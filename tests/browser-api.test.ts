import { expect, test } from "bun:test";
import { renderAstralPackageIdenticon } from "../src/browser-api.js";

const pointIds = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
  "north_node_true", "south_node_true", "north_node_mean", "south_node_mean",
  "ascendant", "descendant", "midheaven", "imum_coeli", "vertex", "antivertex", "east_point",
  "part_of_fortune", "part_of_spirit", "lilith_mean", "lilith_true"
] as const;

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function packagedChart(): Uint8Array {
  const key = Uint8Array.from({ length: 32 }, (_value, index) => index * 5 & 0xff);
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
      calculationFingerprint: "browser-api-test-wheel",
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

test("browser package API renders a genuine ASTRPKG5 chart identicon", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (value: RequestInfo | URL) => {
    requested.push(String(value));
    return new Response(simpleAsset, {
      status: 200,
      headers: { "content-type": "image/svg+xml" }
    });
  }) as typeof fetch;

  try {
    const svg = await renderAstralPackageIdenticon(
      packagedChart(),
      "https://example.invalid/astral-charts/"
    );

    expect(svg).toContain('data-visual-version="10"');
    expect(svg).toContain('data-scannable="v10"');
    expect(svg).not.toContain('id="wheel-houses"');
    expect(svg).toContain('id="wheel-points"');
    expect(svg).toContain('id="reed-solomon-stars"');
    expect(svg).toContain('data-code-stars="128"');
    expect(requested.some((url) => url.includes("/assets/constellations/capricorn.svg"))).toBe(true);
    expect(requested.some((url) => url.includes("/assets/astrology-glyphs/svg/"))).toBe(true);
    expect(requested.some((url) => url.includes("/assets/sigils/"))).toBe(false);
    expect(requested.some((url) => url.endsWith("/assets/decor/star.svg"))).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
