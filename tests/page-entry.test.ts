import { describe, expect, test } from "bun:test";

const source = await Bun.file(`${import.meta.dir}/../src/page-entry.ts`).text();
const pagesBuild = await Bun.file(`${import.meta.dir}/../scripts/build-pages.ts`).text();

describe("standalone V10 page entry", () => {
  test("does not replace birth-derived fields with a PRNG chart on startup", () => {
    expect(source).not.toContain("await loadRandomChart()");
    expect(source).not.toContain("randomAstralPreview(document.baseURI)");
    expect(source).not.toContain("New random chart");
    expect(source).not.toContain("edit the seed and six signs manually");
  });

  test("shows the six V10 signs as derived read-only labels", () => {
    expect(source).toContain("The six V10 signs are derived from the chart and shown as read-only labels.");
    expect(source).toContain("select.hidden = true");
    expect(source).toContain('output.className = "sign-value empty"');
    expect(source).toContain('output.textContent = "Not calculated"');
    expect(source).toContain("showSignLabels(source.input)");
    expect(source).toContain("syncSignLabelsFromControls()");
  });

  test("offers explicit birth calculation without changing the V10 contract", () => {
    expect(source).toContain('id="birth-date"');
    expect(source).toContain('id="birth-time"');
    expect(source).toContain('id="birth-country"');
    expect(source).toContain('id="birth-region"');
    expect(source).toContain('id="birth-city"');
    expect(source).toContain("birthAstralPreview(document.baseURI");
    expect(source).toContain("rawPublicKey(seed.value.trim())");
  });

  test("shows exact calculated longitudes beside the derived labels", () => {
    expect(source).toContain("Exact glyph longitude");
    expect(source).toContain("ecliptic");
    expect(source).toContain("package sign says");
    expect(source).toContain("clearPositions()");
  });

  test("ships the pinned birthplace catalogue with the Pages build", () => {
    expect(pagesBuild).toContain("vendor/astral-chart-wheel/vendor/places/src/countries-browser/data");
    expect(pagesBuild).toContain('`${outputRoot}/assets/places`');
  });

  test("normalises TEST-ONLY files before the ordinary package loader sees them", () => {
    expect(source).toContain("normaliseAstralTransport(bytes)");
    expect(source).toContain("event.stopImmediatePropagation()");
    expect(source).toContain('input.dispatchEvent(new Event("change", { bubbles: true }))');
  });
});
