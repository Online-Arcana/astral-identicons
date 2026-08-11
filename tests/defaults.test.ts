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

  test("randomises every sign field on initial page construction", () => {
    expect(source).toContain("const defaults = randomInput()");
    expect(source).toContain("solar: randomSign()");
    expect(source).toContain("lunar: randomSign()");
    expect(source).toContain("ascendant: randomSign()");
    expect(source).toContain("midheaven: randomSign()");
    expect(source).toContain("descendant: randomSign()");
    expect(source).toContain("imumCoeli: randomSign()");
  });

  test("does not present a wheel-less v10 shell as a finished identicon", () => {
    expect(source).toContain("const natalWheel = boundAstralWheel(data)");
    expect(source).toContain("if (!natalWheel)");
    expect(source).toContain("preview.replaceChildren()");
    expect(source).toContain("save.disabled = true");
    expect(source).toContain("Load an ASTRPKG5 .astral file to render the current chart-wheel identicon");
    expect(source).not.toContain("the preview uses the chart-wheel shell without inventing houses or planetary positions");
  });
});
