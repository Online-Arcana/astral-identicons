import {
  escapeXml,
  identiconCentre,
  monochrome,
  nestedSvg,
  parseSvg,
  scopeIds,
  signLabel,
} from "./identiconCommon.js";
import { parityLayer, v9InnerClipRadius } from "./identiconV9Geometry.js";
import { v10OverlayRadius, v10OverlayScale } from "../../layout-v10.js";
import type {
  AstralIdenticonAssetSource,
  AstralIdenticonV10Request,
} from "./identiconTypes.js";
import {
  pointGlyphVisible,
  type PointId,
  type WheelGlyphs,
} from "../../../vendor/astral-chart-wheel/dist/wheel/index.js";
import type { Sign } from "../../sign.ts";

const canvas = 800;
const centre = canvas / 2;
const radii = {
  outer: 372,
  zodiacInner: 316,
  pointBase: 286,
} as const;

const identiconPointGlyphs = {
  default: false,
  collections: { planets: true },
} as const satisfies WheelGlyphs;

const signOrder = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
] as const satisfies readonly Sign[];

interface Point { x: number; y: number; }
interface PlacedPoint { id: PointId; longitude: number; lane: number; }
interface GlyphAsset { path: string; rotation?: number; modifier?: string; }

const normalise = (degrees: number): number => ((degrees % 360) + 360) % 360;
const forwardDistance = (start: number, end: number): number => normalise(end - start);
const radians = (degrees: number): number => degrees * Math.PI / 180;
const screenAngle = (longitude: number, ascendant: number): number =>
  Math.PI - radians(normalise(longitude - ascendant));

const polar = (longitude: number, radius: number, ascendant: number): Point => {
  const angle = screenAngle(longitude, ascendant);
  return {
    x: centre + radius * Math.cos(angle),
    y: centre + radius * Math.sin(angle),
  };
};

const sectorPath = (
  start: number,
  end: number,
  inner: number,
  outer: number,
  ascendant: number,
): string => {
  const distance = Math.max(0.01, forwardDistance(start, end));
  const steps = Math.max(3, Math.ceil(distance / 3));
  const outerPoints: Point[] = [];
  const innerPoints: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const longitude = normalise(start + distance * index / steps);
    outerPoints.push(polar(longitude, outer, ascendant));
    innerPoints.push(polar(longitude, inner, ascendant));
  }
  const first = outerPoints[0];
  if (first === undefined) return "";
  const commands = [`M ${first.x.toFixed(3)} ${first.y.toFixed(3)}`];
  for (const point of outerPoints.slice(1)) commands.push(`L ${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
  for (const point of innerPoints.reverse()) commands.push(`L ${point.x.toFixed(3)} ${point.y.toFixed(3)}`);
  commands.push("Z");
  return commands.join(" ");
};

const line = (
  longitude: number,
  fromRadius: number,
  toRadius: number,
  ascendant: number,
  colour: string,
  opacity: number,
  width: number,
): string => {
  const from = polar(longitude, fromRadius, ascendant);
  const to = polar(longitude, toRadius, ascendant);
  return `<line x1="${from.x.toFixed(3)}" y1="${from.y.toFixed(3)}" x2="${to.x.toFixed(3)}" y2="${to.y.toFixed(3)}" stroke="${colour}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;
};

const pointLayout = (request: AstralIdenticonV10Request): PlacedPoint[] => {
  if (request.wheel === null) return [];
  const points = Object.entries(request.wheel.points)
  .flatMap(([rawId, longitude]) => {
    const id = rawId as PointId;
    return longitude === null || !pointGlyphVisible(id, identiconPointGlyphs)
      ? []
      : [{ id, longitude }];
  })
    .sort((left, right) => left.longitude - right.longitude || left.id.localeCompare(right.id));
  const lastByLane: (number | null)[] = [null, null, null, null, null];
  return points.map((point) => {
    let selected = 0;
    for (let lane = 0; lane < lastByLane.length; lane += 1) {
      const previous = lastByLane[lane];
      if (previous === undefined || previous === null || forwardDistance(previous, point.longitude) >= 6.5) {
        selected = lane;
        break;
      }
      selected = Math.min(lane + 1, lastByLane.length - 1);
    }
    lastByLane[selected] = point.longitude;
    return { ...point, lane: selected };
  });
};

