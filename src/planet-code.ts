import {
  planetAnchor,
  planetAnchorCount,
  planetAnchorGroup,
  planetAnchorGroupCount,
  planetAnchorGroupSize,
  planetAnchorPosition,
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

export interface PlanetaryAlternative extends Omit<PlanetState, "key"> {
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
const allPlanetGroups = Array.from(
  { length: planetAnchorGroupCount },
  (_unused, group) => group
);

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

function factorial(value: number): bigint {
  let result = 1n;
  for (let factor = 2; factor <= value; factor += 1) {
    result *= BigInt(factor);
  }
  return result;
}

/**
 * Counts ordered selections of distinct macro-groups while weighting each
 * selected group by the number of scannable micro-anchors it contains.
 */
export function weightedPlanetLocationCount(
  groups: readonly number[],
  selected: number
): bigint {
  if (!Number.isInteger(selected) || selected < 0 || selected > groups.length) {
    throw new Error("weighted location dimensions are invalid");
  }
  const elementary = Array<bigint>(selected + 1).fill(0n);
  elementary[0] = 1n;
  let available = 0;
  for (const group of groups) {
    const size = BigInt(planetAnchorGroupSize(group));
    available += 1;
    const maximum = Math.min(selected, available);
    for (let count = maximum; count >= 1; count -= 1) {
      elementary[count] += elementary[count - 1]! * size;
    }
  }
  return elementary[selected]! * factorial(selected);
}

export const planetLocationSpace = weightedPlanetLocationCount(
  allPlanetGroups,
  planetCount
);
export const planetLocalSpace = localRadix ** BigInt(planetCount);
export const planetaryConfigurationSpace =
  planetLocationSpace * planetLocalSpace;
export const reservedPlanetaryConfigurations =
  planetaryConfigurationSpace - identitySpace;

if (planetaryConfigurationSpace <= identitySpace) {
  throw new Error("v9 separated planetary configuration cannot hold every 32-byte identity");
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
    if (choice < 0) throw new Error("permutation values must be distinct");
    const remaining = selected - index - 1;
    const block = permutationCount(total - index - 1, remaining);
    result += BigInt(choice) * block;
    available.splice(choice, 1);
  }
  return result;
}

function groupsWithout(groups: readonly number[], index: number): number[] {
  return [...groups.slice(0, index), ...groups.slice(index + 1)];
}

function unrankLocations(value: bigint): readonly number[] {
  if (value < 0n || value >= planetLocationSpace) {
    throw new Error("planet location rank is outside its configuration space");
  }

  const available = [...allPlanetGroups];
  const anchors: number[] = [];
  let rank = value;

  for (let index = 0; index < planetCount; index += 1) {
    const remaining = planetCount - index - 1;
    let chosen = -1;

    for (let candidate = 0; candidate < available.length; candidate += 1) {
      const group = available[candidate]!;
      const rest = groupsWithout(available, candidate);
      const future = weightedPlanetLocationCount(rest, remaining);
      const block = BigInt(planetAnchorGroupSize(group)) * future;
      if (rank >= block) {
        rank -= block;
        continue;
      }

      const position = Number(rank / future);
      rank %= future;
      anchors.push(planetAnchor(group, position));
      chosen = candidate;
      break;
    }

    if (chosen < 0) {
      throw new Error("planet location rank could not select a separated group");
    }
    available.splice(chosen, 1);
  }

  if (rank !== 0n) {
    throw new Error("planet location rank exceeded its configuration space");
  }
  return anchors;
}

function rankLocations(anchors: readonly number[]): bigint {
  if (anchors.length !== planetCount) {
    throw new Error(`planet locations must contain exactly ${planetCount} anchors`);
  }

  const available = [...allPlanetGroups];
  let result = 0n;

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index]!;
    const selectedGroup = planetAnchorGroup(anchor);
    const selectedPosition = planetAnchorPosition(anchor);
    const remaining = planetCount - index - 1;
    const selectedIndex = available.indexOf(selectedGroup);
    if (selectedIndex < 0) {
      throw new Error("all eleven planetary anchor groups must be distinct");
    }

    for (let candidate = 0; candidate < selectedIndex; candidate += 1) {
      const group = available[candidate]!;
      const rest = groupsWithout(available, candidate);
      const future = weightedPlanetLocationCount(rest, remaining);
      result += BigInt(planetAnchorGroupSize(group)) * future;
    }

    const future = weightedPlanetLocationCount(
      groupsWithout(available, selectedIndex),
      remaining
    );
    result += BigInt(selectedPosition) * future;
    available.splice(selectedIndex, 1);
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
  return Number(rankPermutation(
    satellitePositions(value),
    satellitePositionCount,
    satelliteCount
  ));
}

function decodeSatellites(value: number): SatelliteState {
  integer(value, 0, satelliteConfigurationCount - 1, "satellite configuration");
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
  integer(value.rotation, 0, planetRotationLevelCount - 1, "planet rotation");
  integer(value.size, 0, planetSizeLevelCount - 1, "planet size");
  integer(value.density, 0, planetDensityLevelCount - 1, "planet density");

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
  return {
    key,
    anchor,
    rotation: remaining,
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

  const groups = new Set<number>();
  for (let index = 0; index < planetaryGlyphs.length; index += 1) {
    const expected = planetaryGlyphs[index]!;
    const planet = value.planets[index]!;
    if (planet.key !== expected.key) {
      throw new Error(
        `v9 planet ${index} must be ${expected.body}, not ${planet.key}`
      );
    }
    encodeLocalState(planet);
    const group = planetAnchorGroup(planet.anchor);
    if (groups.has(group)) {
      throw new Error("all eleven planetary anchor groups must be distinct");
    }
    groups.add(group);
  }
  return value.planets;
}

export function planetaryConfiguration(
  identity: Uint8Array
): PlanetaryConfiguration {
  const numericIdentity = bytesToInteger(identity);
  const locationRank = numericIdentity % planetLocationSpace;
  let localRank = numericIdentity / planetLocationSpace;
  const anchors = unrankLocations(locationRank);
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
  const locationRank = rankLocations(planets.map((planet) => planet.anchor));
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
    readonly groups: ReadonlySet<number>;
    readonly score: number;
  }

  let beams: readonly Beam[] = [{
    planets: [],
    groups: new Set<number>(),
    score: 0
  }];

  for (const glyph of planetaryGlyphs) {
    const observation = byKey.get(glyph.key);
    if (!observation || observation.alternatives.length === 0) return [];
    const alternatives = [...observation.alternatives]
      .filter((alternative) => Number.isFinite(alternative.confidence))
      .filter((alternative) => alternative.confidence > 0)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, alternativesPerGlyph);
    const expanded: Beam[] = [];

    for (const beam of beams) {
      for (const alternative of alternatives) {
        let group: number;
        try {
          group = planetAnchorGroup(alternative.anchor);
        } catch {
          continue;
        }
        if (beam.groups.has(group)) continue;

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
          groups: new Set([...beam.groups, group]),
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
    const configuration: PlanetaryConfiguration = { planets: beam.planets };
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
      // Reserved or malformed global configurations are invalid.
    }
  }
  return result.sort((left, right) => right.confidence - left.confidence);
}
