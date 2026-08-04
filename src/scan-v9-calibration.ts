import {
  v9CalibrationAngle,
  v9CalibrationLevelCount,
  v9CalibrationSampleCount,
  v9RayFadingLevel,
  v9StarCalibrationLevel
} from "./calibration-v9.ts";
import {
  calibrationStarRadius,
  calibrationStarSizes,
  centralSun,
  parityFadingOpacities
} from "./layout-v9.ts";
import {
  foregroundEvidence,
  greyReference,
  patchEvidence,
  type GreyReference
} from "./scan-v9-evidence.ts";

export interface V9CalibrationObservation {
  readonly angle: number;
  readonly confidence: number;
  readonly score: number;
  readonly starSizeCentres: readonly number[];
  readonly starFadingCentres: readonly number[];
  readonly rayFadingCentres: readonly number[];
  readonly fadingCentres: readonly number[];
  readonly planetSizeCentres: readonly number[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface StarSample {
  readonly intensity: number;
  readonly diameter: number;
}

interface RankedAngle {
  readonly angle: number;
  readonly score: number;
}

interface AngularEvidence {
  readonly offset: number;
  readonly value: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normaliseAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function point(image: ImageData, angle: number, radius: number): Point {
  const scale = image.width / 1024;
  const radians = angle * Math.PI / 180;
  return {
    x: image.width / 2 + Math.sin(radians) * radius * scale,
    y: image.height / 2 - Math.cos(radians) * radius * scale
  };
}

function starProfile(
  image: ImageData,
  reference: GreyReference,
  location: Point,
  expectedSize: number
): StarSample {
  const scale = image.width / 1024;
  const searchRadius = Math.max(4, (expectedSize / 2 + 4) * scale);
  const step = Math.max(1, Math.round(image.width / 1024));
  const samples: Array<{
    readonly distance: number;
    readonly evidence: number;
  }> = [];
  let peak = 0;

  for (let y = -searchRadius; y <= searchRadius; y += step) {
    for (let x = -searchRadius; x <= searchRadius; x += step) {
      const distance = Math.hypot(x, y);
      if (distance > searchRadius) continue;
      const evidence = foregroundEvidence(
        image,
        reference,
        location.x + x,
        location.y + y
      );
      peak = Math.max(peak, evidence);
      samples.push({ distance, evidence });
    }
  }

  if (peak < 0.08) return { diameter: 0, intensity: 0 };
  const threshold = Math.max(0.08, peak * 0.24);
  let extent = 0;
  let mass = 0;
  let count = 0;

  for (const sample of samples) {
    if (sample.evidence < threshold) continue;
    extent = Math.max(extent, sample.distance);
    mass += sample.evidence;
    count += 1;
  }

  return {
    diameter: extent * 2 / scale,
    intensity: count === 0 ? 0 : mass / count
  };
}

function starSample(
  image: ImageData,
  reference: GreyReference,
  angle: number,
  expectedSize: number
): StarSample {
  return starProfile(
    image,
    reference,
    point(image, angle, calibrationStarRadius),
    expectedSize
  );
}

function rayEvidence(
  image: ImageData,
  reference: GreyReference,
  angle: number
): number {
  const radius = (centralSun.rayInnerRadius + centralSun.rayOuterRadius) / 2;
  const location = point(image, angle, radius);
  const scale = image.width / 1024;
  return patchEvidence(
    image,
    reference,
    location.x,
    location.y,
    Math.max(1.5, 2.4 * scale)
  );
}

function correlation(
  measured: readonly number[],
  expected: readonly number[]
): number {
  if (measured.length !== expected.length || measured.length === 0) return 0;

  const measuredMean = measured.reduce((sum, value) => sum + value, 0) /
    measured.length;
  const expectedMean = expected.reduce((sum, value) => sum + value, 0) /
    expected.length;
  let numerator = 0;
  let measuredEnergy = 0;
  let expectedEnergy = 0;

  for (let index = 0; index < measured.length; index += 1) {
    const left = measured[index]! - measuredMean;
    const right = expected[index]! - expectedMean;
    numerator += left * right;
    measuredEnergy += left * left;
    expectedEnergy += right * right;
  }

  if (measuredEnergy === 0 || expectedEnergy === 0) return 0;
  return clamp(
    numerator / Math.sqrt(measuredEnergy * expectedEnergy),
    0,
    1
  );
}

function scoreAngle(
  image: ImageData,
  reference: GreyReference,
  angle: number
): number {
  const stars = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => {
      const level = v9StarCalibrationLevel(index);
      return starSample(
        image,
        reference,
        angle + v9CalibrationAngle(index),
        calibrationStarSizes[level]!
      );
    }
  );
  const rays = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => {
      return rayEvidence(
        image,
        reference,
        angle + v9CalibrationAngle(index)
      );
    }
  );
  const starExpected = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => v9StarCalibrationLevel(index)
  );
  const rayExpected = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => v9RayFadingLevel(index)
  );
  const intensities = stars.map((sample) => sample.intensity);
  const diameters = stars.map((sample) => sample.diameter);
  const visible = stars.filter((sample) => {
    return sample.intensity >= 0.08 && sample.diameter >= 4;
  }).length / v9CalibrationSampleCount;
  const meanIntensity = intensities.reduce((sum, value) => sum + value, 0) /
    intensities.length;

  return (
    correlation(intensities, starExpected) * 0.27 +
    correlation(diameters, starExpected) * 0.29 +
    correlation(rays, rayExpected) * 0.26 +
    visible * 0.12 +
    clamp(meanIntensity, 0, 1) * 0.06
  );
}

