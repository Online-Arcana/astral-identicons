import { rsRecoverErasures } from "./rs.ts";
import {
  decodeSeedCodeword,
  seedCodewordByteCount,
  seedDataByteCount,
  seedParityByteCount
} from "./seed.ts";
import {
  recoverStarParity,
  type ByteObservation,
  type RecoveredParity
} from "./star-parity.ts";
import type { IdenticonInput } from "./types.ts";

export interface VisualCodeReading {
  readonly value: IdenticonInput;
  readonly glyphBytes: number;
  readonly recoveredGlyphBytes: number;
  readonly observedStars: number;
  readonly discardedGlyphBytes: number;
  readonly discardedStars: number;
  readonly confidence: number;
}

function validateGlyphData(observations: readonly ByteObservation[]): void {
  if (observations.length !== seedDataByteCount) {
    throw new Error(`glyph data must contain ${seedDataByteCount} byte observations`);
  }

  for (const observation of observations) {
    if (observation.value === null) continue;
    if (
      !Number.isInteger(observation.value) ||
      observation.value < 0 ||
      observation.value > 255
    ) {
      throw new Error("glyph data observations must contain bytes or null");
    }
  }
}

function retainedConfidence(
  glyphs: readonly ByteObservation[],
  erased: ReadonlySet<number>,
  parity: RecoveredParity
): number {
  let total = parity.confidence;
  let count = 1;

  for (let index = 0; index < glyphs.length; index += 1) {
    const observation = glyphs[index]!;
    if (observation.value === null || erased.has(index)) continue;
    total += observation.confidence;
    count += 1;
  }

  return total / count;
}

export function recoverVisualCode(
  glyphs: readonly ByteObservation[],
  stars: readonly ByteObservation[]
): VisualCodeReading {
  validateGlyphData(glyphs);
  const parity = recoverStarParity(stars);
  const codeword = new Uint8Array(seedCodewordByteCount);
  codeword.set(parity.bytes, seedDataByteCount);

  const erased = new Set<number>();
  const candidates: Array<{ index: number; confidence: number }> = [];
  let glyphBytes = 0;

  for (let index = 0; index < glyphs.length; index += 1) {
    const observation = glyphs[index]!;

    if (observation.value === null) {
      erased.add(index);
      continue;
    }

    codeword[index] = observation.value;
    glyphBytes += 1;
    candidates.push({ index, confidence: observation.confidence });
  }

  if (erased.size > seedParityByteCount) {
    throw new Error(
      `Need at least ${seedDataByteCount - seedParityByteCount} readable glyph bytes; found ${glyphBytes}`
    );
  }

  candidates.sort((left, right) => left.confidence - right.confidence);
  let candidateIndex = 0;
  let lastError: unknown;

  while (erased.size <= seedParityByteCount) {
    try {
      const repaired = erased.size === 0
        ? codeword
        : rsRecoverErasures(codeword, seedParityByteCount, [...erased]);
      const value = decodeSeedCodeword(repaired);

      return {
        value,
        glyphBytes,
        recoveredGlyphBytes: erased.size,
        observedStars: parity.observedStars,
        discardedGlyphBytes:
          erased.size - (seedDataByteCount - glyphBytes),
        discardedStars: parity.discardedStars,
        confidence: retainedConfidence(glyphs, erased, parity)
      };
    } catch (error) {
      lastError = error;
    }

    if (erased.size === seedParityByteCount) break;
    const next = candidates[candidateIndex];
    candidateIndex += 1;
    if (!next) break;
    if (erased.has(next.index)) continue;
    erased.add(next.index);
    codeword[next.index] = 0;
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "visual code recovery failed";
  throw new Error(`${message}; glyph and star evidence do not yet agree`);
}
