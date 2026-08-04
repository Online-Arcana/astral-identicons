import { northStar, northStarPoint } from "./code-layout.ts";
import {
  centralSun,
  parityAnchorPoint,
  parityDensityOpacities,
  parityDensityStrokeWidths,
  parityStarSizes,
  planetAnchorPoint,
  planetDensityOpacities,
  planetDensityStrokeWidths,
  planetGlyphSizes,
  satelliteDotRadii,
  satellitePoint,
  sunRay,
  v9InnerClipRadius
} from "./layout-v9.ts";
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

const symbolFont =
  "Noto Sans Symbols 2, Segoe UI Symbol, Apple Symbols, Arial Unicode MS, sans-serif";
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

function denseShape(source: string, colour: string, width: number): string {
  if (width === 0) return source;

  return source.replace(
    /<(path|circle|ellipse|polygon|polyline|rect)\b([^>]*)>/giu,
    (_match, tag: string, raw: string) => {
      const selfClosing = /\/\s*$/u.test(raw);
      const attributes = raw
        .replace(/\/\s*$/u, "")
        .replace(/\sstroke=(["'])[^"']*\1/giu, "")
        .replace(/\sstroke-width=(["'])[^"']*\1/giu, "")
        .replace(/\spaint-order=(["'])[^"']*\1/giu, "")
        .replace(/\svector-effect=(["'])[^"']*\1/giu, "");

      return `<${tag}${attributes} stroke="${colour}" stroke-width="${width}" paint-order="stroke fill" vector-effect="non-scaling-stroke"${selfClosing ? "/>" : ">"}`;
    }
  );
}

function northStarLayer(
  star: ReturnType<typeof parseSvg>,
  colour: string,
  background: string
): string {
  const point = northStarPoint();
  const body = monochrome(scopeIds(star.body, "north-star-reference"), colour);

  return `<g id="north-star-reference" data-recognition-role="north-star-reference" data-reference-position="top" data-reference-size="${northStar.size}" data-reference-density="fixed" data-code-colour="parity-star-foreground">
    <circle cx="${point.x}" cy="${point.y}" r="${northStar.size / 2 + 6}" fill="${background}" opacity="0.96"/>
    ${placedSvg(body, star.viewBox, point.x, point.y, northStar.size, 'data-calibration-reference="true"')}
  </g>`;
}

function sunLayer(
  sunColour: string,
  signColour: string,
  background: string,
  solarSigil: ReturnType<typeof parseSvg>
): string {
  const rays = Array.from({ length: centralSun.rayCount }, (_unused, index) => {
    const ray = sunRay(index);
    return `<line x1="${ray.start.x}" y1="${ray.start.y}" x2="${ray.end.x}" y2="${ray.end.y}" stroke="${sunColour}" stroke-width="${centralSun.rayStrokeWidth}" stroke-linecap="round" data-calibration-angle="${ray.angle}"/>`;
  }).join("\n");
  const solarBody = monochrome(
    scopeIds(solarSigil.body, "central-literal-solar-sign"),
    signColour
  );

  return `<g id="central-sun-reference" data-recognition-role="centre-size-density-rotation-reference" data-encodes="nothing" data-rotation="fixed">
    <circle cx="${centre}" cy="${centre}" r="${centralSun.medallionRadius}" fill="${background}" opacity="0.98" data-role="central-sun-medallion"/>
    ${rays}
    <text x="${centre}" y="${centre}" text-anchor="middle" dominant-baseline="central" font-family="${symbolFont}" font-size="${centralSun.glyphSize}" font-weight="600" fill="${sunColour}" data-glyph="${calibrationSunGlyph}">${calibrationSunGlyph}</text>
    <circle cx="${centre}" cy="${centre}" r="${centralSun.solarSigilKnockoutRadius}" fill="${background}" data-role="solar-sign-knockout"/>
    ${placedSvg(
      solarBody,
      solarSigil.viewBox,
      centre,
      centre,
      centralSun.solarSigilSize,
      'data-role="Sun" data-recognition-role="literal-central-solar-sign" data-orientation="upright"'
    )}
  </g>`;
}

function planetLayer(value: IdenticonInput, colour: string): string {
  const configuration = planetaryConfiguration(v9IdentityBytes(value));

  return configuration.planets.map((planet, index) => {
    const definition = planetaryGlyphs[index]!;
    const point = planetAnchorPoint(planet.anchor);
    const size = planetGlyphSizes[planet.size]!;
    const opacity = planetDensityOpacities[planet.density]!;
    const strokeWidth = planetDensityStrokeWidths[planet.density]!;
    const satellitePositions = [
      planet.satellites.small,
      planet.satellites.medium,
      planet.satellites.large
    ] as const;
    const satellites = satellitePositions.map((position, satellite) => {
      const location = satellitePoint(point, size, position);
      return `<circle cx="${location.x}" cy="${location.y}" r="${satelliteDotRadii[satellite]}" fill="${colour}" data-satellite-size="${satellite}" data-satellite-position="${position}" data-code-colour="planetary-foreground"/>`;
    }).join("\n");

    return `<g data-planet-index="${index}" data-planet-key="${definition.key}" data-planet-body="${definition.body}" data-planet-glyph="${definition.glyph}" data-planet-anchor="${planet.anchor}" data-planet-rotation-level="${planet.rotation}" data-planet-size-level="${planet.size}" data-planet-density-level="${planet.density}" data-code-role="exact-32-byte-identity" data-code-colour="planetary-foreground">
      <g transform="rotate(${planet.rotation * 30} ${point.x} ${point.y})" opacity="${opacity}">
        <text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="central" font-family="${symbolFont}" font-size="${size}" font-weight="600" fill="${colour}" stroke="${colour}" stroke-width="${strokeWidth}" paint-order="stroke fill">${definition.glyph}</text>
      </g>
      ${satellites}
    </g>`;
  }).join("\n");
}

function parityLayer(
  value: IdenticonInput,
  star: ReturnType<typeof parseSvg>,
  colour: string
): string {
  return [...v9Parity(value)].map((byte, index) => {
    const state = v9ParityVisualState(byte);
    const point = parityAnchorPoint(index, state.position);
    const size = parityStarSizes[state.size]!;
    const opacity = parityDensityOpacities[state.density]!;
    const base = monochrome(scopeIds(star.body, `v9-parity-${index}`), colour);
    const body = denseShape(base, colour, parityDensityStrokeWidths[state.density]!);

    return `<g data-parity-index="${index}" data-parity-byte="${byte}" data-parity-state="${state.state}" data-parity-position="${state.position}" data-parity-size-level="${state.size}" data-parity-density-level="${state.density}" data-code-role="reed-solomon-parity-only" data-code-colour="parity-star-foreground" opacity="${opacity}">
      ${placedSvg(body, star.viewBox, point.x, point.y, size, "", (index * 137.5) % 360)}
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
  const star = parseSvg(await assets.star());
  const signs = await signAssets(value, assets);
  const solarSigil = signs.get(value.solar);
  if (!solarSigil) throw new Error(`Missing central solar sigil for ${value.solar}`);
  const identityHex = [...identity]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const title = `Astral identicon v9: ${label(value.solar)} Sun, ${label(value.lunar)} Moon`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${escapeXml(JSON.stringify(value))}" data-palette-index="${seedPaletteIndex(value)}" data-code-version="${v9RecordVersion}" data-scannable="v9" data-identity-hex="${identityHex}">
  <title>${escapeXml(title)}</title>
  <metadata>Astral Identicon visual contract v9. Literal signs remain in the constellation, centre grid and zodiac ring. Eleven planetary glyphs and thirty-three satellites encode the exact 32-byte identity through eleven distinct choices from a balanced field of 256 legal anchors. Every planetary glyph and satellite uses the same foreground colour. Thirty-two indexed parity stars and the North Star use the other foreground colour and contain RS(72,40) parity or fixed calibration only. Colour is decorative and is never required for decoding. The North Star establishes upright orientation. The central Sun and twelve fixed rays establish centre, size, density and thirty-degree rotation calibration, while its protected centre preserves the literal solar zodiac glyph.</metadata>
  <defs><clipPath id="inner-clip-v9"><circle cx="${centre}" cy="${centre}" r="${v9InnerClipRadius}"/></clipPath></defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${background}"/>

  <g id="foreground-layer-0" data-recognition-role="literal-solar-constellation" data-orientation="upright" opacity="0.6" clip-path="url(#inner-clip-v9)">
    ${nestedSvg(constellationBody, constellation.viewBox, layer0X, layer0Y, layer0Size, layer0Size, `data-sign="${value.solar}" data-recognition-role="solar-constellation" data-orientation="upright"`)}
  </g>

  <g id="literal-sign-grid" data-recognition-role="literal-six-sign-grid" data-orientation="upright" opacity="0.28" clip-path="url(#inner-clip-v9)">
    ${innerSigns(value, signs, parityColour, background)}
  </g>

  <g id="parity-stars-v9" data-code="reed-solomon-72-40-parity-stars-32-v9" data-code-role="error-correction-only" data-code-source-bytes="${v9DataByteCount}" data-code-parity-bytes="${v9ParityByteCount}" data-code-stars="${v9ParityByteCount}" data-code-colour="parity-star-foreground" clip-path="url(#inner-clip-v9)">
    ${parityLayer(value, star, parityColour)}
  </g>

  <g id="planetary-identity-v9" data-code-role="exact-32-byte-identity" data-code-planets="${planetaryGlyphs.length}" data-code-satellites="${planetaryGlyphs.length * 3}" data-code-anchors="256" data-code-colour="planetary-foreground" clip-path="url(#inner-clip-v9)">
    ${planetLayer(value, planetaryColour)}
  </g>

  <g clip-path="url(#inner-clip-v9)">
    ${sunLayer(planetaryColour, parityColour, background, solarSigil)}
    ${northStarLayer(star, parityColour, background)}
  </g>

  <g id="literal-ring-system" data-recognition-role="literal-sign-redundancy">
    <circle id="ring-outer" cx="${centre}" cy="${centre}" r="${outerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    <circle id="ring-inner" cx="${centre}" cy="${centre}" r="${innerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    ${ringSigns(value, signs, parityColour)}
  </g>
</svg>
`;
}
