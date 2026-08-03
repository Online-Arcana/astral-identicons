import type { AssetSource } from "./types.ts";
import type { Sign } from "./sign.ts";

export function fileAssets(root: string): AssetSource {
  const read = async (path: string): Promise<string> => {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`Missing asset: ${path}`);
    return file.text();
  };

  return {
    constellation: (sign: Sign) => read(`${root}/constellations/${sign}.svg`),
    sigil: (sign: Sign) => read(`${root}/sigils/${sign}.svg`),
    star: () => read(`${root}/decor/star.svg`)
  };
}