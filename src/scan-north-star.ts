import {
  northStar,
  northStarPoint,
  rotatePoint
} from "./code-layout.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette
} from "./scan-colour.ts";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function scoreAt(
  image: ImageData,
  palette: ObservedPalette,
  angle: number
): number {
  const scale = image.width / 1024;
  const point = rotatePoint(northStarPoint(), angle);
  const centreX = point.x * scale;
  const centreY = point.y * scale;
  const coreRadius = Math.max(4, Math.round(northStar.size * scale * 0.34));
  const outerRadius = Math.max(coreRadius + 2, Math.round(northStar.size * scale * 0.62));
  let core = 0;
  let coreCount = 0;
  let outer = 0;
  let outerCount = 0;

  for (let y = -outerRadius; y <= outerRadius; y += 1) {
    for (let x = -outerRadius; x <= outerRadius; x += 1) {
      const distance = Math.hypot(x, y);
      if (distance > outerRadius) continue;

      const evidence = colourEvidence(
        pixel(image, centreX + x, centreY + y),
        palette.background,
        palette.layer1
      );

      if (distance <= coreRadius) {
        core += evidence;
        coreCount += 1;
      } else {
        outer += evidence;
        outerCount += 1;
      }
    }
  }

  const coreMean = core / Math.max(1, coreCount);
  const outerMean = outer / Math.max(1, outerCount);
  return coreMean * 1.5 + outerMean * 0.35;
}

export function findNorthStarOrientation(
  image: ImageData,
  palette: ObservedPalette
): { angle: number; confidence: number } {
  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondScore = Number.NEGATIVE_INFINITY;

  for (let angle = 0; angle < 360; angle += 2) {
    const score = scoreAt(image, palette, angle);

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestAngle = angle;
      continue;
    }

    if (score > secondScore) secondScore = score;
  }

  let refinedAngle = bestAngle;
  let refinedScore = bestScore;

  for (let offset = -2; offset <= 2; offset += 0.25) {
    const angle = (bestAngle + offset + 360) % 360;
    const score = scoreAt(image, palette, angle);
    if (score <= refinedScore) continue;
    refinedAngle = angle;
    refinedScore = score;
  }

  return {
    angle: refinedAngle,
    confidence: clamp(
      (refinedScore - secondScore) / Math.max(0.01, refinedScore),
      0,
      1
    )
  };
}
