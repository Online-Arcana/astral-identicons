import { describe, expect, test } from "bun:test";
import {
  planetaryConfiguration,
  type PlanetaryObservation
} from "../src/planet-code.ts";
import {
  decodeV9Candidates,
  uniqueV9Candidate,
  v9SignRoles,
  type V9SignObservation
} from "../src/scan-v9-core.ts";
import {
  v9Parity,
  v9ParityByteCount,
  type V9ByteObservation
} from "../src/record-v9.ts";
import { rawPublicKey } from "../src/seed-value.ts";
import { input } from "../src/input.ts";

const sample = input({
  seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

function parityObservations(): readonly V9ByteObservation[] {
  return [...v9Parity(sample)].map((value) => ({
    value,
    confidence: 0.99
  }));
}

function signObservations(): readonly V9SignObservation[] {
  return v9SignRoles.map((role) => ({
    role,
    alternatives: [{
      sign: sample[role],
      confidence: 0.99
    }]
  }));
}

function planetObservations(): readonly PlanetaryObservation[] {
  const configuration = planetaryConfiguration(rawPublicKey(sample.seed));

  return configuration.planets.map((planet, index) => ({
    key: planet.key,
    alternatives: index === 0
      ? [
        {
          anchor: planet.anchor,
          rotation: (planet.rotation + 1) % 12,
          size: planet.size,
          density: planet.density,
          satellites: planet.satellites,
          confidence: 0.99
        },
        {
          anchor: planet.anchor,
          rotation: planet.rotation,
          size: planet.size,
          density: planet.density,
          satellites: planet.satellites,
          confidence: 0.9
        }
      ]
      : [{
        anchor: planet.anchor,
        rotation: planet.rotation,
        size: planet.size,
        density: planet.density,
        satellites: planet.satellites,
        confidence: 0.99
      }]
  }));
}

describe("v9 ranked decoder", () => {
  test("does not commit to one uncertain planetary rank without parity", () => {
    const erasedParity = Array.from({ length: v9ParityByteCount }, () => ({
      value: null,
      confidence: 0
    }));
    const candidates = decodeV9Candidates(
      planetObservations(),
      signObservations(),
      erasedParity
    );

    expect(candidates.length).toBe(2);
    expect(uniqueV9Candidate(candidates)).toBeUndefined();
  });

  test("uses parity to recover the exact identity behind a lower-ranked glyph reading", () => {
    const candidates = decodeV9Candidates(
      planetObservations(),
      signObservations(),
      parityObservations()
    );
    const unique = uniqueV9Candidate(candidates);

    expect(unique).toBeDefined();
    expect(unique!.value).toEqual(sample);
  });
});
