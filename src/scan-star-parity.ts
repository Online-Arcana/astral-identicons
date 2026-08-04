import { codeSymbolPoint } from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette
} from "./scan-colour.ts";
import {
  starOpacities,
  starSizes,
  type ByteObservation
} from "./star-parity.ts";
import { seedSlotCount } from "./seed.ts";

interface RankedValue {
  readonly value: number;
  readonly score: number;
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
  const selected = values.slice(0, Math.max(4, Math.round(values.length * 0.22)));
  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function positionObservation(
  image: ImageData,
  palette: ObservedPalette,
  slot: number
): { value: number | null; confidence: number; point?: { x: number; y: number } } {
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

  if (best.score < 0.09 || margin < 0.018) {
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
  point: { x: number; y: number }
): { size: number; opacity: number; confidence: number } {
  const scale = image.width / 1024;
  const centreX = point.x * scale;
  const centreY = point.y * scale;
  const radius = Math.max(6, Math.round(13 * scale));
  const values: Array<{ evidence: number; distance: number }> = [];

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > radius) continue;

      values.push({
        evidence: colourEvidence(
          pixel(image, centreX + offsetX, centreY + offsetY),
          palette.background,
          palette.layer1
        ),
        distance
      });
    }
  }

  const ranked = values
    .map((value) => value.evidence)
    .sort((left, right) => right - left);
  const opacitySamples = ranked.slice(0, Math.max(5, Math.round(ranked.length * 0.12)));
  const opacity = opacitySamples.reduce((sum, value) => sum + value, 0) /
    Math.max(1, opacitySamples.length);
  const visible = values.filter((value) => value.evidence >= Math.max(0.2, opacity * 0.38));
  const extent = visible.reduce((maximum, value) => {
    return Math.max(maximum, value.distance);
  }, 0);
  const size = extent * 2 / scale;
  const confidence = clamp(
    visible.length / Math.max(1, values.length * 0.18),
    0,
    1
  );

  return { size, opacity, confidence };
}

function lowNibbleObservation(
  profile: { size: number; opacity: number; confidence: number }
): { value: number | null; confidence: number } {
  let best: RankedValue = { value: 0, score: Number.POSITIVE_INFINITY };
  let second: RankedValue = { value: 0, score: Number.POSITIVE_INFINITY };

  for (let sizeLevel = 0; sizeLevel < starSizes.length; sizeLevel += 1) {
    for (let opacityLevel = 0; opacityLevel < starOpacities.length; opacityLevel += 1) {
      const sizeCost = Math.abs(profile.size - starSizes[sizeLevel]!) / 5;
      const opacityCost = Math.abs(profile.opacity - starOpacities[opacityLevel]!) / 0.16;
      const score = sizeCost + opacityCost;
      const value = (sizeLevel << 2) | opacityLevel;
      const candidate = { value, score };

      if (candidate.score < best.score) {
        second = best;
        best = candidate;
        continue;
      }

      if (candidate.score < second.score) second = candidate;
    }
  }

  const margin = second.score - best.score;
  const confidence = clamp(margin / 1.4, 0, 1) * profile.confidence;

  if (best.score > 1.45 || margin < 0.12 || profile.opacity < 0.28) {
    return { value: null, confidence };
  }

  return { value: best.value, confidence };
}

function observeStar(
  image: ImageData,
  palette: ObservedPalette,
  slot: number
): ByteObservation {
  const high = positionObservation(image, palette, slot);
  if (high.value === null || !high.point) {
    return { value: null, confidence: high.confidence };
  }

  const low = lowNibbleObservation(starProfile(image, palette, high.point));
  if (low.value === null) {
    return {
      value: null,
      confidence: Math.min(high.confidence, low.confidence)
    };
  }

  return {
    value: (high.value << 4) | low.value,
    confidence: Math.min(high.confidence, low.confidence)
  };
}

export function observeStarParity(
  image: ImageData,
  palette: ObservedPalette
): readonly ByteObservation[] {
  return Array.from({ length: seedSlotCount }, (_unused, slot) => {
    return observeStar(image, palette, slot);
  });
}
