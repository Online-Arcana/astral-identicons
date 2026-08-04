import type {
  PlanetaryAlternative,
  PlanetaryObservation
} from "./planet-code.ts";
import { v9ParityStarCount } from "./parity-v9.ts";
import {
  decodeV9Candidates,
  uniqueV9Candidate,
  v9SignRoles,
  type V9DecodedCandidate,
  type V9SignAlternative,
  type V9SignObservation
} from "./scan-v9-core.ts";
import {
  observeV9Calibration,
  type V9CalibrationObservation
} from "./scan-v9-calibration.ts";
import {
  observeV9Parity,
  type V9ParityObservation
} from "./scan-v9-parity.ts";
import { observeV9Planets } from "./scan-v9-planet.ts";
import { observeV9Signs } from "./scan-v9-sign.ts";
import type { PlanetaryKey } from "./planet.ts";
import type { Sign } from "./sign.ts";

export interface V9FrameObservation {
  readonly orientation: number;
  readonly orientationConfidence: number;
  readonly calibration: V9CalibrationObservation;
  readonly canvas: HTMLCanvasElement;
  readonly planets: readonly PlanetaryObservation[];
  readonly signs: readonly V9SignObservation[];
  readonly parity: readonly V9ParityObservation[];
  readonly candidates: readonly V9DecodedCandidate[];
  readonly unique: V9DecodedCandidate | undefined;
}

export interface V9MergedObservation {
  readonly planets: readonly PlanetaryObservation[];
  readonly signs: readonly V9SignObservation[];
  readonly parity: readonly V9ParityObservation[];
  readonly candidates: readonly V9DecodedCandidate[];
  readonly unique: V9DecodedCandidate | undefined;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Could not access a v9 scanner canvas");
  return value;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function uprightCanvas(
  source: HTMLCanvasElement,
  angle: number
): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  const targetContext = context(target);
  targetContext.translate(target.width / 2, target.height / 2);
  targetContext.rotate(-angle * Math.PI / 180);
  targetContext.drawImage(source, -source.width / 2, -source.height / 2);
  return target;
}

export async function observeV9Frame(
  source: HTMLCanvasElement
): Promise<V9FrameObservation> {
  const calibration = observeV9Calibration(imageData(source));
  const canvas = uprightCanvas(source, calibration.angle);
  const image = imageData(canvas);
  const planets = observeV9Planets(image, calibration);
  const parity = observeV9Parity(image, calibration);
  const signs = await observeV9Signs(image);
  const candidates = decodeV9Candidates(planets, signs, parity);

  return {
    orientation: calibration.angle,
    orientationConfidence: calibration.confidence,
    calibration,
    canvas,
    planets,
    signs,
    parity,
    candidates,
    unique: uniqueV9Candidate(candidates)
  };
}

function planetKey(value: PlanetaryAlternative): string {
  return [
    value.anchor,
    value.rotation,
    value.size,
    value.density,
    value.satellites.small,
    value.satellites.medium,
    value.satellites.large
  ].join(":");
}

