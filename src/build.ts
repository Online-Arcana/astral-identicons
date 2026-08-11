import type { PublicWheelMeta } from "../vendor/astral-chart-wheel/dist/index.js";
import { boundAstralWheel } from "./astral.ts";
import { buildV8Identicon } from "./build-v8.ts";
import { buildV10Identicon } from "./build-v10.ts";
import { isPublicSeed } from "./seed-value.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

export function visualFormatVersion(value: IdenticonInput): 8 | 10 {
  return isPublicSeed(value) ? 10 : 8;
}

export function buildIdenticon(
  value: IdenticonInput,
  assets: AssetSource,
  wheel?: PublicWheelMeta | null
): Promise<string> {
  if (visualFormatVersion(value) === 8) return buildV8Identicon(value, assets);
  return buildV10Identicon(value, assets, wheel ?? boundAstralWheel(value) ?? null);
}
