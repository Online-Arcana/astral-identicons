import { describe, expect, test } from "bun:test";
import {
  codeSymbolPoint,
  northStar,
  northStarPoint
} from "../src/code-layout.ts";
import { input } from "../src/input.ts";
import type { ObservedPalette, Rgb } from "../src/scan-colour.ts";
import {
  observeStarParity,
  observeStarParitySlot
} from "../src/scan-star-parity.ts";
import {
  recoverStarParity,
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

function image(size = 1024): PixelImage {
  const width = size;
  const height = size;
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
  colour: Rgb,
  opacity: number,
  exposure: number
): void {
  const column = Math.round(x);
  const row = Math.round(y);
  if (column < 0 || row < 0 || column >= target.width || row >= target.height) return;

  const offset = (row * target.width + column) * 4;
  const factor = Math.max(0, Math.min(1, opacity * exposure));
  target.data[offset] = Math.max(target.data[offset]!, colour.r * factor);
  target.data[offset + 1] = Math.max(target.data[offset + 1]!, colour.g * factor);
  target.data[offset + 2] = Math.max(target.data[offset + 2]!, colour.b * factor);
}

function disc(
  target: PixelImage,
  x: number,
  y: number,
  radius: number,
  colour: Rgb,
  opacity: number,
  exposure: number
): void {
  const bound = Math.ceil(radius);

  for (let offsetY = -bound; offsetY <= bound; offsetY += 1) {
    for (let offsetX = -bound; offsetX <= bound; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
      setPixel(
        target,
        x + offsetX,
        y + offsetY,
        colour,
        opacity,
        exposure
      );
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
  colour: Rgb,
  opacity: number,
  exposure: number
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
      colour,
      opacity,
      exposure
    );
  }
}

function asImageData(value: PixelImage): ImageData {
  return value as unknown as ImageData;
}

function drawStar(
  target: PixelImage,
  x: number,
  y: number,
  size: number,
  colour: Rgb,
  opacity: number,
  exposure: number
): void {
  const radius = size / 2;

  disc(
    target,
    x,
    y,
    Math.max(1.7, size * 0.11),
    colour,
    opacity,
    exposure
  );

  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = spoke / 8 * Math.PI * 2;
    line(
      target,
      x,
      y,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      Math.max(1.4, size * 0.08),
      colour,
      opacity,
      exposure
    );
  }
}

function drawNorthStar(
  target: PixelImage,
  exposure: number
): void {
  const scale = target.width / 1024;
  const point = northStarPoint();

  drawStar(
    target,
    point.x * scale,
    point.y * scale,
    northStar.size * scale,
    palette.layer0,
    northStar.opacity,
    exposure
  );
}

describe("rendered parity stars", () => {
  test("reads every size and opacity level relative to the invariant North Star", () => {
    const codeword = starParityCodeword(sample);
    const sizes = new Set<number>();
    const opacities = new Set<number>();

    for (let slot = 0; slot < codeword.length; slot += 1) {
      const symbol = starVisualSymbol(codeword[slot]!);
      if (sizes.has(symbol.sizeLevel) && opacities.has(symbol.opacityLevel)) continue;

      const point = codeSymbolPoint(slot, symbol.position);
      const north = northStarPoint();
      if (Math.hypot(point.x - north.x, point.y - north.y) < 55) continue;

      const pixels = image();
      const exposure = 0.78;
      drawStar(
        pixels,
        point.x,
        point.y,
        symbol.size,
        palette.layer1,
        symbol.opacity,
        exposure
      );
      drawNorthStar(pixels, exposure);

      const observation = observeStarParitySlot(
        asImageData(pixels),
        palette,
        slot
      );

      expect(observation.value).toBe(codeword[slot]!);
      expect(observation.positionConfidence > 0).toBe(true);
      expect(observation.sizeConfidence > 0).toBe(true);
      expect(observation.opacityConfidence > 0).toBe(true);
      sizes.add(symbol.sizeLevel);
      opacities.add(symbol.opacityLevel);

      if (sizes.size === 4 && opacities.size === 4) break;
    }

    expect(sizes.size).toBe(4);
    expect(opacities.size).toBe(4);
  });

  test("reconstructs from a complete 512-pixel field under reduced exposure", () => {
    const codeword = starParityCodeword(sample);
    const pixels = image(512);
    const scale = pixels.width / 1024;
    const exposure = 0.76;

    for (let slot = 0; slot < codeword.length; slot += 1) {
      const symbol = starVisualSymbol(codeword[slot]!);
      const point = codeSymbolPoint(slot, symbol.position);
      drawStar(
        pixels,
        point.x * scale,
        point.y * scale,
        symbol.size * scale,
        palette.layer1,
        symbol.opacity,
        exposure
      );
    }
    drawNorthStar(pixels, exposure);

    const observations = observeStarParity(asImageData(pixels), palette);
    const exact = observations.filter((observation, slot) => {
      return observation.value === codeword[slot];
    }).length;
    const recovered = recoverStarParity(observations);

    expect(exact >= 40).toBe(true);
    expect(recovered.value).toEqual(sample);
  });
});
