import { renderAstralIdenticonV8 } from "./legacy/renderer/identiconV8.ts";
import type { AstralIdenticonV8RecoveryStar } from "./legacy/renderer/identiconTypes.ts";
import {
  codeSectorCount,
  codeSymbolPoint,
  codeSymbolSpacing,
  codeTrackCount,
  innerClipRadius,
  northStar,
  northStarPoint
} from "./code-layout.ts";
import { palette } from "./palette.ts";
import { hash32, seedPaletteIndex, seedSlotCount } from "./seed.ts";
import {
  starParityCodeword,
  starParityDataByteCount,
  starParityExpansionByteCount,
  starVisualSymbol
} from "./star-parity.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

export async function buildV8Identicon(
  value: IdenticonInput,
  assets: AssetSource
): Promise<string> {
  const colours = palette(value);
  const recoveryStars: AstralIdenticonV8RecoveryStar[] = Array.from(
    starParityCodeword(value),
    (byte, slot) => {
      const symbol = starVisualSymbol(byte);
      const { x, y } = codeSymbolPoint(slot, symbol.position);
      const style = hash32(`astrological-identicon/parity-star/v8:${slot}`);
      return {
        slot,
        byte: symbol.byte,
        position: symbol.position,
        sizeLevel: symbol.sizeLevel,
        opacityLevel: symbol.opacityLevel,
        opacity: symbol.opacity,
        size: symbol.size,
        x,
        y,
        rotation: (style >>> 16) % 360
      };
    }
  );
  const reference = northStarPoint();

  return renderAstralIdenticonV8(
    {
      input: value,
      paletteIndex: seedPaletteIndex(value),
      palette: {
        background: colours.background.reduced,
        layer0: colours.layer0.reduced,
        layer1: colours.layer1.reduced
      },
      innerClipRadius,
      recoveryStars,
      northStar: {
        x: reference.x,
        y: reference.y,
        size: northStar.size,
        opacity: northStar.opacity
      },
      codeSlots: seedSlotCount,
      sourceByteCount: starParityDataByteCount,
      parityByteCount: starParityExpansionByteCount,
      minimumReadableStars: starParityDataByteCount,
      codeTrackCount,
      codeSectorCount,
      codeSymbolSpacing
    },
    assets
  );
}
