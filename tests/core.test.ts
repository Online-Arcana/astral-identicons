import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build.ts";
import {
  codeSectorCount,
  codeSlotPoint,
  codeSymbolPoint,
  codeSymbolSpacing,
  codeTrackCount,
  innerClipRadius,
  northStar,
  northStarPoint
} from "../src/code-layout.ts";
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
  recoverStarParity,
  starParityCodeword,
  starParityExpansionByteCount,
  type ByteObservation
} from "../src/star-parity.ts";
import type { AssetSource } from "../src/types.ts";
import { recoverVisualCode } from "../src/visual-code.ts";

const sample = input({
  seed: "62-70-F2-Example",
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
  star: async () => simpleAsset
};

function observed(value: number | null, confidence = 0.98): ByteObservation {
  return { value, confidence: value === null ? 0 : confidence };
}

function selectedStars(codeword: Uint8Array, indexes: ReadonlySet<number>): ByteObservation[] {
  return [...codeword].map((byte, index) => {
    return observed(indexes.has(index) ? byte : null);
  });
}

function spread(count: number): Set<number> {
  const indexes = new Set<number>();
  let value = 7;

  while (indexes.size < count) {
    indexes.add(value % seedSlotCount);
    value += 29;
  }

  return indexes;
}

describe("parity-star recovery record", () => {
  test("renders 128 parity bytes rather than a systematic data copy", () => {
    const codeword = starParityCodeword(sample);
    const payload = seedPayload(sample);

    expect(codeword.length).toBe(128);
    expect(starParityExpansionByteCount).toBe(128);
    expect(
      JSON.stringify([...codeword.slice(0, seedDataByteCount)]) ===
      JSON.stringify([...payload])
    ).toBe(false);
  });

  test("reconstructs the complete identity from any forty reliable parity stars", () => {
    const codeword = starParityCodeword(sample);
    const observations = selectedStars(codeword, spread(seedDataByteCount));
    const recovered = recoverStarParity(observations);
    const visual = recoverVisualCode(observations);

    expect(recovered.observedStars).toBe(seedDataByteCount);
    expect(recovered.reconstructedStars).toBe(88);
    expect(recovered.value).toEqual(sample);
    expect(visual.value).toEqual(sample);
    expect(visual.observedStars).toBe(seedDataByteCount);
  });

  test("does not claim recovery below the information threshold", () => {
    const codeword = starParityCodeword(sample);
    const observations = selectedStars(codeword, spread(seedDataByteCount - 1));
    let message = "";

    try {
      recoverStarParity(observations);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("at least 40 readable parity stars");
  });

  test("rejects seeds that cannot fit exactly in the record", () => {
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

  test("gives every parity star sixteen distinct position values", () => {
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

  test("uses one invariant North Star at the top as the calibration reference", () => {
    const point = northStarPoint();

    expect(point.x).toBe(centre);
    expect(point.y < centre).toBe(true);
    expect(northStar.size).toBe(34);
    expect(northStar.opacity).toBe(1);
  });

  test("places Imum Coeli left and Descendant right on the ring", () => {
    const ring = ringPlacements(sample);
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

  test("is deterministic and tied to the exact identity", () => {
    const first = palette(sample);
    const second = palette(sample);

    expect(first).toEqual(second);
    expect(seedPaletteIndex(sample)).toBe(seedPaletteIndex(sample));
    expect(first.background.reduced).toMatch(/^#[0-9A-F]{3}$/);
  });
});

describe("builder", () => {
  test("exports only the approved visual grammar", async () => {
    const first = await buildIdenticon(sample, assets);
    const second = await buildIdenticon(sample, assets);

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 1024 1024"');
    expect(first).toContain('data-code-version="8"');
    expect(first).toContain('id="recovery-stars"');
    expect(first).toContain('data-code="reed-solomon-parity-stars-128-v8"');
    expect(first).toContain('data-code-minimum-readable-stars="40"');
    expect(first).toContain('id="north-star-reference"');
    expect(first).toContain('data-reference-position="top"');
    expect(first).toContain('data-reference-size="34"');
    expect(first).toContain('data-reference-opacity="1"');
    expect(first.includes('id="glyph-data"')).toBe(false);
    expect(first.includes("data-glyph-mark")).toBe(false);
    expect(first.includes("<line")).toBe(false);
    expect(first.includes("currentColor")).toBe(false);
    expect(first.includes("<style")).toBe(false);
    expect(first.includes("<image")).toBe(false);
  });
});
