import {
  escapeXml, identiconCanvas as canvas, identiconCentre as centre,
  identiconInnerRingRadius as innerRingRadius, identiconOuterRingRadius as outerRingRadius,
  identiconRingStroke as ringStroke, monochrome, outlined, parseSvg, ringPlacements,
  scopeIds, signAssets, signLabel, type ParsedSvg,
} from "./identiconCommon.js";
import { literalSignGridPlacements, type LiteralSignIdentity } from "./literalSignGrid.js";
import type { Sign } from "../../sign.ts";
import type { AstralIdenticonAssetSource, AstralIdenticonV8NorthStar, AstralIdenticonV8RecoveryStar, AstralIdenticonV8Request } from "./identiconTypes.js";

function v8NestedSvg(
  body: string,
  viewBox: string,
  x: number,
  y: number,
  width: number,
  height: number,
  attributes = ""
): string {
  return `<svg
    x="${x}"
    y="${y}"
    width="${width}"
    height="${height}"
    viewBox="${viewBox}"
    preserveAspectRatio="xMidYMid meet"
    ${attributes}
  >${body}</svg>`;
}

function v8PlacedSvg(body: string, viewBox: string, cx: number, cy: number, size: number, attributes = "", rotation = 0): string {
  const offset = size / 2;
  const value = v8NestedSvg(body, viewBox, cx - offset, cy - offset, size, size, attributes);
  return rotation === 0 ? value : `<g transform="rotate(${rotation} ${cx} ${cy})">${value}</g>`;
}

function v8StarBody(asset: ParsedSvg, colour: string, prefix: string): string {
  return monochrome(scopeIds(asset.body, prefix), colour);
}

function v8NorthStarLayer(asset: ParsedSvg, colour: string, background: string, northStar: AstralIdenticonV8NorthStar): string {
  const haloRadius = northStar.size / 2 + 6;
  const body = v8StarBody(asset, colour, "north-star-reference");
  return `<g
    id="north-star"
    data-recognition-role="north-star-reference"
    data-reference-position="top"
    data-reference-size="${northStar.size}"
    data-reference-opacity="${northStar.opacity}"
    data-code-colour="layer0"
    opacity="${northStar.opacity}"
  >
    <circle
      cx="${northStar.x}"
      cy="${northStar.y}"
      r="${haloRadius}"
      fill="${background}"
      opacity="0.96"
    />
    ${v8PlacedSvg(body, asset.viewBox, northStar.x, northStar.y, northStar.size, "data-calibration-reference=\"true\"", 0)}
  </g>`;
}

function v8RecoveryStars(stars: readonly AstralIdenticonV8RecoveryStar[], asset: ParsedSvg, colour: string, background: string): string {
  return stars.map((star) => {
    const body = v8StarBody(asset, colour, `parity-star-${star.slot}`);
    const haloRadius = star.size / 2 + 4;
    const halo = `<circle cx="${star.x}" cy="${star.y}" r="${haloRadius}" fill="${background}" opacity="0.94"/>`;
    return `<g
        data-code-slot="${star.slot}"
        data-code-byte="${star.byte}"
        data-code-position="${star.position.toString(16).toUpperCase()}"
        data-code-size-level="${star.sizeLevel}"
        data-code-opacity-level="${star.opacityLevel}"
        data-code-role="parity-disambiguation"
        opacity="${star.opacity}"
      >${halo}${v8PlacedSvg(body, asset.viewBox, star.x, star.y, star.size, "", star.rotation)}</g>`;
  }).join("\n");
}

function v8InnerSigns(value: LiteralSignIdentity, signs: ReadonlyMap<Sign, ParsedSvg>, foreground: string, background: string): string {
  return literalSignGridPlacements(value, { centre, offset: 230 }).map((placement) => {
    const asset = signs.get(placement.sign);
    if (!asset) throw new Error(`Missing sigil asset for ${placement.sign}`);
    const body = outlined(scopeIds(asset.body, `sigil-${placement.key}-${placement.sign}`), foreground, background);
    return v8PlacedSvg(body, asset.viewBox, placement.x, placement.y, placement.size, `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}" data-orientation="upright"`);
  }).join("\n");
}

