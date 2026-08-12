import { describe, expect, test } from "bun:test";
import { pointGlyphVisible } from "../vendor/astral-chart-wheel/dist/wheel/index.js";
import { v10IdenticonPointGlyphs } from "../src/legacy/renderer/identiconV10.ts";

describe("v10 sign-carrier glyphs", () => {
  test("keeps all ordinary planets and the four cardinal angles visible", () => {
    for (const point of [
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
      "ascendant",
      "midheaven",
      "descendant",
      "imum_coeli",
    ] as const) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(true);
    }
  });

  test("does not reintroduce unrelated angle, node, lot or Lilith glyphs", () => {
    for (const point of [
      "vertex",
      "antivertex",
      "east_point",
      "north_node_true",
      "part_of_fortune",
      "lilith_true",
    ] as const) {
      expect(pointGlyphVisible(point, v10IdenticonPointGlyphs)).toBe(false);
    }
  });
});
