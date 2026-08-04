import {
  calibrationStar,
  centralSun,
  parityAnchorPoint,
  parityFadingOpacities,
  parityStarSizes,
  planetAnchorPoint,
  planetFadingOpacities,
  planetGlyphSizes,
  satelliteDotRadii,
  satellitePoint,
  sunRay,
  v9InnerClipRadius
} from "./layout-v9.ts";
import {
  v9CalibrationSampleCount,
  v9RayFadingLevels,
  v9StarCalibrationLevels
} from "./calibration-v9.ts";
import {
  canvas,
  centre,
  innerRingRadius,
  outerRingRadius,
  placements,
  ringPlacements,
  ringStroke
} from "./layout.ts";
import { palette } from "./palette.ts";
import { v9ParityVisualState } from "./parity-v9.ts";
import { planetaryConfiguration } from "./planet-code.ts";
import { calibrationSunGlyph, planetaryGlyphs } from "./planet.ts";
import {
  tracedGlyphSvg,
  tracedPlanetGlyph,
  tracedSunGlyph
} from "./planet-vector.ts";
import {
  v9DataByteCount,
  v9IdentityBytes,
  v9Parity,
  v9ParityByteCount,
  v9RecordVersion
} from "./record-v9.ts";
import { seedPaletteIndex } from "./seed.ts";
import { label, type Sign } from "./sign.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";
import { escapeXml, monochrome, outlined, parseSvg, scopeIds } from "./xml.ts";

const layer0Radius = v9InnerClipRadius - 12;
const layer0Size = layer0Radius * 2;
const layer0X = centre - layer0Radius;
const layer0Y = centre - layer0Radius;

function nestedSvg(
  body: string,
  viewBox: string,
  x: number,
  y: number,
  width: number,
  height: number,
  attributes = ""
): string {
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" ${attributes}>${body}</svg>`;
}

function placedSvg(
  body: string,
  viewBox: string,
  x: number,
  y: number,
  size: number,
  attributes = "",
  rotation = 0
): string {
  const svg = nestedSvg(
    body,
    viewBox,
    x - size / 2,
    y - size / 2,
    size,
    size,
    attributes
  );
  return rotation === 0
    ? svg
    : `<g transform="rotate(${rotation} ${x} ${y})">${svg}</g>`;
}

function starPoints(
  x: number,
  y: number,
  size: number,
  rotation = 0
): string {
  const outer = size / 2;
  const inner = outer * 0.34;
  const points: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (rotation - 90 + index * 22.5) * Math.PI / 180;
    points.push(
      `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`
    );
  }
  return points.join(" ");
}

function calibrationStarsLayer(colour: string): string {
  const stars = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => {
      const reference = calibrationStar(index);
      const name = index === 0
        ? "north-star-reference"
        : index === 6
          ? "south-star-reference"
          : `calibration-star-reference-${index}`;
      const position = index === 0
        ? "north"
        : index === 6
          ? "south"
          : `${reference.angle}-degrees`;
      return `<g id="${name}" data-recognition-role="circumference-size-fading-orientation-reference" data-reference-index="${index}" data-reference-position="${position}" data-reference-angle="${reference.angle}" data-reference-level="${reference.level + 1}" data-reference-size="${reference.size}" data-reference-fading="${reference.opacity}" data-code-colour="parity-star-foreground" opacity="${reference.opacity}">
        <polygon points="${starPoints(reference.point.x, reference.point.y, reference.size)}" fill="${colour}" data-calibration-reference="true"/>
      </g>`;
    }
  ).join("\n");

  return `<g id="calibration-stars-v9" data-recognition-role="twelve-fixed-star-references" data-size-calibration="true" data-fading-calibration="true" data-calibration-pattern="${v9StarCalibrationLevels.join(",")}">
    ${stars}
  </g>`;
}

