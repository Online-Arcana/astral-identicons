import {
  tracedCalibrationSun,
  tracedPlanetGlyphs,
  type TracedGlyph
} from "./planet-glyph-paths.ts";
import type { PlanetaryKey } from "./planet.ts";

function dimensions(glyph: TracedGlyph): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: glyph.maxX - glyph.minX,
    height: glyph.maxY - glyph.minY
  };
}

export function tracedPlanetGlyph(key: PlanetaryKey): TracedGlyph {
  return tracedPlanetGlyphs[key];
}

export function tracedSunGlyph(): TracedGlyph {
  return tracedCalibrationSun;
}

export function tracedGlyphSvg(
  glyph: TracedGlyph,
  x: number,
  y: number,
  size: number,
  colour: string,
  attributes = ""
): string {
  const { width, height } = dimensions(glyph);
  const viewBoxY = -glyph.maxY;

  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="${glyph.minX} ${viewBoxY} ${width} ${height}" preserveAspectRatio="xMidYMid meet" ${attributes}><path d="${glyph.path}" transform="scale(1 -1)" fill="${colour}" fill-rule="nonzero" data-vector-source="unicode-font-outline"/></svg>`;
}

export function fillTracedGlyph(
  context: CanvasRenderingContext2D,
  glyph: TracedGlyph,
  size: number
): void {
  const width = glyph.maxX - glyph.minX;
  const height = glyph.maxY - glyph.minY;
  const extent = Math.max(width, height);
  const scale = size / extent;
  const centreX = (glyph.minX + glyph.maxX) / 2;
  const centreY = (glyph.minY + glyph.maxY) / 2;
  const path = new Path2D(glyph.path);

  context.save();
  context.scale(scale, -scale);
  context.translate(-centreX, -centreY);
  context.fill(path, "nonzero");
  context.restore();
}
