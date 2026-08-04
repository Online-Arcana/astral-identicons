import {
  codeAnchorPoint,
  codeAnchors,
  codeSectorCount,
  codeSymbolPoint,
  codeSymbolSpacing,
  codeTrackCount,
  innerClipRadius
} from "./code-layout.ts";
import {
  glyphCarrierDigits,
  glyphCarriers,
  glyphMark,
  glyphMarkHaloStroke,
  glyphMarkStroke
} from "./glyph-code.ts";
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
import { hash32, seedDataByteCount, seedPaletteIndex, seedSlotCount } from "./seed.ts";
import {
  starParityCodeword,
  starParityDataByteCount,
  starParityExpansionByteCount,
  starVisualSymbol
} from "./star-parity.ts";
import { label, type Sign } from "./sign.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";
import { escapeXml, monochrome, outlined, parseSvg, scopeIds } from "./xml.ts";

const layer0Inset = 12;
const layer0Radius = innerClipRadius - layer0Inset;
const layer0Size = layer0Radius * 2;
const layer0X = centre - layer0Radius;
const layer0Y = centre - layer0Radius;
const coreReferenceOpacity = 0.28;
const codeStarHaloPadding = 4;

function nestedSvg(
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

function placedSvg(
  body: string,
  viewBox: string,
  cx: number,
  cy: number,
  size: number,
  attributes = "",
  rotation = 0
): string {
  const offset = size / 2;
  const svg = nestedSvg(body, viewBox, cx - offset, cy - offset, size, size, attributes);

  if (rotation === 0) return svg;
  return `<g transform="rotate(${rotation} ${cx} ${cy})">${svg}</g>`;
}

function starBody(
  asset: ReturnType<typeof parseSvg>,
  colour: string,
  prefix: string
): string {
  return monochrome(scopeIds(asset.body, prefix), colour);
}

function registrationStars(
  asset: ReturnType<typeof parseSvg>,
  colour: string
): string {
  return codeAnchors
    .map((anchor, index) => {
      const { x, y } = codeAnchorPoint(anchor);
      const body = starBody(asset, colour, `registration-${index}`);

      return `<g data-code-anchor="${index}" opacity="0.72">${placedSvg(
        body,
        asset.viewBox,
        x,
        y,
        anchor.size,
        "",
        anchor.angle + 90
      )}</g>`;
    })
    .join("\n");
}

function parityStars(
  value: IdenticonInput,
  asset: ReturnType<typeof parseSvg>,
  colour: string,
  background: string
): string {
  const codeword = starParityCodeword(value);
  const result: string[] = [];

  for (let slot = 0; slot < codeword.length; slot += 1) {
    const symbol = starVisualSymbol(codeword[slot]!);
    const { x, y } = codeSymbolPoint(slot, symbol.position);
    const style = hash32(`astrological-identicon/parity-star/v6:${slot}`);
    const rotation = (style >>> 16) % 360;
    const body = starBody(asset, colour, `parity-star-${slot}`);
    const haloRadius = symbol.size / 2 + codeStarHaloPadding;
    const halo = `<circle cx="${x}" cy="${y}" r="${haloRadius}" fill="${background}" opacity="0.94"/>`;

    result.push(
      `<g
        data-code-slot="${slot}"
        data-code-byte="${symbol.byte}"
        data-code-position="${symbol.position.toString(16).toUpperCase()}"
        data-code-size-level="${symbol.sizeLevel}"
        data-code-opacity-level="${symbol.opacityLevel}"
        data-code-role="parity-disambiguator"
        opacity="${symbol.opacity}"
      >${halo}${placedSvg(
        body,
        asset.viewBox,
        x,
        y,
        symbol.size,
        "",
        rotation
      )}</g>`
    );
  }

  return result.join("\n");
}

function glyphData(value: IdenticonInput, colour: string, background: string): string {
  return glyphCarriers(value).map((carrier) => {
    const digits = glyphCarrierDigits(value, carrier);
    const marks = digits.map((digit, index) => {
      const actual = glyphMark(carrier, index, digit);
      const maximum = glyphMark(carrier, index, 3);

      return `<g data-glyph-mark="${index}" data-glyph-digit="${digit}">
        <line
          x1="${maximum.startX}"
          y1="${maximum.startY}"
          x2="${maximum.endX}"
          y2="${maximum.endY}"
          stroke="${background}"
          stroke-width="${glyphMarkHaloStroke}"
          stroke-linecap="round"
        />
        <line
          x1="${actual.startX}"
          y1="${actual.startY}"
          x2="${actual.endX}"
          y2="${actual.endY}"
          stroke="${colour}"
          stroke-width="${glyphMarkStroke}"
          stroke-linecap="round"
        />
      </g>`;
    }).join("\n");

    return `<g
      data-glyph-carrier="${carrier.index}"
      data-carrier-key="${carrier.key}"
      data-carrier-group="${carrier.group}"
      data-byte-offset="${carrier.byteOffset}"
      data-code-role="systematic-payload-data"
    >${marks}</g>`;
  }).join("\n");
}

export async function buildIdenticon(value: IdenticonInput, assets: AssetSource): Promise<string> {
  const paletteIndex = seedPaletteIndex(value.seed);
  const colours = palette(value.seed);

  const backgroundSource = await assets.constellation(value.solar);
  const backgroundAsset = parseSvg(backgroundSource);
  const backgroundBody = monochrome(
    scopeIds(backgroundAsset.body, `solar-${value.solar}`),
    colours.layer0.reduced
  );

  const starSource = await assets.star();
  const starAsset = parseSvg(starSource);
  const anchorLayer = registrationStars(starAsset, colours.layer0.reduced);
  const parityLayer = parityStars(
    value,
    starAsset,
    colours.layer1.reduced,
    colours.background.reduced
  );
  const glyphDataLayer = glyphData(
    value,
    colours.layer1.reduced,
    colours.background.reduced
  );

  const allSigns = new Set<Sign>([
    ...placements(value).map((item) => item.sign),
    ...ringPlacements(value).map((item) => item.sign)
  ]);

  const sigils = new Map<Sign, ReturnType<typeof parseSvg>>();

  await Promise.all(
    [...allSigns].map(async (sign) => {
      sigils.set(sign, parseSvg(await assets.sigil(sign)));
    })
  );

  const innerSigils = placements(value)
    .map((placement) => {
      const asset = sigils.get(placement.sign);
      if (!asset) throw new Error(`Missing sigil asset for ${placement.sign}`);

      const body = outlined(
        scopeIds(asset.body, `sigil-${placement.key}-${placement.sign}`),
        colours.layer1.reduced,
        colours.background.reduced
      );

      return placedSvg(
        body,
        asset.viewBox,
        placement.x,
        placement.y,
        placement.size,
        `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}" data-orientation="upright"`
      );
    })
    .join("\n");

  const ringSigils = ringPlacements(value)
    .map((placement) => {
      const asset = sigils.get(placement.sign);
      if (!asset) throw new Error(`Missing ring sigil asset for ${placement.sign}`);

      const body = monochrome(
        scopeIds(asset.body, `ring-${placement.key}-${placement.sign}`),
        colours.layer1.reduced
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
    })
    .join("\n");

  const title = `Astrological identicon: ${label(value.solar)} Sun, ${label(value.lunar)} Moon`;
  const data = escapeXml(JSON.stringify(value));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${data}" data-palette-index="${paletteIndex}" data-code-version="6">
  <title>${escapeXml(title)}</title>
  <metadata>Generated deterministically by astrological-identicon. Glyph carriers contain the systematic payload data. The star field contains expanded Reed-Solomon parity used only to repair and disambiguate incomplete glyph reads.</metadata>
  <defs>
    <clipPath id="inner-clip">
      <circle cx="${centre}" cy="${centre}" r="${innerClipRadius}"/>
    </clipPath>
  </defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${colours.background.reduced}"/>

  <g
    id="foreground-layer-0"
    data-recognition-role="orientation-reference"
    data-orientation="upright"
    opacity="0.6"
    clip-path="url(#inner-clip)"
  >
    ${nestedSvg(
      backgroundBody,
      backgroundAsset.viewBox,
      layer0X,
      layer0Y,
      layer0Size,
      layer0Size,
      `data-sign="${value.solar}" data-recognition-role="solar-constellation" data-orientation="upright"`
    )}
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
    id="registration-stars"
    data-recognition-role="orientation-anchors"
    data-code-colour="layer0"
    clip-path="url(#inner-clip)"
  >
    ${anchorLayer}
  </g>

  <g
    id="parity-stars"
    data-code="reed-solomon-star-parity-128-24-v6"
    data-code-role="error-correction-disambiguation"
    data-code-slots="${seedSlotCount}"
    data-code-source-bytes="${starParityDataByteCount}"
    data-code-expansion-bytes="${starParityExpansionByteCount}"
    data-code-tracks="${codeTrackCount}"
    data-code-sectors="${codeSectorCount}"
    data-code-colour="layer1"
    data-code-symbol-spacing="${codeSymbolSpacing}"
    clip-path="url(#inner-clip)"
  >
    ${parityLayer}
  </g>

  <g id="ring-system">
    <circle
      id="ring-outer"
      cx="${centre}"
      cy="${centre}"
      r="${outerRingRadius}"
      fill="none"
      stroke="${colours.layer1.reduced}"
      stroke-width="${ringStroke}"
    />
    <circle
      id="ring-inner"
      cx="${centre}"
      cy="${centre}"
      r="${innerRingRadius}"
      fill="none"
      stroke="${colours.layer1.reduced}"
      stroke-width="${ringStroke}"
    />
    ${ringSigils}
  </g>

  <g
    id="glyph-data"
    data-code="systematic-glyph-payload-40-v6"
    data-code-role="primary-identicon-data"
    data-code-data-bytes="${seedDataByteCount}"
    data-code-carriers="20"
    data-code-marks-per-carrier="8"
  >
    ${glyphDataLayer}
  </g>
</svg>
`;
}
