import { describe, expect, test } from "bun:test";
import { input } from "../src/input.ts";
import { CaptureSeries } from "../src/scan-series.ts";
import { encodedSeedNibbles } from "../src/seed.ts";

const sample = input({
  seed: "6270f2-example",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

function observations(start: number, end: number) {
  return encodedSeedNibbles(sample).map((value, index) => ({
    value: index >= start && index < end ? value : null,
    confidence: index >= start && index < end ? 0.98 : 0
  }));
}

function mask(length: number, start: number, end: number): readonly boolean[] {
  return Array.from({ length }, (_unused, index) => {
    return index >= start && index < end;
  });
}

describe("cumulative scanner capture", () => {
  test("combines different clear elements across a rolling frame series", () => {
    const series = new CaptureSeries();
    const frames = [
      {
        at: 0,
        observations: observations(0, 32),
        centre: mask(9, 0, 3),
        ring: mask(12, 0, 3)
      },
      {
        at: 700,
        observations: observations(32, 64),
        centre: mask(9, 3, 6),
        ring: mask(12, 3, 6)
      },
      {
        at: 1_400,
        observations: observations(64, 96),
        centre: mask(9, 6, 9),
        ring: mask(12, 6, 9)
      },
      {
        at: 2_200,
        observations: observations(96, 128),
        centre: mask(9, 0, 9),
        ring: mask(12, 9, 12)
      },
      {
        at: 2_400,
        observations: observations(0, 128),
        centre: mask(9, 0, 9),
        ring: mask(12, 0, 12)
      }
    ] as const;

    let snapshot;

    for (const frame of frames) {
      snapshot = series.add({
        ...frame,
        quality: 0.92
      });
    }

    expect(snapshot).toBeDefined();
    expect(snapshot!.ready).toBe(true);
    expect(snapshot!.frames).toBe(5);
    expect(snapshot!.elapsed).toBe(2_400);
    expect(snapshot!.observedStars).toBe(128);
    expect(snapshot!.centreFound).toBe(9);
    expect(snapshot!.ringFound).toBe(12);
    expect(snapshot!.reading?.value).toEqual(sample);
  });
});
