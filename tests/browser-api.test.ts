import { afterEach, describe, expect, test } from "bun:test";
import { renderAstralPackageIdenticon } from "../src/browser.ts";
import { packagedChart } from "./fixtures/astral-package.ts";

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("browser package API", () => {
  test("renders a genuine ASTRPKG5 chart identicon", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (value: string | URL | Request) => {
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
});
