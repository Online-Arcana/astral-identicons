export const v9CalibrationLevelCount = 6;
export const v9CalibrationSampleCount = 12;

/**
 * Sun rays calibrate fading only. Fixed clockwise sequence from North:
 * 6,1,5,2,4,3,4,3,5,2,1,6.
 */
export const v9RayFadingLevels: number[] = [
  6,
  1,
  5,
  2,
  4,
  3,
  4,
  3,
  5,
  2,
  1,
  6
];

/**
 * Circumference stars calibrate both size and fading. North and South are
 * both level 6. Fixed clockwise sequence from North:
 * 6,1,5,2,4,3,6,3,4,2,5,1.
 */
export const v9StarCalibrationLevels: number[] = [
  6,
  1,
  5,
  2,
  4,
  3,
  6,
  3,
  4,
  2,
  5,
  1
];

function level(
  values: readonly number[],
  index: number,
  label: string
): number {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= v9CalibrationSampleCount
  ) {
    throw new Error(`${label} index must be between 0 and 11`);
  }

  return values[index]! - 1;
}

export function v9RayFadingLevel(index: number): number {
  return level(v9RayFadingLevels, index, "v9 Sun-ray calibration");
}

export function v9StarCalibrationLevel(index: number): number {
  return level(v9StarCalibrationLevels, index, "v9 star calibration");
}

export function v9CalibrationAngle(index: number): number {
  v9StarCalibrationLevel(index);
  return index * 30;
}

/** Backwards-compatible name for the circumference-star pattern. */
export const v9CalibrationLevels = v9StarCalibrationLevels;
export const v9CalibrationLevel = v9StarCalibrationLevel;
