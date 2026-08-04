import {
  v9CalibrationAngle,
  v9CalibrationSampleCount,
  v9RayFadingLevel,
  v9StarCalibrationLevel
} from "./calibration-v9.ts";
import {
  canvas,
  centre,
  innerRingRadius,
  outerRingRadius,
  ringStroke
} from "./layout.ts";
import {
  planetAnchorCount,
  planetAnchorGroup,
  planetAnchorGroupCount,
  planetAnchorGroupSize,
  planetDensityLevelCount,
  planetSizeLevelCount,
  satellitePositionCount
} from "./planet.ts";
import {
  v9ParityDensityLevelCount,
  v9ParityPositionCount,
  v9ParitySizeLevelCount,
  v9ParityStarCount
} from "./parity-v9.ts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SunRay {
  readonly start: Point;
  readonly end: Point;
  readonly angle: number;
  readonly level: number;
  readonly opacity: number;
}

export interface CalibrationStar {
  readonly point: Point;
  readonly angle: number;
  readonly level: number;
  readonly size: number;
  readonly opacity: number;
}

interface CandidatePoint extends Point {
  readonly source: number;
}

const innerGap = 8;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
export const v9InnerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;

export const planetMacroSpacing = 100;
export const planetMicroSpacing = 8;
export const planetGlyphSizes = [26, 30, 34, 38, 42, 46] as const;
export const planetDensityStrokeWidths = [0, 0, 0, 0, 0, 0] as const;
export const planetFadingOpacities = [0.48, 0.58, 0.68, 0.78, 0.89, 1] as const;
export const planetDensityOpacities = planetFadingOpacities;
export const satelliteDotRadii = [1.2, 1.8, 2.5] as const;
export const satelliteOrbitPadding = 0;

export const centralSun = {
  glyphSize: 46,
  rayCount: v9CalibrationSampleCount,
  rayInnerRadius: 25,
  rayOuterRadius: 33,
  rayStrokeWidth: 1.2
} as const;

export const parityLocalSpacing = 3;
export const parityStarSizes = [13, 15, 17, 19, 21, 23] as const;
export const parityDensityStrokeWidths = [0, 0, 0, 0, 0, 0] as const;
export const parityFadingOpacities = [0.44, 0.55, 0.66, 0.77, 0.88, 1] as const;
export const parityDensityOpacities = parityFadingOpacities;

/** Exactly twelve non-payload references sit around the outer circumference. */
export const calibrationStarRadius = 498;
export const calibrationStarSizes = parityStarSizes;
export const calibrationStarFadingOpacities = parityFadingOpacities;

export const maximumPlanetEnvelope =
  Math.max(...planetGlyphSizes) / 2 +
  satelliteOrbitPadding +
  Math.max(...satelliteDotRadii);
export const maximumParityEnvelope =
  Math.hypot(parityLocalSpacing * 1.5, parityLocalSpacing * 0.5) +
  Math.max(...parityStarSizes) / 2;
export const maximumCalibrationStarRadius =
  Math.max(...calibrationStarSizes) / 2;

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function polar(angle: number, radius: number): Point {
  return {
    x: centre + Math.cos(angle) * radius,
    y: centre + Math.sin(angle) * radius
  };
}

export function calibrationStarPoint(index: number): Point {
  const angle = (v9CalibrationAngle(index) - 90) * Math.PI / 180;
  return polar(angle, calibrationStarRadius);
}

export function calibrationStar(index: number): CalibrationStar {
  const level = v9StarCalibrationLevel(index);
  return {
    point: calibrationStarPoint(index),
    angle: v9CalibrationAngle(index),
    level,
    size: calibrationStarSizes[level]!,
    opacity: calibrationStarFadingOpacities[level]!
  };
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
      const value = {
        x: centre + x,
        y: centre + y,
        radius,
        angle: Math.atan2(y, x)
      };
      if (radius <= 200.000001) inner.push(value);
      else outer.push(value);
    }
  }

  outer.sort((left, right) => left.angle - right.angle);
  const selected = [
    ...inner,
    ...outer.filter((_value, index) => index % 2 === 0)
  ];
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
  if (values.length !== size) {
    throw new Error("v9 planetary micro-anchor selection is inconsistent");
  }
  return values;
}

