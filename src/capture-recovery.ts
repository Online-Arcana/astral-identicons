import { seedDataByteCount, seedSlotCount } from "./seed.ts";
import type { ByteObservation } from "./star-parity.ts";
import {
  recoverVisualCode,
  type VisualCodeReading
} from "./visual-code.ts";

export const captureObservationTarget = seedDataByteCount + 16;
export const captureMinimumFrames = 6;
export const captureMinimumMilliseconds = 1_200;

export interface CaptureReadiness {
  readonly observedStars: number;
  readonly centreFound: number;
  readonly ringFound: number;
  readonly hasReading: boolean;
  readonly capturedRoles: number;
  readonly frames: number;
  readonly usefulMilliseconds: number;
}

export function captureReady(value: CaptureReadiness): boolean {
  if (value.frames < captureMinimumFrames) return false;
  if (value.usefulMilliseconds < captureMinimumMilliseconds) return false;
  if (value.capturedRoles < 4) return false;
  if (value.centreFound < 4 || value.ringFound < 4) return false;
  return value.hasReading || value.observedStars >= captureObservationTarget;
}

interface ScoredByte {
  readonly value: number;
  readonly score: number;
  readonly support: number;
  readonly strongest: number;
}

function rankedBytes(
  sources: readonly (readonly ByteObservation[])[],
  slot: number
): readonly ScoredByte[] {
  const scores = new Float32Array(256);
  const support = new Uint16Array(256);
  const strongest = new Float32Array(256);

  for (const source of sources) {
    const observation = source[slot];
    if (!observation || observation.value === null) continue;
    const value = observation.value;
    const confidence = Math.max(0, Math.min(1, observation.confidence));
    scores[value] += 0.08 + confidence * 0.92;
    support[value] += 1;
    strongest[value] = Math.max(strongest[value] ?? 0, confidence);
  }

  return [...scores]
    .map((score, value) => ({
      value,
      score,
      support: support[value] ?? 0,
      strongest: strongest[value] ?? 0
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function consensus(
  sources: readonly (readonly ByteObservation[])[],
  minimumMargin: number,
  minimumSupport: number
): readonly ByteObservation[] {
  return Array.from({ length: seedSlotCount }, (_unused, slot) => {
    const ranked = rankedBytes(sources, slot);
    const best = ranked[0];
    if (!best) return { value: null, confidence: 0 };

    const second = ranked[1]?.score ?? 0;
    const margin = (best.score - second) / Math.max(best.score, 0.001);
    const supported = best.support >= minimumSupport || best.strongest >= 0.9;
    if (!supported || margin < minimumMargin) {
      return { value: null, confidence: margin };
    }

    return {
      value: best.value,
      confidence: Math.max(0, Math.min(1, margin * 0.7 + best.strongest * 0.3))
    };
  });
}

function strongest(
  sources: readonly (readonly ByteObservation[])[]
): readonly ByteObservation[] {
  return Array.from({ length: seedSlotCount }, (_unused, slot) => {
    let selected: ByteObservation = { value: null, confidence: 0 };

    for (const source of sources) {
      const observation = source[slot];
      if (!observation || observation.value === null) continue;
      if (selected.value !== null && selected.confidence >= observation.confidence) {
        continue;
      }
      selected = observation;
    }

    return selected;
  });
}

function sourceScore(source: readonly ByteObservation[]): number {
  let observed = 0;
  let confidence = 0;

  for (const value of source) {
    if (value.value === null) continue;
    observed += 1;
    confidence += value.confidence;
  }

  return observed * 2 + confidence;
}

function observed(values: readonly ByteObservation[]): number {
  return values.filter((value) => value.value !== null).length;
}

function attemptOrder(
  sources: readonly (readonly ByteObservation[])[]
): readonly (readonly ByteObservation[])[] {
  const rankedSources = [...sources].sort((left, right) => {
    return sourceScore(right) - sourceScore(left);
  });
  const attempts: Array<readonly ByteObservation[]> = [];

  if (sources.length >= 2) {
    attempts.push(consensus(sources, 0.34, 2));
  }
  attempts.push(...rankedSources);
  if (sources.length >= 2) {
    attempts.push(consensus(sources, 0.2, 2));
    attempts.push(consensus(sources, 0.12, 1));
  }
  attempts.push(strongest(sources));

  return attempts.sort((left, right) => observed(right) - observed(left));
}

export function recoverCaptured(
  sources: readonly (readonly ByteObservation[])[]
): VisualCodeReading | undefined {
  const valid = sources.filter((source) => source.length === seedSlotCount);

  for (const attempt of attemptOrder(valid)) {
    try {
      return recoverVisualCode(attempt);
    } catch {
      // Try the next independent frame or confidence-aware combination.
    }
  }

  return undefined;
}
