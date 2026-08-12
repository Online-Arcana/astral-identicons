import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build-current.ts";
import { input } from "../src/input.ts";
import { exportedV9Svg } from "../src/legacy/exported.ts";
import { recoverV9Record, v9DataByteCount, v9Parity, v9ParityByteCount } from "../src/record-v9.ts";
import type { AstralPublicWheel } from "../src/astral-public.ts";
import { testAssets } from "./fixtures/assets.ts";

const assets = testAssets();
const sample = input({
  seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const wheel = {
  schema: "astral-public-wheel/1.0.0",
  calculationFingerprint: "test",
  primaryHouseSystem: "placidus",
  points: {
    sun: 288,
    moon: 170,
    mercury: 302,
    venus: 252,
    mars: 23,
    jupiter: 116,
    saturn: 337,
    uranus: 314,
    neptune: 301,
    pluto: 244,
    north_node_true: 20,
    south_node_true: 200,
    north_node_mean: 21,
    south_node_mean: 201,
    ascendant: 280,
    descendant: 100,
    midheaven: 190,
    imum_coeli: 10,
    vertex: 222,
    antivertex: 42,
    east_point: 276,
    part_of_fortune: 153,
    part_of_spirit: 333,
    lilith_mean: 88,
    lilith_true: 91
  },
  houses: { status: "unavailable", houses: {} },
  aspects: []
} as unknown as AstralPublicWheel;

function count(source: string, expression: RegExp): number {
  return [...source.matchAll(expression)].length;
}

function observed(value: number) {
  return { value, confidence: 1 };
}
function missing() {
  return { value: null, confidence: 0 };
}

describe("visual V10", () => {
  test("renders the canonical astrology shell and complete RS field", async () => {
    const svg = await buildIdenticon(sample, assets, wheel);
    expect(svg).toContain('data-visual-version="10"');
    expect(svg).toContain('data-scannable="v10"');
    expect(svg).toContain('id="wheel-zodiac"');
    expect(svg).not.toContain('id="wheel-houses"');
    expect(svg).toContain('id="wheel-points"');
    expect(svg).toContain('id="identicon-aspect-overlay"');
    expect(svg).toContain('id="solar-constellation"');
    expect(svg).toContain('id="reed-solomon-stars"');
    expect(svg).toContain('data-code="reed-solomon-168-40-parity-stars-128-v10"');
    expect(count(svg, /data-parity-index=/gu)).toBe(128);
    expect(count(svg, /<line /gu)).toBe(72);

    expect(svg).not.toContain('id="planetary-identity-v9"');
    expect(svg).not.toContain('data-planet-index=');
    expect(svg).not.toContain('data-satellite-size=');
    expect(svg).not.toContain('id="literal-ring-system"');
    expect(svg).not.toContain('id="literal-sign-grid"');
    expect(svg).not.toContain('id="central-sun-reference"');
    expect(svg).not.toContain('id="calibration-stars-v9"');
    expect(svg).not.toContain('id="wheel-aspects"');
    expect(svg).not.toContain('sun:moon:trine');
  });

  test("manual public identities use the same wheel shell without inventing natal positions", async () => {
    const svg = await buildIdenticon(sample, assets);
    expect(svg).toContain('data-visual-version="10"');
    expect(svg).toContain('id="wheel-zodiac"');
    expect(svg).toContain('id="identicon-aspect-overlay"');
    expect(svg).not.toContain('id="wheel-houses"');
    expect(svg).not.toContain('wheel-point-');
  });

  test("renders the ten geocentric planets plus the four cardinal sign carriers", async () => {
    const svg = await buildIdenticon(sample, assets, wheel);
    for (const point of [
      "sun", "moon", "mercury", "venus", "mars",
      "jupiter", "saturn", "uranus", "neptune", "pluto",
      "ascendant", "midheaven", "descendant", "imum_coeli"
    ] as const) {
      expect(svg).toContain(`wheel-point-${point}`);
      expect(svg).toContain(`data-point="${point}"`);
    }
    expect(svg).not.toContain("wheel-point-earth");
    for (const hidden of [
      "north_node_true", "south_node_true", "north_node_mean", "south_node_mean",
      "vertex", "antivertex", "east_point",
      "part_of_fortune", "part_of_spirit", "lilith_mean", "lilith_true"
    ] as const) expect(svg).not.toContain(`wheel-point-${hidden}`);
    expect(svg).not.toContain('id="wheel-houses"');
  });

  test("the 128 parity stars can recover the complete record with every data byte erased", () => {
    const parityBytes = [...v9Parity(sample)];
    const parity = parityBytes.map((value, index) => index < v9DataByteCount
      ? observed(value)
      : missing());
    const recovered = recoverV9Record({
      data: Array.from({ length: v9DataByteCount }, missing),
      parity
    });

    expect(parityBytes.length).toBe(v9ParityByteCount);
    expect(recovered.value).toEqual(sample);
    expect(recovered.erasures).toBe(128);
  });

  test("exact exported SVG metadata remains recoverable without the old planet channel", async () => {
    const svg = await buildIdenticon(sample, assets, wheel);
    expect(exportedV9Svg(svg)).toEqual(sample);
  });
});