export const planetGroupCentres = planetGroups();
export const planetGroupMicroOffsets = Array.from(
  { length: planetAnchorGroupCount },
  (_unused, group) => microOffsets(group)
);
export const maximumPlanetMicroOffset = Math.max(
  ...planetGroupMicroOffsets.flatMap((offsets) => {
    return offsets.map((point) => Math.hypot(point.x, point.y));
  })
);

export const planetAnchorPoints = planetGroupCentres.flatMap((group, index) => {
  return planetGroupMicroOffsets[index]!.map((offset) => ({
    x: group.x + offset.x,
    y: group.y + offset.y
  }));
});

export const planetAnchorOuterRadius = Math.max(
  ...planetAnchorPoints.map((point) => distance(point, { x: centre, y: centre }))
);

function crossGroupMinimum(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < planetAnchorPoints.length; left += 1) {
    const leftGroup = planetAnchorGroup(left);
    for (let right = left + 1; right < planetAnchorPoints.length; right += 1) {
      if (leftGroup === planetAnchorGroup(right)) continue;
      minimum = Math.min(
        minimum,
        distance(planetAnchorPoints[left]!, planetAnchorPoints[right]!)
      );
    }
  }
  return minimum;
}

export const minimumPlanetAnchorSeparation = crossGroupMinimum();
export const minimumPlanetEnvelopeGap =
  minimumPlanetAnchorSeparation - maximumPlanetEnvelope * 2;

const encodedFieldGapTarget = 4;
export const encodedFieldGap = encodedFieldGapTarget;
const planetExclusionRadius =
  maximumPlanetMicroOffset +
  maximumPlanetEnvelope +
  maximumParityEnvelope +
  encodedFieldGapTarget;
const parityMinimumRadius =
  centralSun.rayOuterRadius + maximumParityEnvelope + 6;
const parityMaximumRadius = v9InnerClipRadius - maximumParityEnvelope;

function parityCandidates(): readonly CandidatePoint[] {
  const count = 8_192;
  const values: CandidatePoint[] = [];
  const minimumSquared = parityMinimumRadius ** 2;
  const spanSquared = parityMaximumRadius ** 2 - minimumSquared;

  for (let source = 0; source < count; source += 1) {
    const fraction = (source + 0.5) / count;
    const radius = Math.sqrt(minimumSquared + spanSquared * fraction);
    const point = polar(source * goldenAngle, radius);
    if (planetGroupCentres.some((group) => {
      return distance(point, group) < planetExclusionRadius;
    })) continue;
    values.push({ ...point, source });
  }
  return values;
}

function boundaryClearance(point: Point): number {
  const radius = distance(point, { x: centre, y: centre });
  let clearance = Math.min(
    radius - parityMinimumRadius,
    parityMaximumRadius - radius
  );
  for (const group of planetGroupCentres) {
    clearance = Math.min(clearance, distance(point, group) - planetExclusionRadius);
  }
  return clearance;
}

function blueNoiseParityGroups(): readonly Point[] {
  const candidates = parityCandidates();
  if (candidates.length < v9ParityStarCount) {
    throw new Error("v9 parity field does not provide enough legal candidates");
  }

  let first = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    const difference =
      boundaryClearance(candidates[index]!) -
      boundaryClearance(candidates[first]!);
    if (difference > 0) first = index;
    if (difference === 0 && candidates[index]!.source < candidates[first]!.source) {
      first = index;
    }
  }

  const selected = new Set<number>([first]);
  const result: Point[] = [candidates[first]!];
  const nearest = candidates.map((candidate) => {
    return distance(candidate, candidates[first]!);
  });
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

