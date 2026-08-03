import { codeSymbolPoint } from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette
} from "./scan-colour.ts";
import {
  paletteCorrectionBit,
  paletteCount,
  seedSlotCount
} from "./seed.ts";

export interface BitObservation {
  value: 0 | 1 | null;
  confidence: number;
}

export interface PaletteCorrectionReading {
  index: number;
  confidence: number;
  uncertainStars: number;
  mismatches: number;
  observations: readonly BitObservation[];
}

interface RankedBit {
  value: 0 | 1;
  score: number;
}

interface RankedPalette {
  index: number;
  score: number;
  starCost: number;
  mismatches: number;
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
  const count = Math.max(4, Math.round(values.length * 0.28));
  const selected = values.slice(0, count);

  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function symbolScore(
  image: ImageData,
  slot: number,
  bit: 0 | 1,
  palette: ObservedPalette
): number {
  const point = codeSymbolPoint(slot, bit);
  const scale = image.width / 1024;

  return strongestEvidence(
    image,
    point.x * scale,
    point.y * scale,
    Math.max(3, Math.round(6 * scale)),
    palette
  );
}

function observeBit(
  image: ImageData,
  slot: number,
  palette: ObservedPalette
): BitObservation {
  const scores: RankedBit[] = ([0, 1] as const)
    .map((value) => ({
      value,
      score: symbolScore(image, slot, value, palette)
    }))
    .sort((left, right) => right.score - left.score);

  const best = scores[0]!;
  const second = scores[1]!;
  const margin = best.score - second.score;
  const confidence = clamp(margin / Math.max(0.01, best.score), 0, 1);

  if (best.score < 0.055 || margin < 0.01) {
    return { value: null, confidence };
  }

  return { value: best.value, confidence };
}

function paletteScore(
  observations: readonly BitObservation[],
  index: number,
  colourHint: Pick<ObservedPalette, "index" | "confidence">
): RankedPalette {
  let mismatchWeight = 0;
  let totalWeight = 0;
  let mismatches = 0;

  for (let slot = 0; slot < observations.length; slot += 1) {
    const observation = observations[slot]!;
    if (observation.value === null) continue;

    const weight = 0.3 + observation.confidence * 0.7;
    totalWeight += weight;

    if (observation.value === paletteCorrectionBit(index, slot)) continue;
    mismatchWeight += weight;
    mismatches += 1;
  }

  const starCost = totalWeight === 0 ? 1 : mismatchWeight / totalWeight;

  /*
   * Camera colour is only a weak tie-breaker. The correction stars are the
   * authoritative palette identifier because displays and cameras shift RGB.
   */
  const colourBias = index === colourHint.index
    ? -0.02 * colourHint.confidence
    : 0;

  return {
    index,
    score: starCost + colourBias,
    starCost,
    mismatches
  };
}

export function recoverPaletteCorrection(
  observations: readonly BitObservation[],
  colourHint: Pick<ObservedPalette, "index" | "confidence">
): PaletteCorrectionReading {
  if (observations.length !== seedSlotCount) {
    throw new Error(`palette correction must contain exactly ${seedSlotCount} stars`);
  }

  const observed = observations.filter((value) => value.value !== null).length;
  const uncertainStars = observations.length - observed;

  if (observed < 24) {
    throw new Error("The palette correction stars are not clear enough yet");
  }

  const ranked = Array.from(
    { length: paletteCount },
    (_unused, index) => paletteScore(observations, index, colourHint)
  ).sort((left, right) => left.score - right.score);

  const best = ranked[0]!;
  const second = ranked[1]!;
  const margin = second.score - best.score;
  const confidence = clamp(
    margin / Math.max(0.01, second.starCost),
    0,
    1
  );

  if (best.starCost > 0.34 || margin < 0.025) {
    throw new Error("The palette correction pattern is not stable yet");
  }

  return {
    index: best.index,
    confidence,
    uncertainStars,
    mismatches: best.mismatches,
    observations
  };
}

export function readPaletteCorrection(
  image: ImageData,
  palette: ObservedPalette
): PaletteCorrectionReading {
  const observations = Array.from(
    { length: seedSlotCount },
    (_unused, slot) => observeBit(image, slot, palette)
  );

  return recoverPaletteCorrection(observations, palette);
}
