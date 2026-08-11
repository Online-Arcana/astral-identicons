import type { AssetSource } from "./types.ts";
import type { Sign } from "./sign.ts";

export interface SharedVisualAssetPaths {
  constellations: string;
  star: string;
}

export function sharedWheelAssets(root: string): SharedVisualAssetPaths {
  return {
    constellations: `${root}/assets/constellations`,
    star: `${root}/assets/reed-solomon/star.svg`
  };
}

export function fileAssets(root: string, shared?: SharedVisualAssetPaths): AssetSource {
  const read = async (path: string): Promise<string> => {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`Missing asset: ${path}`);
    return file.text();
  };

  return {
    constellation: (sign: Sign) => read(`${shared?.constellations ?? `${root}/constellations`}/${sign}.svg`),
    sigil: (sign: Sign) => read(`${root}/sigils/${sign}.svg`),
    star: () => read(shared?.star ?? `${root}/decor/star.svg`)
  };
}
