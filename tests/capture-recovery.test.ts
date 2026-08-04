import { describe, expect, test } from "bun:test";
import {
  captureMinimumFrames,
  captureMinimumMilliseconds,
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
  confidence = 0.95,
  mutate?: (value: number, slot: number) => number
): readonly ByteObservation[] {
  return [...values].map((value, slot) => ({
    value: include(slot) ? (mutate?.(value, slot) ?? value) : null,
    confidence: include(slot) ? confidence : 0
  }));
}

function readiness(overrides: Partial<Parameters<typeof captureReady>[0]> = {}) {
  return {
    observedStars: 81,
    centreFound: 9,
    ringFound: 12,
    hasReading: false,
    capturedRoles: 6,
    frames: captureMinimumFrames,
    usefulMilliseconds: captureMinimumMilliseconds,
    ...overrides
  };
}

describe("offline capture transition", () => {
  test("does not snap on the first threshold crossing", () => {
    expect(captureObservationTarget).toBe(56);
    expect(captureReady(readiness({
      observedStars: 88,
      frames: 2,
      usefulMilliseconds: 320
    }))).toBe(false);
  });

  test("waits for several comparison frames and a real settling interval", () => {
    expect(captureMinimumFrames).toBe(6);
    expect(captureMinimumMilliseconds).toBe(1_200);
    expect(captureReady(readiness())).toBe(true);
  });

  test("still allows an earlier verified decode only after settling", () => {
    expect(captureReady(readiness({
      observedStars: 40,
      hasReading: true,
      frames: 3,
      usefulMilliseconds: 600
    }))).toBe(false);
    expect(captureReady(readiness({
      observedStars: 40,
      hasReading: true
    }))).toBe(true);
  });

  test("combines independently captured evidence sources offline", () => {
    const codeword = starParityCodeword(sample);
    const first = source(codeword, (slot) => slot % 2 === 0);
    const second = source(codeword, (slot) => slot % 2 === 1);
    const recovered = recoverCaptured([first, second]);

    expect(recovered?.value).toEqual(sample);
  });

  test("uses repeated comparisons to reject one conflicting frame", () => {
    const codeword = starParityCodeword(sample);
    const cleanA = source(codeword, () => true, 0.86);
    const cleanB = source(codeword, () => true, 0.88);
    const damaged = source(
      codeword,
      () => true,
      0.45,
      (value, slot) => slot % 7 === 0 ? value ^ 0x31 : value
    );
    const recovered = recoverCaptured([damaged, cleanA, cleanB]);

    expect(recovered?.value).toEqual(sample);
  });
});
