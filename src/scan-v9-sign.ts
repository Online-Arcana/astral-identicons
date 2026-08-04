import { centralSun, v9InnerClipRadius } from "./layout-v9.ts";
import { centre, placements, ringPlacements } from "./layout.ts";
import {
  foregroundEvidence,
  greyReference,
  type GreyReference
} from "./scan-v9-evidence.ts";
import {
  v9SignRoles,
  type V9SignObservation,
  type V9SignRole
} from "./scan-v9-core.ts";
import { signs, type Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";

interface Observation {
  readonly role: V9SignRole;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rotation: number;
  readonly weight: number;
}

interface RankedSign {
  readonly sign: Sign;
  readonly score: number;
}

const placeholder: IdenticonInput = {
  seed: "scanner-layout-v9",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};

const roleMap: Readonly<Record<string, V9SignRole>> = {
  Sun: "solar",
  Moon: "lunar",
  Ascendant: "ascendant",
  Midheaven: "midheaven",
  Descendant: "descendant",
  "Imum Coeli": "imumCoeli"
};

const observations: readonly Observation[] = [
  ...placements(placeholder).map((placement) => {
    const centralSolarSign = placement.role === "Sun";
    return {
      role: roleMap[placement.role]!,
      x: placement.x,
      y: placement.y,
      size: centralSolarSign
        ? centralSun.solarSigilSize
        : placement.size,
      rotation: 0,
      weight: centralSolarSign ? 1.8 : 1.7
    };
  }),
  ...ringPlacements(placeholder).map((placement) => ({
    role: roleMap[placement.role]!,
    x: placement.x,
    y: placement.y,
    size: placement.size,
    rotation: placement.angle,
    weight: 1
  }))
];

const vectorCache = new Map<string, Promise<HTMLImageElement>>();
const templateCache = new Map<string, Promise<Float32Array>>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function loadVector(path: string): Promise<HTMLImageElement> {
  let request = vectorCache.get(path);
  if (request) return request;

  request = fetch(path)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load v9 sign template: ${path}`);
      return response.blob();
    })
    .then((blob) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();

        image.addEventListener("load", () => {
          URL.revokeObjectURL(url);
          resolve(image);
        }, { once: true });
        image.addEventListener("error", () => {
          URL.revokeObjectURL(url);
          reject(new Error(`Could not decode v9 sign template: ${path}`));
        }, { once: true });
        image.src = url;
      });
    });

  vectorCache.set(path, request);
  return request;
}

function alphaMask(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access a v9 sign template canvas");

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const result = new Float32Array(canvas.width * canvas.height);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = data[index * 4 + 3]! / 255;
  }
  return result;
}

function template(
  kind: "sigil" | "constellation",
  sign: Sign,
  displaySize: number,
  cropSize: number,
  rotation: number,
  dimension: number
): Promise<Float32Array> {
  const key = [kind, sign, displaySize, cropSize, rotation, dimension].join(":");
  let request = templateCache.get(key);
  if (request) return request;

  request = (async () => {
    const path = kind === "sigil"
      ? `/assets/sigils/${sign}.svg`
      : `/assets/constellations/${sign}.svg`;
    const image = await loadVector(path);
    const canvas = document.createElement("canvas");
    canvas.width = dimension;
    canvas.height = dimension;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a v9 sign template");

    const rendered = displaySize / cropSize * dimension;
    context.translate(dimension / 2, dimension / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(image, -rendered / 2, -rendered / 2, rendered, rendered);
    return alphaMask(canvas);
  })();

  templateCache.set(key, request);
  return request;
}

function evidenceMask(
  image: ImageData,
  reference: GreyReference,
  x: number,
  y: number,
  cropSize: number,
  dimension: number
): Float32Array {
  const result = new Float32Array(dimension * dimension);
  const scaleX = image.width / 1024;
  const scaleY = image.height / 1024;
  const startX = x - cropSize / 2;
  const startY = y - cropSize / 2;

  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      const sourceX = (startX + (column + 0.5) / dimension * cropSize) * scaleX;
      const sourceY = (startY + (row + 0.5) / dimension * cropSize) * scaleY;
      result[row * dimension + column] = foregroundEvidence(
        image,
        reference,
        sourceX,
        sourceY
      );
    }
  }

  return result;
}

function correlation(
  observed: Float32Array,
  expected: Float32Array,
  dimension: number,
  shiftX: number,
  shiftY: number
): number {
  let dot = 0;
  let observedLength = 0;
  let expectedLength = 0;

  for (let row = 0; row < dimension; row += 1) {
    const expectedRow = row - shiftY;
    if (expectedRow < 0 || expectedRow >= dimension) continue;

    for (let column = 0; column < dimension; column += 1) {
      const expectedColumn = column - shiftX;
      if (expectedColumn < 0 || expectedColumn >= dimension) continue;
      const observedValue = observed[row * dimension + column]!;
      const expectedValue = expected[expectedRow * dimension + expectedColumn]!;
      dot += observedValue * expectedValue;
      observedLength += observedValue * observedValue;
      expectedLength += expectedValue * expectedValue;
    }
  }

  if (observedLength === 0 || expectedLength === 0) return 0;
  return dot / Math.sqrt(observedLength * expectedLength);
}

function bestCorrelation(
  observed: Float32Array,
  expected: Float32Array,
  dimension: number
): number {
  let best = 0;

  for (let shiftY = -3; shiftY <= 3; shiftY += 1) {
    for (let shiftX = -3; shiftX <= 3; shiftX += 1) {
      best = Math.max(
        best,
        correlation(observed, expected, dimension, shiftX, shiftY)
      );
    }
  }
  return best;
}

async function classifyObservation(
  image: ImageData,
  reference: GreyReference,
  observation: Observation
): Promise<ReadonlyMap<Sign, number>> {
  const dimension = 72;
  const cropSize = observation.size * 1.42;
  const observed = evidenceMask(
    image,
    reference,
    observation.x,
    observation.y,
    cropSize,
    dimension
  );
  const result = new Map<Sign, number>();

  await Promise.all(signs.map(async (sign) => {
    const expected = await template(
      "sigil",
      sign,
      observation.size,
      cropSize,
      observation.rotation,
      dimension
    );
    result.set(sign, bestCorrelation(observed, expected, dimension));
  }));
  return result;
}

async function classifyConstellation(
  image: ImageData,
  reference: GreyReference
): Promise<ReadonlyMap<Sign, number>> {
  const cropSize = v9InnerClipRadius * 2;
  const displaySize = (v9InnerClipRadius - 12) * 2;
  const dimension = 112;
  const observed = evidenceMask(
    image,
    reference,
    centre,
    centre,
    cropSize,
    dimension
  );
  const result = new Map<Sign, number>();

  await Promise.all(signs.map(async (sign) => {
    const expected = await template(
      "constellation",
      sign,
      displaySize,
      cropSize,
      0,
      dimension
    );
    result.set(sign, bestCorrelation(observed, expected, dimension));
  }));
  return result;
}

function alternatives(
  scores: ReadonlyMap<Sign, number>,
  normaliser: number
): V9SignObservation["alternatives"] {
  const ranked: RankedSign[] = signs
    .map((sign) => ({ sign, score: scores.get(sign) ?? 0 }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const margin = Math.max(0, best - second);

  return ranked.map((candidate, index) => {
    const relative = best === 0 ? 0 : candidate.score / best;
    const confidence = clamp(
      candidate.score / Math.max(normaliser, 0.001) * 0.68 +
      (index === 0 ? margin : 0) * 0.32,
      0.001,
      1
    );
    return {
      sign: candidate.sign,
      confidence: confidence * (0.35 + relative * 0.65)
    };
  });
}

export async function observeV9Signs(
  image: ImageData
): Promise<readonly V9SignObservation[]> {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v9 sign recognition requires a square normalised image");
  }

  const reference = greyReference(image);
  const scores = new Map<V9SignRole, Map<Sign, number>>();
  const weights = new Map<V9SignRole, number>();

  for (const role of v9SignRoles) {
    scores.set(role, new Map(signs.map((sign) => [sign, 0])));
    weights.set(role, 0);
  }

  const classified = await Promise.all(observations.map(async (observation) => ({
    observation,
    values: await classifyObservation(image, reference, observation)
  })));

  for (const { observation, values } of classified) {
    const roleScores = scores.get(observation.role)!;
    weights.set(
      observation.role,
      weights.get(observation.role)! + observation.weight
    );

    for (const sign of signs) {
      roleScores.set(
        sign,
        roleScores.get(sign)! + (values.get(sign) ?? 0) * observation.weight
      );
    }
  }

  const constellation = await classifyConstellation(image, reference);
  const solarScores = scores.get("solar")!;
  const constellationWeight = 2.4;
  weights.set("solar", weights.get("solar")! + constellationWeight);

  for (const sign of signs) {
    solarScores.set(
      sign,
      solarScores.get(sign)! + (constellation.get(sign) ?? 0) * constellationWeight
    );
  }

  return v9SignRoles.map((role) => ({
    role,
    alternatives: alternatives(scores.get(role)!, weights.get(role)!)
  }));
}
