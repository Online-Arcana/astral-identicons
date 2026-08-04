import { rsEncode, rsRecoverErasures, rsValid } from "./rs.ts";
import {
  seedCodeword,
  seedDataByteCount,
  seedParityByteCount,
  seedSlotCount
} from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface ByteObservation {
  readonly value: number | null;
  readonly confidence: number;
}

export interface StarVisualSymbol {
  readonly byte: number;
  readonly position: number;
  readonly sizeLevel: number;
  readonly opacityLevel: number;
  readonly size: number;
  readonly opacity: number;
}

export interface RecoveredParity {
  readonly bytes: Uint8Array;
  readonly observedStars: number;
  readonly discardedStars: number;
  readonly confidence: number;
}

export const starParityDataByteCount = seedParityByteCount;
export const starParityCodewordByteCount = seedSlotCount;
export const starParityExpansionByteCount =
  starParityCodewordByteCount - starParityDataByteCount;
export const starSizes = [9, 13, 17, 21] as const;
export const starOpacities = [0.52, 0.68, 0.84, 1] as const;

if (starParityExpansionByteCount <= 0) {
  throw new Error("star parity expansion must add redundant bytes");
}

export function payloadParity(value: IdenticonInput): Uint8Array {
  return seedCodeword(value).slice(seedDataByteCount);
}

export function starParityCodeword(value: IdenticonInput): Uint8Array {
  return rsEncode(payloadParity(value), starParityExpansionByteCount);
}

export function starVisualSymbol(byte: number): StarVisualSymbol {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error("star parity symbol must be one byte");
  }

  const position = byte >>> 4;
  const low = byte & 0x0f;
  const sizeLevel = low >>> 2;
  const opacityLevel = low & 0x03;

  return {
    byte,
    position,
    sizeLevel,
    opacityLevel,
    size: starSizes[sizeLevel]!,
    opacity: starOpacities[opacityLevel]!
  };
}

function validateObservations(
  observations: readonly ByteObservation[]
): void {
  if (observations.length !== starParityCodewordByteCount) {
    throw new Error(
      `star observations must contain ${starParityCodewordByteCount} slots`
    );
  }

  for (const observation of observations) {
    if (observation.value === null) continue;
    if (
      !Number.isInteger(observation.value) ||
      observation.value < 0 ||
      observation.value > 255
    ) {
      throw new Error("star observations must contain bytes or null");
    }
  }
}

function confidence(
  observations: readonly ByteObservation[],
  erased: ReadonlySet<number>
): number {
  let total = 0;
  let count = 0;

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    if (observation.value === null || erased.has(index)) continue;
    total += observation.confidence;
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

export function recoverStarParity(
  observations: readonly ByteObservation[]
): RecoveredParity {
  validateObservations(observations);

  const damaged = new Uint8Array(starParityCodewordByteCount);
  const erased = new Set<number>();
  const candidates: Array<{ index: number; confidence: number }> = [];

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;

    if (observation.value === null) {
      erased.add(index);
      continue;
    }

    damaged[index] = observation.value;
    candidates.push({ index, confidence: observation.confidence });
  }

  const observedStars = observations.length - erased.size;
  if (observedStars < starParityDataByteCount) {
    throw new Error(
      `Need at least ${starParityDataByteCount} readable stars; found ${observedStars}`
    );
  }

  candidates.sort((left, right) => left.confidence - right.confidence);
  let candidateIndex = 0;
  let lastError: unknown;

  while (erased.size <= starParityExpansionByteCount) {
    try {
      const recovered = erased.size === 0
        ? damaged
        : rsRecoverErasures(
            damaged,
            starParityExpansionByteCount,
            [...erased]
          );

      if (!rsValid(recovered, starParityExpansionByteCount)) {
        throw new Error("expanded star parity codeword is invalid");
      }

      return {
        bytes: recovered.slice(0, starParityDataByteCount),
        observedStars,
        discardedStars: erased.size - (observations.length - observedStars),
        confidence: confidence(observations, erased)
      };
    } catch (error) {
      lastError = error;
    }

    if (erased.size === starParityExpansionByteCount) break;
    const next = candidates[candidateIndex];
    candidateIndex += 1;
    if (!next) break;
    if (erased.has(next.index)) continue;
    erased.add(next.index);
    damaged[next.index] = 0;
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "star parity recovery failed";
  throw new Error(`${message}; the readable stars conflict too strongly`);
}
