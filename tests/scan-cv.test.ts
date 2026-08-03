import { describe, expect, test } from "bun:test";
import {
  canvas,
  innerRingRadius,
  outerRingRadius
} from "../src/layout.ts";
import {
  detectOuterCircle,
  normalisationCrop,
  type PixelFrame
} from "../src/scan-cv.ts";

interface TestRing {
  centreX: number;
  centreY: number;
  radius: number;
}

function frame(size: number, rings: readonly TestRing[] = []): PixelFrame {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const onRing = rings.some((ring) => {
        return Math.abs(
          Math.hypot(x - ring.centreX, y - ring.centreY) - ring.radius
        ) <= 1.5;
      });

      data[index] = onRing ? 238 : 10;
      data[index + 1] = onRing ? 174 : 10;
      data[index + 2] = onRing ? 248 : 16;
      data[index + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}

describe("local outer-circle detector", () => {
  test("selects the outer member of the identicon ring pair", () => {
    const outer = 82;
    const inner = outer * innerRingRadius / outerRingRadius;
    const source = frame(192, [
      { centreX: 101, centreY: 91, radius: outer },
      { centreX: 101, centreY: 91, radius: inner }
    ]);

    const result = detectOuterCircle(source);

    expect(result === null).toBe(false);
    if (!result) throw new Error("expected a detected circle");

    expect(result.x >= 98 && result.x <= 104).toBe(true);
    expect(result.y >= 88 && result.y <= 94).toBe(true);
    expect(result.radius >= 79 && result.radius <= 85).toBe(true);
    expect(result.radius > inner + 8).toBe(true);
    expect(result.confidence > 0.25).toBe(true);
  });

  test("does not mistake an isolated inner-sized ring for an outer ring", () => {
    const result = detectOuterCircle(frame(192, [
      { centreX: 96, centreY: 96, radius: 66 }
    ]));

    expect(result).toBe(null);
  });

  test("rejects a blank frame", () => {
    expect(detectOuterCircle(frame(192))).toBe(null);
  });
});

describe("ring normalisation", () => {
  test("maps the detected outer ring to its canonical 486-unit radius", () => {
    const circle = {
      x: 360,
      y: 360,
      radius: 342,
      confidence: 1
    };
    const crop = normalisationCrop(circle);
    const mappedRadius = circle.radius * canvas / crop.size;

    expect(Math.abs(mappedRadius - outerRingRadius) < 0.000001).toBe(true);
    expect(crop.size > circle.radius * 2).toBe(true);
    expect(Math.abs(crop.x + crop.size / 2 - circle.x) < 0.000001).toBe(true);
    expect(Math.abs(crop.y + crop.size / 2 - circle.y) < 0.000001).toBe(true);
  });
});