function v8RingSigns(value: LiteralSignIdentity, signs: ReadonlyMap<Sign, ParsedSvg>, foreground: string): string {
  return ringPlacements(value).map((placement) => {
    const asset = signs.get(placement.sign);
    if (!asset) throw new Error(`Missing ring sigil asset for ${placement.sign}`);
    const body = monochrome(scopeIds(asset.body, `ring-${placement.key}-${placement.sign}`), foreground);
    return v8PlacedSvg(body, asset.viewBox, placement.x, placement.y, placement.size, `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}"`, placement.angle);
  }).join("\n");
}

export async function renderAstralIdenticonV8(request: AstralIdenticonV8Request, assets: AstralIdenticonAssetSource): Promise<string> {
  const value = request.input;
  const backgroundSource = await assets.constellation(value.solar);
  const backgroundAsset = parseSvg(backgroundSource);
  const backgroundBody = monochrome(scopeIds(backgroundAsset.body, `solar-${value.solar}`), request.palette.layer0);
  const starAsset = parseSvg(await assets.star());
  const recoveryLayer = v8RecoveryStars(request.recoveryStars, starAsset, request.palette.layer1, request.palette.background);
  const northLayer = v8NorthStarLayer(starAsset, request.palette.layer0, request.palette.background, request.northStar);
  const signs = await signAssets(value, assets);
  const innerSigils = v8InnerSigns(value, signs, request.palette.layer1, request.palette.background);
  const ringSigils = v8RingSigns(value, signs, request.palette.layer1);
  const title = `Astrological identicon: ${signLabel(value.solar)} Sun, ${signLabel(value.lunar)} Moon`;
  const data = escapeXml(JSON.stringify(value));
  const layer0Inset = 12;
  const layer0Radius = request.innerClipRadius - layer0Inset;
  const layer0Size = layer0Radius * 2;
  const layer0X = centre - layer0Radius;
  const layer0Y = centre - layer0Radius;
  const coreReferenceOpacity = 0.28;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${data}" data-palette-index="${request.paletteIndex}" data-code-version="8">
  <title>${escapeXml(title)}</title>
  <metadata>Generated deterministically by astrological-identicon. The palette, Solar constellation, centre grid and astrological ring are the primary visual record. The 128 recovery stars contain Reed-Solomon parity only. Their position, size and opacity encode parity symbols, while the fixed North Star canonises orientation, apparent size and relative brightness.</metadata>
  <defs>
    <clipPath id="inner-clip">
      <circle cx="${centre}" cy="${centre}" r="${request.innerClipRadius}"/>
    </clipPath>
  </defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${request.palette.background}"/>
  <g
    id="foreground-layer-0"
    data-recognition-role="orientation-reference"
    data-orientation="upright"
    opacity="0.6"
    clip-path="url(#inner-clip)"
  >
    ${v8NestedSvg(backgroundBody, backgroundAsset.viewBox, layer0X, layer0Y, layer0Size, layer0Size, `data-sign="${value.solar}" data-recognition-role="solar-constellation" data-orientation="upright"`)}
  </g>

  <g
    id="foreground-layer-1-core"
    data-recognition-role="upright-sign-reference"
    data-orientation="upright"
    opacity="${coreReferenceOpacity}"
    clip-path="url(#inner-clip)"
  >
    ${innerSigils}
  </g>

  <g
    id="recovery-stars"
    data-code="reed-solomon-parity-stars-128-v8"
    data-code-role="error-correction-disambiguation"
    data-code-slots="${request.codeSlots}"
    data-code-source-bytes="${request.sourceByteCount}"
    data-code-parity-bytes="${request.parityByteCount}"
    data-code-minimum-readable-stars="${request.minimumReadableStars}"
    data-code-tracks="${request.codeTrackCount}"
    data-code-sectors="${request.codeSectorCount}"
    data-code-colour="layer1"
    data-code-symbol-spacing="${request.codeSymbolSpacing}"
    clip-path="url(#inner-clip)"
  >
    ${recoveryLayer}
  </g>

  <g
    id="north-star-reference"
    data-recognition-role="orientation-size-opacity-reference"
    clip-path="url(#inner-clip)"
  >
    ${northLayer}
  </g>

  <g id="ring-system">
    <circle
      id="ring-outer"
      cx="${centre}"
      cy="${centre}"
      r="${outerRingRadius}"
      fill="none"
      stroke="${request.palette.layer1}"
      stroke-width="${ringStroke}"
    />
    <circle
      id="ring-inner"
      cx="${centre}"
      cy="${centre}"
      r="${innerRingRadius}"
      fill="none"
      stroke="${request.palette.layer1}"
      stroke-width="${ringStroke}"
    />
    ${ringSigils}
  </g>
</svg>
`;
}
