import { describe, expect, test } from "bun:test";

const source = await Bun.file(
  `${import.meta.dir}/../src/web.ts`
).text();

describe("fresh page identity", () => {
  test("generates a fresh canonical 32-byte public-key string", () => {
    expect(source).toContain("crypto.getRandomValues(new Uint8Array(32))");
    expect(source).toContain("return base64Url");
    expect(source.includes('seed: "62-70-F2-Example"')).toBe(false);
    expect(source.includes("new Uint8Array(16)")).toBe(false);
  });

  test("builds a deterministic TEST-only chart for the initial preview", () => {
    expect(source).toContain("const defaultPreview = testChartPreview(randomPublicKey())");
    expect(source).toContain("let activeTestWheel: PublicWheelMeta | null = defaultPreview.wheel");
    expect(source).toContain("const generated = testChartPreview(randomPublicKey())");
    expect(source).toContain("buildIdenticon(data, browserAssets, resolvedWheel.wheel)");
  });
});
