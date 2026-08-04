import {
  rsEncode,
  rsRecoverErrorsAndErasures,
  type ReedSolomonRecovery
} from "./rs.ts";
import {
  decodeSeedCodeword,
  seedDataByteCount,
  seedParityByteCount,
  seedPayload,
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

export interface RecoveredStarRecord {
  readonly value: IdenticonInput;
  readonly bytes: Uint8Array;
  readonly observedStars: number;
  readonly reconstructedStars: number;
  readonly discardedStars: number;
  readonly confidence: number;
}

interface RankedObservation {
  readonly index: number;
  readonly confidence: number;
}

interface RecoveryCandidate {
  readonly recovery: ReedSolomonRecovery;
  readonly ignored: readonly number[];
  readonly value: IdenticonInput;
}

export const starParityDataByteCount = seedDataByteCount;
export const starParityCodewordByteCount = seedSlotCount;
export const starParityExpansionByteCount =
  starParityCodewordByteCount - starParityDataByteCount;
export const starSizes = [5, 10, 15, 20] as const;
export const starOpacities = [0.52, 0.68, 0.84, 1] as const;

if (starParityExpansionByteCount <= 0) {
  throw new Error("star recovery code must add redundant bytes");
}

export function starParityCodeword(value: IdenticonInput): Uint8Array {
  return rsEncode(seedPayload(value), starParityExpansionByteCount);
}

export function starVisualSymbol(byte: number): StarVisualSymbol {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error("star recovery symbol must be one byte");
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

function validateObservations(observations: readonly ByteObservation[]): void {
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
  corrected: ReadonlySet<number>
): number {
  let total = 0;
  let count = 0;

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    if (observation.value === null || corrected.has(index)) continue;
    total += observation.confidence;
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

function decodePayload(payload: Uint8Array): IdenticonInput {
  const canonicalCodeword = rsEncode(payload, seedParityByteCount);
  return decodeSeedCodeword(canonicalCodeword);
}

function recoverCandidate(
  damaged: Uint8Array,
  baseErasures: readonly number[],
  ignored: readonly number[]
): RecoveryCandidate {
  const attempt = damaged.slice();
  const erasures = [...baseErasures, ...ignored];

  for (const position of erasures) attempt[position] = 0;

  const recovery = rsRecoverErrorsAndErasures(
    attempt,
    starParityExpansionByteCount,
    erasures
  );
  const bytes = recovery.codeword.slice(0, starParityDataByteCount);

  return {
    recovery,
    ignored,
    value: decodePayload(bytes)
  };
}

function generalisedMinimumDistanceRecovery(
  damaged: Uint8Array,
  baseErasures: readonly number[],
  ranked: readonly RankedObservation[]
): RecoveryCandidate {
  const maximumIgnored = Math.min(
    ranked.length - starParityDataByteCount,
    starParityExpansionByteCount - baseErasures.length
  );
  let lastError: unknown;

  for (let ignoredCount = 0; ignoredCount <= maximumIgnored; ignoredCount += 1) {
    const ignored = ranked
      .slice(0, ignoredCount)
      .map((value) => value.index);

    try {
      return recoverCandidate(damaged, baseErasures, ignored);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("The captured star candidates do not form a recoverable record yet");
}

export function recoverStarParity(
  observations: readonly ByteObservation[]
): RecoveredStarRecord {
  validateObservations(observations);

  const damaged = new Uint8Array(starParityCodewordByteCount);
  const erasures: number[] = [];
  const ranked: RankedObservation[] = [];

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;

    if (observation.value === null) {
      erasures.push(index);
      continue;
    }

    damaged[index] = observation.value;
    ranked.push({ index, confidence: observation.confidence });
  }

  const observedStars = observations.length - erasures.length;
  if (observedStars < starParityDataByteCount) {
    throw new Error(
      `Need at least ${starParityDataByteCount} readable stars; found ${observedStars}`
    );
  }

  ranked.sort((left, right) => left.confidence - right.confidence);
  const candidate = generalisedMinimumDistanceRecovery(
    damaged,
    erasures,
    ranked
  );
  const bytes = candidate.recovery.codeword.slice(0, starParityDataByteCount);
  const corrected = new Set(candidate.recovery.positions);

  return {
    value: candidate.value,
    bytes,
    observedStars,
    reconstructedStars: candidate.recovery.positions.length,
    discardedStars: candidate.recovery.errors + candidate.ignored.length,
    confidence: confidence(observations, corrected)
  };
}
