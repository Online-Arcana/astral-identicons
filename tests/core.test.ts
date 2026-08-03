import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build.ts";
import {
  codeAnchorPoint,
  codeAnchors,
  codeBitSeparation,
  codeSectorCount,
  codeSlotPoint,
  codeSymbolPoint,
  codeTrackCount,
  innerClipRadius
} from "../src/code-layout.ts";
import { input } from "../src/input.ts";
import { centre, ringPlacements } from "../src/layout.ts";
import {
  palette,
  paletteForIndex,
  paletteIndexFromReduced
} from "../src/palette.ts";
import { matchPalette, type Rgb } from "../src/scan-colour.ts";
import { recoverPaletteCorrection } from "../src/scan-seed.ts";
import {
  canonicalPaletteSeed,
  paletteCorrectionBits,
  paletteCount,
  seedCode,
  seedPaletteIndex,
  seedSlotCount
} from "../src/seed.ts";
import type { AssetSource } from "../src/types.ts";

const sample = {
  seed: "6270f2-example",
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

function rgb(value: string): Rgb {
  const digits = value.slice(1).split("");

  return {
    r: Number.parseInt(digits[0]! + digits[0]!, 16),
    g: Number.parseInt(digits[1]! + digits[1]!, 16),
    b: Number.parseInt(digits[2]! + digits[2]!, 16)
  };
}

function hamming(left: readonly number[], right: readonly number[]): number {
  let distance = 0;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }

  return distance;
}

describe("palette seed", () => {
  test("normalises arbitrary input while preserving explicit palette seeds", () => {
    const exact = "0123456789ABCDEF".repeat(4);
    expect(seedCode("same-seed")).toMatch(/^[0-9A-F]{64}$/);
    expect(seedCode(exact.toLowerCase())).toBe(exact);

    for (let index = 0; index < paletteCount; index += 1) {
      expect(seedPaletteIndex(canonicalPaletteSeed(index))).toBe(index);
    }
  });

  test("uses 64 unique reduced palettes", () => {
    const keys = new Set<string>();

    for (let index = 0; index < paletteCount; index += 1) {
      const value = paletteForIndex(index);
      keys.add([
        value.background.reduced,
        value.layer0.reduced,
        value.layer1.reduced
      ].join("|"));
    }

    expect(keys.size).toBe(paletteCount);
  });

  test("keeps palette correction codewords far apart", () => {
    const codewords = Array.from(
      { length: paletteCount },
      (_unused, index) => paletteCorrectionBits(index)
    );
    let minimum = Number.POSITIVE_INFINITY;

    for (let left = 0; left < codewords.length; left += 1) {
      for (let right = left + 1; right < codewords.length; right += 1) {
        minimum = Math.min(
          minimum,
          hamming(codewords[left]!, codewords[right]!)
        );
      }
    }

    expect(minimum).toBe(64);
  });

  test("correction stars override a wrong camera colour guess", () => {
    const index = 37;
    const observations = paletteCorrectionBits(index).map((value, slot) => ({
      value: slot % 17 === 0 ? null : value,
      confidence: slot % 11 === 0 ? 0.15 : 0.95
    }));

    for (let slot = 3; slot < observations.length; slot += 19) {
      const current = observations[slot]!;
      if (current.value === null) continue;
      observations[slot] = {
        value: current.value === 0 ? 1 : 0,
        confidence: 0.12
      };
    }

    const recovered = recoverPaletteCorrection(observations, {
      index: 12,
      confidence: 1
    });

    expect(recovered.index).toBe(index);
    expect(recovered.uncertainStars > 0).toBe(true);
    expect(recovered.mismatches > 0).toBe(true);
  });
});

describe("visual scanner geometry", () => {
  test("uses 128 deterministic slots across four polar tracks", () => {
    const points = new Set<string>();

    for (let slot = 0; slot < seedSlotCount; slot += 1) {
      const point = codeSlotPoint(slot);
      points.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
    }

    expect(seedSlotCount).toBe(128);
    expect(codeTrackCount).toBe(4);
    expect(codeSectorCount).toBe(32);
    expect(points.size).toBe(seedSlotCount);
  });

  test("uses two clearly separated radial positions per correction bit", () => {
    for (let slot = 0; slot < seedSlotCount; slot += 1) {
      const zero = codeSymbolPoint(slot, 0);
      const one = codeSymbolPoint(slot, 1);
      const separation = Math.hypot(zero.x - one.x, zero.y - one.y);

      expect(Math.abs(separation - codeBitSeparation) < 0.000001).toBe(true);
    }
  });

  test("keeps every correction position inside the inner clipping circle", () => {
    for (let slot = 0; slot < seedSlotCount; slot += 1) {
      for (const bit of [0, 1] as const) {
        const point = codeSymbolPoint(slot, bit);
        const radius = Math.hypot(point.x - centre, point.y - centre);
        expect(radius < innerClipRadius - 8).toBe(true);
      }
    }
  });

  test("uses asymmetric registration anchors", () => {
    const keys = new Set(codeAnchors.map((anchor) => {
      const point = codeAnchorPoint(anchor);
      return `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${anchor.size}`;
    }));

    expect(keys.size).toBe(3);
  });

  test("places Imum Coeli left and Descendant right on the ring", () => {
    const value = input(sample);
    const ring = ringPlacements(value);
    const descendant = ring.find((placement) => placement.role === "Descendant")!;
    const imumCoeli = ring.find((placement) => placement.role === "Imum Coeli")!;

    expect(descendant.angle).toBe(150);
    expect(descendant.x > centre).toBe(true);
    expect(imumCoeli.angle).toBe(210);
    expect(imumCoeli.x < centre).toBe(true);
  });

  test("recovers an exact palette codebook entry from perfect colours", () => {
    const index = 37;
    const value = paletteForIndex(index);
    const match = matchPalette(
      rgb(value.background.reduced),
      rgb(value.layer0.reduced),
      rgb(value.layer1.reduced)
    );

    expect(match.index).toBe(index);
    expect(match.cost).toBe(0);
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
  test("exports a deterministic standalone SVG with palette error correction", async () => {
    const value = input(sample);
    const first = await buildIdenticon(value, assets);
    const second = await buildIdenticon(value, assets);

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 1024 1024"');
    expect(first).toContain(`data-palette-index="${seedPaletteIndex(sample.seed)}"`);
    expect(first).toContain('data-code-version="4"');
    expect(first).toContain('data-code="hadamard-32x4-palette-v4"');
    expect(first).toContain('data-code-role="palette-error-correction"');
    expect(first).toContain('data-code-slots="128"');
    expect(first).toContain('data-code-tracks="4"');
    expect(first).toContain('data-code-sectors="32"');
    expect(first).toContain('data-code-bit="0"');
    expect(first).toContain('data-code-bit="1"');
    expect(first).toContain('id="registration-stars"');
    expect(first).toContain('id="coded-stars"');
    expect(first).toContain('data-code-colour="layer1"');
    expect(first).toContain('data-code-symbol-size="12"');
    expect(first).toContain('data-code-symbol-separation="24"');
    expect(first).toContain('data-code-halo-radius="8"');
    expect(first).toContain('opacity="1"');
    expect(first).toContain('id="foreground-layer-0"');
    expect(first).toContain('id="foreground-layer-1-core"');
    expect(first).toContain('data-recognition-role="upright-sign-reference"');
    expect(first).toContain('id="ring-system"');
    expect(first).not.toContain("currentColor");
    expect(first).not.toContain("<style");
    expect(first).not.toContain("<image");
  });
});
