import {
  identiconCanvas as canvas,
  identiconCentre as centre,
  identiconInnerRingRadius as innerRingRadius,
  identiconOuterRingRadius as outerRingRadius,
  identiconRingStroke as ringStroke,
  type Point,
} from "./identiconCommon.js";
import type { AstralIdenticonPlanetState, AstralIdenticonTracedGlyph } from "./identiconTypes.js";

// v9 visual geometry. The byte-to-state and anchor rules are copied from the
// existing v9 contract so moving the renderer does not change a single visual rule.
const v9CalibrationSampleCount = 12;
const v9RayFadingLevels = [6, 1, 5, 2, 4, 3, 4, 3, 5, 2, 1, 6] as const;
const v9StarCalibrationLevels = [6, 1, 5, 2, 4, 3, 6, 3, 4, 2, 5, 1] as const;
const v9ParityStarCount = 128;
const v9ParityPositionCount = 8;
const v9ParitySizeLevelCount = 6;
const v9ParityDensityLevelCount = 6;
const v9ParityVisualStateCount = v9ParityPositionCount * v9ParitySizeLevelCount * v9ParityDensityLevelCount;
const planetAnchorGroupCount = 24;
const planetAnchorCount = 256;
const satellitePositionCount = 6;
const innerGap = 8;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
export const v9InnerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;
const planetMacroSpacing = 100;
const planetGlyphSizes = [26, 30, 34, 38, 42, 46] as const;
const planetFadingOpacities = [0.48, 0.58, 0.68, 0.78, 0.89, 1] as const;
const satelliteDotRadii = [1.2, 1.8, 2.5] as const;
const satelliteOrbitPadding = 0;
const centralSun = {
  glyphSize: 46,
  rayCount: v9CalibrationSampleCount,
  rayInnerRadius: 25,
  rayOuterRadius: 33,
  rayStrokeWidth: 1.2
} as const;
const parityLocalSpacing = 3;
const parityStarSizes = [13, 15, 17, 19, 21, 23] as const;
const parityFadingOpacities = [0.44, 0.55, 0.66, 0.77, 0.88, 1] as const;
const calibrationStarRadius = 498;
const calibrationStarSizes = parityStarSizes;
const calibrationStarFadingOpacities = parityFadingOpacities;
const maximumPlanetEnvelope = Math.max(...planetGlyphSizes) / 2 + satelliteOrbitPadding + Math.max(...satelliteDotRadii);
const maximumParityEnvelope = Math.hypot(parityLocalSpacing * 1.5, parityLocalSpacing * 0.5) + Math.max(...parityStarSizes) / 2;
const maximumCalibrationStarRadius = Math.max(...calibrationStarSizes) / 2;

function calibrationLevel(values: readonly number[], index: number, label: string): number {
  if (!Number.isInteger(index) || index < 0 || index >= v9CalibrationSampleCount) {
    throw new Error(`${label} index must be between 0 and 11`);
  }
  return values[index]! - 1;
}

function v9RayFadingLevel(index: number): number {
  return calibrationLevel(v9RayFadingLevels, index, "v9 Sun-ray calibration");
}

function v9StarCalibrationLevel(index: number): number {
  return calibrationLevel(v9StarCalibrationLevels, index, "v9 star calibration");
}

function v9CalibrationAngle(index: number): number {
  v9StarCalibrationLevel(index);
  return index * 30;
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function polar(angle: number, radius: number): Point {
  return { x: centre + Math.cos(angle) * radius, y: centre + Math.sin(angle) * radius };
}

function planetAnchorGroupSize(group: number): number {
  if (!Number.isInteger(group) || group < 0 || group >= planetAnchorGroupCount) {
    throw new Error(`planet anchor group must be between 0 and ${planetAnchorGroupCount - 1}`);
  }
  return group < 21 && group % 4 !== 3 ? 11 : 10;
}

function planetAnchorGroup(anchor: number): number {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= planetAnchorCount) {
    throw new Error(`planet anchor must be between 0 and ${planetAnchorCount - 1}`);
  }
  let start = 0;
  for (let group = 0; group < planetAnchorGroupCount; group += 1) {
    const end = start + planetAnchorGroupSize(group);
    if (anchor < end) return group;
    start = end;
  }
  throw new Error("planet anchor group lookup exceeded the v9 anchor field");
}

