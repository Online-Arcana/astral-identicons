import { seedDataByteCount, seedSlotCount } from "./seed.ts";
import type { ByteObservation } from "./star-parity.ts";
import {
  recoverVisualCode,
  type VisualCodeReading
} from "./visual-code.ts";

export const captureObservationTarget = seedDataByteCount + 16;

export interface CaptureReadiness {
  readonly observedStars: number;
  readonly centreFound: number;
  readonly ringFound: number;
  readonly hasReading: boolean;
  readonly capturedRoles: number;
}

export function captureReady(value: CaptureReadiness): boolean {
  if (value.capturedRoles < 4) return false;
  if (value.centreFound < 4 || value.ringFound < 4) return false;
  return value.hasReading || value.observedStars >= captureObservationTarget;
}

function consensus(
  sources: readonly (readonly ByteObservation[])[]
): readonly ByteObservation[] {
  return Array.from({ length: seedSlotCount }, (_unused, slot) => {
    const scores = new Float32Array(256);
    let strongestNull = 0;

    for (const source of sources) {
      const observation = source[slot];
      if (!observation) continue;
      if (observation.value === null) {
        strongestNull = Math.max(strongestNull, observation.confidence);
        continue;
      }

      scores[observation.value] += 0.08 + observation.confidence * 0.92;
    }

    let value = 0;
    let best = 0;
    let second = 0;

    for (let candidate = 0; candidate < scores.length; candidate += 1) {
      const score = scores[candidate] ?? 0;
      if (score > best) {
        second = best;
        best = score;
        value = candidate;
        continue;
      }
      if (score > second) second = score;
    }

    if (best === 0 || best <= strongestNull * 0.85) {
      return { value: null, confidence: strongestNull };
    }

    return {
      value,
      confidence: Math.max(0, Math.min(1, (best - second) / best))
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

export function recoverCaptured(
  sources: readonly (readonly ByteObservation[])[]
): VisualCodeReading | undefined {
  const valid = sources.filter((source) => source.length === seedSlotCount);
  const attempts = [
    ...valid,
    strongest(valid),
    consensus(valid)
  ];

  for (const attempt of attempts) {
    try {
      return recoverVisualCode(attempt);
    } catch {
      // Try the next independently captured or combined evidence source.
    }
  }

  return undefined;
}
