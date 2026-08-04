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
export const planetAnchorGroupCount = 18;
export const planetAnchorPositionCount = 16;
export const planetAnchorCount =
  planetAnchorGroupCount * planetAnchorPositionCount;
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

export function planetAnchorGroup(anchor: number): number {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= planetAnchorCount) {
    throw new Error(`planet anchor must be between 0 and ${planetAnchorCount - 1}`);
  }
  return Math.floor(anchor / planetAnchorPositionCount);
}

export function planetAnchorPosition(anchor: number): number {
  planetAnchorGroup(anchor);
  return anchor % planetAnchorPositionCount;
}

export function planetAnchor(group: number, position: number): number {
  if (
    !Number.isInteger(group) ||
    group < 0 ||
    group >= planetAnchorGroupCount
  ) {
    throw new Error(
      `planet anchor group must be between 0 and ${planetAnchorGroupCount - 1}`
    );
  }
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= planetAnchorPositionCount
  ) {
    throw new Error(
      `planet anchor position must be between 0 and ${planetAnchorPositionCount - 1}`
    );
  }
  return group * planetAnchorPositionCount + position;
}

if (planetCount !== 11) {
  throw new Error("v9 requires exactly eleven identity-bearing planetary glyphs");
}
if (planetAnchorCount !== 288) {
  throw new Error("v9 requires eighteen separated groups of sixteen anchors");
}
if (planetLocalStateCount !== 51_840) {
  throw new Error("v9 planetary local-state capacity is inconsistent");
}
