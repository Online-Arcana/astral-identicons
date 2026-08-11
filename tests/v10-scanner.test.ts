import { describe, expect, test } from "bun:test";
import {
  rotateV10Point,
  v10Canvas,
  v10OuterRingRadius,
  v10ParityAnchorPoint,
  v10ParityStarSizes,
  v10RingRatio
} from "../src/layout-v10.ts";
import { v9ParityVisualState } from "../src/parity-v9.ts";
import { v9Parity } from "../src/record-v9.ts";
import { detectV10OuterCircle } from "../src/scan-v10-cv.ts";
import { observeV10Orientation } from "../src/scan-v10-orientation.ts";
import { observeV10Parity } from "../src/scan-v10-parity.ts";
import { parityFadingOpacities } from "../src/layout-v9.ts";
import { input } from "../src/input.ts";

const sample = input({
  seed: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
});

function blend(background: number, foreground: number, opacity: number): number {
  return Math.round(background + (foreground - background) * opacity);
}

function blank(size: number, value = 12): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  return data;
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
  const offset = (row * size + column) * 4;
  data[offset] = value;
  data[offset + 1] = value;
  data[offset + 2] = value;
  data[offset + 3] = 255;
}

function disc(
  data: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
  radius: number,
  value: number
): void {
  for (let row = Math.floor(y - radius); row <= Math.ceil(y + radius); row += 1) {
    for (let column = Math.floor(x - radius); column <= Math.ceil(x + radius); column += 1) {
      if (Math.hypot(column - x, row - y) > radius) continue;
      setPixel(data, size, column, row, value);
    }
  }
}

function starImage(angle = 0): ImageData {
  const size = 512;
  const background = 12;
  const foreground = 244;
  const data = blank(size, background);
  const scale = size / v10Canvas;
  const parity = v9Parity(sample);

  for (let group = 0; group < parity.length; group += 1) {
    const state = v9ParityVisualState(parity[group]!);
    const point = rotateV10Point(v10ParityAnchorPoint(group, state.position), angle);
    const value = blend(
      background,
      foreground,
      parityFadingOpacities[state.density]!
    );
    disc(
      data,
      size,
      point.x * scale,
      point.y * scale,
      v10ParityStarSizes[state.size]! * scale / 2,
      value
    );
  }

  return { width: size, height: size, data } as ImageData;
}

function distance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360;
  return Math.min(difference, 360 - difference);
}

function ringFrame(): { width: number; height: number; data: Uint8ClampedArray } {
  const size = 224;
  const data = blank(size, 8);
  const centre = size / 2;
  const outer = size * v10OuterRingRadius / v10Canvas;
  const inner = outer * v10RingRatio;

  for (const radius of [outer, inner]) {
    for (let sample = 0; sample < 1440; sample += 1) {
      const angle = sample / 1440 * Math.PI * 2;
      const x = centre + Math.cos(angle) * radius;
      const y = centre + Math.sin(angle) * radius;
      disc(data, size, x, y, 1.25, 244);
    }
  }

  return { width: size, height: size, data };
}

describe("v10 parity-only scanner", () => {
  test("infers rotation from the asymmetric Reed–Solomon field", () => {
    const observed = observeV10Orientation(starImage(73.5));
    expect(distance(observed.angle, 73.5)).toBeLessThanOrEqual(1);
    expect(observed.confidence).toBeGreaterThan(0.10);
  });

  test("maps the v10 field back through the unchanged v9 star classifier", () => {
    const parity = observeV10Parity(starImage());
    expect(parity).toHaveLength(128);
    expect(parity.some((value) => value.value !== null)).toBe(true);
    expect(parity.some((value) => value.position !== null)).toBe(true);
  });

  test("detects the astrology wheel outer and zodiac-inner ring pair", () => {
    const circle = detectV10OuterCircle(ringFrame());
    expect(circle).not.toBeNull();
    expect(Math.abs(circle!.x - 112)).toBeLessThan(5);
    expect(Math.abs(circle!.y - 112)).toBeLessThan(5);
    expect(Math.abs(circle!.radius - 104.16)).toBeLessThan(5);
  });
});
