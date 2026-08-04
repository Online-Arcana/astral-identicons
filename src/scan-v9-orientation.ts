import { observeV9Calibration } from "./scan-v9-calibration.ts";

export interface V9OrientationObservation {
  readonly angle: number;
  readonly confidence: number;
  readonly score: number;
}

export function observeV9Orientation(
  image: ImageData
): V9OrientationObservation {
  const calibration = observeV9Calibration(image);
  return {
    angle: calibration.angle,
    confidence: calibration.confidence,
    score: calibration.score
  };
}
