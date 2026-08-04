import { describe, expect, test } from "bun:test";
import {
  centralSun,
  encodedFieldGap,
  maximumParityEnvelope,
  maximumPlanetEnvelope,
  parityDensityStrokeWidths,
  parityFadingOpacities,
  parityGroupRadii,
  planetAnchorOuterRadius,
  planetAnchorPoints,
  planetDensityStrokeWidths,
  planetFadingOpacities,
  planetGlyphSizes,
  v9InnerClipRadius
} from "../src/layout-v9.ts";
import { planetAnchorCount } from "../src/planet.ts";

describe("v9 visual hierarchy", () => {
  test("doubles planetary glyph sizes and matches the Sun to that scale", () => {
    expect(planetGlyphSizes).toEqual([26, 30, 34, 38, 42, 46]);
    expect(centralSun.glyphSize).toBe(46);
  });

  test("uses fading rather than stroke thickness as the six-level channel", () => {
    expect(planetDensityStrokeWidths).toEqual([0, 0, 0, 0, 0, 0]);
    expect(parityDensityStrokeWidths).toEqual([0, 0, 0, 0, 0, 0]);
    expect(new Set(planetFadingOpacities).size).toBe(6);
    expect(new Set(parityFadingOpacities).size).toBe(6);
  });

  test("keeps the planetary and parity fields physically separate", () => {
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
});
