import { describe, expect, test } from "bun:test";
import {
  v9RayFadingLevels,
  v9StarCalibrationLevels
} from "../src/calibration-v9.ts";
import {
  calibrationStarRadius,
  calibrationStarSizes,
  centralSun,
  encodedFieldGap,
  maximumCalibrationStarRadius,
  maximumParityEnvelope,
  maximumPlanetEnvelope,
  parityDensityStrokeWidths,
  parityFadingOpacities,
  parityGroupRadii,
  parityStarSizes,
  planetAnchorOuterRadius,
  planetAnchorPoints,
  planetDensityStrokeWidths,
  planetFadingOpacities,
  planetGlyphSizes,
  v9InnerClipRadius
} from "../src/layout-v9.ts";
import { canvas, outerRingRadius, ringStroke } from "../src/layout.ts";
import { planetAnchorCount } from "../src/planet.ts";

describe("v9 visual hierarchy", () => {
  test("keeps planetary glyphs exactly twice star size", () => {
    expect(parityStarSizes).toEqual([13, 15, 17, 19, 21, 23]);
    expect(calibrationStarSizes).toEqual(parityStarSizes);
    expect(planetGlyphSizes).toEqual([26, 30, 34, 38, 42, 46]);

    for (let level = 0; level < planetGlyphSizes.length; level += 1) {
      expect(Number(planetGlyphSizes[level])).toBe(
        Number(parityStarSizes[level]) * 2
      );
    }

    expect(centralSun.glyphSize).toBe(46);
  });

  test("uses fading rather than stroke thickness as the six-level channel", () => {
    expect(planetDensityStrokeWidths).toEqual([0, 0, 0, 0, 0, 0]);
    expect(parityDensityStrokeWidths).toEqual([0, 0, 0, 0, 0, 0]);
    expect(new Set(planetFadingOpacities).size).toBe(6);
    expect(new Set(parityFadingOpacities).size).toBe(6);
  });

  test("keeps ray fading and circumference-star calibration separate", () => {
    expect(v9RayFadingLevels).toEqual([6, 1, 5, 2, 4, 3, 4, 3, 5, 2, 1, 6]);
    expect(v9StarCalibrationLevels).toEqual([6, 1, 5, 2, 4, 3, 6, 3, 4, 2, 5, 1]);
    expect(v9StarCalibrationLevels[0]).toBe(6);
    expect(v9StarCalibrationLevels[6]).toBe(6);
  });

  test("keeps payload fields separate and calibration stars outside the ring", () => {
    expect(encodedFieldGap).toBeGreaterThan(0);
    expect(
      parityGroupRadii.at(-1)! + maximumParityEnvelope
    ).toBeLessThanOrEqual(v9InnerClipRadius);
    expect(
      planetAnchorOuterRadius + maximumPlanetEnvelope
    ).toBeLessThan(
      parityGroupRadii[0]! - maximumParityEnvelope
    );
    expect(calibrationStarRadius).toBeGreaterThan(
      outerRingRadius + ringStroke / 2
    );
    expect(
      calibrationStarRadius + maximumCalibrationStarRadius
    ).toBeLessThanOrEqual(canvas / 2);
  });

  test("provides exactly 256 balanced legal anchors", () => {
    expect(planetAnchorPoints.length).toBe(planetAnchorCount);
    expect(new Set(planetAnchorPoints.map((point) => {
      return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
    })).size).toBe(planetAnchorCount);
  });
});