function mergePlanets(
  frames: readonly V9FrameObservation[]
): readonly PlanetaryObservation[] {
  const byPlanet = new Map<PlanetaryKey, Map<string, {
    readonly value: PlanetaryAlternative;
    score: number;
    support: number;
  }>>();

  for (const frame of frames) {
    const frameWeight = 0.4 + frame.orientationConfidence * 0.6;

    for (const observation of frame.planets) {
      let states = byPlanet.get(observation.key);
      if (!states) {
        states = new Map();
        byPlanet.set(observation.key, states);
      }

      for (const alternative of observation.alternatives) {
        const key = planetKey(alternative);
        const score = frameWeight * alternative.confidence;
        const existing = states.get(key);

        if (existing) {
          existing.score += score;
          existing.support += 1;
          continue;
        }

        states.set(key, {
          value: alternative,
          score,
          support: 1
        });
      }
    }
  }

  return [...byPlanet.entries()].map(([key, states]) => {
    const ranked = [...states.values()]
      .map((state) => ({
        value: state.value,
        score: state.score + Math.min(0.5, state.support * 0.08)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
    const best = ranked[0]?.score ?? 0;

    return {
      key,
      alternatives: ranked.map((state) => ({
        ...state.value,
        confidence: best === 0
          ? 0.001
          : Math.max(0.001, Math.min(1, state.score / best))
      }))
    };
  });
}

function mergeSigns(
  frames: readonly V9FrameObservation[]
): readonly V9SignObservation[] {
  return v9SignRoles.map((role) => {
    const scores = new Map<Sign, { score: number; support: number }>();

    for (const frame of frames) {
      const observation = frame.signs.find((value) => value.role === role);
      if (!observation) continue;
      const frameWeight = 0.4 + frame.orientationConfidence * 0.6;

      for (const alternative of observation.alternatives) {
        const existing = scores.get(alternative.sign) ?? { score: 0, support: 0 };
        existing.score += alternative.confidence * frameWeight;
        existing.support += 1;
        scores.set(alternative.sign, existing);
      }
    }

    const ranked = [...scores.entries()]
      .map(([sign, value]) => ({
        sign,
        score: value.score + Math.min(0.4, value.support * 0.06)
      }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0]?.score ?? 0;
    const alternatives: V9SignAlternative[] = ranked.map((value) => ({
      sign: value.sign,
      confidence: best === 0
        ? 0.001
        : Math.max(0.001, Math.min(1, value.score / best))
    }));

    return { role, alternatives };
  });
}

function mergeParity(
  frames: readonly V9FrameObservation[]
): readonly V9ParityObservation[] {
  const slots = frames[0]?.parity.length ?? v9ParityStarCount;

  return Array.from({ length: slots }, (_unused, slot) => {
    const scores = new Float32Array(256);
    const support = new Uint8Array(256);
    let strongestNull = 0;

    for (const frame of frames) {
      const observation = frame.parity[slot];
      if (!observation) continue;
      const frameWeight = 0.4 + frame.orientationConfidence * 0.6;

      if (observation.value === null) {
        strongestNull = Math.max(
          strongestNull,
          observation.confidence * frameWeight
        );
        continue;
      }

      scores[observation.value] += observation.confidence * frameWeight;
      support[observation.value] = Math.min(
        255,
        support[observation.value]! + 1
      );
    }

    const ranked = [...scores]
      .map((score, value) => ({
        value,
        score: score + Math.min(0.4, support[value]! * 0.06)
      }))
      .filter((value) => value.score > 0)
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const second = ranked[1];

    if (!best) {
      return {
        value: null,
        confidence: strongestNull,
        position: null,
        size: null,
        density: null,
        positionConfidence: 0,
        sizeConfidence: 0,
        densityConfidence: 0
      };
    }

    const margin = (best.score - (second?.score ?? 0)) /
      Math.max(best.score, 0.001);
    const confidence = Math.max(0, Math.min(1, margin));
    if (margin < 0.16 || best.score <= strongestNull * 0.9) {
      return {
        value: null,
        confidence,
        position: null,
        size: null,
        density: null,
        positionConfidence: confidence,
        sizeConfidence: confidence,
        densityConfidence: confidence
      };
    }

    const source = frames
      .map((frame) => frame.parity[slot])
      .find((observation) => observation?.value === best.value);

    return {
      value: best.value,
      confidence,
      position: source?.position ?? null,
      size: source?.size ?? null,
      density: source?.density ?? null,
      positionConfidence: source?.positionConfidence ?? confidence,
      sizeConfidence: source?.sizeConfidence ?? confidence,
      densityConfidence: source?.densityConfidence ?? confidence
    };
  });
}

export function mergeV9Frames(
  frames: readonly V9FrameObservation[]
): V9MergedObservation {
  if (frames.length === 0) {
    return {
      planets: [],
      signs: [],
      parity: [],
      candidates: [],
      unique: undefined
    };
  }

  const planets = mergePlanets(frames);
  const signs = mergeSigns(frames);
  const parity = mergeParity(frames);
  const candidates = decodeV9Candidates(planets, signs, parity);

  return {
    planets,
    signs,
    parity,
    candidates,
    unique: uniqueV9Candidate(candidates)
  };
}
