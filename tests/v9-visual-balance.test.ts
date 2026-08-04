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
  minimumParityGroupSeparation,
  minimumPlanetAnchorSeparation,
  minimumPlanetEnvelopeGap,
  parityDensityStrokeWidths,
  parityFadingOpacities,
  parityGroupPoints,
  parityStarSizes,
  planetAnchorPoints,
  planetDensityStrokeWidths,
  planetFadingOpacities,
  planetGlyphSizes,
  planetGroupCentres,
  v9InnerClipRadius
} from "../src/layout-v9.ts";
import { canvas, centre, outerRingRadius, ringStroke } from "../src/layout.ts";
import {
  planetAnchorCount,
  planetAnchorGroupCount
} from "../src/planet.ts";
import { v9ParityStarCount } from "../src/parity-v9.ts";

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

  test("keeps payload stars inside and only calibration stars outside", () => {
    expect(encodedFieldGap).toBeGreaterThan(0);
    expect(parityGroupPoints.length).toBe(v9ParityStarCount);
    for (const point of parityGroupPoints) {
      const radius = Math.hypot(point.x - centre, point.y - centre);
      expect(radius + maximumParityEnvelope).toBeLessThanOrEqual(v9InnerClipRadius);
    }
    expect(minimumParityGroupSeparation).toBeGreaterThan(
      maximumParityEnvelope * 2 + 2
    );
    expect(calibrationStarRadius).toBeGreaterThan(
      outerRingRadius + ringStroke / 2
    );
    expect(
      calibrationStarRadius + maximumCalibrationStarRadius
    ).toBeLessThanOrEqual(canvas / 2);
  });

  test("scatters parity groups rather than arranging them in circular tracks", () => {
    const radii = parityGroupPoints.map((point) => {
      return Math.hypot(point.x - centre, point.y - centre).toFixed(1);
    });
    expect(new Set(radii).size).toBeGreaterThan(100);
  });

  test("keeps all eleven possible planets visibly separated", () => {
    expect(planetGroupCentres.length).toBe(planetAnchorGroupCount);
    expect(minimumPlanetAnchorSeparation).toBeGreaterThan(69);
    expect(minimumPlanetEnvelopeGap).toBeGreaterThanOrEqual(18);
  });

  test("preserves exactly 256 legal anchor identities", () => {
    expect(planetAnchorPoints.length).toBe(planetAnchorCount);
    expect(planetAnchorCount).toBe(256);
    expect(new Set(planetAnchorPoints.map((point) => {
      return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
    })).size).toBe(planetAnchorCount);
  });
});
