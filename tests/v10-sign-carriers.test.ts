import { describe, expect, test } from "bun:test";
import {
  pointGlyphVisible,
  wheelPointCollections,
} from "../vendor/astral-chart-wheel/dist/wheel/index.js";
import { v10IdenticonPointGlyphs } from "../src/legacy/renderer/identiconV10.ts";

const v10Planets = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

const v10SignCarriers = [
  "sun",
  "moon",
  "ascendant",
  "midheaven",
  "descendant",
  "imum_coeli",
] as const;

describe("v10 visible point contract", () => {
  test("uses the geocentric ten-planet set and never Earth", () => {
    expect(wheelPointCollections.planets).toEqual(v10Planets);
    expect(wheelPointCollections.planets).not.toContain("earth");

    for (const point of v10Planets) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(true);
    }
  });

  test("renders all six sign carriers against the twelve-sign zodiac ring", () => {
    for (const point of v10SignCarriers) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(true);
    }
  });

  test("adds only the four cardinal angles beyond the planet collection", () => {
    for (const point of [
      "ascendant",
      "midheaven",
      "descendant",
      "imum_coeli",
    ] as const) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(true);
    }

    for (const point of [
      "vertex",
      "antivertex",
      "east_point",
      "north_node_true",
      "south_node_true",
      "north_node_mean",
      "south_node_mean",
      "part_of_fortune",
      "part_of_spirit",
      "lilith_mean",
      "lilith_true",
    ] as const) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(false);
    }
  });
});
