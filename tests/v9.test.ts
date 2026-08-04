import { describe, expect, test } from "bun:test";
import { buildIdenticon, visualFormatVersion } from "../src/build.ts";
import {
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
import {
  planetAnchorCount,
  planetaryGlyphs,
  planetLocalStateCount
} from "../src/planet.ts";
import {
  v9ParityByte,
  v9ParityReservedStateCount,
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
      const anchors = new Set(configuration.planets.map((planet) => {
        return planet.anchor;
      }));
      const decoded = planetaryIdentity(configuration);

      expect(anchors.size).toBe(11);
      expect(sameBytes(decoded, identity)).toBe(true);
    }
  });

  test("uses eleven distinct anchors and three distinct satellites per glyph", () => {
    const configuration = planetaryConfiguration(bytes(sequenceKey));
    const anchors = new Set(configuration.planets.map((planet) => planet.anchor));

    expect(configuration.planets.length).toBe(11);
    expect(anchors.size).toBe(11);

    for (const planet of configuration.planets) {
      const satellites = new Set([
        planet.satellites.small,
        planet.satellites.medium,
        planet.satellites.large
      ]);
      expect(satellites.size).toBe(3);
    }
  });

  test("rejects duplicate anchors and globally reserved configurations", () => {
    const duplicateAnchor: PlanetaryConfiguration = {
      planets: planetaryGlyphs.map((glyph) => ({
        key: glyph.key,
        anchor: 0,
        rotation: 0,
        size: 0,
        density: 0,
        satellites: { small: 0, medium: 1, large: 2 }
      }))
    };

    expect(() => planetaryIdentity(duplicateAnchor)).toThrow(
      "anchors must be distinct"
    );

    const reserved: PlanetaryConfiguration = {
      planets: planetaryGlyphs.map((glyph, index) => ({
        key: glyph.key,
        anchor: planetAnchorCount - 1 - index,
        rotation: 11,
        size: 5,
        density: 5,
        satellites: { small: 5, medium: 4, large: 3 }
      }))
    };

    expect(planetaryConfigurationSpace > 2n ** 256n).toBe(true);
    expect(reservedPlanetaryConfigurations > 0n).toBe(true);
    expect(() => planetaryIdentity(reserved)).toThrow("reserved v9 state");
    expect(planetLocalStateCount).toBe(51_840);
  });

  test("retains ranked alternatives without duplicate-anchor candidates", () => {
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
      return planet.anchor;
    })).size).toBe(11);
  });
});

describe("v9 canonical record and parity stars", () => {
  test("builds an exact 40-byte source and RS(72,40) codeword", () => {
    expect(v9Record(sample).length).toBe(40);
    expect(v9Codeword(sample).length).toBe(72);
    expect(v9DataByteCount).toBe(40);
    expect(v9ParityByteCount).toBe(32);
    expect(decodeV9Codeword(v9Codeword(sample))).toEqual(sample);
  });

  test("recovers a boundary mixture satisfying 2e+s=32", () => {
    const codeword = v9Codeword(sample);
    const data = [...codeword.slice(0, v9DataByteCount)].map((value) => observed(value));
    const parity = [...codeword.slice(v9DataByteCount)].map((value) => observed(value));
    const all = [...data, ...parity];
    const errors = new Set<number>();

    for (let index = 0; index < 8; index += 1) {
      const position = (index * 7 + 3) % all.length;
      errors.add(position);
      all[position] = observed((all[position]!.value! + 91) & 0xff, 0.45);
    }

    const erased = new Set<number>();
    let cursor = 5;
    while (erased.size < 16) {
      if (!errors.has(cursor)) erased.add(cursor);
      cursor = (cursor + 11) % all.length;
    }
    for (const position of erased) all[position] = observed(null);

    const recovered = recoverV9Record({
      data: all.slice(0, v9DataByteCount),
      parity: all.slice(v9DataByteCount)
    });

    expect(recovered.value).toEqual(sample);
    expect(recovered.errors).toBe(8);
    expect(recovered.erasures).toBe(16);
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
  test("provides 256 planetary anchors, 256 parity anchors and twelve Sun rays", () => {
    const planets = new Set<string>();
    const parity = new Set<string>();

    for (let anchor = 0; anchor < planetAnchorCount; anchor += 1) {
      const point = planetAnchorPoint(anchor);
      planets.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
    }

    for (let parityGroup = 0; parityGroup < 32; parityGroup += 1) {
      for (let position = 0; position < 8; position += 1) {
        const point = parityAnchorPoint(parityGroup, position);
        parity.add(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`);
      }
    }

    const rays = new Set(
      Array.from({ length: 12 }, (_unused, index) => sunRay(index).angle)
    );

    expect(planets.size).toBe(256);
    expect(parity.size).toBe(256);
    expect(rays.size).toBe(12);
  });

  test("routes exact identities to v9 and text seeds to legacy v8", () => {
    expect(visualFormatVersion(sample)).toBe(9);
    expect(visualFormatVersion(legacy)).toBe(8);
  });

  test("renders only the specified clean visual channels", async () => {
    const svg = await buildIdenticon(sample, assets);

    expect(svg).toContain('data-code-version="9"');
    expect(svg).toContain('data-code="reed-solomon-72-40-parity-stars-32-v9"');
    expect(svg).toContain('id="central-sun-reference"');
    expect(svg).toContain('data-glyph="☉"');
    expect(svg).not.toContain('data-recognition-role="literal-central-solar-sign"');
    expect(svg).not.toContain('data-role="solar-sign-knockout"');
    expect(svg).not.toContain('data-role="central-sun-medallion"');
    // The literal sign grid retains its original outlined artwork.
    // Only the planetary and parity payload layers must have fixed,
    // undeformed shapes without a stroke-thickness channel.
    const parityStart = svg.indexOf('<g id="parity-stars-v9"');
    const planetaryStart = svg.indexOf('<g id="planetary-identity-v9"');
    const calibrationStart = svg.indexOf(
      '<g clip-path="url(#inner-clip-v9)">',
      planetaryStart
    );

    expect(parityStart).toBeGreaterThanOrEqual(0);
    expect(planetaryStart).toBeGreaterThan(parityStart);
    expect(calibrationStart).toBeGreaterThan(planetaryStart);

    const paritySvg = svg.slice(parityStart, planetaryStart);
    const planetarySvg = svg.slice(planetaryStart, calibrationStart);

    expect(paritySvg).not.toContain('stroke=');
    expect(planetarySvg).not.toContain('stroke=');

    // Preserve the original solar sign in the centre of the fixed grid.
    expect(count(
      svg,
      /data-role="Sun" data-sign="capricorn" data-orientation="upright"/gu
    )).toBe(1);
    expect(svg).not.toContain('data-planet-density-level=');
    expect(svg).not.toContain('data-parity-density-level=');
    expect(svg).toContain('data-planet-fading-level=');
    expect(svg).toContain('data-parity-fading-level=');
    expect(count(svg, /data-calibration-angle=/gu)).toBe(12);
    expect(count(svg, /data-planet-index=/gu)).toBe(11);
    expect(count(svg, /data-satellite-size=/gu)).toBe(33);
    expect(count(svg, /data-parity-index=/gu)).toBe(32);
    expect(count(svg, /data-code-colour="planetary-foreground"/gu)).toBeGreaterThanOrEqual(45);
    expect(count(svg, /data-code-colour="parity-star-foreground"/gu)).toBe(34);

    for (const planet of planetaryGlyphs) {
      expect(svg).toContain(`data-planet-glyph="${planet.glyph}"`);
    }
  });
});
