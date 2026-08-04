import { innerClipRadius } from "./code-layout.ts";
import { centre, placements, ringPlacements } from "./layout.ts";
import type { Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";
import {
  colourEvidence,
  type ObservedPalette,
  pixel
} from "./scan-colour.ts";

type Role = keyof Omit<IdenticonInput, "seed">;

interface VerificationItem {
  role: Role;
  group: "centre" | "ring";
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export interface SignVerification {
  centreFound: number;
  ringFound: number;
  rolesFound: number;
  roleFound: Readonly<Record<Role, boolean>>;
  constellationFound: boolean;
  minimumScore: number;
  complete: boolean;
}

const placeholder: IdenticonInput = {
  seed: "verification-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};

const roles: readonly Role[] = [
  "solar",
  "lunar",
  "ascendant",
  "midheaven",
  "descendant",
  "imumCoeli"
] as const;

const roleMap: Readonly<Record<string, Role>> = {
  Sun: "solar",
  Moon: "lunar",
  Ascendant: "ascendant",
  Midheaven: "midheaven",
  Descendant: "descendant",
  "Imum Coeli": "imumCoeli"
};

const items: readonly VerificationItem[] = [
  ...placements(placeholder).map((placement) => ({
    role: roleMap[placement.role]!,
    group: "centre" as const,
    x: placement.x,
    y: placement.y,
    size: placement.size,
    rotation: 0
  })),
  ...ringPlacements(placeholder).map((placement) => ({
    role: roleMap[placement.role]!,
    group: "ring" as const,
    x: placement.x,
    y: placement.y,
    size: placement.size,
    rotation: placement.angle
  }))
];

const vectorCache = new Map<string, Promise<HTMLImageElement>>();
const templateCache = new Map<string, Promise<Float32Array>>();
const sigilThreshold = 0.055;
const constellationThreshold = 0.07;

function assetPath(path: string): string {
  return new URL(path.replace(/^\//u, ""), document.baseURI).href;
}

function loadVector(path: string): Promise<HTMLImageElement> {
  const resolved = assetPath(path);
  let request = vectorCache.get(resolved);
  if (request) return request;

  request = fetch(resolved)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load verification template: ${resolved}`);
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
          reject(new Error(`Could not decode verification template: ${resolved}`));
        }, { once: true });

        image.src = url;
      });
    });

  vectorCache.set(resolved, request);
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
      ? `assets/sigils/${sign}.svg`
      : `assets/constellations/${sign}.svg`;
    const image = await loadVector(path);
    const canvas = document.createElement("canvas");
    canvas.width = dimension;
    canvas.height = dimension;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a verification template");

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

  for (let shiftY = -2; shiftY <= 2; shiftY += 1) {
    for (let shiftX = -2; shiftX <= 2; shiftX += 1) {
      best = Math.max(
        best,
        correlation(observed, expected, dimension, shiftX, shiftY)
      );
    }
  }

  return best;
}

async function verifyItem(
  image: ImageData,
  palette: ObservedPalette,
  value: IdenticonInput,
  item: VerificationItem
): Promise<number> {
  const dimension = 56;
  const cropSize = item.size * 1.42;
  const observed = evidenceMask(
    image,
    palette,
    item.x,
    item.y,
    cropSize,
    dimension,
    "layer1"
  );
  const expected = await template(
    "sigil",
    value[item.role],
    item.size,
    cropSize,
    item.rotation,
    dimension
  );

  return bestCorrelation(observed, expected, dimension);
}

async function verifyConstellation(
  image: ImageData,
  palette: ObservedPalette,
  sign: Sign
): Promise<number> {
  const cropSize = innerClipRadius * 2;
  const displaySize = (innerClipRadius - 12) * 2;
  const dimension = 80;
  const observed = evidenceMask(
    image,
    palette,
    centre,
    centre,
    cropSize,
    dimension,
    "layer0"
  );
  const expected = await template(
    "constellation",
    sign,
    displaySize,
    cropSize,
    0,
    dimension
  );

  return bestCorrelation(observed, expected, dimension);
}

export async function verifyExpectedSigns(
  image: ImageData,
  palette: ObservedPalette,
  value: IdenticonInput
): Promise<SignVerification> {
  const scores = await Promise.all(items.map((item) => {
    return verifyItem(image, palette, value, item);
  }));
  const constellationScore = await verifyConstellation(
    image,
    palette,
    value.solar
  );
  const found = Object.fromEntries(
    roles.map((role) => [role, false])
  ) as Record<Role, boolean>;
  let centreFound = 0;
  let ringFound = 0;
  let minimumScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length; index += 1) {
    const score = scores[index] ?? 0;
    const item = items[index]!;
    minimumScore = Math.min(minimumScore, score);

    if (score < sigilThreshold) continue;
    found[item.role] = true;
    if (item.group === "centre") centreFound += 1;
    else ringFound += 1;
  }

  const constellationFound = constellationScore >= constellationThreshold;
  if (constellationFound) found.solar = true;
  const rolesFound = roles.filter((role) => found[role]).length;

  return {
    centreFound,
    ringFound,
    rolesFound,
    roleFound: found,
    constellationFound,
    minimumScore: Number.isFinite(minimumScore) ? minimumScore : 0,
    complete: rolesFound === roles.length && constellationFound
  };
}
