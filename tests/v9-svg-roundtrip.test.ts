import { describe, expect, test } from "bun:test";
import { buildIdenticon } from "../src/build.ts";
import { input } from "../src/input.ts";
import { exportedV9Svg } from "../src/scan-v9-svg.ts";
import type { AssetSource } from "../src/types.ts";

const sample = input({
  seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;
const assets: AssetSource = {
  constellation: async () => simpleAsset,
  sigil: async () => simpleAsset,
  star: async () => simpleAsset
};

describe("original v9 SVG ingestion", () => {
  test("recovers the exact identity and six signs from a freshly exported SVG", async () => {
    const svg = await buildIdenticon(sample, assets);
    expect(exportedV9Svg(svg)).toEqual(sample);
  });

  test("rejects altered identity metadata rather than trusting an edited SVG", async () => {
    const svg = await buildIdenticon(sample, assets);
    const altered = svg.replace(
      /data-identity-hex="[0-9a-f]+"/u,
      `data-identity-hex="${"00".repeat(32)}"`
    );
    expect(() => exportedV9Svg(altered)).toThrow(
      "identity metadata does not match"
    );
  });

  test("does not mistake an arbitrary SVG for an exported v9 record", () => {
    expect(exportedV9Svg(simpleAsset)).toBeNull();
  });
});