function planetGroups(): readonly Point[] {
  const rowSpacing = planetMacroSpacing * Math.sqrt(3) / 2;
  const inner: Array<Point & { readonly radius: number; readonly angle: number }> = [];
  const outer: Array<Point & { readonly radius: number; readonly angle: number }> = [];
  for (let row = -4; row <= 4; row += 1) {
    const y = row * rowSpacing;
    const offset = Math.abs(row) % 2 === 0 ? 0 : planetMacroSpacing / 2;
    for (let column = -4; column <= 4; column += 1) {
      const x = column * planetMacroSpacing + offset;
      const radius = Math.hypot(x, y);
      if (radius < 90 || radius > 265.000001) continue;
      const value = { x: centre + x, y: centre + y, radius, angle: Math.atan2(y, x) };
      if (radius <= 200.000001) inner.push(value);
      else outer.push(value);
    }
  }
  outer.sort((left, right) => left.angle - right.angle);
  const selected = [...inner, ...outer.filter((_value, index) => index % 2 === 0)];
  selected.sort((left, right) => {
    const radius = left.radius - right.radius;
    return radius === 0 ? left.angle - right.angle : radius;
  });
  if (selected.length !== planetAnchorGroupCount) {
    throw new Error("v9 must expose exactly twenty-four separated planet groups");
  }
  return selected.map(({ x, y }) => ({ x, y }));
}

const microCandidates = [
  { x: -12, y: -8 }, { x: -4, y: -8 }, { x: 4, y: -8 }, { x: 12, y: -8 },
  { x: -12, y: 0 }, { x: -4, y: 0 }, { x: 4, y: 0 }, { x: 12, y: 0 },
  { x: -12, y: 8 }, { x: -4, y: 8 }, { x: 4, y: 8 }, { x: 12, y: 8 }
] as const;

function microOffsets(group: number): readonly Point[] {
  const size = planetAnchorGroupSize(group);
  const omitted = size === 11
    ? new Set([group % 4 * 4 + (group % 2 === 0 ? 0 : 3)])
    : new Set(group % 2 === 0 ? [0, 11] : [3, 8]);
  const values = microCandidates.filter((_point, index) => !omitted.has(index));
  if (values.length !== size) throw new Error("v9 planetary micro-anchor selection is inconsistent");
  return values;
}

const planetGroupCentres = planetGroups();
const planetGroupMicroOffsets = Array.from({ length: planetAnchorGroupCount }, (_unused, group) => microOffsets(group));
const maximumPlanetMicroOffset = Math.max(...planetGroupMicroOffsets.flatMap((offsets) => offsets.map((point) => Math.hypot(point.x, point.y))));
const planetAnchorPoints = planetGroupCentres.flatMap((group, index) => planetGroupMicroOffsets[index]!.map((offset) => ({ x: group.x + offset.x, y: group.y + offset.y })));

function crossGroupMinimum(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < planetAnchorPoints.length; left += 1) {
    const leftGroup = planetAnchorGroup(left);
    for (let right = left + 1; right < planetAnchorPoints.length; right += 1) {
      if (leftGroup === planetAnchorGroup(right)) continue;
      minimum = Math.min(minimum, distance(planetAnchorPoints[left]!, planetAnchorPoints[right]!));
    }
  }
  return minimum;
}

const minimumPlanetEnvelopeGap = crossGroupMinimum() - maximumPlanetEnvelope * 2;
const encodedFieldGapTarget = 4;
const planetExclusionRadius = maximumPlanetMicroOffset + maximumPlanetEnvelope + maximumParityEnvelope + encodedFieldGapTarget;
const parityMinimumRadius = centralSun.rayOuterRadius + maximumParityEnvelope + 6;
const parityMaximumRadius = v9InnerClipRadius - maximumParityEnvelope;

interface CandidatePoint extends Point { readonly source: number; }

