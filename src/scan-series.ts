import {
  recoverSeedObservations,
  type NibbleObservation,
  type SeedReading
} from "./scan-seed.ts";
import { seedSlotCount } from "./seed.ts";

export interface CaptureEvidence {
  at: number;
  observations: readonly NibbleObservation[];
  quality: number;
  centre: readonly boolean[];
  ring: readonly boolean[];
}

export interface CaptureSnapshot {
  elapsed: number;
  frames: number;
  observedStars: number;
  centreFound: number;
  ringFound: number;
  reading: SeedReading | undefined;
  confirmations: number;
  ready: boolean;
}

interface WeightedCapture extends CaptureEvidence {
  weight: number;
}

const windowMilliseconds = 5_000;
const minimumMilliseconds = 2_000;
const minimumFrames = 4;
const requiredConfirmations = 2;
const maximumCorrectedBytes = 18;

function key(reading: SeedReading): string {
  const value = reading.value;
  return [
    value.seedKind,
    value.seed,
    value.solar,
    value.lunar,
    value.ascendant,
    value.midheaven,
    value.descendant,
    value.imumCoeli
  ].join("|");
}

function fusedObservation(votes: readonly number[]): NibbleObservation {
  let bestValue = 0;
  let best = 0;
  let second = 0;
  let total = 0;

  for (let value = 0; value < votes.length; value += 1) {
    const score = votes[value] ?? 0;
    total += score;

    if (score > best) {
      second = best;
      best = score;
      bestValue = value;
      continue;
    }

    if (score > second) second = score;
  }

  if (total < 0.24 || best / total < 0.55 || best - second < 0.08) {
    return {
      value: null,
      confidence: total === 0 ? 0 : Math.max(0, (best - second) / total)
    };
  }

  return {
    value: bestValue,
    confidence: Math.max(0, Math.min(1, (best - second) / best))
  };
}

export class CaptureSeries {
  readonly #samples: WeightedCapture[] = [];
  #lastKey: string | undefined;
  #confirmations = 0;

  clear(): void {
    this.#samples.length = 0;
    this.#lastKey = undefined;
    this.#confirmations = 0;
  }

  add(value: CaptureEvidence): CaptureSnapshot {
    if (value.observations.length !== seedSlotCount) {
      throw new Error(`capture evidence must contain ${seedSlotCount} star observations`);
    }

    const weight = 0.3 + Math.max(0, Math.min(1, value.quality)) * 0.7;
    this.#samples.push({ ...value, weight });
    this.prune(value.at);

    const snapshot = this.snapshot(value.at);
    const reading = snapshot.reading;
    const readingKey = reading ? key(reading) : undefined;

    if (!readingKey || !reading) {
      this.#lastKey = undefined;
      this.#confirmations = 0;
      return { ...snapshot, confirmations: 0, ready: false };
    }

    if (readingKey === this.#lastKey) {
      this.#confirmations += 1;
    } else {
      this.#lastKey = readingKey;
      this.#confirmations = 1;
    }

    const ready = (
      snapshot.elapsed >= minimumMilliseconds &&
      snapshot.frames >= minimumFrames &&
      snapshot.centreFound === value.centre.length &&
      snapshot.ringFound === value.ring.length &&
      reading.erasures <= maximumCorrectedBytes &&
      this.#confirmations >= requiredConfirmations
    );

    return {
      ...snapshot,
      confirmations: this.#confirmations,
      ready
    };
  }

  snapshot(now: number): CaptureSnapshot {
    this.prune(now);

    if (this.#samples.length === 0) {
      return {
        elapsed: 0,
        frames: 0,
        observedStars: 0,
        centreFound: 0,
        ringFound: 0,
        reading: undefined,
        confirmations: this.#confirmations,
        ready: false
      };
    }

    const votes = Array.from(
      { length: seedSlotCount },
      () => Array<number>(16).fill(0)
    );
    const centre = Array<boolean>(this.#samples[0]!.centre.length).fill(false);
    const ring = Array<boolean>(this.#samples[0]!.ring.length).fill(false);

    for (const sample of this.#samples) {
      for (let slot = 0; slot < sample.observations.length; slot += 1) {
        const observation = sample.observations[slot]!;
        if (observation.value === null) continue;

        const confidence = 0.12 + observation.confidence * 0.88;
        votes[slot]![observation.value] += sample.weight * confidence;
      }

      for (let index = 0; index < centre.length; index += 1) {
        centre[index] ||= sample.centre[index] ?? false;
      }

      for (let index = 0; index < ring.length; index += 1) {
        ring[index] ||= sample.ring[index] ?? false;
      }
    }

    const observations = votes.map(fusedObservation);
    let reading: SeedReading | undefined;

    try {
      reading = recoverSeedObservations(observations);
    } catch {
      reading = undefined;
    }

    return {
      elapsed: now - this.#samples[0]!.at,
      frames: this.#samples.length,
      observedStars: observations.filter((value) => value.value !== null).length,
      centreFound: centre.filter(Boolean).length,
      ringFound: ring.filter(Boolean).length,
      reading,
      confirmations: this.#confirmations,
      ready: false
    };
  }

  private prune(now: number): void {
    const minimum = now - windowMilliseconds;
    while (this.#samples[0] && this.#samples[0]!.at < minimum) {
      this.#samples.shift();
    }
  }
}
