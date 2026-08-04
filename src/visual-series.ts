import { seedDataByteCount, seedSlotCount } from "./seed.ts";
import type { ByteObservation } from "./star-parity.ts";
import { recoverVisualCode, type VisualCodeReading } from "./visual-code.ts";

export interface VisualCaptureEvidence {
  readonly at: number;
  readonly stars: readonly ByteObservation[];
  readonly quality: number;
  readonly centre: readonly boolean[];
  readonly ring: readonly boolean[];
}

export interface VisualCaptureSnapshot {
  readonly usefulMilliseconds: number;
  readonly frames: number;
  readonly observedStars: number;
  readonly requiredStars: number;
  readonly centreFound: number;
  readonly ringFound: number;
  readonly reading: VisualCodeReading | undefined;
  readonly ready: boolean;
}

interface VoteResult extends ByteObservation {
  readonly total: number;
}

function vote(): Float32Array {
  return new Float32Array(256);
}

function observation(votes: Float32Array): VoteResult {
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

  const share = total === 0 ? 0 : best / total;
  const margin = best - second;
  const confidence = best === 0 ? 0 : Math.max(0, Math.min(1, margin / best));

  if (best < 0.24 || share < 0.52 || margin < 0.07) {
    return { value: null, confidence, total };
  }

  return { value: bestValue, confidence, total };
}

export class VisualCaptureSeries {
  readonly #starVotes = Array.from({ length: seedSlotCount }, vote);
  #centre: boolean[] = [];
  #ring: boolean[] = [];
  #frames = 0;
  #usefulMilliseconds = 0;
  #lastUsefulAt: number | undefined;

  clear(): void {
    for (const votes of this.#starVotes) votes.fill(0);
    this.#centre = [];
    this.#ring = [];
    this.#frames = 0;
    this.#usefulMilliseconds = 0;
    this.#lastUsefulAt = undefined;
  }

  add(value: VisualCaptureEvidence): VisualCaptureSnapshot {
    if (value.stars.length !== this.#starVotes.length) {
      throw new Error(`capture requires ${this.#starVotes.length} star bytes`);
    }

    const weight = 0.35 + Math.max(0, Math.min(1, value.quality)) * 0.65;
    this.addVotes(this.#starVotes, value.stars, weight);
    this.mergeRegions(value.centre, value.ring);

    if (this.#lastUsefulAt === undefined) {
      this.#usefulMilliseconds += 100;
    } else {
      this.#usefulMilliseconds += Math.max(
        40,
        Math.min(250, value.at - this.#lastUsefulAt)
      );
    }

    this.#lastUsefulAt = value.at;
    this.#frames += 1;
    return this.snapshot();
  }

  snapshot(): VisualCaptureSnapshot {
    const stars = this.#starVotes.map(observation);
    const observedStars = stars.filter((value) => value.value !== null).length;
    let reading: VisualCodeReading | undefined;

    if (observedStars >= seedDataByteCount) {
      try {
        reading = recoverVisualCode(stars);
      } catch {
        reading = undefined;
      }
    }

    return {
      usefulMilliseconds: this.#usefulMilliseconds,
      frames: this.#frames,
      observedStars,
      requiredStars: seedDataByteCount,
      centreFound: this.#centre.filter(Boolean).length,
      ringFound: this.#ring.filter(Boolean).length,
      reading,
      ready: Boolean(reading) && (
        this.#frames >= 2 ||
        (reading?.confidence ?? 0) >= 0.86
      )
    };
  }

  private addVotes(
    targets: readonly Float32Array[],
    observations: readonly ByteObservation[],
    weight: number
  ): void {
    for (let index = 0; index < observations.length; index += 1) {
      const value = observations[index]!;
      if (value.value === null) continue;

      const confidence = 0.08 + value.confidence * 0.92;
      targets[index]![value.value] += weight * confidence;
    }
  }

  private mergeRegions(
    centre: readonly boolean[],
    ring: readonly boolean[]
  ): void {
    if (this.#centre.length === 0) this.#centre = Array(centre.length).fill(false);
    if (this.#ring.length === 0) this.#ring = Array(ring.length).fill(false);

    for (let index = 0; index < this.#centre.length; index += 1) {
      this.#centre[index] ||= centre[index] ?? false;
    }

    for (let index = 0; index < this.#ring.length; index += 1) {
      this.#ring[index] ||= ring[index] ?? false;
    }
  }
}
