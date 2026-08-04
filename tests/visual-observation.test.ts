import { describe, expect, test } from "bun:test";
import { codeSymbolPoint } from "../src/code-layout.ts";
import { glyphMarks } from "../src/glyph-code.ts";
import { input } from "../src/input.ts";
import type { ObservedPalette } from "../src/scan-colour.ts";
import { observeGlyphData } from "../src/scan-glyph-code.ts";
import { observeStarParitySlot } from "../src/scan-star-parity.ts";
import { seedPayload } from "../src/seed.ts";
import {
  starParityCodeword,
  starVisualSymbol
} from "../src/star-parity.ts";

interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const sample = input({
  seed: "6270f2-example",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const palette: ObservedPalette = {
  background: { r: 0, g: 0, b: 0 },
  layer0: { r: 80, g: 190, b: 150 },
  layer1: { r: 255, g: 255, b: 255 },
  index: 0,
  confidence: 1
};

function image(): PixelImage {
  const width = 1024;
  const height = 1024;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    data[index * 4 + 3] = 255;
  }

  return { width, height, data };
}

function setPixel(
  target: PixelImage,
  x: number,
  y: number,
  intensity: number
): void {
  const column = Math.round(x);
  const row = Math.round(y);
  if (column < 0 || row < 0 || column >= target.width || row >= target.height) return;

  const offset = (row * target.width + column) * 4;
  const value = Math.max(0, Math.min(255, Math.round(intensity)));
  target.data[offset] = Math.max(target.data[offset]!, value);
  target.data[offset + 1] = Math.max(target.data[offset + 1]!, value);
  target.data[offset + 2] = Math.max(target.data[offset + 2]!, value);
}

function disc(
  target: PixelImage,
  x: number,
  y: number,
  radius: number,
  intensity: number
): void {
  const bound = Math.ceil(radius);

  for (let offsetY = -bound; offsetY <= bound; offsetY += 1) {
    for (let offsetX = -bound; offsetX <= bound; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
      setPixel(target, x + offsetX, y + offsetY, intensity);
    }
  }
}

function line(
  target: PixelImage,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  intensity: number
): void {
  const length = Math.hypot(endX - startX, endY - startY);
  const steps = Math.max(1, Math.ceil(length * 2));

  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    disc(
      target,
      startX + (endX - startX) * amount,
      startY + (endY - startY) * amount,
      width / 2,
      intensity
    );
  }
}

function asImageData(value: PixelImage): ImageData {
  return value as unknown as ImageData;
}

function drawGlyphData(target: PixelImage): void {
  for (const mark of glyphMarks(sample)) {
    line(
      target,
      mark.startX,
      mark.startY,
      mark.endX,
      mark.endY,
      4,
      255
    );
  }
}

function drawStar(
  target: PixelImage,
  x: number,
  y: number,
  size: number,
  opacity: number
): void {
  const radius = size / 2;
  const intensity = opacity * 255;

  disc(target, x, y, Math.max(1.7, size * 0.11), intensity);

  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = spoke / 8 * Math.PI * 2;
    line(
      target,
      x,
      y,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      Math.max(1.4, size * 0.08),
      intensity
    );
  }
}

describe("rendered visual channels", () => {
  test("reads all systematic payload bytes from rendered glyph marks", () => {
    const pixels = image();
    drawGlyphData(pixels);

    const observations = observeGlyphData(asImageData(pixels), palette);
    const values = observations.map((observation) => observation.value);

    expect(values).toEqual([...seedPayload(sample)]);
    expect(observations.every((observation) => observation.confidence > 0)).toBe(true);
  });

  test("reads parity-star byte channels from rendered position, size and intensity", () => {
    const codeword = starParityCodeword(sample);
    const tested: number[] = [];

    for (let sizeLevel = 0; sizeLevel < 4; sizeLevel += 1) {
      const slot = [...codeword].findIndex((byte, index) => {
        return index > 2 && ((byte & 0x0f) >>> 2) === sizeLevel;
      });
      if (slot < 0) continue;

      const symbol = starVisualSymbol(codeword[slot]!);
      const point = codeSymbolPoint(slot, symbol.position);
      const pixels = image();
      drawStar(pixels, point.x, point.y, symbol.size, symbol.opacity);

      const observation = observeStarParitySlot(
        asImageData(pixels),
        palette,
        slot
      );

      expect(observation.value).toBe(codeword[slot]!);
      expect(observation.confidence > 0).toBe(true);
      tested.push(sizeLevel);
    }

    expect(tested.length).toBe(4);
  });
});
