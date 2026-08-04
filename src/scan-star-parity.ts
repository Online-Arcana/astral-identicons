import {
  codeSlotPoint,
  codeSymbolPoint,
  codeSymbolSpacing,
  northStar,
  northStarPoint
} from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette,
  type Rgb
} from "./scan-colour.ts";
import {
  byteObservation,
  starOpacities,
  starSizes,
  type StarComponentObservation
} from "./star-parity.ts";
import { seedSlotCount } from "./seed.ts";

interface RankedValue {
  readonly value: number;
  readonly score: number;
}

interface PositionObservation {
  readonly value: number | null;
  readonly confidence: number;
  readonly point?: { x: number; y: number };
}

interface StarProfile {
  readonly size: number;
  readonly opacity: number;
  readonly confidence: number;
}

interface StarCalibration {
  readonly sizeScale: number;
  readonly opacityScale: number;
  readonly confidence: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function positionObservation(
  image: ImageData,
  palette: ObservedPalette,
  slot: number
): PositionObservation {
  const scale = image.width / 1024;
  const base = codeSlotPoint(slot);
  const centreX = base.x * scale;
  const centreY = base.y * scale;
  const radius = Math.max(5, Math.round(18 * scale));
  let total = 0;
  let weightedX = 0;
  let weightedY = 0;
  let peak = 0;

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const evidence = colourEvidence(
        pixel(image, centreX + offsetX, centreY + offsetY),
        palette.background,
        palette.layer1
      );
      peak = Math.max(peak, evidence);
      const weight = Math.max(0, evidence - 0.14);
      if (weight === 0) continue;

      total += weight;
      weightedX += (centreX + offsetX) * weight;
      weightedY += (centreY + offsetY) * weight;
    }
  }

  if (total < 0.35 || peak < 0.18) {
    return { value: null, confidence: 0 };
  }

  const observedX = weightedX / total / scale;
  const observedY = weightedY / total / scale;
  const ranked = Array.from({ length: 16 }, (_unused, value) => {
    const point = codeSymbolPoint(slot, value);
    return {
      value,
      score: Math.hypot(observedX - point.x, observedY - point.y)
    };
  }).sort((left, right) => left.score - right.score);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const distanceConfidence = clamp(
    (second.score - best.score) / codeSymbolSpacing,
    0,
    1
  );
  const evidenceConfidence = clamp(total / 2, 0, 1);
  const confidence = distanceConfidence * evidenceConfidence;

  if (best.score > 7) {
    return { value: null, confidence };
  }

  return {
    value: best.value,
    confidence,
    point: codeSymbolPoint(slot, best.value)
  };
}

function starProfile(
  image: ImageData,
  palette: ObservedPalette,
  point: { x: number; y: number },
  target: Rgb
): StarProfile {
  const scale = image.width / 1024;
  const centreX = point.x * scale;
  const centreY = point.y * scale;
  const radius = Math.max(7, Math.round(18 * scale));
  const side = radius * 2 + 1;
  const evidence = new Float32Array(side * side);

  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const offsetX = column - radius;
      const offsetY = row - radius;
      if (Math.hypot(offsetX, offsetY) > radius) continue;

      evidence[row * side + column] = colourEvidence(
        pixel(image, centreX + offsetX, centreY + offsetY),
        palette.background,
        target
      );
    }
  }

  let seed = radius * side + radius;
  let peak = 0;

  for (let row = Math.max(0, radius - 2); row <= Math.min(side - 1, radius + 2); row += 1) {
    for (
      let column = Math.max(0, radius - 2);
      column <= Math.min(side - 1, radius + 2);
      column += 1
    ) {
      const index = row * side + column;
      const value = evidence[index] ?? 0;
      if (value <= peak) continue;
      peak = value;
      seed = index;
    }
  }

  if (peak < 0.16) return { size: 0, opacity: 0, confidence: 0 };

  const threshold = Math.max(0.16, peak * 0.35);
  const visited = new Uint8Array(side * side);
  const queue: number[] = [seed];
  visited[seed] = 1;
  const component: Array<{ value: number; distance: number }> = [];

  while (queue.length > 0) {
    const index = queue.shift()!;
    const value = evidence[index] ?? 0;
    if (value < threshold) continue;

    const row = Math.floor(index / side);
    const column = index % side;
    const offsetX = column - radius;
    const offsetY = row - radius;
    component.push({
      value,
      distance: Math.hypot(offsetX, offsetY)
    });

    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
        const nextRow = row + deltaY;
        const nextColumn = column + deltaX;
        if (
          nextRow < 0 ||
          nextColumn < 0 ||
          nextRow >= side ||
          nextColumn >= side
        ) {
          continue;
        }

        const next = nextRow * side + nextColumn;
        if (visited[next] !== 0) continue;
        visited[next] = 1;
        if ((evidence[next] ?? 0) >= threshold) queue.push(next);
      }
    }
  }

  if (component.length === 0) {
    return { size: 0, opacity: 0, confidence: 0 };
  }

  const ranked = component
    .map((value) => value.value)
    .sort((left, right) => right - left);
  const opacitySamples = ranked.slice(0, Math.min(7, ranked.length));
  const opacity = opacitySamples.reduce((sum, value) => sum + value, 0) /
    Math.max(1, opacitySamples.length);
  const extent = component.reduce((maximum, value) => {
    return Math.max(maximum, value.distance);
  }, 0);
  const size = extent * 2 / scale;
  const confidence = clamp(
    component.length / Math.max(1, side * side * 0.12),
    0,
    1
  );

  return { size, opacity, confidence };
}

