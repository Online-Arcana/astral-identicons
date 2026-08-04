import { describe, expect, test } from "bun:test";
import {
  v9CalibrationAngle,
  v9CalibrationSampleCount,
  v9RayFadingLevel,
  v9StarCalibrationLevel
} from "../src/calibration-v9.ts";
import {
  calibrationStarRadius,
  calibrationStarSizes,
  centralSun,
  parityFadingOpacities,
  planetFadingOpacities
} from "../src/layout-v9.ts";
import { observeV9Calibration } from "../src/scan-v9-calibration.ts";
import { observeV9Orientation } from "../src/scan-v9-orientation.ts";

function blend(background: number, foreground: number, opacity: number): number {
  return Math.round(background + (foreground - background) * opacity);
}

function setPixel(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  value: number
): void {
  const column = Math.round(x);
  const row = Math.round(y);
  if (column < 0 || row < 0 || column >= size || row >= size) return;
  const index = (row * size + column) * 4;
  data[index] = value;
  data[index + 1] = value;
  data[index + 2] = value;
  data[index + 3] = 255;
}

function disc(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  radius: number,
  value: number
): void {
  const minimumX = Math.floor(x - radius);
  const maximumX = Math.ceil(x + radius);
  const minimumY = Math.floor(y - radius);
  const maximumY = Math.ceil(y + radius);

  for (let row = minimumY; row <= maximumY; row += 1) {
    for (let column = minimumX; column <= maximumX; column += 1) {
      if (Math.hypot(column - x, row - y) > radius) continue;
      setPixel(data, size, column, row, value);
    }
  }
}

function polar(
  size: number,
  angle: number,
  radius: number
): { readonly x: number; readonly y: number } {
  const scale = size / 1024;
  const radians = angle * Math.PI / 180;
  return {
    x: size / 2 + Math.sin(radians) * radius * scale,
    y: size / 2 - Math.cos(radians) * radius * scale
  };
}

function image(
  angle: number,
  background: number,
  foreground: number
): ImageData {
  const size = 512;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = background;
    data[index * 4 + 1] = background;
    data[index * 4 + 2] = background;
    data[index * 4 + 3] = 255;
  }

  const scale = size / 1024;

  for (let index = 0; index < v9CalibrationSampleCount; index += 1) {
    const starLevel = v9StarCalibrationLevel(index);
    const starAngle = angle + v9CalibrationAngle(index);
    const starPoint = polar(size, starAngle, calibrationStarRadius);
    const starValue = blend(
      background,
      foreground,
      parityFadingOpacities[starLevel]!
    );
    disc(
      data,
      size,
      starPoint.x,
      starPoint.y,
      calibrationStarSizes[starLevel]! * scale / 2,
      starValue
    );

    const rayLevel = v9RayFadingLevel(index);
    const rayValue = blend(
      background,
      foreground,
      planetFadingOpacities[rayLevel]!
    );

    for (let step = 0; step <= 40; step += 1) {
      const fraction = step / 40;
      const radius =
        centralSun.rayInnerRadius +
        (centralSun.rayOuterRadius - centralSun.rayInnerRadius) * fraction;
      const rayPoint = polar(size, starAngle, radius);
      disc(data, size, rayPoint.x, rayPoint.y, 0.8, rayValue);
    }
  }

  return { width: size, height: size, data } as ImageData;
}

function distance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function increasing(values: readonly number[]): boolean {
  return values.every((value, index) => {
    return index === 0 || value > values[index - 1]!;
  });
}

describe("v9 fixed calibration orientation", () => {
  test("finds the ordered star and ray patterns without using RGB colour", () => {
    const observed = observeV9Orientation(image(73, 12, 244));
    expect(distance(observed.angle, 73)).toBeLessThanOrEqual(1);
    expect(observed.confidence).toBeGreaterThan(0.15);
  });

  test("finds the same patterns in inverted monochrome", () => {
    const observed = observeV9Orientation(image(221.5, 248, 8));
    expect(distance(observed.angle, 221.5)).toBeLessThanOrEqual(1);
    expect(observed.confidence).toBeGreaterThan(0.15);
  });

  test("derives monotonic size and fading curves from fixed references", () => {
    const observed = observeV9Calibration(image(47, 18, 238));

    expect(distance(observed.angle, 47)).toBeLessThanOrEqual(1);
    expect(increasing(observed.starSizeCentres)).toBe(true);
    expect(increasing(observed.starFadingCentres)).toBe(true);
    expect(increasing(observed.rayFadingCentres)).toBe(true);
    expect(increasing(observed.fadingCentres)).toBe(true);
    expect(observed.planetSizeCentres).toEqual(
      observed.starSizeCentres.map((value) => value * 2)
    );
  });
});
