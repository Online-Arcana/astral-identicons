import { buildV8Identicon } from "./build-v8.ts";
import { buildV9Identicon } from "./build-v9.ts";
import { isPublicSeed } from "./seed-value.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

export function visualFormatVersion(value: IdenticonInput): 8 | 9 {
  return isPublicSeed(value) ? 9 : 8;
}

export function buildIdenticon(
  value: IdenticonInput,
  assets: AssetSource
): Promise<string> {
  return visualFormatVersion(value) === 9
    ? buildV9Identicon(value, assets)
    : buildV8Identicon(value, assets);
}
