import { codeSymbolPoint } from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette,
  type SeedReading
} from "./scan-colour.ts";
import {
  decodeSeedNibbles,
  seedNibbleSlot,
  seedSlotCount
} from "./seed.ts";

export interface NibbleObservation {
  value: number | null;
  confidence: number;
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
  const count = Math.max(2, Math.round(values.length * 0.16));
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
    Math.max(2, Math.round(3 * scale)),
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

  if (best.score < 0.12 || margin < 0.035) {
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

export function recoverSeedObservations(
  observations: readonly NibbleObservation[],
  paletteIndex: number
): SeedReading {
  if (observations.length !== seedSlotCount) {
    throw new Error(`seed observation must contain exactly ${seedSlotCount} nibbles`);
  }

  const values = observations.map((observation) => observation.value);
  const erased = new Set<number>();
  const candidates: Array<{ byte: number; confidence: number }> = [];

  for (let byte = 0; byte < seedSlotCount / 2; byte += 1) {
    const confidence = byteConfidence(observations, byte);

    if (confidence < 0) {
      erased.add(byte);
      eraseByte(values, byte);
      continue;
    }

    candidates.push({ byte, confidence });
  }

  if (erased.size > 16) {
    throw new Error(
      `Too many uncertain star bytes (${erased.size}); hold the identicon flatter and closer`
    );
  }

  candidates.sort((left, right) => left.confidence - right.confidence);

  let candidateIndex = 0;
  let lastError: unknown;

  while (erased.size <= 16) {
    try {
      const seed = decodeSeedNibbles(values, paletteIndex);
      const retained = observations.filter((observation, slot) => {
        const byte = Math.floor(slot / 2);
        return observation.value !== null && !erased.has(byte);
      });

      const confidence = retained.length === 0
        ? 0
        : retained.reduce((sum, value) => sum + value.confidence, 0) /
          retained.length;

      return {
        seed,
        erasures: erased.size,
        confidence,
        nibbles: values
      };
    } catch (error) {
      lastError = error;
    }

    if (erased.size === 16) break;

    const next = candidates[candidateIndex];
    candidateIndex += 1;

    if (!next) break;
    if (erased.has(next.byte)) continue;

    erased.add(next.byte);
    eraseByte(values, next.byte);
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "visual seed recovery failed";

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

  return recoverSeedObservations(observations, palette.index);
}
