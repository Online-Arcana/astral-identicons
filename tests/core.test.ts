import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build.ts";
import {
  codeAnchorPoint,
  codeAnchors,
  codeSectorCount,
  codeSlotPoint,
  codeSymbolPoint,
  codeSymbolSpacing,
  codeTrackCount,
  innerClipRadius
} from "../src/code-layout.ts";
import {
  glyphCarrierDigits,
  glyphCarriers,
  glyphMarkCount
} from "../src/glyph-code.ts";
import { input } from "../src/input.ts";
import { centre, ringPlacements } from "../src/layout.ts";
import { palette, paletteForIndex } from "../src/palette.ts";
import {
  paletteCount,
  seedDataByteCount,
  seedPaletteIndex,
  seedPayload,
  seedSlotCount
} from "../src/seed.ts";
import {
  payloadParity,
  recoverStarParity,
  starParityCodeword,
  type ByteObservation
} from "../src/star-parity.ts";
import type { AssetSource } from "../src/types.ts";
import { recoverVisualCode } from "../src/visual-code.ts";

const sample = {
  seed: "62-70-F2-Example",
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

function observed(value: number | null, confidence = 0.98): ByteObservation {
  return { value, confidence: value === null ? 0 : confidence };
}

describe("systematic visual payload", () => {
  test("stores all 40 payload bytes in twenty glyph carriers", () => {
    const value = input(sample);
    const payload = seedPayload(value);
    const carriers = glyphCarriers(value);
    const recovered: number[] = [];

    expect(carriers.length).toBe(20);
    expect(glyphMarkCount).toBe(8);

    for (const carrier of carriers) {
      const digits = glyphCarrierDigits(value, carrier);
      let word = 0;

      for (let index = 0; index < digits.length; index += 1) {
        word |= digits[index]! << (index * 2);
      }

      recovered.push(word & 0xff, word >>> 8);
    }

    expect(recovered).toEqual([...payload]);
    expect(recovered.length).toBe(seedDataByteCount);
  });

  test("uses stars only as an expanded parity code", () => {
    const value = input(sample);
    const expanded = starParityCodeword(value);
    const parity = payloadParity(value);
    const payload = seedPayload(value);

    expect(expanded.length).toBe(128);
    expect([...expanded.slice(0, 24)]).toEqual([...parity]);
    expect(
      JSON.stringify([...expanded.slice(0, 40)]) === JSON.stringify([...payload])
    ).toBe(false);
  });

  test("recovers all parity bytes from fifty percent plus one stars", () => {
    const value = input(sample);
    const expanded = starParityCodeword(value);
    const observations = [...expanded].map((byte, index) => {
      const keep = index % 2 === 0 || index === 127;
      return observed(keep ? byte : null);
    });
    const recovered = recoverStarParity(observations);

    expect(recovered.observedStars).toBe(65);
    expect([...recovered.bytes]).toEqual([...payloadParity(value)]);
  });

  test("repairs twenty-four missing glyph bytes from parity stars", () => {
    const value = input(sample);
    const payload = seedPayload(value);
    const expanded = starParityCodeword(value);
    const glyphs = [...payload].map((byte, index) => {
      return observed(index < 16 ? byte : null);
    });
    const stars = [...expanded].map((byte, index) => {
      const keep = index % 2 === 0 || index === 127;
      return observed(keep ? byte : null);
    });
    const recovered = recoverVisualCode(glyphs, stars);

    expect(recovered.value).toEqual(value);
    expect(recovered.glyphBytes).toBe(16);
    expect(recovered.recoveredGlyphBytes).toBe(24);
    expect(recovered.observedStars).toBe(65);
  });

  test("rejects seeds that cannot fit exactly in the visual payload", () => {
    let message = "";

    try {
      input({ ...sample, seed: "x".repeat(33) });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("at most 32 UTF-8 bytes");
  });
});

describe("visual scanner geometry", () => {
  test("uses 128 deterministic star slots across four polar tracks", () => {
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

  test("gives every star sixteen distinct position values", () => {
    for (let slot = 0; slot < seedSlotCount; slot += 1) {
      const positions = new Set<string>();

      for (let value = 0; value < 16; value += 1) {
        const point = codeSymbolPoint(slot, value);
        positions.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
      }

      expect(positions.size).toBe(16);
    }

    expect(codeSymbolSpacing).toBe(10);
  });

  test("keeps every parity-star position inside the inner clipping circle", () => {
    for (let slot = 0; slot < seedSlotCount; slot += 1) {
      for (let value = 0; value < 16; value += 1) {
        const point = codeSymbolPoint(slot, value);
        const radius = Math.hypot(point.x - centre, point.y - centre);
        expect(radius < innerClipRadius - 7).toBe(true);
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
});

describe("palette", () => {
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

  test("is deterministic and tied to the exact seed", () => {
    const first = palette(sample.seed);
    const second = palette(sample.seed);

    expect(first).toEqual(second);
    expect(seedPaletteIndex(sample.seed)).toBe(seedPaletteIndex(sample.seed));
    expect(first.background.reduced).toMatch(/^#[0-9A-F]{3}$/);
  });
});

describe("builder", () => {
  test("exports a deterministic SVG with glyph data and parity stars", async () => {
    const value = input(sample);
    const first = await buildIdenticon(value, assets);
    const second = await buildIdenticon(value, assets);

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 1024 1024"');
    expect(first).toContain(`data-input="{&quot;seed&quot;:&quot;${sample.seed}`);
    expect(first).toContain(`data-palette-index="${seedPaletteIndex(sample.seed)}"`);
    expect(first).toContain('data-code-version="6"');
    expect(first).toContain('id="glyph-data"');
    expect(first).toContain('data-code="systematic-glyph-payload-40-v6"');
    expect(first).toContain('data-code-role="primary-identicon-data"');
    expect(first).toContain('id="parity-stars"');
    expect(first).toContain('data-code="reed-solomon-star-parity-128-24-v6"');
    expect(first).toContain('data-code-role="error-correction-disambiguation"');
    expect(first).toContain('data-code-role="parity-disambiguator"');
    expect(first.includes('data-code-role="complete-identicon-payload"')).toBe(false);
    expect(first.includes("currentColor")).toBe(false);
    expect(first.includes("<style")).toBe(false);
    expect(first.includes("<image")).toBe(false);
  });
});
