import {
  renderAstralIdenticonV9,
  type AstralIdenticonPlanetState
} from "../vendor/astral-chart-wheel/dist/index.js";
import { palette } from "./palette.ts";
import { planetaryConfiguration } from "./planet-code.ts";
import { calibrationSunGlyph, planetaryGlyphs } from "./planet.ts";
import { tracedPlanetGlyph, tracedSunGlyph } from "./planet-vector.ts";
import {
  v9DataByteCount,
  v9IdentityBytes,
  v9Parity,
  v9ParityByteCount,
  v9RecordVersion
} from "./record-v9.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

export async function buildV9Identicon(
  value: IdenticonInput,
  assets: AssetSource
): Promise<string> {
  const identity = v9IdentityBytes(value);
  const colours = palette(value);
  const configuration = planetaryConfiguration(identity);
  const planets: AstralIdenticonPlanetState[] = configuration.planets.map(
    (planet, index) => {
      const definition = planetaryGlyphs[index]!;
      return {
        ...planet,
        key: definition.key,
        body: definition.body,
        glyph: definition.glyph,
        vector: tracedPlanetGlyph(definition.key)
      };
    }
  );
  const identityHex = [...identity]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return renderAstralIdenticonV9(
    {
      input: value,
      paletteIndex: seedPaletteIndex(value),
      palette: {
        background: colours.background.reduced,
        layer0: colours.layer0.reduced,
        layer1: colours.layer1.reduced
      },
      identityHex,
      parityBytes: [...v9Parity(value)],
      planets,
      sunGlyph: tracedSunGlyph(),
      calibrationSunGlyph,
      recordVersion: v9RecordVersion,
      dataByteCount: v9DataByteCount,
      parityByteCount: v9ParityByteCount
    },
    assets
  );
}
