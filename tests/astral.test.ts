import { describe, expect, test } from "bun:test";
import { astralInput } from "../src/astral.ts";
import { seedCodeword, seedPayload, decodeSeedCodeword } from "../src/seed.ts";
import { base64Url } from "../src/seed-value.ts";

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
  test("copies the exact 32 public-key bytes into the visual payload", () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => index * 7 & 0xff);
    const value = astralInput(container(key));
    const payload = seedPayload(value);

    expect(value.seed).toBe(base64Url(key));
    expect([...payload.slice(3, 35)]).toEqual([...key]);
    expect(payload[1]).toBe(2);
    expect(payload[2]).toBe(32);
    expect(value.solar).toBe("capricorn");
    expect(value.lunar).toBe("virgo");
    expect(value.ascendant).toBe("capricorn");
    expect(value.midheaven).toBe("libra");
    expect(value.descendant).toBe("cancer");
    expect(value.imumCoeli).toBe("aries");
  });

  test("scanner decoding reproduces the canonical public key and signs", () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => 255 - index);
    const value = astralInput(container(key));
    const recovered = decodeSeedCodeword(seedCodeword(value));

    expect(recovered).toEqual(value);
    expect(recovered.seed).toBe(base64Url(key));
  });

  test("rejects older text-key containers for direct file ingestion", () => {
    const bytes = container(new Uint8Array(32));
    bytes.set(new TextEncoder().encode("ASTRPKG3"), 0);
    bytes[8] = 3;
    expect(() => astralInput(bytes)).toThrow("ASTRPKG4");
  });
});
