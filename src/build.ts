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
import {
  hash32,
  seedCode,
  seedPaletteIndex,
  seedSymbols,
  seedSlotCount
} from "./seed.ts";
import { label, type Sign } from "./sign.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";
import { escapeXml, monochrome, outlined, parseSvg, scopeIds } from "./xml.ts";

const innerGap = 8;
const innerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;
const layer0Inset = 12;
const layer0Radius = innerClipRadius - layer0Inset;
const layer0Size = layer0Radius * 2;
const layer0X = centre - layer0Radius;
const layer0Y = centre - layer0Radius;
const starCodeRadius = innerClipRadius - 54;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const coreReferenceOpacity = 0.12;

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

function slotPoint(slot: number): { x: number; y: number } {
  const fraction = (slot + 0.5) / seedSlotCount;
  const radius = 42 + Math.sqrt(fraction) * (starCodeRadius - 42);
  const angle = slot * goldenAngle - Math.PI / 2;

  return {
    x: centre + Math.cos(angle) * radius,
    y: centre + Math.sin(angle) * radius
  };
}

function symbolPoint(slot: number, value: number): { x: number; y: number } {
  const base = slotPoint(slot);
  const column = value >>> 2;
  const row = value & 0x03;
  const spacing = 8;

  return {
    x: base.x + (column - 1.5) * spacing,
    y: base.y + (row - 1.5) * spacing
  };
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
  const anchors = [
    { angle: -90, radius: 358, size: 28 },
    { angle: 134, radius: 354, size: 20 },
    { angle: 246, radius: 350, size: 14 }
  ] as const;

  return anchors
    .map((anchor, index) => {
      const radians = (anchor.angle * Math.PI) / 180;
      const x = centre + Math.cos(radians) * anchor.radius;
      const y = centre + Math.sin(radians) * anchor.radius;
      const body = starBody(asset, colour, `registration-${index}`);

      return `<g data-code-anchor="${index}" opacity="0.34">${placedSvg(
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

function stars(
  seed: string,
  asset: ReturnType<typeof parseSvg>,
  colour: string
): string {
  const result: string[] = [registrationStars(asset, colour)];

  for (const symbol of seedSymbols(seed)) {
    const { x, y } = symbolPoint(symbol.slot, symbol.value);
    const style = hash32(`astrological-identicon/star-slot/v2:${symbol.slot}`);
    const size = 6 + (style % 10);
    const opacity = 0.18 + ((style >>> 8) % 9) / 100;
    const rotation = (style >>> 16) % 360;
    const body = starBody(asset, colour, `star-${symbol.slot}`);

    result.push(
      `<g
        data-code-slot="${symbol.slot}"
        data-code-byte="${symbol.byte}"
        data-code-nibble="${symbol.half}"
        data-code-value="${symbol.value.toString(16).toUpperCase()}"
        data-code-parity="${symbol.parity}"
        opacity="${opacity.toFixed(2)}"
      >${placedSvg(body, asset.viewBox, x, y, size, "", rotation)}</g>`
    );
  }

  return result.join("\n");
}

export async function buildIdenticon(value: IdenticonInput, assets: AssetSource): Promise<string> {
  const code = seedCode(value.seed);
  const paletteIndex = seedPaletteIndex(code);
  const colours = palette(code);

  const backgroundSource = await assets.constellation(value.solar);
  const backgroundAsset = parseSvg(backgroundSource);
  const backgroundBody = monochrome(
    scopeIds(backgroundAsset.body, `solar-${value.solar}`),
    colours.layer0.reduced
  );

  const starSource = await assets.star();
  const starAsset = parseSvg(starSource);
  const starLayer = stars(code, starAsset, colours.layer0.reduced);

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
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${data}" data-seed-code="${code}" data-palette-index="${paletteIndex}" data-code-version="1">
  <title>${escapeXml(title)}</title>
  <metadata>Generated deterministically by astrological-identicon. Visual seed ${code}; palette code 6-bit-v1; star code reed-solomon-48-32-v1.</metadata>
  <defs>
    <clipPath id="inner-clip">
      <circle cx="${centre}" cy="${centre}" r="${innerClipRadius}"/>
    </clipPath>
  </defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${colours.background.reduced}"/>

  <g
    id="background-stars"
    data-code="reed-solomon-48-32-v1"
    data-code-slots="${seedSlotCount}"
    clip-path="url(#inner-clip)"
  >
    ${starLayer}
  </g>

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
</svg>
`;
}