function parityCandidates(): readonly CandidatePoint[] {
  const count = 8_192;
  const values: CandidatePoint[] = [];
  const minimumSquared = parityMinimumRadius ** 2;
  const spanSquared = parityMaximumRadius ** 2 - minimumSquared;
  for (let source = 0; source < count; source += 1) {
    const fraction = (source + 0.5) / count;
    const radius = Math.sqrt(minimumSquared + spanSquared * fraction);
    const point = polar(source * goldenAngle, radius);
    if (planetGroupCentres.some((group) => distance(point, group) < planetExclusionRadius)) continue;
    values.push({ ...point, source });
  }
  return values;
}

function boundaryClearance(point: Point): number {
  const radius = distance(point, { x: centre, y: centre });
  let clearance = Math.min(radius - parityMinimumRadius, parityMaximumRadius - radius);
  for (const group of planetGroupCentres) {
    clearance = Math.min(clearance, distance(point, group) - planetExclusionRadius);
  }
  return clearance;
}

function blueNoiseParityGroups(): readonly Point[] {
  const candidates = parityCandidates();
  if (candidates.length < v9ParityStarCount) throw new Error("v9 parity field does not provide enough legal candidates");
  let first = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    const difference = boundaryClearance(candidates[index]!) - boundaryClearance(candidates[first]!);
    if (difference > 0) first = index;
    if (difference === 0 && candidates[index]!.source < candidates[first]!.source) first = index;
  }
  const selected = new Set<number>([first]);
  const result: Point[] = [candidates[first]!];
  const nearest = candidates.map((candidate) => distance(candidate, candidates[first]!));
  nearest[first] = 0;
  while (result.length < v9ParityStarCount) {
    let best = -1;
    for (let index = 0; index < candidates.length; index += 1) {
      if (selected.has(index)) continue;
      if (best < 0 || nearest[index]! > nearest[best]!) best = index;
      if (best < 0 || nearest[index] !== nearest[best]) continue;
      if (candidates[index]!.source < candidates[best]!.source) best = index;
    }
    if (best < 0) throw new Error("v9 parity blue-noise selection failed");
    selected.add(best);
    const point = candidates[best]!;
    result.push(point);
    for (let index = 0; index < candidates.length; index += 1) {
      if (selected.has(index)) continue;
      nearest[index] = Math.min(nearest[index]!, distance(candidates[index]!, point));
    }
  }
  return result;
}

const parityGroupPoints = blueNoiseParityGroups();

function parityMinimumSeparation(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < parityGroupPoints.length; left += 1) {
    for (let right = left + 1; right < parityGroupPoints.length; right += 1) {
      minimum = Math.min(minimum, distance(parityGroupPoints[left]!, parityGroupPoints[right]!));
    }
  }
  return minimum;
}

if (planetAnchorPoints.length !== planetAnchorCount) throw new Error("v9 planetary field must contain exactly 256 anchors");
if (parityGroupPoints.length !== v9ParityStarCount) throw new Error("v9 parity geometry must expose exactly 128 scattered groups");
for (let level = 0; level < planetGlyphSizes.length; level += 1) {
  if (planetGlyphSizes[level] !== parityStarSizes[level]! * 2) throw new Error("v9 planetary glyph sizes must be exactly twice star sizes");
}
if (minimumPlanetEnvelopeGap < 18) throw new Error("v9 planetary groups are not visually separated enough");
if (parityMinimumSeparation() <= maximumParityEnvelope * 2 + 2) throw new Error("v9 parity stars must form a non-overlapping blue-noise field");
if (calibrationStarRadius <= outerRingRadius + ringStroke / 2) throw new Error("v9 calibration stars must remain outside the outer ring");
if (calibrationStarRadius + maximumCalibrationStarRadius > canvas / 2) throw new Error("v9 calibration stars must remain inside the canvas");

function planetAnchorPoint(anchor: number): Point {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= planetAnchorCount) {
    throw new Error(`planet anchor must be between 0 and ${planetAnchorCount - 1}`);
  }
  const point = planetAnchorPoints[anchor];
  if (!point) throw new Error("v9 planetary anchor is unavailable");
  return point;
}

