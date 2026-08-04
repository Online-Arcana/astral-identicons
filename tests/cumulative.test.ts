import { describe, expect, test } from "bun:test";
import { input } from "../src/input.ts";
import { seedPayload } from "../src/seed.ts";
import { starParityCodeword, type ByteObservation } from "../src/star-parity.ts";
import {
  VisualCaptureSeries,
  type VisualCaptureSnapshot
} from "../src/visual-series.ts";

const sample = input({
  seed: "6270f2-example",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

function observations(
  values: Uint8Array,
  included: ReadonlySet<number>
): readonly ByteObservation[] {
  return [...values].map((value, index) => ({
    value: included.has(index) ? value : null,
    confidence: included.has(index) ? 0.98 : 0
  }));
}

function range(start: number, end: number): Set<number> {
  return new Set(Array.from({ length: end - start }, (_unused, index) => {
    return start + index;
  }));
}

function mask(length: number, indexes: readonly number[]): readonly boolean[] {
  const included = new Set(indexes);
  return Array.from({ length }, (_unused, index) => included.has(index));
}

describe("human cumulative scanner capture", () => {
  test("keeps useful evidence across shake and long out-of-frame gaps", () => {
    const series = new VisualCaptureSeries();
    const payload = seedPayload(sample);
    const stars = starParityCodeword(sample);
    let snapshot: VisualCaptureSnapshot | undefined;

    snapshot = series.add({
      at: 0,
      glyphs: observations(payload, range(0, 8)),
      stars: observations(stars, range(0, 32)),
      quality: 0.88,
      centre: mask(9, [0, 1, 2, 3]),
      ring: mask(12, [0, 1, 2, 3, 4])
    });

    expect(snapshot.ready).toBe(false);
    expect(snapshot.glyphBytes).toBe(8);
    expect(snapshot.observedStars).toBe(32);

    snapshot = series.add({
      at: 12_000,
      glyphs: observations(payload, range(8, 16)),
      stars: observations(stars, range(32, 65)),
      quality: 0.91,
      centre: mask(9, [4, 5, 6, 7, 8]),
      ring: mask(12, [5, 6, 7, 8, 9, 10, 11])
    });

    expect(snapshot.ready).toBe(true);
    expect(snapshot.frames).toBe(2);
    expect(snapshot.usefulMilliseconds).toBe(350);
    expect(snapshot.glyphBytes).toBe(16);
    expect(snapshot.observedStars).toBe(65);
    expect(snapshot.centreFound).toBe(9);
    expect(snapshot.ringFound).toBe(12);
    expect(snapshot.reading?.value).toEqual(sample);
    expect(snapshot.reading?.recoveredGlyphBytes).toBe(24);
  });

  test("does not lose saved progress when time passes without a useful frame", () => {
    const series = new VisualCaptureSeries();
    const payload = seedPayload(sample);
    const stars = starParityCodeword(sample);

    series.add({
      at: 0,
      glyphs: observations(payload, range(0, 10)),
      stars: observations(stars, range(0, 40)),
      quality: 0.8,
      centre: mask(9, [0, 1]),
      ring: mask(12, [0, 1])
    });

    const muchLater = series.snapshot();

    expect(muchLater.glyphBytes).toBe(10);
    expect(muchLater.observedStars).toBe(40);
    expect(muchLater.centreFound).toBe(2);
    expect(muchLater.ringFound).toBe(2);
  });
});
