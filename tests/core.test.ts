import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build.ts";
import { input } from "../src/input.ts";
import {
  palette,
  paletteForIndex,
  paletteIndexFromReduced
} from "../src/palette.ts";
import {
  decodeSeedNibbles,
  encodedSeedNibbles,
  seedCode,
  seedNibbleSlot,
  seedPaletteIndex
} from "../src/seed.ts";
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
  sigil: async () => simpleAsset,
  star: async () => simpleAsset
};

describe("visual seed", () => {
  test("normalises input to a recoverable 256-bit code", () => {
    const exact = "0123456789ABCDEF".repeat(4);
    expect(seedCode("same-seed")).toMatch(/^[0-9A-F]{64}$/);
    expect(seedCode(exact.toLowerCase())).toBe(exact);
  });

  test("uses 64 unique palettes as six redundant seed bits", () => {
    const keys = new Set<string>();

    for (let index = 0; index < 64; index += 1) {
      const value = paletteForIndex(index);
      keys.add([
        value.background.reduced,
        value.layer0.reduced,
        value.layer1.reduced
      ].join("|"));
    }

    expect(keys.size).toBe(64);
  });

  test("recovers sixteen erased Reed-Solomon bytes", () => {
    const valuePalette = palette(sample.seed);
    const paletteIndex = paletteIndexFromReduced(
      valuePalette.background.reduced,
      valuePalette.layer0.reduced,
      valuePalette.layer1.reduced
    );

    const slots: Array<number | null> = [...encodedSeedNibbles(sample.seed)];

    for (let index = 0; index < 16; index += 1) {
      const byte = (index * 7) % 48;
      slots[seedNibbleSlot(byte * 2)] = null;
      slots[seedNibbleSlot(byte * 2 + 1)] = null;
    }

    expect(paletteIndex).toBe(seedPaletteIndex(sample.seed));
    expect(decodeSeedNibbles(slots, paletteIndex)).toBe(seedCode(sample.seed));
  });
});

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
  test("exports a deterministic standalone SVG with a recoverable seed", async () => {
    const value = input(sample);
    const first = await buildIdenticon(value, assets);
    const second = await buildIdenticon(value, assets);

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 1024 1024"');
    expect(first).toContain(`data-seed-code="${seedCode(sample.seed)}"`);
    expect(first).toContain('data-code="reed-solomon-48-32-v1"');
    expect(first).toContain('data-code-slots="96"');
    expect(first).toContain('data-code-parity="true"');
    expect(first).toContain('id="background-stars"');
    expect(first).toContain('id="foreground-layer-0"');
    expect(first).toContain('id="foreground-layer-1-core"');
    expect(first).toContain('id="ring-system"');
    expect(first).not.toContain("currentColor");
    expect(first).not.toContain("<style");
    expect(first).not.toContain("<image");
  });
});
