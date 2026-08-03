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
import { input } from "../src/input.ts";
import { centre, ringPlacements } from "../src/layout.ts";
import {
  palette,
  paletteForIndex
} from "../src/palette.ts";
import { recoverSeedObservations } from "../src/scan-seed.ts";
import {
  decodeSeedNibbles,
  encodedSeedNibbles,
  paletteCount,
  seedDataByteCount,
  seedNibbleSlot,
  seedPaletteIndex,
  seedParityByteCount,
  seedSlotCount
} from "../src/seed.ts";
import type { AssetSource } from "../src/types.ts";

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

describe("complete visual payload", () => {
  test("round-trips the exact seed and all six signs", () => {
    const value = input(sample);
    const recovered = decodeSeedNibbles(encodedSeedNibbles(value));

    expect(recovered).toEqual(value);
  });

  test("reconstructs the full payload with the complete erasure budget", () => {
    const value = input(sample);
    const damaged = [...encodedSeedNibbles(value)] as Array<number | null>;

    for (let byte = 0; byte < seedParityByteCount; byte += 1) {
      damaged[seedNibbleSlot(byte * 2)] = null;
      damaged[seedNibbleSlot(byte * 2 + 1)] = null;
    }

    expect(decodeSeedNibbles(damaged)).toEqual(value);
  });

  test("uses confidence-ranked erasures to repair conflicting star reads", () => {
    const value = input(sample);
    const observations: Array<{ value: number | null; confidence: number }> =
      encodedSeedNibbles(value).map((nibble) => ({
        value: nibble,
        confidence: 0.95
      }));

    for (let byte = 0; byte < 8; byte += 1) {
      const slot = seedNibbleSlot(byte * 2);
      observations[slot] = {
        value: (observations[slot]!.value! + 3) & 0x0f,
        confidence: 0.01
      };
    }

    for (let byte = 20; byte < 26; byte += 1) {
      observations[seedNibbleSlot(byte * 2)] = {
        value: null,
        confidence: 0
      };
    }

    const recovered = recoverSeedObservations(observations);

    expect(recovered.value).toEqual(value);
    expect(recovered.erasures >= 14).toBe(true);
    expect(recovered.uncertainStars).toBe(6);
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

  test("gives every star sixteen distinct nibble positions", () => {
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

  test("keeps every coded-star position inside the inner clipping circle", () => {
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
  test("exports a deterministic standalone SVG with the complete protected payload", async () => {
    const value = input(sample);
    const first = await buildIdenticon(value, assets);
    const second = await buildIdenticon(value, assets);

    expect(first).toBe(second);
    expect(first).toContain('viewBox="0 0 1024 1024"');
    expect(first).toContain(`data-input="{&quot;seed&quot;:&quot;${sample.seed}`);
    expect(first).toContain(`data-palette-index="${seedPaletteIndex(sample.seed)}"`);
    expect(first).toContain('data-code-version="5"');
    expect(first).toContain('data-code="reed-solomon-64-40-identicon-v5"');
    expect(first).toContain('data-code-role="complete-identicon-payload"');
    expect(first).toContain('data-code-slots="128"');
    expect(first).toContain(`data-code-data-bytes="${seedDataByteCount}"`);
    expect(first).toContain(`data-code-parity-bytes="${seedParityByteCount}"`);
    expect(first).toContain('data-code-tracks="4"');
    expect(first).toContain('data-code-sectors="32"');
    expect(first).toContain('data-code-value="0"');
    expect(first).toContain('data-code-parity="true"');
    expect(first).toContain('id="registration-stars"');
    expect(first).toContain('id="coded-stars"');
    expect(first).toContain('data-code-colour="layer1"');
    expect(first).toContain('data-code-symbol-size="10"');
    expect(first).toContain('data-code-symbol-spacing="10"');
    expect(first).toContain('data-code-halo-radius="7"');
    expect(first).toContain('id="foreground-layer-0"');
    expect(first).toContain('id="foreground-layer-1-core"');
    expect(first).toContain('data-recognition-role="upright-sign-reference"');
    expect(first).toContain('id="ring-system"');
    expect(first).not.toContain("currentColor");
    expect(first).not.toContain("<style");
    expect(first).not.toContain("<image");
  });
});
