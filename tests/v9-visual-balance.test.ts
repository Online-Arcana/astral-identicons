import { describe, expect, test } from "bun:test";
import {
  encodedFieldGap,
  maximumParityEnvelope,
  maximumPlanetEnvelope,
  parityGroupRadii,
  parityStarSizes,
  planetAnchorOuterRadius,
  planetAnchorPoints,
  planetAnchorSpacing,
  planetGlyphSizes,
  v9InnerClipRadius
} from "../src/layout-v9.ts";
import { planetAnchorCount } from "../src/planet.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

describe("v9 visual hierarchy", () => {
  test("never renders an identity glyph larger than the largest parity star", () => {
    expect(Math.max(...planetGlyphSizes)).toBeLessThanOrEqual(
      Math.max(...parityStarSizes)
    );
  });

  test("keeps the planetary and parity envelopes physically separate", () => {
    expect(encodedFieldGap).toBeGreaterThan(0);
    expect(
      parityGroupRadii.at(-1)! + maximumParityEnvelope
    ).toBeLessThanOrEqual(v9InnerClipRadius);
    expect(
      planetAnchorOuterRadius + maximumPlanetEnvelope
    ).toBeLessThan(
      parityGroupRadii[0]! - maximumParityEnvelope
    );
  });

  test("provides exactly 256 balanced legal anchors", () => {
    expect(planetAnchorPoints.length).toBe(planetAnchorCount);
    expect(new Set(planetAnchorPoints.map((point) => {
      return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
    })).size).toBe(planetAnchorCount);
  });

  test("keeps adjacent maximum-size planetary envelopes separate", () => {
    let minimum = Number.POSITIVE_INFINITY;

    for (let left = 0; left < planetAnchorPoints.length; left += 1) {
      for (let right = left + 1; right < planetAnchorPoints.length; right += 1) {
        minimum = Math.min(
          minimum,
          distance(planetAnchorPoints[left]!, planetAnchorPoints[right]!)
        );
      }
    }

    expect(minimum).toBeCloseTo(planetAnchorSpacing, 8);
    expect(minimum).toBeGreaterThan(maximumPlanetEnvelope * 2);
  });
});
