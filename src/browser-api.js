import { astralSource } from "./astral.ts";
import { buildIdenticon } from "./build.ts";

const assetCache = new Map();

function assetText(path, base) {
  const url = new URL(path.replace(/^\/+/, ""), base).href;
  let request = assetCache.get(url);
  if (request === undefined) {
    request = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load identicon asset: ${url}`);
      return response.text();
    });
    assetCache.set(url, request);
  }
  return request;
}

function browserAssets(base) {
  return {
    constellation: (sign) => assetText(`assets/constellations/${sign}.svg`, base),
    sigil: (sign) => assetText(`assets/sigils/${sign}.svg`, base),
    star: () => assetText("assets/decor/star.svg", base),
    astrologyGlyph: (path) => assetText(`assets/astrology-glyphs/svg/${path}`, base),
  };
}

export async function renderAstralPackageIdenticon(data, base = document.baseURI) {
  const source = astralSource(data);
  if (source.containerVersion !== 5 || source.wheel === null) {
    throw new Error(
      "Current chart-wheel identicons require an ASTRPKG5 .astral package with public deterministic wheel metadata",
    );
  }
  return buildIdenticon(source.input, browserAssets(base), source.wheel);
}
