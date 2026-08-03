import { describe, expect, test } from "bun:test";
import { input } from "../src/input.ts";
import { palette } from "../src/palette.ts";
import { buildIdenticon } from "../src/build.ts";
import type { AssetSource } from "../src/types.ts";

const sample = {
  seed: "same-seed",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
} as const;

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;
const assets: AssetSource = {
  constellation: async () => simpleAsset,
  sigil: async () => simpleAsset
};

describe("palette", () => {
  test("is deterministic and reduced", () => {
    const first = palette("test-seed");
    const second = palette("test-seed");
    expect(first).toEqual(second);
    expect(first.background.reduced).toMatch(/^#[0-9A-F]{3}$/);
    expect(first.layer0.reduced).toMatch(/^#[0-9A-F]{3}$/);
    expect(first.layer1.reduced).toMatch(/^#[0-9A-F]{3}$/);
  });

  test("uses the darkest transformed colour as the background", () => {
    const value = palette("test-seed");
    expect(value.background.luminance < value.layer0.luminance).toBe(true);
    expect(value.background.luminance < value.layer1.luminance).toBe(true);
  });
});

describe("builder", () => {
  test("exports a standalone square SVG without CSS colours", async () => {
    const svg = await buildIdenticon(input(sample), assets);
    expect(svg).toContain('viewBox="0 0 1024 1024"');
    expect(svg).toContain('id="foreground-layer-0"');
    expect(svg).toContain('id="foreground-layer-1"');
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("<image");
  });
});