export const parityGroupPoints = blueNoiseParityGroups();

function parityMinimumSeparation(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < parityGroupPoints.length; left += 1) {
    for (let right = left + 1; right < parityGroupPoints.length; right += 1) {
      minimum = Math.min(
        minimum,
        distance(parityGroupPoints[left]!, parityGroupPoints[right]!)
      );
    }
  }
  return minimum;
}

export const minimumParityGroupSeparation = parityMinimumSeparation();

if (planetAnchorPoints.length !== planetAnchorCount) {
  throw new Error("v9 planetary field must contain exactly 256 anchors");
}
if (planetGlyphSizes.length !== planetSizeLevelCount) {
  throw new Error("v9 planetary size geometry is inconsistent");
}
if (planetFadingOpacities.length !== planetDensityLevelCount) {
  throw new Error("v9 planetary fading geometry is inconsistent");
}
if (satellitePositionCount !== 6) {
  throw new Error("v9 satellites require exactly six angular positions");
}
if (parityGroupPoints.length !== v9ParityStarCount) {
  throw new Error("v9 parity geometry must expose exactly 128 scattered groups");
}
if (parityStarSizes.length !== v9ParitySizeLevelCount) {
  throw new Error("v9 parity size geometry is inconsistent");
}
if (parityFadingOpacities.length !== v9ParityDensityLevelCount) {
  throw new Error("v9 parity fading geometry is inconsistent");
}
if (v9ParityPositionCount !== 8) {
  throw new Error("v9 parity groups require exactly eight local anchors");
}
for (let level = 0; level < planetGlyphSizes.length; level += 1) {
  if (planetGlyphSizes[level] !== parityStarSizes[level]! * 2) {
    throw new Error("v9 planetary glyph sizes must be exactly twice star sizes");
  }
}
if (minimumPlanetEnvelopeGap < 18) {
  throw new Error("v9 planetary groups are not visually separated enough");
}
if (minimumParityGroupSeparation <= maximumParityEnvelope * 2 + 2) {
  throw new Error("v9 parity stars must form a non-overlapping blue-noise field");
}
if (calibrationStarRadius <= outerRingRadius + ringStroke / 2) {
  throw new Error("v9 calibration stars must remain outside the outer ring");
}
if (calibrationStarRadius + maximumCalibrationStarRadius > canvas / 2) {
  throw new Error("v9 calibration stars must remain inside the canvas");
}

export function planetAnchorPoint(anchor: number): Point {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= planetAnchorCount) {
    throw new Error(`planet anchor must be between 0 and ${planetAnchorCount - 1}`);
  }
  const point = planetAnchorPoints[anchor];
  if (!point) throw new Error("v9 planetary anchor is unavailable");
  return point;
}

export function satellitePoint(
  parent: Point,
  glyphSize: number,
  position: number
): Point {
  if (!Number.isInteger(position) || position < 0 || position >= satellitePositionCount) {
    throw new Error("satellite position must be between 0 and 5");
  }
  const angle = position / satellitePositionCount * Math.PI * 2 - Math.PI / 2;
  const radius = glyphSize / 2 + satelliteOrbitPadding;
  return {
    x: parent.x + Math.cos(angle) * radius,
    y: parent.y + Math.sin(angle) * radius
  };
}

export function parityAnchorPoint(group: number, position: number): Point {
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

export function sunRay(index: number): SunRay {
  if (!Number.isInteger(index) || index < 0 || index >= centralSun.rayCount) {
    throw new Error(`sun ray must be between 0 and ${centralSun.rayCount - 1}`);
  }
  const angle = (v9CalibrationAngle(index) - 90) * Math.PI / 180;
  const level = v9RayFadingLevel(index);
  return {
    angle: v9CalibrationAngle(index),
    level,
    opacity: planetFadingOpacities[level]!,
    start: polar(angle, centralSun.rayInnerRadius),
    end: polar(angle, centralSun.rayOuterRadius)
  };
}
