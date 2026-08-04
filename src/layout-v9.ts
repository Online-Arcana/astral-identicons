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

interface AnchorCandidate extends Point {
  readonly radius: number;
  readonly angle: number;
}

const innerGap = 8;
export const v9InnerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;

export const planetAnchorSpacing = 32;
export const planetAnchorInnerRadius = 80;
export const planetAnchorOuterRadius = 279;
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

/** 128 indexed payload stars arranged as two collision-free polar tracks. */
export const parityGroupTrackCount = 2;
export const parityGroupSectorCount = 64;
export const parityGroupRadii = [332, 365] as const;
export const parityLocalSpacing = 3;
export const parityStarSizes = [13, 15, 17, 19, 21, 23] as const;
export const parityDensityStrokeWidths = [0, 0, 0, 0, 0, 0] as const;
export const parityFadingOpacities = [0.44, 0.55, 0.66, 0.77, 0.88, 1] as const;
export const parityDensityOpacities = parityFadingOpacities;

/**
 * Twelve fixed references sit outside the outer ring, one every 30 degrees.
 * They do not consume payload space and cannot collide with parity stars.
 */
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
export const encodedFieldGap =
  parityGroupRadii[0] - maximumParityEnvelope -
  (planetAnchorOuterRadius + maximumPlanetEnvelope);

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
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

function anchorCandidates(): AnchorCandidate[] {
  const rowSpacing = planetAnchorSpacing * Math.sqrt(3) / 2;
  const rowLimit = Math.ceil(planetAnchorOuterRadius / rowSpacing);
  const columnLimit = Math.ceil(
    planetAnchorOuterRadius / planetAnchorSpacing
  ) + 2;
  const result: AnchorCandidate[] = [];

  for (let row = -rowLimit; row <= rowLimit; row += 1) {
    const y = row * rowSpacing;
    const offset = Math.abs(row) % 2 === 0
      ? 0
      : planetAnchorSpacing / 2;

    for (let column = -columnLimit; column <= columnLimit; column += 1) {
      const x = column * planetAnchorSpacing + offset;
      const radius = Math.hypot(x, y);
      if (
        radius < planetAnchorInnerRadius ||
        radius > planetAnchorOuterRadius
      ) {
        continue;
      }

      result.push({
        x: centre + x,
        y: centre + y,
        radius,
        angle: Math.atan2(y, x)
      });
    }
  }

  return result;
}

function balancedPlanetAnchors(): readonly Point[] {
  const candidates = anchorCandidates();
  const removeCount = candidates.length - planetAnchorCount;
  if (removeCount < 0) {
    throw new Error("v9 planetary lattice does not provide 256 anchors");
  }

  const removable = candidates
    .filter((candidate) => candidate.radius >= 270)
    .sort((left, right) => right.radius - left.radius);
  const removed = new Set<AnchorCandidate>();

  for (let index = 0; index < removeCount; index += 1) {
    const target = -Math.PI / 2 + index / removeCount * Math.PI * 2;
    const candidate = removable
      .filter((value) => !removed.has(value))
      .sort((left, right) => {
        const angle =
          angularDistance(left.angle, target) -
          angularDistance(right.angle, target);
        if (angle !== 0) return angle;
        return right.radius - left.radius;
      })[0];

    if (!candidate) {
      throw new Error("v9 planetary lattice could not remove excess anchors");
    }
    removed.add(candidate);
  }

  const anchors = candidates
    .filter((candidate) => !removed.has(candidate))
    .sort((left, right) => {
      const radius = left.radius - right.radius;
      if (radius !== 0) return radius;
      return left.angle - right.angle;
    })
    .map(({ x, y }) => ({ x, y }));

  if (anchors.length !== planetAnchorCount) {
    throw new Error("v9 planetary lattice must contain exactly 256 anchors");
  }
  return anchors;
}

export const planetAnchorPoints = balancedPlanetAnchors();

if (planetGlyphSizes.length !== planetSizeLevelCount) {
  throw new Error("v9 planetary size geometry is inconsistent");
}
if (planetFadingOpacities.length !== planetDensityLevelCount) {
  throw new Error("v9 planetary fading geometry is inconsistent");
}
if (satellitePositionCount !== 6) {
  throw new Error("v9 satellites require exactly six angular positions");
}
if (parityGroupTrackCount * parityGroupSectorCount !== v9ParityStarCount) {
  throw new Error("v9 parity geometry must expose exactly 128 indexed groups");
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
if (
  planetAnchorInnerRadius <=
  centralSun.rayOuterRadius + maximumPlanetEnvelope
) {
  throw new Error("v9 planetary anchors must clear the central Sun reference");
}
if (encodedFieldGap <= 0) {
  throw new Error("v9 planetary and parity envelopes must not overlap");
}
const minimumTrackChord =
  2 * parityGroupRadii[0] * Math.sin(Math.PI / parityGroupSectorCount);
if (minimumTrackChord <= maximumParityEnvelope * 2) {
  throw new Error("adjacent v9 parity envelopes on a track must not overlap");
}
if (
  parityGroupRadii[1] - parityGroupRadii[0] <=
  maximumParityEnvelope * 2
) {
  throw new Error("v9 parity tracks must not overlap");
}
if (
  parityGroupRadii.at(-1)! + maximumParityEnvelope >
  v9InnerClipRadius
) {
  throw new Error("v9 parity stars must remain inside the inner ring");
}
if (calibrationStarRadius <= outerRingRadius + ringStroke / 2) {
  throw new Error("v9 calibration stars must remain outside the outer ring");
}
if (
  calibrationStarRadius + maximumCalibrationStarRadius >
  canvas / 2
) {
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
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= satellitePositionCount
  ) {
    throw new Error("satellite position must be between 0 and 5");
  }

  const angle = position / satellitePositionCount * Math.PI * 2 - Math.PI / 2;
  const radius = glyphSize / 2 + satelliteOrbitPadding;
  return {
    x: parent.x + Math.cos(angle) * radius,
    y: parent.y + Math.sin(angle) * radius
  };
}

function parityGroupGeometry(group: number): {
  readonly angle: number;
  readonly base: Point;
} {
  if (!Number.isInteger(group) || group < 0 || group >= v9ParityStarCount) {
    throw new Error(`parity group must be between 0 and ${v9ParityStarCount - 1}`);
  }

  const track = Math.floor(group / parityGroupSectorCount);
  const sector = group % parityGroupSectorCount;
  const phase = track % 2 === 0 ? 0 : 0.5;
  const angle =
    ((sector + phase) / parityGroupSectorCount) * Math.PI * 2 - Math.PI / 2;
  const radius = parityGroupRadii[track]!;
  return { angle, base: polar(angle, radius) };
}

export function parityAnchorPoint(group: number, position: number): Point {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= v9ParityPositionCount
  ) {
    throw new Error("parity position must be between 0 and 7");
  }

  const geometry = parityGroupGeometry(group);
  const column = position % 4;
  const row = Math.floor(position / 4);
  const tangent = (column - 1.5) * parityLocalSpacing;
  const radial = (row - 0.5) * parityLocalSpacing;
  const radialX = Math.cos(geometry.angle);
  const radialY = Math.sin(geometry.angle);
  const tangentX = -radialY;
  const tangentY = radialX;

  return {
    x: geometry.base.x + tangentX * tangent + radialX * radial,
    y: geometry.base.y + tangentY * tangent + radialY * radial
  };
}

export function sunRay(index: number): SunRay {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= centralSun.rayCount
  ) {
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
