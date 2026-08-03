import { innerClipRadius } from "./code-layout.ts";
import { centre, placements, ringPlacements } from "./layout.ts";
import { signs, type Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";
import {
  colourEvidence,
  type ObservedPalette,
  pixel
} from "./scan-colour.ts";

export interface SignResult {
  sign: Sign;
  confidence: number;
  score: number;
}

export interface SignReading {
  solar: SignResult;
  lunar: SignResult;
  ascendant: SignResult;
  midheaven: SignResult;
  descendant: SignResult;
  imumCoeli: SignResult;
  constellation: SignResult;
}

type Role = keyof Omit<IdenticonInput, "seed">;

interface Observation {
  role: Role;
  x: number;
  y: number;
  size: number;
  rotation: number;
  weight: number;
}

const placeholder: IdenticonInput = {
  seed: "scanner-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};

const roleMap: Readonly<Record<string, Role>> = {
  Sun: "solar",
  Moon: "lunar",
  Ascendant: "ascendant",
  Midheaven: "midheaven",
  Descendant: "descendant",
  "Imum Coeli": "imumCoeli"
};

const observations: readonly Observation[] = [
  ...placements(placeholder).map((placement) => ({
    role: roleMap[placement.role]!,
    x: placement.x,
    y: placement.y,
    size: placement.size,
    rotation: 0,
    weight: placement.role === "Sun" ? 2.2 : 1.8
  })),
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

function loadVector(path: string): Promise<HTMLImageElement> {
  let request = vectorCache.get(path);
  if (request) return request;

  request = fetch(path)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load recognition template: ${path}`);
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
          reject(new Error(`Could not decode recognition template: ${path}`));
        }, { once: true });

        image.src = url;
      });
    });

  vectorCache.set(path, request);
  return request;
}

function alphaMask(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access a recognition template canvas");

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
    if (!context) throw new Error("Could not create a recognition template");

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
  palette: ObservedPalette,
  x: number,
  y: number,
  cropSize: number,
  dimension: number,
  layer: "layer0" | "layer1"
): Float32Array {
  const result = new Float32Array(dimension * dimension);
  const scaleX = image.width / 1024;
  const scaleY = image.height / 1024;
  const startX = x - cropSize / 2;
  const startY = y - cropSize / 2;
  const target = layer === "layer0" ? palette.layer0 : palette.layer1;

  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column < dimension; column += 1) {
      const sourceX = (startX + (column + 0.5) / dimension * cropSize) * scaleX;
      const sourceY = (startY + (row + 0.5) / dimension * cropSize) * scaleY;

      result[row * dimension + column] = colourEvidence(
        pixel(image, sourceX, sourceY),
        palette.background,
        target
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
  palette: ObservedPalette,
  observation: Observation
): Promise<ReadonlyMap<Sign, number>> {
  const dimension = 72;
  const cropSize = observation.size * 1.42;
  const observed = evidenceMask(
    image,
    palette,
    observation.x,
    observation.y,
    cropSize,
    dimension,
    "layer1"
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

function ranked(scores: ReadonlyMap<Sign, number>): SignResult {
  const values = signs
    .map((sign) => ({ sign, score: scores.get(sign) ?? 0 }))
    .sort((left, right) => right.score - left.score);

  const best = values[0]!;
  const second = values[1]!;

  return {
    sign: best.sign,
    score: best.score,
    confidence: Math.max(0, best.score - second.score)
  };
}

export async function classifyConstellation(
  image: ImageData,
  palette: ObservedPalette
): Promise<SignResult> {
  const cropSize = innerClipRadius * 2;
  const displaySize = (innerClipRadius - 12) * 2;
  const dimension = 112;
  const observed = evidenceMask(
    image,
    palette,
    centre,
    centre,
    cropSize,
    dimension,
    "layer0"
  );

  const scores = new Map<Sign, number>();

  await Promise.all(signs.map(async (sign) => {
    const expected = await template(
      "constellation",
      sign,
      displaySize,
      cropSize,
      0,
      dimension
    );

    scores.set(sign, bestCorrelation(observed, expected, dimension));
  }));

  return ranked(scores);
}

export async function classifySigns(
  image: ImageData,
  palette: ObservedPalette,
  constellation?: SignResult
): Promise<SignReading> {
  const roleScores = new Map<Role, Map<Sign, number>>();
  const roleWeights = new Map<Role, number>();

  for (const role of Object.values(roleMap)) {
    roleScores.set(role, new Map(signs.map((sign) => [sign, 0])));
    roleWeights.set(role, 0);
  }

  for (const observation of observations) {
    const scores = await classifyObservation(image, palette, observation);
    const totals = roleScores.get(observation.role)!;

    for (const sign of signs) {
      totals.set(
        sign,
        (totals.get(sign) ?? 0) + (scores.get(sign) ?? 0) * observation.weight
      );
    }

    roleWeights.set(
      observation.role,
      (roleWeights.get(observation.role) ?? 0) + observation.weight
    );
  }

  const constellationResult = constellation ?? await classifyConstellation(image, palette);
  const solarScores = roleScores.get("solar")!;
  const solarWeight = roleWeights.get("solar") ?? 1;

  for (const sign of signs) {
    const bonus = sign === constellationResult.sign
      ? constellationResult.score * 2.4
      : 0;

    solarScores.set(sign, (solarScores.get(sign) ?? 0) + bonus);
  }

  roleWeights.set("solar", solarWeight + 2.4);

  const normalised = (role: Role): SignResult => {
    const total = Math.max(1, roleWeights.get(role) ?? 1);
    const scores = new Map<Sign, number>();

    for (const sign of signs) {
      scores.set(sign, (roleScores.get(role)?.get(sign) ?? 0) / total);
    }

    return ranked(scores);
  };

  return {
    solar: normalised("solar"),
    lunar: normalised("lunar"),
    ascendant: normalised("ascendant"),
    midheaven: normalised("midheaven"),
    descendant: normalised("descendant"),
    imumCoeli: normalised("imumCoeli"),
    constellation: constellationResult
  };
}
