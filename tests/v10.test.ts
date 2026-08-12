import { describe, expect, test } from "bun:test";
import type { PublicWheelMeta } from "../vendor/astral-chart-wheel/dist/index.js";
import { buildIdenticon } from "../src/build.ts";
import { exportedV9Svg } from "../src/scan-v9-svg.ts";
import { input } from "../src/input.ts";
import {
  recoverV9Record,
  v9DataByteCount,
  v9Parity,
  v9ParityByteCount,
  type V9ByteObservation
} from "../src/record-v9.ts";
import type { AssetSource } from "../src/types.ts";

const sample = input({
  seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;
const assets: AssetSource = {
  constellation: async () => simpleAsset,
  sigil: async () => simpleAsset,
  star: async () => simpleAsset,
  astrologyGlyph: async () => simpleAsset
};

const points: PublicWheelMeta["points"] = {
  sun: 285.25,
  moon: 166.5,
  mercury: 301.2,
  venus: 274.1,
  mars: 52.8,
  jupiter: 138.4,
  saturn: 303.7,
  uranus: 282.2,
  neptune: 284.5,
  pluto: 229.3,
  north_node_true: 289.1,
  south_node_true: 109.1,
  north_node_mean: null,
  south_node_mean: null,
  ascendant: 291.75,
  descendant: 111.75,
  midheaven: 194.2,
  imum_coeli: 14.2,
  vertex: 148.6,
  antivertex: 328.6,
  east_point: 300.4,
  part_of_fortune: 173.9,
  part_of_spirit: 49.6,
  lilith_mean: 267.2,
  lilith_true: 271.8
};

const houses = Object.fromEntries(
  Array.from({ length: 12 }, (_unused, index) => {
    const number = index + 1;
    const cusp = (291.75 + index * 30) % 360;
    return [String(number), {
      number,
      cuspLongitudeDegrees: cusp,
      endLongitudeDegrees: (cusp + 30) % 360
    }];
  })
) as PublicWheelMeta["houses"]["houses"];

const wheel: PublicWheelMeta = {
  schema: "astral-public-wheel/1.0.0",
  calculationFingerprint: "v10-test-fixture",
  primaryHouseSystem: "placidus",
  points,
  houses: {
    status: "calculated",
    houses
  },
  aspects: [{
    id: "sun:moon:trine",
    a: "sun",
    b: "moon",
    kind: "trine",
    class: "major",
    character: "flowing"
  }]
};

function missing(): V9ByteObservation {
  return { value: null, confidence: 0 };
}

function observed(value: number): V9ByteObservation {
  return { value, confidence: 0.99 };
}

function count(source: string, expression: RegExp): number {
  return [...source.matchAll(expression)].length;
}

describe("v10 chart-wheel identicon", () => {
  test("renders the natal wheel with only constellation art and RS stars in the aspect area", async () => {
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

  test("renders the ten geocentric planets plus all four cardinal sign carriers", async () => {
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
