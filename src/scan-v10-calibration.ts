import {
  v9CalibrationSampleCount,
  v9StarCalibrationLevel
} from "./calibration-v9.ts";
import {
  v10CalibrationStarFadingOpacities,
  v10CalibrationStarRadius,
  v10CalibrationStarSizes,
  v10Canvas,
  v10OverlayScale
} from "./layout-v10.ts";
import {
  foregroundEvidence,
  greyReference,
  type GreyReference
} from "./scan-v9-evidence.ts";
import type { V9CalibrationObservation } from "./scan-v9-calibration.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface StarSample {
  readonly diameter: number;
  readonly intensity: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function point(image: ImageData, index: number): Point {
  const scale = image.width / v10Canvas;
  const angle = index * 30 * Math.PI / 180;
  return {
    x: image.width / 2 + Math.sin(angle) * v10CalibrationStarRadius * scale,
    y: image.height / 2 - Math.cos(angle) * v10CalibrationStarRadius * scale
  };
}

function starProfile(
  image: ImageData,
  reference: GreyReference,
  location: Point,
  expectedSize: number
): StarSample {
  const scale = image.width / v10Canvas;
  const searchRadius = Math.max(3, (expectedSize / 2 + 4) * scale);
  const step = Math.max(1, Math.round(image.width / v10Canvas));
  const samples: Array<{ readonly distance: number; readonly evidence: number }> = [];
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

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function levelCentres(
  samples: readonly number[],
  fallback: readonly number[]
): readonly number[] {
  const result = Array.from({ length: fallback.length }, (_unused, level) => {
    const values = samples.filter((_value, index) => {
      return v9StarCalibrationLevel(index) === level;
    });
    const measured = median(values.filter((value) => {
      return Number.isFinite(value) && value > 0;
    }));
    return measured > 0 ? measured : fallback[level]!;
  });

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

/**
 * Measure the twelve fixed v10 circumference stars after the frame has been
 * rotated upright. Their exact six-level size/fading ladder is converted back
 * into the v9 parity coordinate scale consumed by the unchanged star decoder.
 */
export function observeV10Calibration(
  image: ImageData
): V9CalibrationObservation {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v10 calibration requires a square normalised image");
  }

  const reference = greyReference(image);
  const stars = Array.from({ length: v9CalibrationSampleCount }, (_unused, index) => {
    const level = v9StarCalibrationLevel(index);
    return starProfile(
      image,
      reference,
      point(image, index),
      v10CalibrationStarSizes[level]!
    );
  });

  const sizeV10 = levelCentres(
    stars.map((sample) => sample.diameter),
    v10CalibrationStarSizes
  );
  const fadingCentres = normaliseFading(levelCentres(
    stars.map((sample) => sample.intensity),
    v10CalibrationStarFadingOpacities
  ));
  const starSizeCentres = sizeV10.map((value) => value / v10OverlayScale);
  const visible = stars.filter((sample) => {
    return sample.diameter > 0 && sample.intensity >= 0.08;
  }).length / v9CalibrationSampleCount;

  return {
    angle: 0,
    confidence: visible,
    score: visible,
    starSizeCentres,
    starFadingCentres: fadingCentres,
    rayFadingCentres: fadingCentres,
    fadingCentres,
    planetSizeCentres: starSizeCentres.map((value) => value * 2)
  };
}