function rankedAngles(
  image: ImageData,
  reference: GreyReference,
  step: number,
  centre?: number,
  radius = 180
): readonly RankedAngle[] {
  const start = centre === undefined ? 0 : centre - radius;
  const end = centre === undefined ? 360 : centre + radius;
  const values: RankedAngle[] = [];

  for (let angle = start; angle < end; angle += step) {
    const normalised = normaliseAngle(angle);
    values.push({
      angle: normalised,
      score: scoreAngle(image, reference, normalised)
    });
  }

  return values.sort((left, right) => right.score - left.score);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function angularStarEvidence(
  image: ImageData,
  reference: GreyReference,
  angle: number
): number {
  const location = point(image, angle, calibrationStarRadius);
  const scale = image.width / 1024;
  return patchEvidence(
    image,
    reference,
    location.x,
    location.y,
    Math.max(1, 2.5 * scale)
  );
}

/**
 * The ordered size/fading pattern identifies the correct 30-degree phase.
 * Once that phase is known, refine the angle from the actual tangential
 * centroids of all twelve circumference stars. This removes the one-to-two
 * degree rasterisation bias produced by sampling only nominal star centres.
 */
function refineAngleWithStars(
  image: ImageData,
  reference: GreyReference,
  initialAngle: number
): number {
  let angle = initialAngle;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    let weightedCorrection = 0;
    let totalReliability = 0;

    for (let index = 0; index < v9CalibrationSampleCount; index += 1) {
      const expected = angle + v9CalibrationAngle(index);
      const samples: AngularEvidence[] = [];

      for (let offset = -4; offset <= 4.0001; offset += 0.125) {
        samples.push({
          offset,
          value: angularStarEvidence(image, reference, expected + offset)
        });
      }

      const ordered = samples
        .map((sample) => sample.value)
        .sort((left, right) => left - right);
      const baseline = ordered[Math.floor(ordered.length * 0.2)] ?? 0;
      let localWeightedOffset = 0;
      let localWeight = 0;
      let peak = baseline;

      for (const sample of samples) {
        peak = Math.max(peak, sample.value);
        const contrast = Math.max(0, sample.value - baseline);
        const weight = contrast * contrast;
        localWeightedOffset += sample.offset * weight;
        localWeight += weight;
      }

      if (localWeight <= 1e-6 || peak - baseline < 0.025) continue;
      const correction = localWeightedOffset / localWeight;
      const reliability = (peak - baseline) * Math.sqrt(localWeight);
      weightedCorrection += correction * reliability;
      totalReliability += reliability;
    }

    if (totalReliability <= 1e-6) break;
    const correction = clamp(
      weightedCorrection / totalReliability,
      -4,
      4
    );
    angle = normaliseAngle(angle + correction);
    if (Math.abs(correction) < 0.02) break;
  }

  return angle;
}

