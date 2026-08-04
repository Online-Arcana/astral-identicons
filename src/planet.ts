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

if (planetCount !== 11) {
  throw new Error("v9 requires exactly eleven identity-bearing planetary glyphs");
}

if (planetLocalStateCount !== 51_840) {
  throw new Error("v9 planetary local-state capacity is inconsistent");
}
