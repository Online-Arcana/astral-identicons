import { describe, expect, test } from "bun:test";
import {
  codeSymbolPoint,
  northStar,
  northStarPoint
} from "../src/code-layout.ts";
import { input } from "../src/input.ts";
import type { ObservedPalette, Rgb } from "../src/scan-colour.ts";
import { observeStarParity } from "../src/scan-star-parity.ts";
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
  seed: "phone-camera-relative-levels",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

const palette: ObservedPalette = {
  background: { r: 0, g: 0, b: 0 },
  layer0: { r: 70, g: 184, b: 146 },
  layer1: { r: 255, g: 255, b: 255 },
  index: 0,
  confidence: 1
};

function image(size: number): PixelImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

function cameraResponse(opacity: number, exposure: number): number {
  const linear = Math.max(0, Math.min(1, opacity * exposure));
  return Math.pow(linear, 0.46);
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

  const factor = cameraResponse(opacity, exposure);
  const offset = (row * target.width + column) * 4;
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

function drawStar(
  target: PixelImage,
  x: number,
  y: number,
  canonicalSize: number,
  colour: Rgb,
  opacity: number,
  exposure: number
): void {
  const scale = target.width / 1024;
  // Lens blur and sharpening add a nearly constant apparent radius. This
  // compresses the four canonical size levels instead of scaling them linearly.
  const size = canonicalSize * scale * 0.78 + 2.2;
  const radius = size / 2;

  disc(
    target,
    x,
    y,
    Math.max(1.5, size * 0.12),
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
      Math.max(1.25, size * 0.09),
      colour,
      opacity,
      exposure
    );
  }
}

function asImageData(value: PixelImage): ImageData {
  return value as unknown as ImageData;
}

function drawNorthStar(target: PixelImage, exposure: number): void {
  const scale = target.width / 1024;
  const point = northStarPoint();
  drawStar(
    target,
    point.x * scale,
    point.y * scale,
    northStar.size,
    palette.layer0,
    northStar.opacity,
    exposure
  );
}

function renderedField(
  include: (slot: number) => boolean
): { observations: ReturnType<typeof observeStarParity>; rendered: number } {
  const codeword = starParityCodeword(sample);
  const pixels = image(512);
  const scale = pixels.width / 1024;
  const exposure = 0.68;
  let rendered = 0;

  for (let slot = 0; slot < codeword.length; slot += 1) {
    if (!include(slot)) continue;
    const symbol = starVisualSymbol(codeword[slot]!);
    const point = codeSymbolPoint(slot, symbol.position);
    drawStar(
      pixels,
      point.x * scale,
      point.y * scale,
      symbol.size,
      palette.layer1,
      symbol.opacity,
      exposure
    );
    rendered += 1;
  }
  drawNorthStar(pixels, exposure);

  return {
    observations: observeStarParity(asImageData(pixels), palette),
    rendered
  };
}

function expectRecovery(
  observations: ReturnType<typeof observeStarParity>,
  minimumAssembled: number
): void {
  const assembled = observations.filter((value) => value.value !== null).length;
  const recovered = recoverStarParity(observations);

  expect(assembled >= minimumAssembled).toBe(true);
  expect(recovered.value).toEqual(sample);
}

describe("phone-relative parity calibration", () => {
  test("recovers from 106 stars after nonlinear brightness and size compression", () => {
    const capture = renderedField((slot) => slot % 6 !== 0);

    expect(capture.rendered).toBe(106);
    expectRecovery(capture.observations, 72);
  });

  test("recovers from the live 81-star threshold under the same distortion", () => {
    const capture = renderedField((slot) => slot % 8 < 5 || slot === 127);

    expect(capture.rendered).toBe(81);
    expectRecovery(capture.observations, 56);
  });
});
