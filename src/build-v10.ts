import {
  renderAstralIdenticonV10,
  type AstralIdenticonAssetSource,
  type PublicWheelMeta
} from "../vendor/astral-chart-wheel/dist/index.js";
import { palette } from "./palette.ts";
import {
  v9DataByteCount,
  v9IdentityBytes,
  v9Parity,
  v9ParityByteCount,
  v9RecordVersion
} from "./record-v9.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

function hex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function browserChartGlyph(path: string): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("Chart glyph assets are unavailable in this runtime");
  }
  const url = new URL(`assets/astrology-glyphs/svg/${path}`, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load chart glyph: ${url.href}`);
  return response.text();
}

function vendorAssets(assets: AssetSource): AstralIdenticonAssetSource {
  return {
    constellation: assets.constellation,
    sigil: assets.sigil,
    star: assets.star,
    astrologyGlyph: assets.astrologyGlyph ?? browserChartGlyph
  };
}

export async function buildV10Identicon(
  value: IdenticonInput,
  assets: AssetSource,
  wheel: PublicWheelMeta | null = null
): Promise<string> {
  const colours = palette(value);
  return renderAstralIdenticonV10({
    input: value,
    wheel,
    paletteIndex: seedPaletteIndex(value),
    palette: {
      background: colours.background.reduced,
      layer0: colours.layer0.reduced,
      layer1: colours.layer1.reduced
    },
    identityHex: hex(v9IdentityBytes(value)),
    parityBytes: [...v9Parity(value)],
    recordVersion: v9RecordVersion,
    dataByteCount: v9DataByteCount,
    parityByteCount: v9ParityByteCount
  }, vendorAssets(assets));
}
