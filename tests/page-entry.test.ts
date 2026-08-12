import { describe, expect, test } from "bun:test";

const source = await Bun.file(`${import.meta.dir}/../src/page-entry.ts`).text();

describe("standalone V10 page entry", () => {
  test("loads a complete random chart immediately", () => {
    expect(source).toContain("await loadRandomChart()");
    expect(source).toContain("randomAstralPreview(document.baseURI)");
    expect(source).toContain("New random chart");
    expect(source).toContain("Calculating a complete random chart with real planetary and angle longitudes");
  });

  test("treats the six sign controls as derived chart facts", () => {
    expect(source).toContain('select.dataset["derivedChartField"] = "true"');
    expect(source).toContain("pointer-events: none");
    expect(source).toContain("Exact glyph longitude");
    expect(source).toContain("ecliptic");
    expect(source).toContain("package sign says");
  });

  test("normalises TEST-ONLY files before the ordinary package loader sees them", () => {
    expect(source).toContain("normaliseAstralTransport(bytes)");
    expect(source).toContain('event.stopImmediatePropagation()');
    expect(source).toContain('input.dispatchEvent(new Event("change", { bubbles: true }))');
  });
});
