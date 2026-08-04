import {
  recoverStarParity,
  type ByteObservation
} from "./star-parity.ts";
import type { IdenticonInput } from "./types.ts";

export interface VisualCodeReading {
  readonly value: IdenticonInput;
  readonly observedStars: number;
  readonly reconstructedStars: number;
  readonly discardedStars: number;
  readonly confidence: number;
}

export function recoverVisualCode(
  stars: readonly ByteObservation[]
): VisualCodeReading {
  const recovered = recoverStarParity(stars);

  return {
    value: recovered.value,
    observedStars: recovered.observedStars,
    reconstructedStars: recovered.reconstructedStars,
    discardedStars: recovered.discardedStars,
    confidence: recovered.confidence
  };
}