function sunLayer(colour: string): string {
  const rays = Array.from({ length: centralSun.rayCount }, (_unused, index) => {
    const ray = sunRay(index);
    return `<line x1="${ray.start.x}" y1="${ray.start.y}" x2="${ray.end.x}" y2="${ray.end.y}" stroke="${colour}" stroke-width="${centralSun.rayStrokeWidth}" stroke-linecap="round" opacity="${ray.opacity}" data-calibration-angle="${ray.angle}" data-calibration-level="${ray.level + 1}" data-calibrates="fading-only"/>`;
  }).join("\n");
  const sun = tracedGlyphSvg(
    tracedSunGlyph(),
    centre,
    centre,
    centralSun.glyphSize,
    colour,
    `data-glyph="${calibrationSunGlyph}" data-vector-role="calibration-sun"`
  );

  return `<g id="central-sun-reference" data-recognition-role="centre-fading-rotation-reference" data-size-calibration="false" data-fading-calibration="true" data-calibration-pattern="${v9RayFadingLevels.join(",")}" data-encodes="nothing" data-rotation="fixed">
    ${rays}
    ${sun}
  </g>`;
}

function planetLayer(value: IdenticonInput, colour: string): string {
  const configuration = planetaryConfiguration(v9IdentityBytes(value));
  return configuration.planets.map((planet, index) => {
    const definition = planetaryGlyphs[index]!;
    const point = planetAnchorPoint(planet.anchor);
    const size = planetGlyphSizes[planet.size]!;
    const fading = planetFadingOpacities[planet.density]!;
    const satellites = [
      planet.satellites.small,
      planet.satellites.medium,
      planet.satellites.large
    ].map((position, satellite) => {
      const location = satellitePoint(point, size, position);
      return `<circle cx="${location.x}" cy="${location.y}" r="${satelliteDotRadii[satellite]}" fill="${colour}" data-satellite-size="${satellite}" data-satellite-position="${position}" data-code-colour="planetary-foreground"/>`;
    }).join("\n");
    const glyph = tracedGlyphSvg(
      tracedPlanetGlyph(definition.key),
      point.x,
      point.y,
      size,
      colour,
      `data-vector-key="${definition.key}"`
    );

    return `<g data-planet-index="${index}" data-planet-key="${definition.key}" data-planet-body="${definition.body}" data-planet-glyph="${definition.glyph}" data-planet-anchor="${planet.anchor}" data-planet-rotation-level="${planet.rotation}" data-planet-size-level="${planet.size}" data-planet-fading-level="${planet.density}" data-code-role="exact-32-byte-identity" data-code-colour="planetary-foreground">
      <g transform="rotate(${planet.rotation * 30} ${point.x} ${point.y})" opacity="${fading}">
        ${glyph}
      </g>
      ${satellites}
    </g>`;
  }).join("\n");
}

function parityLayer(value: IdenticonInput, colour: string): string {
  return [...v9Parity(value)].map((byte, index) => {
    const state = v9ParityVisualState(byte);
    const point = parityAnchorPoint(index, state.position);
    const size = parityStarSizes[state.size]!;
    const fading = parityFadingOpacities[state.density]!;
    const rotation = (index * 137.5) % 360;
    return `<g data-parity-index="${index}" data-parity-byte="${byte}" data-parity-state="${state.state}" data-parity-position="${state.position}" data-parity-size-level="${state.size}" data-parity-fading-level="${state.density}" data-code-role="reed-solomon-parity-only" data-code-colour="parity-star-foreground" opacity="${fading}">
      <polygon points="${starPoints(point.x, point.y, size, rotation)}" fill="${colour}"/>
    </g>`;
  }).join("\n");
}

async function signAssets(
  value: IdenticonInput,
  assets: AssetSource
): Promise<Map<Sign, ReturnType<typeof parseSvg>>> {
  const required = new Set<Sign>([
    ...placements(value).map((placement) => placement.sign),
    ...ringPlacements(value).map((placement) => placement.sign)
  ]);
  const result = new Map<Sign, ReturnType<typeof parseSvg>>();
  await Promise.all([...required].map(async (sign) => {
    result.set(sign, parseSvg(await assets.sigil(sign)));
  }));
  return result;
}

function innerSigns(
  value: IdenticonInput,
  signs: ReadonlyMap<Sign, ReturnType<typeof parseSvg>>,
  foreground: string,
  background: string
): string {
  return placements(value).map((placement) => {
    const asset = signs.get(placement.sign);
    if (!asset) throw new Error(`Missing sigil asset for ${placement.sign}`);
    const body = outlined(
      scopeIds(asset.body, `sigil-${placement.key}-${placement.sign}`),
      foreground,
      background
    );
    return placedSvg(
      body,
      asset.viewBox,
      placement.x,
      placement.y,
      placement.size,
      `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}" data-orientation="upright"`
    );
  }).join("\n");
}

