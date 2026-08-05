export const calibrationSunGlyph = "☉";

export const planetaryGlyphs = [
  { key: "moon", glyph: "☽", body: "Moon" },
  { key: "mercury", glyph: "☿", body: "Mercury" },
  { key: "venus", glyph: "♀", body: "Venus" },
  { key: "earth", glyph: "♁", body: "Earth" },
  { key: "mars", glyph: "♂", body: "Mars" },
  { key: "jupiter", glyph: "♃", body: "Jupiter" },
  { key: "saturn", glyph: "♄", body: "Saturn" },
  { key: "uranus", glyph: "♅", body: "Uranus" },
  { key: "neptune", glyph: "♆", body: "Neptune" },
  { key: "pluto", glyph: "♇", body: "Pluto" },
  { key: "ceres", glyph: "⚳", body: "Ceres" }
] as const;

export type PlanetaryGlyph = (typeof planetaryGlyphs)[number];
export type PlanetaryKey = PlanetaryGlyph["key"];

export const planetCount = planetaryGlyphs.length;
export const planetAnchorGroupCount = 24;
export const planetAnchorCount = 256;
export const planetRotationLevelCount = 12;
export const planetSizeLevelCount = 6;
export const planetDensityLevelCount = 6;
export const satellitePositionCount = 6;
export const satelliteCount = 3;
export const satelliteConfigurationCount = 120;

export const planetLocalStateCount =
  planetRotationLevelCount *
  planetSizeLevelCount *
  planetDensityLevelCount *
  satelliteConfigurationCount;

function validGroup(group: number): void {
  if (
    !Number.isInteger(group) ||
    group < 0 ||
    group >= planetAnchorGroupCount
  ) {
    throw new Error(
      `planet anchor group must be between 0 and ${planetAnchorGroupCount - 1}`
    );
  }
}

/**
 * Sixteen groups expose eleven micro-anchors and eight expose ten. The
 * eleven-anchor groups deliberately avoid macro indices ending in 3 so the
 * deterministic omission pattern in layout-v9 always names a real point.
 */
export function planetAnchorGroupSize(group: number): number {
  validGroup(group);
  return group < 21 && group % 4 !== 3 ? 11 : 10;
}

export function planetAnchorGroupStart(group: number): number {
  validGroup(group);
  let start = 0;
  for (let index = 0; index < group; index += 1) {
    start += planetAnchorGroupSize(index);
  }
  return start;
}

export function planetAnchorGroup(anchor: number): number {
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

export function planetAnchorPosition(anchor: number): number {
  const group = planetAnchorGroup(anchor);
  return anchor - planetAnchorGroupStart(group);
}

export function planetAnchor(group: number, position: number): number {
  const size = planetAnchorGroupSize(group);
  if (!Number.isInteger(position) || position < 0 || position >= size) {
    throw new Error(
      `planet anchor position must be between 0 and ${size - 1}`
    );
  }
  return planetAnchorGroupStart(group) + position;
}

if (planetCount !== 11) {
  throw new Error("v9 requires exactly eleven identity-bearing planetary glyphs");
}
const groupSizes = Array.from(
  { length: planetAnchorGroupCount },
  (_unused, group) => planetAnchorGroupSize(group)
);
if (groupSizes.filter((size) => size === 11).length !== 16) {
  throw new Error("v9 requires exactly sixteen eleven-anchor groups");
}
if (groupSizes.reduce((sum, size) => sum + size, 0) !== planetAnchorCount) {
  throw new Error("v9 separated planetary groups must expose exactly 256 anchors");
}
if (planetLocalStateCount !== 51_840) {
  throw new Error("v9 planetary local-state capacity is inconsistent");
}
