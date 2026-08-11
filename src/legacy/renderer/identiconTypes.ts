import type { LiteralSignIdentity } from "./literalSignGrid.js";
import type { Sign } from "../../sign.ts";
import type { PublicWheelMeta } from "../../../vendor/astral-chart-wheel/dist/index.js";

export interface AstralIdenticonInput extends LiteralSignIdentity { seed: string; }
export interface AstralIdenticonAssetSource {
  constellation(sign: Sign): Promise<string>;
  sigil(sign: Sign): Promise<string>;
  star(): Promise<string>;
  astrologyGlyph?(path: string): Promise<string>;
}
export interface AstralIdenticonPalette { background: string; layer0: string; layer1: string; }
export interface AstralIdenticonTracedGlyph {
  readonly path: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface AstralIdenticonPlanetState {
  readonly key: string;
  readonly body: string;
  readonly glyph: string;
  readonly anchor: number;
  readonly rotation: number;
  readonly size: number;
  readonly density: number;
  readonly satellites: { readonly small: number; readonly medium: number; readonly large: number; };
  readonly vector: AstralIdenticonTracedGlyph;
}
export interface AstralIdenticonV10Request {
  readonly input: AstralIdenticonInput;
  readonly wheel: PublicWheelMeta | null;
  readonly paletteIndex: number;
  readonly palette: AstralIdenticonPalette;
  readonly identityHex: string;
  readonly parityBytes: readonly number[];
  readonly recordVersion: number;
  readonly dataByteCount: number;
  readonly parityByteCount: number;
}
export interface AstralIdenticonV9Request {
  readonly input: AstralIdenticonInput;
  readonly paletteIndex: number;
  readonly palette: AstralIdenticonPalette;
  readonly identityHex: string;
  readonly parityBytes: readonly number[];
  readonly planets: readonly AstralIdenticonPlanetState[];
  readonly sunGlyph: AstralIdenticonTracedGlyph;
  readonly calibrationSunGlyph: string;
  readonly recordVersion: number;
  readonly dataByteCount: number;
  readonly parityByteCount: number;
}
export interface AstralIdenticonV8RecoveryStar {
  readonly slot: number;
  readonly byte: number;
  readonly position: number;
  readonly sizeLevel: number;
  readonly opacityLevel: number;
  readonly opacity: number;
  readonly size: number;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}
export interface AstralIdenticonV8NorthStar { readonly x: number; readonly y: number; readonly size: number; readonly opacity: number; }
export interface AstralIdenticonV8Request {
  readonly input: AstralIdenticonInput;
  readonly paletteIndex: number;
  readonly palette: AstralIdenticonPalette;
  readonly innerClipRadius: number;
  readonly recoveryStars: readonly AstralIdenticonV8RecoveryStar[];
  readonly northStar: AstralIdenticonV8NorthStar;
  readonly codeSlots: number;
  readonly sourceByteCount: number;
  readonly parityByteCount: number;
  readonly minimumReadableStars: number;
  readonly codeTrackCount: number;
  readonly codeSectorCount: number;
  readonly codeSymbolSpacing: number;
}
