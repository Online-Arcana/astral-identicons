import {
  planetAnchorCount,
  planetCount,
  planetDensityLevelCount,
  planetaryGlyphs,
  planetLocalStateCount,
  planetRotationLevelCount,
  planetSizeLevelCount,
  satelliteConfigurationCount,
  satelliteCount,
  satellitePositionCount,
  type PlanetaryKey
} from "./planet.ts";

export interface SatelliteState {
  readonly small: number;
  readonly medium: number;
  readonly large: number;
}

export interface PlanetState {
  readonly key: PlanetaryKey;
  readonly anchor: number;
  readonly rotation: number;
  readonly size: number;
  readonly density: number;
  readonly satellites: SatelliteState;
}

export interface PlanetaryConfiguration {
  readonly planets: readonly PlanetState[];
}

export interface PlanetaryAlternative
  extends Omit<PlanetState, "key"> {
  readonly confidence: number;
}

export interface PlanetaryObservation {
  readonly key: PlanetaryKey;
  readonly alternatives: readonly PlanetaryAlternative[];
}

export interface PlanetaryIdentityCandidate {
  readonly identity: Uint8Array;
  readonly configuration: PlanetaryConfiguration;
  readonly confidence: number;
}

const identityByteCount = 32;
const identitySpace = 1n << 256n;
const localRadix = BigInt(planetLocalStateCount);

export function permutationCount(total: number, selected: number): bigint {
  if (!Number.isInteger(total) || !Number.isInteger(selected)) {
    throw new Error("permutation dimensions must be integers");
  }
  if (total < 0 || selected < 0 || selected > total) {
    throw new Error("permutation dimensions are invalid");
  }

  let result = 1n;
  for (let index = 0; index < selected; index += 1) {
    result *= BigInt(total - index);
  }
  return result;
}

export const planetLocationSpace = permutationCount(
  planetAnchorCount,
  planetCount
);
export const planetLocalSpace = localRadix ** BigInt(planetCount);
export const planetaryConfigurationSpace =
  planetLocationSpace * planetLocalSpace;
export const reservedPlanetaryConfigurations =
  planetaryConfigurationSpace - identitySpace;

if (planetaryConfigurationSpace <= identitySpace) {
  throw new Error("v9 planetary configuration cannot hold every 32-byte identity");
}

function integer(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
}

function unrankPermutation(
  value: bigint,
  total: number,
  selected: number
): number[] {
  const capacity = permutationCount(total, selected);
  if (value < 0n || value >= capacity) {
    throw new Error("permutation rank is outside its configuration space");
  }

  const available = Array.from({ length: total }, (_unused, index) => index);
  const result: number[] = [];
  let rank = value;

  for (let index = 0; index < selected; index += 1) {
    const remaining = selected - index - 1;
    const block = permutationCount(total - index - 1, remaining);
    const choice = Number(rank / block);
    rank %= block;

    const picked = available.splice(choice, 1)[0];
    if (picked === undefined) {
      throw new Error("permutation rank selected an unavailable value");
    }
    result.push(picked);
  }

  return result;
}

function rankPermutation(
  values: readonly number[],
  total: number,
  selected: number
): bigint {
  if (values.length !== selected) {
    throw new Error(`permutation must contain exactly ${selected} values`);
  }

  const available = Array.from({ length: total }, (_unused, index) => index);
  let result = 0n;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    integer(value, 0, total - 1, "permutation value");

    const choice = available.indexOf(value);
    if (choice < 0) {
      throw new Error("permutation values must be distinct");
    }

    const remaining = selected - index - 1;
    const block = permutationCount(total - index - 1, remaining);
    result += BigInt(choice) * block;
    available.splice(choice, 1);
  }

  return result;
}

function bytesToInteger(bytes: Uint8Array): bigint {
  if (bytes.byteLength !== identityByteCount) {
    throw new Error("v9 identity must contain exactly 32 bytes");
  }

  let result = 0n;
  for (const byte of bytes) result = (result << 8n) | BigInt(byte);
  return result;
}