function levelCentres(
  samples: readonly number[],
  levelForIndex: (index: number) => number,
  fallback: readonly number[]
): readonly number[] {
  const result = Array.from(
    { length: v9CalibrationLevelCount },
    (_unused, level) => {
      const values = samples.filter((_value, index) => {
        return levelForIndex(index) === level;
      });
      const measured = median(values.filter((value) => {
        return Number.isFinite(value) && value > 0;
      }));
      return measured > 0 ? measured : fallback[level]!;
    }
  );

  for (let level = 1; level < result.length; level += 1) {
    if (result[level]! > result[level - 1]!) continue;
    result[level] = result[level - 1]! + 0.001;
  }
  return result;
}

function normaliseFading(values: readonly number[]): readonly number[] {
  const maximum = Math.max(...values, 0.001);
  return values.map((value) => clamp(value / maximum, 0.001, 1));
}

export function observeV9Calibration(
  image: ImageData
): V9CalibrationObservation {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v9 calibration requires a square normalised image");
  }

  const reference = greyReference(image);
  const coarse = rankedAngles(image, reference, 2);
  const first = coarse[0];
  if (!first) {
    return {
      angle: 0,
      confidence: 0,
      score: 0,
      starSizeCentres: calibrationStarSizes,
      starFadingCentres: parityFadingOpacities,
      rayFadingCentres: parityFadingOpacities,
      fadingCentres: parityFadingOpacities,
      planetSizeCentres: calibrationStarSizes.map((value) => value * 2)
    };
  }

  const fine = rankedAngles(image, reference, 0.25, first.angle, 4);
  const patternBest = fine[0] ?? first;
  const angle = refineAngleWithStars(image, reference, patternBest.angle);
  const finalScore = scoreAngle(image, reference, angle);
  const alternatives = [...fine, ...coarse]
    .filter((candidate) => {
      return angularDistance(candidate.angle, angle) >= 15;
    })
    .sort((left, right) => right.score - left.score);
  const second = alternatives[0];
  const margin = finalScore === 0
    ? 0
    : (finalScore - (second?.score ?? 0)) / finalScore;
  const confidence = clamp(margin * 0.72 + finalScore * 0.28, 0, 1);

  const stars = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => {
      const level = v9StarCalibrationLevel(index);
      return starSample(
        image,
        reference,
        angle + v9CalibrationAngle(index),
        calibrationStarSizes[level]!
      );
    }
  );
  const rays = Array.from(
    { length: v9CalibrationSampleCount },
    (_unused, index) => {
      return rayEvidence(
        image,
        reference,
        angle + v9CalibrationAngle(index)
      );
    }
  );
  const starSizeCentres = levelCentres(
    stars.map((sample) => sample.diameter),
    v9StarCalibrationLevel,
    calibrationStarSizes
  );
  const starFadingCentres = normaliseFading(levelCentres(
    stars.map((sample) => sample.intensity),
    v9StarCalibrationLevel,
    parityFadingOpacities
  ));
  const rayFadingCentres = normaliseFading(levelCentres(
    rays,
    v9RayFadingLevel,
    parityFadingOpacities
  ));
  const fadingCentres = normaliseFading(
    starFadingCentres.map((value, level) => {
      return value * 0.4 + rayFadingCentres[level]! * 0.6;
    })
  );

  return {
    angle,
    confidence,
    score: finalScore,
    starSizeCentres,
    starFadingCentres,
    rayFadingCentres,
    fadingCentres,
    planetSizeCentres: starSizeCentres.map((value) => value * 2)
  };
}