function northCalibration(
  image: ImageData,
  palette: ObservedPalette
): StarCalibration {
  const reference = starProfile(
    image,
    palette,
    northStarPoint(),
    palette.layer0
  );
  const sizeScale = reference.size / northStar.size;
  const opacityScale = reference.opacity / northStar.opacity;
  const sizeConfidence = clamp(1 - Math.abs(sizeScale - 1) / 0.55, 0, 1);
  const opacityConfidence = clamp(opacityScale / 0.65, 0, 1);

  return {
    sizeScale: clamp(sizeScale, 0.55, 1.65),
    opacityScale: clamp(opacityScale, 0.28, 1.35),
    confidence: Math.min(
      reference.confidence,
      sizeConfidence,
      opacityConfidence
    )
  };
}

function orderedLevel(
  measured: number,
  levels: readonly number[],
  maximumCost: number
): { value: number | null; confidence: number } {
  let best: RankedValue = { value: 0, score: Number.POSITIVE_INFINITY };
  let second: RankedValue = { value: 0, score: Number.POSITIVE_INFINITY };

  for (let value = 0; value < levels.length; value += 1) {
    const score = Math.abs(measured - levels[value]!);
    const candidate = { value, score };

    if (candidate.score < best.score) {
      second = best;
      best = candidate;
      continue;
    }

    if (candidate.score < second.score) second = candidate;
  }

  const margin = second.score - best.score;
  const confidence = clamp(margin / maximumCost, 0, 1);

  if (best.score > maximumCost || margin < maximumCost * 0.08) {
    return { value: null, confidence };
  }

  return { value: best.value, confidence };
}

function observeStar(
  image: ImageData,
  palette: ObservedPalette,
  calibration: StarCalibration,
  slot: number
): StarComponentObservation {
  const position = positionObservation(image, palette, slot);
  if (position.value === null || !position.point) {
    return {
      value: null,
      confidence: position.confidence,
      position: null,
      sizeLevel: null,
      opacityLevel: null,
      positionConfidence: position.confidence,
      sizeConfidence: 0,
      opacityConfidence: 0
    };
  }

  const profile = starProfile(
    image,
    palette,
    position.point,
    palette.layer1
  );
  const normalisedSize = profile.size / calibration.sizeScale;
  const normalisedOpacity = profile.opacity / calibration.opacityScale;
  const size = orderedLevel(normalisedSize, starSizes, 4.5);
  const opacity = orderedLevel(normalisedOpacity, starOpacities, 0.085);
  const profileConfidence = Math.min(profile.confidence, calibration.confidence);
  const components = {
    position: position.value,
    sizeLevel: size.value,
    opacityLevel: opacity.value,
    positionConfidence: position.confidence,
    sizeConfidence: size.confidence * profileConfidence,
    opacityConfidence: opacity.confidence * profileConfidence
  };
  const combined = byteObservation(components);

  return {
    ...components,
    value: combined.value,
    confidence: combined.confidence
  };
}

export function observeStarParitySlot(
  image: ImageData,
  palette: ObservedPalette,
  slot: number
): StarComponentObservation {
  if (!Number.isInteger(slot) || slot < 0 || slot >= seedSlotCount) {
    throw new Error(`star slot must be between 0 and ${seedSlotCount - 1}`);
  }

  return observeStar(image, palette, northCalibration(image, palette), slot);
}

export function observeStarParity(
  image: ImageData,
  palette: ObservedPalette
): readonly StarComponentObservation[] {
  const calibration = northCalibration(image, palette);

  return Array.from({ length: seedSlotCount }, (_unused, slot) => {
    return observeStar(image, palette, calibration, slot);
  });
}
