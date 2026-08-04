import { describe, expect, test } from "bun:test";
import { paletteNonce } from "../src/palette-nonce.ts";
import { palette } from "../src/palette.ts";
import { paletteDraw } from "../src/prng.ts";
import { paletteCount, seedPaletteIndex } from "../src/seed.ts";
import { hexBytes, sha256 } from "../src/sha256.ts";

describe("cryptographic palette PRNG", () => {
  test("implements the standard SHA-256 known vector", () => {
    expect(hexBytes(sha256("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223" +
      "b00361a396177a9cb410ff61f20015ad"
    );
  });

  test("gives every seed a deterministic 256-bit nonce", () => {
    const first = paletteNonce("ordinary-seed");
    const second = paletteNonce("ordinary-seed");
    const other = paletteNonce("another-seed");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(other).toMatch(/^[0-9a-f]{64}$/u);
    expect(other).not.toBe(first);
  });

  test("tunes the chosen seed through the normal PRNG path", () => {
    const seed = "6270f2-example";
    const nonce = paletteNonce(seed);
    const index = seedPaletteIndex(seed);
    const colours = palette(seed);

    expect(paletteDraw(seed, nonce, paletteCount)).toBe(index);
    expect(index).toBe(40);
    expect(colours.background.reduced).toBe("#525");
    expect(colours.layer0.reduced).toBe("#6EB");
    expect(colours.layer1.reduced).toBe("#69E");
  });
});
