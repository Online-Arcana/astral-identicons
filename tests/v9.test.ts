import { describe, expect, test } from "bun:test";
import { visualFormatVersion } from "../src/build.ts";
import { buildV9Identicon } from "../src/build-v9.ts";
import {
  v9RayFadingLevels,
  v9StarCalibrationLevels
} from "../src/calibration-v9.ts";
import {
  calibrationStar,
  parityAnchorPoint,
  planetAnchorPoint,
  sunRay
} from "../src/layout-v9.ts";
import {
  planetaryConfiguration,
  planetaryIdentity,
  planetaryIdentityCandidates,
  planetaryConfigurationSpace,
  reservedPlanetaryConfigurations,
  type PlanetaryConfiguration,
  type PlanetaryObservation
} from "../src/planet-code.ts";
import { tracedPlanetGlyphs } from "../src/planet-glyph-paths.ts";
import {
  planetAnchor,
  planetAnchorCount,
  planetAnchorGroup,
  planetAnchorGroupSize,
  planetaryGlyphs,
  planetLocalStateCount
} from "../src/planet.ts";
import {
  v9ParityByte,
  v9ParityReservedStateCount,
  v9ParityStarCount,
  v9ParityVisualState
} from "../src/parity-v9.ts";
import {
  decodeV9Codeword,
  recoverV9Record,
  v9Codeword,
  v9DataByteCount,
  v9ParityByteCount,
  v9Record,
  type V9ByteObservation
} from "../src/record-v9.ts";
import { input } from "../src/input.ts";
import type { AssetSource } from "../src/types.ts";

const zeroKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const maximumKey = "__________________________________________8";
const sequenceKey = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

