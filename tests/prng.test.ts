import { describe, expect, test } from "bun:test";
import { paletteNonce } from "../src/palette-nonce.ts";
import { palette } from "../src/palette.ts";
import { paletteDraw } from "../src/prng.ts";
import { paletteCount, seedPaletteIndex } from "../src/seed.ts";
import { rawPublicKey } from "../src/seed-value.ts";
import { hexBytes, sha256 } from "../src/sha256.ts";

describe("cryptographic palette PRNG", () => {
  test("implements the standard SHA-256 known vector", () => {
    expect(hexBytes(sha256("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223" +
      "b00361a396177a9cb410ff61f20015ad"
    );
  });

  test("gives every identity a deterministic 256-bit nonce", () => {
    const first = paletteNonce("ordinary-seed");
    const second = paletteNonce("ordinary-seed");
    const other = paletteNonce("another-seed");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(other).toMatch(/^[0-9a-f]{64}$/u);
    expect(other === first).toBe(false);
  });

  test("keeps the existing configured palette mapping", () => {
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

  test("maps the requested 32-byte key through the normal nonce path", () => {
    const seed = "Kcgr43Hr1qJgeG7ICVVq4yAEzGvnGMkBrRdSQ0f4Z0I";
    const raw = rawPublicKey(seed);
    const nonce = paletteNonce(raw);
    const index = seedPaletteIndex(seed);
    const colours = palette(seed);

    expect(paletteDraw(raw, nonce, paletteCount)).toBe(index);
    expect(index).toBe(21);
    expect(colours.background.reduced).toBe("#133");
    expect(colours.layer0.reduced).toBe("#DE6");
    expect(colours.layer1.reduced).toBe("#6E7");
  });
});
