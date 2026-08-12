import { describe, expect, test } from "bun:test";
import type { Calculation } from "../vendor/astral-chart-wheel/dist/web.js";
import {
  normaliseAstralTransport,
  publicWheelFromCalculation,
} from "../src/random-preview.ts";

const text = new TextEncoder();

const fakeCalculation = (): Calculation => {
  const points = Object.fromEntries([
    ["sun", 197.25],
    ["moon", 128.5],
    ["ascendant", 292.75],
    ["descendant", 112.75],
    ["midheaven", 103.125],
    ["imum_coeli", 283.125],
  ].map(([id, longitude]) => [id, { position: { value: { longitudeDegrees: longitude } } }])) as unknown;
  const houses = Object.fromEntries(Array.from({ length: 12 }, (_unused, index) => {
    const number = index + 1;
    const cusp = (292.75 + index * 30) % 360;
    return [String(number), {
      number,
      cusp: { value: { longitudeDegrees: cusp } },
      end: { value: { longitudeDegrees: (cusp + 30) % 360 } },
    }];
  }));
  return {
    provenance: { calculationFingerprint: "random-preview-test" },
    settings: { primaryHouseSystem: "placidus" },
    system: {
      points,
      houses: {
        placidus: { status: "calculated", houses },
        whole_sign: { status: "unavailable", houses },
        equal: { status: "unavailable", houses },
        porphyry: { status: "unavailable", houses },
      },
      aspects: [],
    },
  } as unknown as Calculation;
};

describe("random V10 preview source", () => {
  test("unwraps the TEST-ONLY transport without changing its inner ASTRPKG bytes", () => {
    const inner = text.encode("ASTRPKG5-inner-package");
    const wrapped = new Uint8Array(text.encode("ASTRTEST1").byteLength + inner.byteLength);
    wrapped.set(text.encode("ASTRTEST1"), 0);
    wrapped.set(inner, text.encode("ASTRTEST1").byteLength);
    expect([...normaliseAstralTransport(wrapped)]).toEqual([...inner]);
    expect(normaliseAstralTransport(inner)).toBe(inner);
  });

  test("keeps exact chart longitudes for the six visible sign facts", () => {
    const wheel = publicWheelFromCalculation(fakeCalculation());
    expect(wheel.points.sun).toBe(197.25);
    expect(wheel.points.moon).toBe(128.5);
    expect(wheel.points.ascendant).toBe(292.75);
    expect(wheel.points.descendant).toBe(112.75);
    expect(wheel.points.midheaven).toBe(103.125);
    expect(wheel.points.imum_coeli).toBe(283.125);
    expect(wheel.houses.status).toBe("calculated");
    expect(wheel.houses.houses["1"]?.cuspLongitudeDegrees).toBe(292.75);
  });
});