const pointAsset = (id: PointId): GlyphAsset | null => {
  if (["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"].includes(id)) {
    return { path: `planets/${id}.svg` };
  }
  switch (id) {
    case "ascendant":
    case "descendant":
    case "midheaven":
    case "imum_coeli":
    case "vertex":
    case "east_point": return { path: `angles/${id}.svg` };
    case "antivertex": return { path: "angles/vertex.svg", rotation: 180 };
    case "north_node_true": return { path: "misc/true_node.svg", modifier: "N" };
    case "south_node_true": return { path: "misc/true_node.svg", modifier: "S" };
    case "north_node_mean": return { path: "misc/mean_node.svg", modifier: "N" };
    case "south_node_mean": return { path: "misc/mean_node.svg", modifier: "S" };
    case "part_of_fortune": return { path: "points/lot_of_fortune.svg" };
    case "part_of_spirit": return { path: "points/lot_of_spirit.svg" };
    case "lilith_mean": return { path: "points/black_moon_lilith.svg", modifier: "M" };
    case "lilith_true": return { path: "points/black_moon_lilith.svg", modifier: "T" };
    default: return null;
  }
};

async function glyph(
  assets: AstralIdenticonAssetSource,
  path: string,
  prefix: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  rotation = 0,
  modifier?: string,
): Promise<string> {
  const load = assets.astrologyGlyph;
  if (load === undefined) {
    throw new Error("v10 chart identicons require astrology chart glyph assets");
  }
  const parsed = parseSvg(await load(path));
  const body = monochrome(scopeIds(parsed.body, prefix), colour);
  const image = nestedSvg(
    body,
    parsed.viewBox,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  const rotated = rotation === 0
    ? image
    : `<g transform="rotate(${rotation} ${x.toFixed(3)} ${y.toFixed(3)})">${image}</g>`;
  if (modifier === undefined) return rotated;
  return `${rotated}<text x="${(x + size * 0.42).toFixed(3)}" y="${(y - size * 0.28).toFixed(3)}" fill="${colour}" font-family="Inter,system-ui,sans-serif" font-size="${Math.max(8, size * 0.32).toFixed(3)}" font-weight="900" text-anchor="middle">${modifier}</text>`;
}

async function zodiacLayer(
  request: AstralIdenticonV10Request,
  assets: AstralIdenticonAssetSource,
  ascendant: number,
): Promise<string> {
  const sectors: string[] = [];
  const glyphs: string[] = [];
  for (let index = 0; index < signOrder.length; index += 1) {
    const sign = signOrder[index]!;
    const start = index * 30;
    const end = start + 30;
    const fill = index % 2 === 0 ? request.palette.layer0 : request.palette.layer1;
    sectors.push(`<path d="${sectorPath(start, end, radii.zodiacInner, radii.outer, ascendant)}" fill="${fill}" fill-opacity="0.11" stroke="${request.palette.layer1}" stroke-opacity="0.24" stroke-width="1.2" data-sign="${sign}"/>`);
    const point = polar(start + 15, (radii.zodiacInner + radii.outer) / 2, ascendant);
    glyphs.push(await glyph(
      assets,
      `zodiac/${sign}.svg`,
      `wheel-sign-${sign}`,
      point.x,
      point.y,
      31,
      request.palette.layer1,
    ));
  }
  return `<g id="wheel-zodiac">${sectors.join("")}${glyphs.join("")}</g>`;
}

function degreeTicks(request: AstralIdenticonV10Request, ascendant: number): string {
  const ticks: string[] = [];
  for (let longitude = 0; longitude < 360; longitude += 5) {
    const major = longitude % 30 === 0;
    ticks.push(line(
      longitude,
      major ? radii.outer - 14 : radii.outer - 7,
      radii.outer,
      ascendant,
      request.palette.layer1,
      major ? 0.66 : 0.32,
      major ? 1.6 : 1,
    ));
  }
  return `<g id="wheel-degree-ticks">${ticks.join("")}</g>`;
}

async function pointsLayer(
  request: AstralIdenticonV10Request,
  assets: AstralIdenticonAssetSource,
  ascendant: number,
): Promise<string> {
  const placed = pointLayout(request);
  const parts: string[] = [];
  for (const point of placed) {
    const radius = radii.pointBase - point.lane * 24;
    const location = polar(point.longitude, radius, ascendant);
    const asset = pointAsset(point.id);
    if (asset === null) continue;
    parts.push(await glyph(
      assets,
      asset.path,
      `wheel-point-${point.id}`,
      location.x,
      location.y,
      29,
      request.palette.layer1,
      asset.rotation ?? 0,
      asset.modifier,
    ));
  }
  return `<g id="wheel-points">${parts.join("")}</g>`;
}

async function identiconOverlay(
  request: AstralIdenticonV10Request,
  assets: AstralIdenticonAssetSource,
): Promise<string> {
  const constellation = parseSvg(await assets.constellation(request.input.solar));
  const constellationBody = monochrome(
    scopeIds(constellation.body, `v10-solar-${request.input.solar}`),
    request.palette.layer0,
  );
  const sourceRadius = v9InnerClipRadius - 12;
  const sourceSize = sourceRadius * 2;
  const sourceX = identiconCentre - sourceRadius;
  const sourceY = identiconCentre - sourceRadius;
  const scale = v10OverlayScale;
  const transform = `translate(${centre} ${centre}) scale(${scale.toFixed(9)}) translate(-${identiconCentre} -${identiconCentre})`;
  return `<g id="identicon-aspect-overlay" clip-path="url(#identicon-aspect-clip)">
    <g transform="${transform}">
      <g id="solar-constellation" data-recognition-role="solar-constellation" data-sign="${request.input.solar}" opacity="0.6">
        ${nestedSvg(constellationBody, constellation.viewBox, sourceX, sourceY, sourceSize, sourceSize)}
      </g>
      <g id="reed-solomon-stars" data-code="reed-solomon-168-40-parity-stars-128-v10" data-code-role="complete-record-recovery" data-code-source-bytes="${request.dataByteCount}" data-code-parity-bytes="${request.parityByteCount}" data-code-stars="${request.parityByteCount}">
        ${parityLayer(request.parityBytes, request.palette.layer1)}
      </g>
    </g>
  </g>`;
}

export async function renderAstralIdenticonV10(
  request: AstralIdenticonV10Request,
  assets: AstralIdenticonAssetSource,
): Promise<string> {
  const ascendant = request.wheel?.points.ascendant ?? 180;
  const title = `Astral chart identicon v10: ${signLabel(request.input.solar)} Sun, ${signLabel(request.input.lunar)} Moon`;
  const zodiac = await zodiacLayer(request, assets, ascendant);
  const points = await pointsLayer(request, assets, ascendant);
  const overlay = await identiconOverlay(request, assets);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${escapeXml(JSON.stringify(request.input))}" data-palette-index="${request.paletteIndex}" data-code-version="${request.recordVersion}" data-visual-version="10" data-scannable="v10" data-identity-hex="${request.identityHex}">
  <title>${escapeXml(title)}</title>
  <metadata>Astral chart identicon visual contract v10. The deterministic natal chart wheel supplies the zodiac ring and real planetary chart points. House divisions, house labels and aspect lines are deliberately omitted. The identicon field expands to the inner edge of the zodiac ring and contains the Solar constellation artwork and the one hundred and twenty-eight RS(168,40) parity stars. The former encoded planetary glyphs, satellites, literal six-sign grid and separate identicon zodiac ring are not rendered.</metadata>
  <defs>
    <clipPath id="identicon-aspect-clip"><circle cx="${centre}" cy="${centre}" r="${v10OverlayRadius}"/></clipPath>
  </defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${request.palette.background}"/>
  <circle id="wheel-frame" cx="${centre}" cy="${centre}" r="${radii.outer}" fill="${request.palette.background}" stroke="${request.palette.layer1}" stroke-opacity="0.62" stroke-width="2"/>
  ${zodiac}
  ${degreeTicks(request, ascendant)}
  ${overlay}
  ${points}
</svg>
`;
}