const sample = input({
  seed: sequenceKey,
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const legacy = input({
  ...sample,
  seed: "62-70-F2-Example"
});

const simpleAsset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="shape" fill="#000" stroke="none" d="M0 0h10v10z"/></svg>`;
const assets: AssetSource = {
  constellation: async () => simpleAsset,
  sigil: async () => simpleAsset,
  star: async () => simpleAsset
};

function bytes(seed: string): Uint8Array {
  const raw = atob(seed.replaceAll("-", "+").replaceAll("_", "/") + "=");
  return Uint8Array.from(raw, (value) => value.charCodeAt(0));
}

function observed(value: number | null, confidence = 0.99): V9ByteObservation {
  return {
    value,
    confidence: value === null ? 0 : confidence
  };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => {
    return value === right[index];
  });
}

function count(source: string, expression: RegExp): number {
  return [...source.matchAll(expression)].length;
}

describe("v9 planetary identity codec", () => {
  test("round-trips the lowest, highest and patterned identities", () => {
    for (const seed of [zeroKey, maximumKey, sequenceKey]) {
      const identity = bytes(seed);
      const configuration = planetaryConfiguration(identity);
      const decoded = planetaryIdentity(configuration);
      expect(sameBytes(decoded, identity)).toBe(true);
      expect(new Set(configuration.planets.map((planet) => {
        return planetAnchorGroup(planet.anchor);
      })).size).toBe(11);
    }
  });

  test("round-trips deterministic pseudo-random identities", () => {
    let state = 0x13579bdf;
    for (let sampleIndex = 0; sampleIndex < 256; sampleIndex += 1) {
      const identity = new Uint8Array(32);
      for (let index = 0; index < identity.length; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        identity[index] = state & 0xff;
      }

      const configuration = planetaryConfiguration(identity);
      const groups = new Set(configuration.planets.map((planet) => {
        return planetAnchorGroup(planet.anchor);
      }));
      expect(groups.size).toBe(11);
      expect(sameBytes(planetaryIdentity(configuration), identity)).toBe(true);
    }
  });

  test("uses eleven separated groups and three distinct satellites per glyph", () => {
    const configuration = planetaryConfiguration(bytes(sequenceKey));
    const groups = new Set(configuration.planets.map((planet) => {
      return planetAnchorGroup(planet.anchor);
    }));
    expect(configuration.planets.length).toBe(11);
    expect(groups.size).toBe(11);

    for (const planet of configuration.planets) {
      const satellites = new Set([
        planet.satellites.small,
        planet.satellites.medium,
        planet.satellites.large
      ]);
      expect(satellites.size).toBe(3);
    }
  });

  test("rejects duplicate groups and globally reserved configurations", () => {
    const duplicateGroup: PlanetaryConfiguration = {
      planets: planetaryGlyphs.map((glyph, index) => ({
        key: glyph.key,
        anchor: planetAnchor(0, index % planetAnchorGroupSize(0)),
        rotation: 0,
        size: 0,
        density: 0,
        satellites: { small: 0, medium: 1, large: 2 }
      }))
    };
    expect(() => planetaryIdentity(duplicateGroup)).toThrow(
      "anchor groups must be distinct"
    );

    const reserved: PlanetaryConfiguration = {
      planets: planetaryGlyphs.map((glyph, index) => {
        const group = 23 - index;
        return {
          key: glyph.key,
          anchor: planetAnchor(group, planetAnchorGroupSize(group) - 1),
          rotation: 11,
          size: 5,
          density: 5,
          satellites: { small: 5, medium: 4, large: 3 }
        };
      })
    };

    expect(planetaryConfigurationSpace > 2n ** 256n).toBe(true);
    expect(reservedPlanetaryConfigurations > 0n).toBe(true);
    expect(() => planetaryIdentity(reserved)).toThrow("reserved v9 state");
    expect(planetLocalStateCount).toBe(51_840);
    expect(planetAnchorCount).toBe(256);
  });

  test("retains ranked alternatives without duplicate-group candidates", () => {
    const canonical = planetaryConfiguration(bytes(sequenceKey));
    const observations: PlanetaryObservation[] = canonical.planets.map((planet) => ({
      key: planet.key,
      alternatives: [
        {
          anchor: planet.anchor,
          rotation: planet.rotation,
          size: planet.size,
          density: planet.density,
          satellites: planet.satellites,
          confidence: 0.99
        },
        {
          anchor: canonical.planets[0]!.anchor,
          rotation: planet.rotation,
          size: planet.size,
          density: planet.density,
          satellites: planet.satellites,
          confidence: 0.4
        }
      ]
    }));

    const candidates = planetaryIdentityCandidates(observations, 16, 2);
    expect(candidates.length > 0).toBe(true);
    expect(sameBytes(candidates[0]!.identity, bytes(sequenceKey))).toBe(true);
    expect(new Set(candidates[0]!.configuration.planets.map((planet) => {
      return planetAnchorGroup(planet.anchor);
    })).size).toBe(11);
  });

  test("uses traced Unicode contours rather than platform font rendering", () => {
    expect(tracedPlanetGlyphs.mars.unicode).toBe("♂");
    expect(tracedPlanetGlyphs.mars.path.startsWith("M")).toBe(true);
    expect(tracedPlanetGlyphs.mars.path.includes("Z")).toBe(true);
    expect(tracedPlanetGlyphs.mars.font).toBe("Noto Sans Symbols");
  });
});

describe("v9 canonical record and parity stars", () => {
  test("builds an exact 40-byte source and RS(168,40) codeword", () => {
    expect(v9Record(sample).length).toBe(40);
    expect(v9Codeword(sample).length).toBe(168);
    expect(v9DataByteCount).toBe(40);
    expect(v9ParityByteCount).toBe(128);
    expect(v9ParityStarCount).toBe(128);
    expect(decodeV9Codeword(v9Codeword(sample))).toEqual(sample);
  });

  test("recovers a boundary mixture satisfying 2e+s=128", () => {
    const codeword = v9Codeword(sample);
    const data = [...codeword.slice(0, v9DataByteCount)].map((value) => observed(value));
    const parity = [...codeword.slice(v9DataByteCount)].map((value) => observed(value));
    const all = [...data, ...parity];
    const errors = new Set<number>();

    for (let index = 0; index < 32; index += 1) {
      const position = (index * 11 + 3) % all.length;
      errors.add(position);
      all[position] = observed((all[position]!.value! + 91) & 0xff, 0.45);
    }
    expect(errors.size).toBe(32);

    const erased = new Set<number>();
    let cursor = 5;
    while (erased.size < 64) {
      if (!errors.has(cursor)) erased.add(cursor);
      cursor = (cursor + 13) % all.length;
    }
    for (const position of erased) all[position] = observed(null);

    const recovered = recoverV9Record({
      data: all.slice(0, v9DataByteCount),
      parity: all.slice(v9DataByteCount)
    });
    expect(recovered.value).toEqual(sample);
    expect(recovered.errors).toBe(32);
    expect(recovered.erasures).toBe(64);
  });

  test("maps every byte independently and rejects all 32 reserved star states", () => {
    const used = new Set<number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const state = v9ParityVisualState(byte);
      used.add(state.state);
      expect(v9ParityByte(state.position, state.size, state.density)).toBe(byte);
    }

    let reserved = 0;
    for (let density = 0; density < 6; density += 1) {
      for (let size = 0; size < 6; size += 1) {
        for (let position = 0; position < 8; position += 1) {
          try {
            v9ParityByte(position, size, density);
          } catch {
            reserved += 1;
          }
        }
      }
    }
    expect(used.size).toBe(256);
    expect(reserved).toBe(32);
    expect(v9ParityReservedStateCount).toBe(32);
  });
});

describe("v9 geometry and renderer", () => {
  test("provides 256 planetary anchors, 1024 parity anchors and fixed calibration", () => {
    const planets = new Set<string>();
    const parity = new Set<string>();
    const references = new Set<string>();

    for (let anchor = 0; anchor < planetAnchorCount; anchor += 1) {
      const point = planetAnchorPoint(anchor);
      planets.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
    }
    for (let parityGroup = 0; parityGroup < v9ParityStarCount; parityGroup += 1) {
      for (let position = 0; position < 8; position += 1) {
        const point = parityAnchorPoint(parityGroup, position);
        parity.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
      }
    }

    const rays = Array.from({ length: 12 }, (_unused, index) => sunRay(index));
    for (let index = 0; index < 12; index += 1) {
      const reference = calibrationStar(index);
      references.add(
        `${reference.point.x.toFixed(6)}:${reference.point.y.toFixed(6)}`
      );
    }

    expect(planets.size).toBe(256);
    expect(parity.size).toBe(1024);
    expect(new Set(rays.map((ray) => ray.angle)).size).toBe(12);
    expect(references.size).toBe(12);
    expect(rays.map((ray) => ray.level + 1)).toEqual(v9RayFadingLevels);
    expect(
      Array.from({ length: 12 }, (_unused, index) => {
        return calibrationStar(index).level + 1;
      })
    ).toEqual(v9StarCalibrationLevels);
  });

  test("routes exact identities to v10 and text seeds to legacy v8", () => {
    expect(visualFormatVersion(sample)).toBe(10);
    expect(visualFormatVersion(legacy)).toBe(8);
  });

  test("retains the legacy v9 renderer for old visual records", async () => {
    const svg = await buildV9Identicon(sample, assets);

    expect(svg).toContain('data-code-version="9"');
    expect(svg).toContain('data-code="reed-solomon-168-40-parity-stars-128-v9"');
    expect(svg).toContain('data-layout="interior-blue-noise"');
    expect(svg).toContain('data-code-anchors="256"');
    expect(svg).toContain('id="central-sun-reference"');
    expect(svg).toContain('id="north-star-reference"');
    expect(svg).toContain('id="south-star-reference"');
    expect(svg).toContain('data-glyph="☉"');
    expect(svg).not.toContain('data-recognition-role="literal-central-solar-sign"');
    expect(svg).not.toContain('data-role="solar-sign-knockout"');
    expect(svg).not.toContain('data-role="central-sun-medallion"');

    const parityStart = svg.indexOf('<g id="parity-stars-v9"');
    const planetaryStart = svg.indexOf('<g id="planetary-identity-v9"');
    const ringStart = svg.indexOf('<g id="literal-ring-system"');
    expect(parityStart).toBeGreaterThanOrEqual(0);
    expect(planetaryStart).toBeGreaterThan(parityStart);
    expect(ringStart).toBeGreaterThan(planetaryStart);

    const paritySvg = svg.slice(parityStart, planetaryStart);
    const planetarySvg = svg.slice(planetaryStart, ringStart);
    expect(paritySvg).not.toContain('stroke=');
    expect(planetarySvg).not.toContain('stroke=');
    expect(planetarySvg).not.toContain('<text');

    expect(count(
      svg,
      /data-role="Sun" data-sign="capricorn" data-orientation="upright"/gu
    )).toBe(1);
    expect(svg).not.toContain('data-planet-density-level=');
    expect(svg).not.toContain('data-parity-density-level=');
    expect(svg).toContain('data-planet-fading-level=');
    expect(svg).toContain('data-parity-fading-level=');
    expect(svg).toContain('data-calibration-pattern="6,1,5,2,4,3,4,3,5,2,1,6"');
    expect(svg).toContain('data-calibration-pattern="6,1,5,2,4,3,6,3,4,2,5,1"');
    expect(count(svg, /data-calibration-angle=/gu)).toBe(12);
    expect(count(svg, /data-calibrates="fading-only"/gu)).toBe(12);
    expect(count(svg, /data-reference-angle=/gu)).toBe(12);
    expect(count(svg, /data-calibration-reference="true"/gu)).toBe(12);
    expect(count(svg, /data-vector-source="unicode-font-outline"/gu)).toBe(12);
    expect(count(svg, /data-planet-index=/gu)).toBe(11);
    expect(count(svg, /data-satellite-size=/gu)).toBe(33);
    expect(count(svg, /data-parity-index=/gu)).toBe(128);
    expect(count(svg, /data-code-colour="planetary-foreground"/gu)).toBeGreaterThanOrEqual(45);
    expect(count(svg, /data-code-colour="parity-star-foreground"/gu)).toBeGreaterThanOrEqual(141);

    for (const planet of planetaryGlyphs) {
      expect(svg).toContain(`data-planet-glyph="${planet.glyph}"`);
    }
  });
});
