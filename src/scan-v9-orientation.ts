import { northStar } from "./code-layout.ts";
import {
  foregroundEvidence,
  greyReference,
  patchEvidence,
  type GreyReference
} from "./scan-v9-evidence.ts";

export interface V9OrientationObservation {
  readonly angle: number;
  readonly confidence: number;
  readonly score: number;
}

interface RankedAngle {
  readonly angle: number;
  readonly score: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function point(
  image: ImageData,
  angle: number
): { readonly x: number; readonly y: number } {
  const scale = image.width / 1024;
  const radians = angle * Math.PI / 180;
  return {
    x: image.width / 2 + Math.sin(radians) * northStar.radius * scale,
    y: image.height / 2 - Math.cos(radians) * northStar.radius * scale
  };
}

function apparentDiameter(
  image: ImageData,
  reference: GreyReference,
  x: number,
  y: number
): number {
  const scale = image.width / 1024;
  const searchRadius = Math.max(5, northStar.size * scale * 0.8);
  const step = Math.max(1, Math.round(image.width / 1024));
  let extent = 0;

  for (let offsetY = -searchRadius; offsetY <= searchRadius; offsetY += step) {
    for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX += step) {
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > searchRadius) continue;
      const evidence = foregroundEvidence(
        image,
        reference,
        x + offsetX,
        y + offsetY
      );
      if (evidence < 0.2) continue;
      extent = Math.max(extent, distance);
    }
  }

  return extent * 2 / scale;
}

function scoreAt(
  image: ImageData,
  reference: GreyReference,
  angle: number
): number {
  const location = point(image, angle);
  const scale = image.width / 1024;
  const presence = patchEvidence(
    image,
    reference,
    location.x,
    location.y,
    Math.max(4, northStar.size * scale * 0.48)
  );
  const diameter = apparentDiameter(
    image,
    reference,
    location.x,
    location.y
  );
  const sizeScore = clamp(
    1 - Math.abs(diameter - northStar.size) / (northStar.size * 0.45),
    0,
    1
  );

  return presence * 0.58 + sizeScore * 0.42;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function rankedAngles(
  image: ImageData,
  reference: GreyReference,
  step: number,
  centre?: number,
  radius = 180
): readonly RankedAngle[] {
  const values: RankedAngle[] = [];
  const start = centre === undefined ? 0 : centre - radius;
  const end = centre === undefined ? 360 : centre + radius;

  for (let angle = start; angle < end; angle += step) {
    const normalised = ((angle % 360) + 360) % 360;
    values.push({
      angle: normalised,
      score: scoreAt(image, reference, normalised)
    });
  }

  return values.sort((left, right) => right.score - left.score);
}

export function observeV9Orientation(
  image: ImageData
): V9OrientationObservation {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v9 orientation requires a square normalised image");
  }

  const reference = greyReference(image);
  const coarse = rankedAngles(image, reference, 4);
  const firstCoarse = coarse[0];
  if (!firstCoarse) return { angle: 0, confidence: 0, score: 0 };

  const fine = rankedAngles(image, reference, 0.5, firstCoarse.angle, 6);
  const best = fine[0]!;
  const independent = [...fine, ...coarse].filter((candidate) => {
    return angularDistance(candidate.angle, best.angle) >= 18;
  });
  const second = independent.sort((left, right) => right.score - left.score)[0];
  const secondScore = second?.score ?? 0;
  const margin = best.score === 0
    ? 0
    : (best.score - secondScore) / best.score;
  const confidence = Math.max(
    0,
    Math.min(1, margin * 0.72 + best.score * 0.28)
  );

  return {
    angle: best.angle,
    confidence,
    score: best.score
  };
}
