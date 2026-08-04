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

interface SlotEvidence {
  readonly peaks: Float32Array;
  readonly support: Uint8Array;
}

function slotEvidence(): SlotEvidence {
  return {
    peaks: new Float32Array(256),
    support: new Uint8Array(256)
  };
}

function observation(evidence: SlotEvidence): ByteObservation {
  let bestValue = 0;
  let best = 0;
  let second = 0;

  for (let value = 0; value < evidence.peaks.length; value += 1) {
    const peak = evidence.peaks[value] ?? 0;
    const confirmation = Math.min(0.18, (evidence.support[value] ?? 0) * 0.03);
    const score = peak + confirmation;

    if (score > best) {
      second = best;
      best = score;
      bestValue = value;
      continue;
    }

    if (score > second) second = score;
  }

  if (best < 0.24) return { value: null, confidence: 0 };

  return {
    value: bestValue,
    confidence: Math.max(0, Math.min(1, (best - second) / Math.max(0.01, best)))
  };
}

export class VisualCaptureSeries {
  readonly #stars = Array.from({ length: seedSlotCount }, slotEvidence);
  #centre: boolean[] = [];
  #ring: boolean[] = [];
  #frames = 0;
  #usefulMilliseconds = 0;
  #lastUsefulAt: number | undefined;
  #reading: VisualCodeReading | undefined;

  clear(): void {
    for (const evidence of this.#stars) {
      evidence.peaks.fill(0);
      evidence.support.fill(0);
    }
    this.#centre = [];
    this.#ring = [];
    this.#frames = 0;
    this.#usefulMilliseconds = 0;
    this.#lastUsefulAt = undefined;
    this.#reading = undefined;
  }

  add(value: VisualCaptureEvidence): VisualCaptureSnapshot {
    if (value.stars.length !== this.#stars.length) {
      throw new Error(`capture requires ${this.#stars.length} star bytes`);
    }

    const weight = 0.35 + Math.max(0, Math.min(1, value.quality)) * 0.65;
    this.addEvidence(value.stars, weight);
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
    const stars = this.#stars.map(observation);
    const observedStars = stars.filter((value) => value.value !== null).length;

    if (!this.#reading && observedStars >= seedDataByteCount) {
      try {
        this.#reading = recoverVisualCode(stars);
      } catch {
        this.#reading = undefined;
      }
    }

    return {
      usefulMilliseconds: this.#usefulMilliseconds,
      frames: this.#frames,
      observedStars,
      requiredStars: seedDataByteCount,
      centreFound: this.#centre.filter(Boolean).length,
      ringFound: this.#ring.filter(Boolean).length,
      reading: this.#reading,
      ready: Boolean(this.#reading)
    };
  }

  private addEvidence(
    observations: readonly ByteObservation[],
    weight: number
  ): void {
    for (let index = 0; index < observations.length; index += 1) {
      const observation = observations[index]!;
      if (observation.value === null) continue;

      const evidence = this.#stars[index]!;
      const confidence = 0.08 + observation.confidence * 0.92;
      const score = weight * confidence;
      const current = evidence.peaks[observation.value] ?? 0;

      evidence.peaks[observation.value] = Math.max(current, score);
      if (score >= 0.2 && evidence.support[observation.value]! < 6) {
        evidence.support[observation.value] += 1;
      }
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
