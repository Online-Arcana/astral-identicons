import { describe, expect, test } from "bun:test";
import { testChartPreview } from "../src/test-wheel.ts";

const seed = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

function normalise(value: number): number {
  return ((value % 360) + 360) % 360;
}

function signIndex(value: string): number {
  return [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
  ].indexOf(value);
}

describe("TEST-only front-end chart fixture", () => {
  test("is deterministic for one identity and visibly marked TEST-only", () => {
    const left = testChartPreview(seed);
    const right = testChartPreview(seed);
    expect(left).toEqual(right);
    expect(left.wheel.calculationFingerprint.startsWith("TEST-ONLY:"))
      .toBe(true);
  });

  test("keeps the six displayed signs consistent with their generated longitudes", () => {
    const value = testChartPreview(seed);
    const pairs = [
      [value.input.solar, value.wheel.points.sun],
      [value.input.lunar, value.wheel.points.moon],
      [value.input.ascendant, value.wheel.points.ascendant],
      [value.input.midheaven, value.wheel.points.midheaven],
      [value.input.descendant, value.wheel.points.descendant],
      [value.input.imumCoeli, value.wheel.points.imum_coeli]
    ] as const;

    for (const [sign, longitude] of pairs) {
      expect(longitude).not.toBeNull();
      expect(Math.floor(longitude! / 30)).toBe(signIndex(sign));
    }
  });

  test("preserves chart-wheel opposition and house geometry invariants", () => {
    const { wheel } = testChartPreview(seed);
    expect(normalise(wheel.points.ascendant! + 180))
      .toBeCloseTo(wheel.points.descendant!, 10);
    expect(normalise(wheel.points.midheaven! + 180))
      .toBeCloseTo(wheel.points.imum_coeli!, 10);
    expect(normalise(wheel.points.north_node_true! + 180))
      .toBeCloseTo(wheel.points.south_node_true!, 10);

    expect(wheel.primaryHouseSystem).toBe("equal");
    expect(Object.keys(wheel.houses.houses)).toHaveLength(12);
    for (let number = 1; number <= 12; number += 1) {
      const house = wheel.houses.houses[String(number)]!;
      expect(Number(house.number)).toBe(number);
      expect(normalise(house.cuspLongitudeDegrees! + 30))
        .toBeCloseTo(house.endLongitudeDegrees!, 10);
    }
  });
});