function integerToBytes(value: bigint): Uint8Array {
  if (value < 0n || value >= identitySpace) {
    throw new Error("identity integer is outside the 256-bit range");
  }

  const result = new Uint8Array(identityByteCount);
  let remaining = value;

  for (let index = result.length - 1; index >= 0; index -= 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return result;
}

function satellitePositions(value: SatelliteState): readonly number[] {
  return [value.small, value.medium, value.large];
}

function encodeSatellites(value: SatelliteState): number {
  const rank = rankPermutation(
    satellitePositions(value),
    satellitePositionCount,
    satelliteCount
  );
  return Number(rank);
}

function decodeSatellites(value: number): SatelliteState {
  integer(
    value,
    0,
    satelliteConfigurationCount - 1,
    "satellite configuration"
  );
  const positions = unrankPermutation(
    BigInt(value),
    satellitePositionCount,
    satelliteCount
  );

  return {
    small: positions[0]!,
    medium: positions[1]!,
    large: positions[2]!
  };
}

function encodeLocalState(value: PlanetState): number {
  integer(value.anchor, 0, planetAnchorCount - 1, "planet anchor");
  integer(
    value.rotation,
    0,
    planetRotationLevelCount - 1,
    "planet rotation"
  );
  integer(value.size, 0, planetSizeLevelCount - 1, "planet size");
  integer(
    value.density,
    0,
    planetDensityLevelCount - 1,
    "planet density"
  );

  let result = value.rotation;
  result = result * planetSizeLevelCount + value.size;
  result = result * planetDensityLevelCount + value.density;
  result = result * satelliteConfigurationCount + encodeSatellites(value.satellites);
  return result;
}

function decodeLocalState(
  key: PlanetaryKey,
  anchor: number,
  value: number
): PlanetState {
  integer(value, 0, planetLocalStateCount - 1, "planet local state");

  let remaining = value;
  const satellites = decodeSatellites(remaining % satelliteConfigurationCount);
  remaining = Math.floor(remaining / satelliteConfigurationCount);
  const density = remaining % planetDensityLevelCount;
  remaining = Math.floor(remaining / planetDensityLevelCount);
  const size = remaining % planetSizeLevelCount;
  remaining = Math.floor(remaining / planetSizeLevelCount);
  const rotation = remaining;

  return {
    key,
    anchor,
    rotation,
    size,
    density,
    satellites
  };
}

function validateConfiguration(
  value: PlanetaryConfiguration
): readonly PlanetState[] {
  if (value.planets.length !== planetCount) {
    throw new Error(`v9 configuration must contain exactly ${planetCount} planets`);
  }

  const anchors = new Set<number>();

  for (let index = 0; index < planetaryGlyphs.length; index += 1) {
    const expected = planetaryGlyphs[index]!;
    const planet = value.planets[index]!;
    if (planet.key !== expected.key) {
      throw new Error(
        `v9 planet ${index} must be ${expected.body}, not ${planet.key}`
      );
    }
    encodeLocalState(planet);
    if (anchors.has(planet.anchor)) {
      throw new Error("all eleven planetary anchors must be distinct");
    }
    anchors.add(planet.anchor);
  }

  return value.planets;
}

export function planetaryConfiguration(
  identity: Uint8Array
): PlanetaryConfiguration {
  const numericIdentity = bytesToInteger(identity);
  const locationRank = numericIdentity % planetLocationSpace;
  let localRank = numericIdentity / planetLocationSpace;
  const anchors = unrankPermutation(
    locationRank,
    planetAnchorCount,
    planetCount
  );
  const planets: PlanetState[] = [];

  for (let index = 0; index < planetaryGlyphs.length; index += 1) {
    const glyph = planetaryGlyphs[index]!;
    const local = Number(localRank % localRadix);
    localRank /= localRadix;
    planets.push(decodeLocalState(glyph.key, anchors[index]!, local));
  }

  if (localRank !== 0n) {
    throw new Error("identity exceeded the planetary local-state capacity");
  }

  return { planets };
}

export function planetaryIdentity(
  configuration: PlanetaryConfiguration
): Uint8Array {
  const planets = validateConfiguration(configuration);
  const locationRank = rankPermutation(
    planets.map((planet) => planet.anchor),
    planetAnchorCount,
    planetCount
  );
  let localRank = 0n;
  let multiplier = 1n;

  for (const planet of planets) {
    localRank += BigInt(encodeLocalState(planet)) * multiplier;
    multiplier *= localRadix;
  }

  const rank = localRank * planetLocationSpace + locationRank;
  if (rank >= identitySpace) {
    throw new Error("planetary configuration is a reserved v9 state");
  }

  return integerToBytes(rank);
}

function identityKey(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function planetaryIdentityCandidates(
  observations: readonly PlanetaryObservation[],
  limit = 64,
  alternativesPerGlyph = 8
): readonly PlanetaryIdentityCandidate[] {
  integer(limit, 1, 4_096, "candidate limit");
  integer(alternativesPerGlyph, 1, 64, "alternatives per glyph");

  const byKey = new Map<PlanetaryKey, PlanetaryObservation>();
  for (const observation of observations) {
    if (byKey.has(observation.key)) {
      throw new Error(`duplicate planetary observation for ${observation.key}`);
    }
    byKey.set(observation.key, observation);
  }

  interface Beam {
    readonly planets: readonly PlanetState[];
    readonly anchors: ReadonlySet<number>;
    readonly score: number;
  }

  let beams: readonly Beam[] = [{
    planets: [],
    anchors: new Set<number>(),
    score: 0
  }];

  for (const glyph of planetaryGlyphs) {
    const observation = byKey.get(glyph.key);
    if (!observation || observation.alternatives.length === 0) {
      return [];
    }

    const alternatives = [...observation.alternatives]
      .filter((alternative) => Number.isFinite(alternative.confidence))
      .filter((alternative) => alternative.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, alternativesPerGlyph);
    const expanded: Beam[] = [];

    for (const beam of beams) {
      for (const alternative of alternatives) {
        if (beam.anchors.has(alternative.anchor)) continue;

        const planet: PlanetState = {
          key: glyph.key,
          anchor: alternative.anchor,
          rotation: alternative.rotation,
          size: alternative.size,
          density: alternative.density,
          satellites: alternative.satellites
        };

        try {
          encodeLocalState(planet);
        } catch {
          continue;
        }

        expanded.push({
          planets: [...beam.planets, planet],
          anchors: new Set([...beam.anchors, planet.anchor]),
          score: beam.score + Math.log(Math.max(alternative.confidence, 1e-12))
        });
      }
    }

    beams = expanded
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    if (beams.length === 0) return [];
  }

  const seen = new Set<string>();
  const result: PlanetaryIdentityCandidate[] = [];

  for (const beam of beams) {
    const configuration: PlanetaryConfiguration = {
      planets: beam.planets
    };

    try {
      const identity = planetaryIdentity(configuration);
      const key = identityKey(identity);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        identity,
        configuration,
        confidence: Math.exp(beam.score / planetCount)
      });
    } catch {
      // Reserved or otherwise malformed global configurations are invalid.
    }
  }

  return result.sort((left, right) => right.confidence - left.confidence);
}
