import {
  rotateV10Point,
  v10Canvas,
  v10ParityAnchorPoint,
  v10ParityStarSizes
} from "./layout-v10.ts";
import { v9ParityPositionCount, v9ParityStarCount } from "./parity-v9.ts";
import {
  greyReference,
  patchEvidence,
  type GreyReference
} from "./scan-v9-evidence.ts";

export interface V10OrientationObservation {
  readonly angle: number;
  readonly confidence: number;
  readonly score: number;
}

interface ScoredAngle {
  readonly angle: number;
  readonly score: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalise(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(normalise(left) - normalise(right));
  return Math.min(difference, 360 - difference);
}

function scoreAngle(
  image: ImageData,
  reference: GreyReference,
  angle: number,
  groupStep: number
): number {
  const scale = image.width / v10Canvas;
  const patchRadius = Math.max(1, v10ParityStarSizes.at(-1)! * scale * 0.22);
  let total = 0;
  let count = 0;

  for (let group = 0; group < v9ParityStarCount; group += groupStep) {
    const ranked: number[] = [];
    for (let position = 0; position < v9ParityPositionCount; position += 1) {
      const point = rotateV10Point(v10ParityAnchorPoint(group, position), angle);
      ranked.push(patchEvidence(
        image,
        reference,
        point.x * scale,
        point.y * scale,
        patchRadius
      ));
    }
    ranked.sort((left, right) => right - left);
    const best = ranked[0] ?? 0;
    const second = ranked[1] ?? 0;
    const margin = Math.max(0, best - second);
    total += best * 0.7 + margin * 0.3;
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

function coarseAngles(
  image: ImageData,
  reference: GreyReference
): readonly ScoredAngle[] {
  const values: ScoredAngle[] = [];
  for (let angle = 0; angle < 360; angle += 2) {
    values.push({ angle, score: scoreAngle(image, reference, angle, 2) });
  }
  return values.sort((left, right) => right.score - left.score);
}

function refine(
  image: ImageData,
  reference: GreyReference,
  coarse: number
): ScoredAngle {
  let best: ScoredAngle = {
    angle: normalise(coarse),
    score: scoreAngle(image, reference, coarse, 1)
  };
  for (let offset = -2.5; offset <= 2.5001; offset += 0.25) {
    const angle = normalise(coarse + offset);
    const candidate = { angle, score: scoreAngle(image, reference, angle, 1) };
    if (candidate.score > best.score) best = candidate;
  }
  return best;
}

export function observeV10Orientation(image: ImageData): V10OrientationObservation {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v10 orientation requires a square normalised image");
  }

  const reference = greyReference(image);
  const coarse = coarseAngles(image, reference);
  const leading = coarse[0] ?? { angle: 0, score: 0 };
  const best = refine(image, reference, leading.angle);
  const competitor = coarse.find((candidate) => {
    return angularDistance(candidate.angle, best.angle) >= 8;
  });
  const separation = best.score === 0
    ? 0
    : Math.max(0, best.score - (competitor?.score ?? 0)) / best.score;
  const confidence = clamp(best.score * 0.58 + separation * 0.42, 0, 1);

  return {
    angle: best.angle,
    confidence,
    score: best.score
  };
}
