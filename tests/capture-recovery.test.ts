import { describe, expect, test } from "bun:test";
import {
  captureObservationTarget,
  captureReady,
  recoverCaptured
} from "../src/capture-recovery.ts";
import { input } from "../src/input.ts";
import { starParityCodeword, type ByteObservation } from "../src/star-parity.ts";

const sample = input({
  seed: "offline-capture-recovery",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

function source(
  values: Uint8Array,
  include: (slot: number) => boolean,
  confidence = 0.95
): readonly ByteObservation[] {
  return [...values].map((value, slot) => ({
    value: include(slot) ? value : null,
    confidence: include(slot) ? confidence : 0
  }));
}

describe("offline capture transition", () => {
  test("freezes after enough distinct observations and visual coverage", () => {
    expect(captureObservationTarget).toBe(56);
    expect(captureReady({
      observedStars: 56,
      centreFound: 9,
      ringFound: 12,
      hasReading: false,
      capturedRoles: 6
    })).toBe(true);
  });

  test("does not require the decoder to finish before stopping the camera", () => {
    expect(captureReady({
      observedStars: 81,
      centreFound: 9,
      ringFound: 12,
      hasReading: false,
      capturedRoles: 6
    })).toBe(true);
  });

  test("combines independently captured evidence sources offline", () => {
    const codeword = starParityCodeword(sample);
    const first = source(codeword, (slot) => slot % 2 === 0);
    const second = source(codeword, (slot) => slot % 2 === 1);
    const recovered = recoverCaptured([first, second]);

    expect(recovered?.value).toEqual(sample);
  });
});
