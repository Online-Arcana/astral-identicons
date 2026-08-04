import { describe, expect, test } from "bun:test";
import { northStar } from "../src/code-layout.ts";
import { observeV9Orientation } from "../src/scan-v9-orientation.ts";

function image(
  angle: number,
  background: number,
  foreground: number
): ImageData {
  const size = 256;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = background;
    data[index * 4 + 1] = background;
    data[index * 4 + 2] = background;
    data[index * 4 + 3] = 255;
  }

  const scale = size / 1024;
  const radians = angle * Math.PI / 180;
  const x = size / 2 + Math.sin(radians) * northStar.radius * scale;
  const y = size / 2 - Math.cos(radians) * northStar.radius * scale;
  const radius = northStar.size * scale * 0.55;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (Math.hypot(column - x, row - y) > radius) continue;
      const index = (row * size + column) * 4;
      data[index] = foreground;
      data[index + 1] = foreground;
      data[index + 2] = foreground;
    }
  }

  return { width: size, height: size, data } as ImageData;
}

function distance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

describe("v9 North Star orientation", () => {
  test("finds a bright North Star without using RGB colour", () => {
    const observed = observeV9Orientation(image(73, 12, 244));
    expect(distance(observed.angle, 73)).toBeLessThanOrEqual(1);
    expect(observed.confidence).toBeGreaterThan(0.2);
  });

  test("finds an inverted monochrome North Star", () => {
    const observed = observeV9Orientation(image(221.5, 248, 8));
    expect(distance(observed.angle, 221.5)).toBeLessThanOrEqual(1);
    expect(observed.confidence).toBeGreaterThan(0.2);
  });
});