function satellitePoint(parent: Point, glyphSize: number, position: number): Point {
  if (!Number.isInteger(position) || position < 0 || position >= satellitePositionCount) {
    throw new Error("satellite position must be between 0 and 5");
  }
  const angle = position / satellitePositionCount * Math.PI * 2 - Math.PI / 2;
  const radius = glyphSize / 2 + satelliteOrbitPadding;
  return { x: parent.x + Math.cos(angle) * radius, y: parent.y + Math.sin(angle) * radius };
}

function parityAnchorPoint(group: number, position: number): Point {
  if (!Number.isInteger(group) || group < 0 || group >= v9ParityStarCount) {
    throw new Error(`parity group must be between 0 and ${v9ParityStarCount - 1}`);
  }
  if (!Number.isInteger(position) || position < 0 || position >= v9ParityPositionCount) {
    throw new Error("parity position must be between 0 and 7");
  }
  const base = parityGroupPoints[group]!;
  const column = position % 4;
  const row = Math.floor(position / 4);
  const localX = (column - 1.5) * parityLocalSpacing;
  const localY = (row - 0.5) * parityLocalSpacing;
  const angle = group * goldenAngle;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: base.x + localX * cosine - localY * sine,
    y: base.y + localX * sine + localY * cosine
  };
}

function calibrationStar(index: number): { point: Point; angle: number; level: number; size: number; opacity: number } {
  const level = v9StarCalibrationLevel(index);
  const angleDegrees = v9CalibrationAngle(index);
  const angle = (angleDegrees - 90) * Math.PI / 180;
  return {
    point: polar(angle, calibrationStarRadius),
    angle: angleDegrees,
    level,
    size: calibrationStarSizes[level]!,
    opacity: calibrationStarFadingOpacities[level]!
  };
}

function sunRay(index: number): { start: Point; end: Point; angle: number; level: number; opacity: number } {
  if (!Number.isInteger(index) || index < 0 || index >= centralSun.rayCount) {
    throw new Error(`sun ray must be between 0 and ${centralSun.rayCount - 1}`);
  }
  const angleDegrees = v9CalibrationAngle(index);
  const angle = (angleDegrees - 90) * Math.PI / 180;
  const level = v9RayFadingLevel(index);
  return {
    angle: angleDegrees,
    level,
    opacity: planetFadingOpacities[level]!,
    start: polar(angle, centralSun.rayInnerRadius),
    end: polar(angle, centralSun.rayOuterRadius)
  };
}

function starPoints(x: number, y: number, size: number, rotation = 0): string {
  const outer = size / 2;
  const inner = outer * 0.34;
  const points: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (rotation - 90 + index * 22.5) * Math.PI / 180;
    points.push(`${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`);
  }
  return points.join(" ");
}

