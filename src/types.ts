import type { Sign } from "./sign.ts";

export interface IdenticonInput {
  seed: string;
  solar: Sign;
  lunar: Sign;
  ascendant: Sign;
  midheaven: Sign;
  descendant: Sign;
  imumCoeli: Sign;
}

export interface RawIdenticonInput {
  seed: unknown;
  solar: unknown;
  lunar: unknown;
  ascendant: unknown;
  midheaven: unknown;
  descendant: unknown;
  imumCoeli: unknown;
}

export interface PaletteColour {
  hue: number;
  full: string;
  reduced: string;
  luminance: number;
}

export interface Palette {
  background: PaletteColour;
  layer0: PaletteColour;
  layer1: PaletteColour;
  source: readonly [PaletteColour, PaletteColour, PaletteColour];
}

export interface AssetSource {
  constellation(sign: Sign): Promise<string>;
  sigil(sign: Sign): Promise<string>;
  star(): Promise<string>;
  astrologyGlyph?(path: string): Promise<string>;
}
