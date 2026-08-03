import { codeSymbolPoint } from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette
} from "./scan-colour.ts";
import {
  decodeSeedNibbles,
  seedNibbleSlot,
  seedParityByteCount,
  seedSlotCount
} from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface NibbleObservation {
  value: number | null;
  confidence: number;
}

export interface SeedReading {
  value: IdenticonInput;
  erasures: number;
  confidence: number;
  uncertainStars: number;
  nibbles: readonly (number | null)[];
}

interface RankedSymbol {
  value: number;
  score: number;
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
  const count = Math.max(4, Math.round(values.length * 0.24));
  const selected = values.slice(0, count);

  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function symbolScore(
  image: ImageData,
  slot: number,
  value: number,
  palette: ObservedPalette
): number {
  const point = codeSymbolPoint(slot, value);
  const scale = image.width / 1024;

  return strongestEvidence(
    image,
    point.x * scale,
    point.y * scale,
    Math.max(3, Math.round(5 * scale)),
    palette
  );
}

function observeNibble(
  image: ImageData,
  slot: number,
  palette: ObservedPalette
): NibbleObservation {
  const scores: RankedSymbol[] = Array.from(
    { length: 16 },
    (_unused, value) => ({
      value,
      score: symbolScore(image, slot, value, palette)
    })
  ).sort((left, right) => right.score - left.score);

  const best = scores[0]!;
  const second = scores[1]!;
  const margin = best.score - second.score;
  const confidence = clamp(margin / Math.max(0.01, best.score), 0, 1);

  if (best.score < 0.065 || margin < 0.014) {
    return { value: null, confidence };
  }

  return { value: best.value, confidence };
}

function byteConfidence(
  observations: readonly NibbleObservation[],
  byte: number
): number {
  const high = observations[seedNibbleSlot(byte * 2)]!;
  const low = observations[seedNibbleSlot(byte * 2 + 1)]!;

  if (high.value === null || low.value === null) return -1;
  return Math.min(high.confidence, low.confidence);
}

function eraseByte(values: Array<number | null>, byte: number): void {
  values[seedNibbleSlot(byte * 2)] = null;
  values[seedNibbleSlot(byte * 2 + 1)] = null;
}

function retainedConfidence(
  observations: readonly NibbleObservation[],
  erased: ReadonlySet<number>
): number {
  let total = 0;
  let count = 0;

  for (let byte = 0; byte < seedSlotCount / 2; byte += 1) {
    if (erased.has(byte)) continue;

    const high = observations[seedNibbleSlot(byte * 2)]!;
    const low = observations[seedNibbleSlot(byte * 2 + 1)]!;
    if (high.value === null || low.value === null) continue;

    total += high.confidence + low.confidence;
    count += 2;
  }

  return count === 0 ? 0 : total / count;
}

export function recoverSeedObservations(
  observations: readonly NibbleObservation[]
): SeedReading {
  if (observations.length !== seedSlotCount) {
    throw new Error(`seed observation must contain exactly ${seedSlotCount} nibbles`);
  }

  const values = observations.map((observation) => observation.value);
  const erased = new Set<number>();
  const candidates: Array<{ byte: number; confidence: number }> = [];
  const uncertainStars = observations.filter((value) => value.value === null).length;

  for (let byte = 0; byte < seedSlotCount / 2; byte += 1) {
    const confidence = byteConfidence(observations, byte);

    if (confidence < 0) {
      erased.add(byte);
      eraseByte(values, byte);
      continue;
    }

    candidates.push({ byte, confidence });
  }

  if (erased.size > seedParityByteCount) {
    throw new Error(
      `Too many uncertain star bytes (${erased.size}); this code can reconstruct ${seedParityByteCount}`
    );
  }

  candidates.sort((left, right) => left.confidence - right.confidence);

  let candidateIndex = 0;
  let lastError: unknown;

  while (erased.size <= seedParityByteCount) {
    try {
      return {
        value: decodeSeedNibbles(values),
        erasures: erased.size,
        confidence: retainedConfidence(observations, erased),
        uncertainStars,
        nibbles: [...values]
      };
    } catch (error) {
      lastError = error;
    }

    if (erased.size === seedParityByteCount) break;

    const next = candidates[candidateIndex];
    candidateIndex += 1;

    if (!next) break;
    if (erased.has(next.byte)) continue;

    erased.add(next.byte);
    eraseByte(values, next.byte);
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "visual payload recovery failed";

  throw new Error(
    `${message}; the star field contains too many conflicting observations`
  );
}

export function readSeed(
  image: ImageData,
  palette: ObservedPalette
): SeedReading {
  const observations = Array.from(
    { length: seedSlotCount },
    (_unused, slot) => observeNibble(image, slot, palette)
  );

  return recoverSeedObservations(observations);
}