function tracedGlyphSvg(glyph: AstralIdenticonTracedGlyph, x: number, y: number, size: number, colour: string, attributes = ""): string {
  const width = glyph.maxX - glyph.minX;
  const height = glyph.maxY - glyph.minY;
  const viewBoxY = -glyph.maxY;
  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="${glyph.minX} ${viewBoxY} ${width} ${height}" preserveAspectRatio="xMidYMid meet" ${attributes}><path d="${glyph.path}" transform="scale(1 -1)" fill="${colour}" fill-rule="nonzero" data-vector-source="unicode-font-outline"/></svg>`;
}

export function calibrationStarsLayer(colour: string): string {
  const stars = Array.from({ length: v9CalibrationSampleCount }, (_unused, index) => {
    const reference = calibrationStar(index);
    const name = index === 0 ? "north-star-reference" : index === 6 ? "south-star-reference" : `calibration-star-reference-${index}`;
    const position = index === 0 ? "north" : index === 6 ? "south" : `${reference.angle}-degrees`;
    return `<g id="${name}" data-recognition-role="circumference-size-fading-orientation-reference" data-reference-index="${index}" data-reference-position="${position}" data-reference-angle="${reference.angle}" data-reference-level="${reference.level + 1}" data-reference-size="${reference.size}" data-reference-fading="${reference.opacity}" data-code-colour="parity-star-foreground" opacity="${reference.opacity}">
        <polygon points="${starPoints(reference.point.x, reference.point.y, reference.size)}" fill="${colour}" data-calibration-reference="true"/>
      </g>`;
  }).join("\n");
  return `<g id="calibration-stars-v9" data-recognition-role="twelve-fixed-star-references" data-size-calibration="true" data-fading-calibration="true" data-calibration-pattern="${v9StarCalibrationLevels.join(",")}">
    ${stars}
  </g>`;
}

export function sunLayer(colour: string, glyph: AstralIdenticonTracedGlyph, glyphName: string): string {
  const rays = Array.from({ length: centralSun.rayCount }, (_unused, index) => {
    const ray = sunRay(index);
    return `<line x1="${ray.start.x}" y1="${ray.start.y}" x2="${ray.end.x}" y2="${ray.end.y}" stroke="${colour}" stroke-width="${centralSun.rayStrokeWidth}" stroke-linecap="round" opacity="${ray.opacity}" data-calibration-angle="${ray.angle}" data-calibration-level="${ray.level + 1}" data-calibrates="fading-only"/>`;
  }).join("\n");
  const sun = tracedGlyphSvg(glyph, centre, centre, centralSun.glyphSize, colour, `data-glyph="${glyphName}" data-vector-role="calibration-sun"`);
  return `<g id="central-sun-reference" data-recognition-role="centre-fading-rotation-reference" data-size-calibration="false" data-fading-calibration="true" data-calibration-pattern="${v9RayFadingLevels.join(",")}" data-encodes="nothing" data-rotation="fixed">
    ${rays}
    ${sun}
  </g>`;
}

function validateLevel(value: number, count: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= count) throw new Error(`${label} is invalid`);
}

export function planetLayer(planets: readonly AstralIdenticonPlanetState[], colour: string): string {
  return planets.map((planet, index) => {
    validateLevel(planet.rotation, 12, "planet rotation level");
    validateLevel(planet.size, planetGlyphSizes.length, "planet size level");
    validateLevel(planet.density, planetFadingOpacities.length, "planet fading level");
    const point = planetAnchorPoint(planet.anchor);
    const size = planetGlyphSizes[planet.size]!;
    const fading = planetFadingOpacities[planet.density]!;
    const satellites = [planet.satellites.small, planet.satellites.medium, planet.satellites.large].map((position, satellite) => {
      const location = satellitePoint(point, size, position);
      return `<circle cx="${location.x}" cy="${location.y}" r="${satelliteDotRadii[satellite]}" fill="${colour}" data-satellite-size="${satellite}" data-satellite-position="${position}" data-code-colour="planetary-foreground"/>`;
    }).join("\n");
    const glyph = tracedGlyphSvg(planet.vector, point.x, point.y, size, colour, `data-vector-key="${planet.key}"`);
    return `<g data-planet-index="${index}" data-planet-key="${planet.key}" data-planet-body="${planet.body}" data-planet-glyph="${planet.glyph}" data-planet-anchor="${planet.anchor}" data-planet-rotation-level="${planet.rotation}" data-planet-size-level="${planet.size}" data-planet-fading-level="${planet.density}" data-code-role="exact-32-byte-identity" data-code-colour="planetary-foreground">
      <g transform="rotate(${planet.rotation * 30} ${point.x} ${point.y})" opacity="${fading}">
        ${glyph}
      </g>
      ${satellites}
    </g>`;
  }).join("\n");
}

function v9ParityVisualState(byte: number): { byte: number; state: number; position: number; size: number; density: number } {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error("v9 parity symbol must be one byte");
  const state = ((byte * 37 + 17) % v9ParityVisualStateCount + v9ParityVisualStateCount) % v9ParityVisualStateCount;
  const position = state % v9ParityPositionCount;
  const quotient = Math.floor(state / v9ParityPositionCount);
  const size = quotient % v9ParitySizeLevelCount;
  const density = Math.floor(quotient / v9ParitySizeLevelCount);
  return { byte, state, position, size, density };
}

export function parityLayer(parityBytes: readonly number[], colour: string): string {
  if (parityBytes.length !== v9ParityStarCount) {
    throw new Error(`v9 identicon requires exactly ${v9ParityStarCount} Reed-Solomon parity bytes`);
  }
  return parityBytes.map((byte, index) => {
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
