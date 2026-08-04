import { describe, expect, test } from "bun:test";
import {
  inspectFrame,
  loadOpenCv,
  type PixelImage
} from "../src/opencv.ts";

function image(
  width: number,
  height: number,
  value: (x: number, y: number) => number
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = value(x, y);
      data[offset] = luminance;
      data[offset + 1] = luminance;
      data[offset + 2] = luminance;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

function structured(width: number, height: number): PixelImage {
  const centreX = width / 2;
  const centreY = height / 2;
  const radius = width * 0.42;

  return image(width, height, (x, y) => {
    const distance = Math.hypot(x - centreX, y - centreY);
    const ring = Math.abs(distance - radius) <= 1.5;
    const grid = (
      Math.abs(x - width * 0.35) <= 1 ||
      Math.abs(x - width * 0.5) <= 1 ||
      Math.abs(x - width * 0.65) <= 1 ||
      Math.abs(y - height * 0.35) <= 1 ||
      Math.abs(y - height * 0.5) <= 1 ||
      Math.abs(y - height * 0.65) <= 1
    );
    const spokes = (
      Math.abs(x - centreX) <= 1 ||
      Math.abs(y - centreY) <= 1 ||
      Math.abs((x - centreX) - (y - centreY)) <= 1 ||
      Math.abs((x - centreX) + (y - centreY)) <= 1
    );

    return ring || grid || spokes ? 235 : 24;
  });
}

describe("self-contained scanner vision", () => {
  test("resolves immediately without a downloaded runtime", async () => {
    const vision = await loadOpenCv();
    expect(vision.local).toBe(true);
  });

  test("distinguishes structured sharp evidence from a flat frame", async () => {
    const vision = await loadOpenCv();
    const flat = inspectFrame(vision, image(192, 192, () => 24));
    const detailed = inspectFrame(vision, structured(192, 192));

    expect(detailed.sharpness > flat.sharpness).toBe(true);
    expect(detailed.contrast > flat.contrast).toBe(true);
    expect(detailed.edgeDensity > flat.edgeDensity).toBe(true);
    expect(detailed.centre.length).toBe(9);
    expect(detailed.ring.length).toBe(12);
    expect(flat.ready).toBe(false);
  });
});
