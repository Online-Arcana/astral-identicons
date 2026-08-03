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

function hash(value: string): number {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;

  return result >>> 0;
}

function random(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function stars(
  seed: string,
  asset: ReturnType<typeof parseSvg>,
  colour: string
): string {
  const next = random(hash(`${seed}:stars`));
  const count = 34 + Math.floor(next() * 18);
  const result: string[] = [];
  const minRadius = 36;
  const maxRadius = innerClipRadius - 18;

  for (let index = 0; index < count; index += 1) {
    const angle = next() * Math.PI * 2;
    const radius = minRadius + Math.sqrt(next()) * (maxRadius - minRadius);

    const x = centre + Math.cos(angle) * radius;
    const y = centre + Math.sin(angle) * radius;

    const size = 6 + next() * 26;
    const opacity = 0.16 + next() * 0.12;
    const rotation = Math.round(next() * 360);

    const body = monochrome(
      scopeIds(asset.body, `star-${index}`),
      colour
    );

    result.push(
      `<g opacity="${opacity.toFixed(3)}" transform="rotate(${rotation} ${x} ${y})">${placedSvg(
        body,
        asset.viewBox,
        x,
        y,
        size
      )}</g>`
    );
  }

  return result.join("\n");
}

export async function buildIdenticon(value: IdenticonInput, assets: AssetSource): Promise<string> {
  const colours = palette(value.seed);

  const backgroundSource = await assets.constellation(value.solar);
  const backgroundAsset = parseSvg(backgroundSource);
  const backgroundBody = monochrome(
    scopeIds(backgroundAsset.body, `solar-${value.solar}`),
    colours.layer0.reduced
  );

  const starSource = await assets.star();
  const starAsset = parseSvg(starSource);
  const starLayer = stars(value.seed, starAsset, colours.layer0.reduced);

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
        `data-role="${escapeXml(placement.role)}" data-sign="${placement.sign}"`
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
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${data}">
  <title>${escapeXml(title)}</title>
  <metadata>Generated deterministically by astrological-identicon from existing vector assets.</metadata>
      <defs>
    <clipPath id="inner-clip">
      <circle cx="${centre}" cy="${centre}" r="${innerClipRadius}"/>
    </clipPath>
  </defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${colours.background.reduced}"/>

    <g id="background-stars" clip-path="url(#inner-clip)">
    ${starLayer}
  </g>

    <g id="foreground-layer-0" opacity="0.6" clip-path="url(#inner-clip)">
    ${nestedSvg(
    backgroundBody,
    backgroundAsset.viewBox,
    layer0X,
    layer0Y,
    layer0Size,
    layer0Size,
    `data-sign="${value.solar}"`
  )}
  </g>

  <g id="foreground-layer-1-core" opacity="0.04" clip-path="url(#inner-clip)">
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