function ringSigns(
  value: IdenticonInput,
  signs: ReadonlyMap<Sign, ReturnType<typeof parseSvg>>,
  foreground: string
): string {
  return ringPlacements(value).map((placement) => {
    const asset = signs.get(placement.sign);
    if (!asset) throw new Error(`Missing ring sigil asset for ${placement.sign}`);
    const body = monochrome(
      scopeIds(asset.body, `ring-${placement.key}-${placement.sign}`),
      foreground
    );
    return placedSvg(
      body,
      asset.viewBox,
      placement.x,
      placement.y,
      placement.size,
      `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}"`,
      placement.angle
    );
  }).join("\n");
}

export async function buildV9Identicon(
  value: IdenticonInput,
  assets: AssetSource
): Promise<string> {
  const identity = v9IdentityBytes(value);
  const colours = palette(value);
  const planetaryColour = colours.layer0.reduced;
  const parityColour = colours.layer1.reduced;
  const background = colours.background.reduced;
  const constellation = parseSvg(await assets.constellation(value.solar));
  const constellationBody = monochrome(
    scopeIds(constellation.body, `solar-${value.solar}`),
    planetaryColour
  );
  const signs = await signAssets(value, assets);
  const identityHex = [...identity]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const title = `Astral identicon v9: ${label(value.solar)} Sun, ${label(value.lunar)} Moon`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${escapeXml(JSON.stringify(value))}" data-palette-index="${seedPaletteIndex(value)}" data-code-version="${v9RecordVersion}" data-scannable="v9" data-identity-hex="${identityHex}">
  <title>${escapeXml(title)}</title>
  <metadata>Astral Identicon visual contract v9. Literal signs remain in the constellation, centre grid and zodiac ring. Eleven planetary glyphs and thirty-three satellites encode the exact 32-byte identity through eleven distinct separated groups from exactly 256 legal anchors. Planetary glyphs are deterministic SVG outlines traced from their Unicode font contours. One hundred and twenty-eight indexed parity stars are scattered through an interior blue-noise field and contain RS(168,40) parity. Only twelve fixed calibration stars sit around the circumference.</metadata>
  <defs><clipPath id="inner-clip-v9"><circle cx="${centre}" cy="${centre}" r="${v9InnerClipRadius}"/></clipPath></defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${background}"/>
  <g id="foreground-layer-0" data-recognition-role="literal-solar-constellation" data-orientation="upright" opacity="0.6" clip-path="url(#inner-clip-v9)">
    ${nestedSvg(constellationBody, constellation.viewBox, layer0X, layer0Y, layer0Size, layer0Size, `data-sign="${value.solar}" data-recognition-role="solar-constellation" data-orientation="upright"`)}
  </g>
  <g clip-path="url(#inner-clip-v9)">${sunLayer(planetaryColour)}</g>
  <g id="literal-sign-grid" data-recognition-role="literal-six-sign-grid" data-orientation="upright" opacity="0.28" clip-path="url(#inner-clip-v9)">${innerSigns(value, signs, parityColour, background)}</g>
  <g id="parity-stars-v9" data-code="reed-solomon-168-40-parity-stars-128-v9" data-layout="interior-blue-noise" data-code-role="error-correction-only" data-code-source-bytes="${v9DataByteCount}" data-code-parity-bytes="${v9ParityByteCount}" data-code-stars="${v9ParityByteCount}" data-code-colour="parity-star-foreground" clip-path="url(#inner-clip-v9)">${parityLayer(value, parityColour)}</g>
  <g id="planetary-identity-v9" data-code-role="exact-32-byte-identity" data-code-planets="${planetaryGlyphs.length}" data-code-satellites="${planetaryGlyphs.length * 3}" data-code-anchors="256" data-code-colour="planetary-foreground" clip-path="url(#inner-clip-v9)">${planetLayer(value, planetaryColour)}</g>
  <g id="literal-ring-system" data-recognition-role="literal-sign-redundancy">
    <circle id="ring-outer" cx="${centre}" cy="${centre}" r="${outerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    <circle id="ring-inner" cx="${centre}" cy="${centre}" r="${innerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    ${ringSigns(value, signs, parityColour)}
  </g>
  ${calibrationStarsLayer(parityColour)}
</svg>
`;
}
