import {
  codeSymbolPoint,
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

function strongestEvidence(
  image: ImageData,
  x: number,
  y: number,
  radius: number,
  palette: ObservedPalette
): number {
  const values: number[] = [];

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;

      values.push(colourEvidence(
        pixel(image, x + offsetX, y + offsetY),
        palette.background,
        palette.layer1
      ));
    }
  }

  values.sort((left, right) => right - left);
  const selected = values.slice(0, Math.max(4, Math.round(values.length * 0.18)));
  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function positionObservation(
  image: ImageData,
  palette: ObservedPalette,
  slot: number
): PositionObservation {
  const scale = image.width / 1024;
  let best: RankedValue = { value: 0, score: Number.NEGATIVE_INFINITY };
  let second: RankedValue = { value: 0, score: Number.NEGATIVE_INFINITY };

  for (let value = 0; value < 16; value += 1) {
    const point = codeSymbolPoint(slot, value);
    const score = strongestEvidence(
      image,
      point.x * scale,
      point.y * scale,
      Math.max(4, Math.round(11 * scale)),
      palette
    );
    const candidate = { value, score };

    if (candidate.score > best.score) {
      second = best;
      best = candidate;
      continue;
    }

    if (candidate.score > second.score) second = candidate;
  }

  const margin = best.score - second.score;
  const confidence = clamp(margin / Math.max(0.025, best.score), 0, 1);

  if (best.score < 0.1 || margin < 0.018) {
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
  const values: Array<{ evidence: number; distance: number }> = [];

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > radius) continue;

      values.push({
        evidence: colourEvidence(
          pixel(image, centreX + offsetX, centreY + offsetY),
          palette.background,
          target
        ),
        distance
      });
    }
  }

  const ranked = values
    .map((value) => value.evidence)
    .sort((left, right) => right - left);
  const opacitySamples = ranked.slice(
    0,
    Math.max(5, Math.round(ranked.length * 0.04))
  );
  const opacity = opacitySamples.reduce((sum, value) => sum + value, 0) /
    Math.max(1, opacitySamples.length);
  const visible = values.filter((value) => {
    return value.evidence >= Math.max(0.18, opacity * 0.38);
  });
  const extent = visible.reduce((maximum, value) => {
    return Math.max(maximum, value.distance);
  }, 0);
  const size = extent * 2 / scale;
  const confidence = clamp(
    visible.length / Math.max(1, values.length * 0.12),
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
  const size = orderedLevel(normalisedSize, starSizes, 3.2);
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
