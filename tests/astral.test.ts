import { describe, expect, test } from "bun:test";
import { astralInput } from "../src/astral.ts";
import { decodeSeedCodeword, seedCodeword, seedPayload } from "../src/seed.ts";
import {
  base64Url,
  boundPublicKey,
  seedBytes,
  seedMaterial
} from "../src/seed-value.ts";

const signs = [
  "\n",
  "solar_sign=capricorn\n",
  "lunar_sign=virgo\n",
  "ascending_sign=capricorn\n",
  "midheaven_sign=libra\n",
  "descending_sign=cancer\n",
  "imum_coeli_sign=aries\n"
].join("");

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function container(key: Uint8Array): Uint8Array {
  const publicBlock = new TextEncoder().encode(signs);
  const headSize = 92 + publicBlock.length;
  const cipherSize = 16;
  const out = new Uint8Array(headSize + cipherSize);
  out.set(new TextEncoder().encode("ASTRPKG4"), 0);
  out[8] = 4;
  out[9] = 0;
  out[10] = 1;
  out[11] = 1;
  out[12] = 0;
  out[13] = 2;
  out[14] = 0;
  out[15] = 0;
  out.set(u32(1_200_000), 16);
  out.set(u32(1), 20);
  out.set(u32(cipherSize), 24);
  out.set(u32(headSize), 28);
  out.set(key, 60);
  out.set(publicBlock, 92);
  return out;
}

describe("packaged astral input", () => {
  test("retains and encodes the exact 32 public-key bytes", () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => index * 7 & 0xff);
    const expected = key.slice();
    const value = astralInput(container(key));
    key.fill(0);
    const payload = seedPayload(value);

    expect(value.seed).toBe(base64Url(expected));
    expect([...(boundPublicKey(value) ?? [])]).toEqual([...expected]);
    expect([...seedBytes(value)]).toEqual([...expected]);
    expect([...(seedMaterial(value) as Uint8Array)]).toEqual([...expected]);
    expect([...payload.slice(3, 35)]).toEqual([...expected]);
    expect(payload[1]).toBe(2);
    expect(payload[2]).toBe(32);
    expect(JSON.parse(JSON.stringify(value))).toEqual({
      seed: base64Url(expected),
      solar: "capricorn",
      lunar: "virgo",
      ascendant: "capricorn",
      midheaven: "libra",
      descendant: "cancer",
      imumCoeli: "aries"
    });
  });

  test("scanner decoding retains the exact recovered bytes and signs", () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => 255 - index);
    const value = astralInput(container(key));
    const recovered = decodeSeedCodeword(seedCodeword(value));

    expect(recovered).toEqual(value);
    expect(recovered.seed).toBe(base64Url(key));
    expect([...(boundPublicKey(recovered) ?? [])]).toEqual([...key]);
    expect([...seedBytes(recovered)]).toEqual([...key]);
    expect(recovered.solar).toBe("capricorn");
    expect(recovered.lunar).toBe("virgo");
    expect(recovered.ascendant).toBe("capricorn");
    expect(recovered.midheaven).toBe("libra");
    expect(recovered.descendant).toBe("cancer");
    expect(recovered.imumCoeli).toBe("aries");
  });

  test("rejects older text-key containers for direct file ingestion", () => {
    const bytes = container(new Uint8Array(32));
    bytes.set(new TextEncoder().encode("ASTRPKG3"), 0);
    bytes[8] = 3;

    let message = "";
    try {
      astralInput(bytes);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("ASTRPKG4");
  });
});
