import { describe, expect, test } from "bun:test";
import {
  detectOuterCircle,
  type PixelFrame
} from "../src/scan-cv.ts";

function frame(
  size: number,
  centreX?: number,
  centreY?: number,
  radius?: number
): PixelFrame {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const onRing = centreX !== undefined &&
        centreY !== undefined &&
        radius !== undefined &&
        Math.abs(Math.hypot(x - centreX, y - centreY) - radius) <= 1.5;

      data[index] = onRing ? 238 : 10;
      data[index + 1] = onRing ? 174 : 10;
      data[index + 2] = onRing ? 248 : 16;
      data[index + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}

describe("local outer-circle detector", () => {
  test("recovers a bright circular ring", () => {
    const result = detectOuterCircle(frame(192, 101, 91, 82));

    expect(result === null).toBe(false);
    if (!result) throw new Error("expected a detected circle");

    expect(result.x >= 98 && result.x <= 104).toBe(true);
    expect(result.y >= 88 && result.y <= 94).toBe(true);
    expect(result.radius >= 79 && result.radius <= 85).toBe(true);
    expect(result.confidence > 0.25).toBe(true);
  });

  test("rejects a blank frame", () => {
    expect(detectOuterCircle(frame(192))).toBe(null);
  });
});
