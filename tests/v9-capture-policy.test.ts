import { describe, expect, test } from "bun:test";
import { inspectFrame, loadOpenCv } from "../src/opencv.ts";

function structured(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const centre = size / 2;
  const outer = size * 0.475;
  const inner = size * 0.385;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre);
      const ring =
        Math.abs(distance - outer) <= 2 ||
        Math.abs(distance - inner) <= 2;
      const grid =
        Math.abs(x - centre) <= 1 ||
        Math.abs(y - centre) <= 1 ||
        Math.abs(x - centre - size * 0.22) <= 1 ||
        Math.abs(x - centre + size * 0.22) <= 1 ||
        Math.abs(y - centre - size * 0.22) <= 1 ||
        Math.abs(y - centre + size * 0.22) <= 1;
      const stars =
        ((x * 17 + y * 29) % 83) < 3 &&
        distance > size * 0.28 &&
        distance < size * 0.37;
      const value = ring || grid || stars ? 218 : 36;
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  return { width: size, height: size, data } as ImageData;
}

function blurred(source: ImageData, radius: number): ImageData {
  const data = new Uint8ClampedArray(source.data.length);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      let total = 0;
      let count = 0;

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = Math.max(0, Math.min(source.height - 1, y + offsetY));

        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = Math.max(0, Math.min(source.width - 1, x + offsetX));
          total += source.data[(sampleY * source.width + sampleX) * 4]!;
          count += 1;
        }
      }

      const value = Math.round(total / count);
      const index = (y * source.width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  return {
    width: source.width,
    height: source.height,
    data
  } as ImageData;
}

describe("v9 camera acceptance policy", () => {
  test("the local vision metric distinguishes a sharp frame from motion blur", async () => {
    const vision = await loadOpenCv();
    const sharp = inspectFrame(vision, structured(256));
    const soft = inspectFrame(vision, blurred(structured(256), 5));

    expect(sharp.sharpness).toBeGreaterThan(36);
    expect(soft.sharpness).toBeLessThan(sharp.sharpness * 0.35);
    expect(sharp.sharpness).toBeGreaterThan(soft.sharpness);
  });

  test("updates the best preview before admitting only stable evidence", async () => {
    const source = await Bun.file("src/scan-v9.ts").text();
    const preview = source.indexOf("this.considerBest(frame);");
    const stability = source.indexOf("if (!this.stable(quality))");
    const retain = source.indexOf("this.remember(frame);", stability);

    expect(source).toContain("const focusSettleMilliseconds = 1800;");
    expect(source).toContain("const minimumFrames = 10;");
    expect(source).toContain("const minimumUsefulMilliseconds = 2400;");
    expect(source).toContain("const minimumStableFrames = 4;");
    expect(source).toContain("quality.ready &&");
    expect(preview).toBeGreaterThanOrEqual(0);
    expect(stability).toBeGreaterThan(preview);
    expect(retain).toBeGreaterThan(stability);
  });

  test("continually replaces the snapshot only when frame quality improves", async () => {
    const source = await Bun.file("src/scan-v9.ts").text();
    const method = source.slice(
      source.indexOf("private considerBest"),
      source.indexOf("private remember")
    );

    expect(method).toContain("if (frame.score <= this.#bestScore) return;");
    expect(method).toContain("this.#bestScore = frame.score;");
    expect(method).toContain("this.updateBestFrame(frame.canvas);");
  });
});
