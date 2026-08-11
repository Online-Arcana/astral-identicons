import { describe, expect, test } from "bun:test";
import {
  astralInput,
  astralSource,
  boundAstralWheel
} from "../src/astral.ts";
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

const pointIds = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
  "north_node_true", "south_node_true", "north_node_mean", "south_node_mean",
  "ascendant", "descendant", "midheaven", "imum_coeli", "vertex", "antivertex", "east_point",
  "part_of_fortune", "part_of_spirit", "lilith_mean", "lilith_true"
] as const;

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

function v5Container(key: Uint8Array): Uint8Array {
  const points = Object.fromEntries(pointIds.map((id) => [id, null])) as Record<string, number | null>;
  points.sun = 285.25;
  points.moon = 166.5;
  points.ascendant = 291.75;
  points.descendant = 111.75;
  points.midheaven = 194.2;
  points.imum_coeli = 14.2;

  const houses = Object.fromEntries(
    Array.from({ length: 12 }, (_unused, index) => {
      const number = index + 1;
      const cusp = (291.75 + index * 30) % 360;
      return [String(number), {
        number,
        cuspLongitudeDegrees: cusp,
        endLongitudeDegrees: (cusp + 30) % 360
      }];
    })
  );

  const publicMeta = new TextEncoder().encode(JSON.stringify({
    schema: "astral-public-meta/1.0.0",
    signs: {
      solar: "capricorn",
      lunar: "virgo",
      ascending: "capricorn",
      midheaven: "libra",
      descending: "cancer",
      imumCoeli: "aries"
    },
    wheel: {
      schema: "astral-public-wheel/1.0.0",
      calculationFingerprint: "astral-test-wheel",
      primaryHouseSystem: "placidus",
      points,
      houses: {
        status: "calculated",
        houses
      },
      aspects: [{
        id: "sun:moon:trine",
        a: "sun",
        b: "moon",
        kind: "trine",
        class: "major",
        character: "flowing"
      }]
    }
  }));

  const headSize = 92 + publicMeta.length;
  const cipherSize = 16;
  const out = new Uint8Array(headSize + cipherSize);
  out.set(new TextEncoder().encode("ASTRPKG5"), 0);
  out[8] = 5;
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
  out.set(publicMeta, 92);
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

  test("reads the authenticated public natal wheel metadata from ASTRPKG5", () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => index * 5 & 0xff);
    const source = astralSource(v5Container(key));

    expect(source.containerVersion).toBe(5);
    expect(source.input.seed).toBe(base64Url(key));
    expect(source.input.solar).toBe("capricorn");
    expect(source.wheel?.schema).toBe("astral-public-wheel/1.0.0");
    expect(source.wheel?.points.ascendant).toBe(291.75);
    expect(source.wheel?.points.sun).toBe(285.25);
    expect(source.wheel?.houses.houses["1"]?.cuspLongitudeDegrees).toBe(291.75);
    expect(source.wheel?.aspects[0]?.kind).toBe("trine");
    expect(boundAstralWheel(source.input)).toEqual(source.wheel);
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
