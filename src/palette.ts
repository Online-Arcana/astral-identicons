import { seedPaletteIndex } from "./seed.ts";
import type { Palette, PaletteColour } from "./types.ts";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const paletteHues = [
  0, 6, 13, 19, 23, 27, 38, 41,
  48, 49, 55, 56, 66, 72, 73, 80,
  83, 94, 101, 108, 113, 126, 128, 133,
  139, 143, 147, 154, 161, 162, 169, 173,
  176, 185, 188, 192, 199, 200, 203, 214,
  218, 222, 228, 235, 246, 253, 260, 267,
  274, 282, 288, 289, 295, 296, 306, 308,
  313, 319, 323, 327, 338, 341, 348, 353
] as const;

function hue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function hsl(h: number, saturation: number, lightness: number): Rgb {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue(h) / 60;
  const x = c * (1 - Math.abs((section % 2) - 1));
  const m = lightness - c / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (section < 1) [red, green] = [c, x];
  else if (section < 2) [red, green] = [x, c];
  else if (section < 3) [green, blue] = [c, x];
  else if (section < 4) [green, blue] = [x, c];
  else if (section < 5) [red, blue] = [x, c];
  else [red, blue] = [c, x];

  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255)
  };
}

function hex(rgb: Rgb): string {
  const part = (value: number): string => value.toString(16).padStart(2, "0").toUpperCase();
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

export function reduced(rgb: Rgb): string {
  const part = (value: number): string => {
    const nibble = Math.max(0, Math.min(15, Math.round(value / 17)));
    return nibble.toString(16).toUpperCase();
  };

  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

function channel(value: number): number {
  const normalised = value / 255;
  return normalised <= 0.04045
    ? normalised / 12.92
    : ((normalised + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function fromReduced(value: string): Rgb {
  const digits = value.slice(1).split("");
  return {
    r: Number.parseInt(digits[0]! + digits[0]!, 16),
    g: Number.parseInt(digits[1]! + digits[1]!, 16),
    b: Number.parseInt(digits[2]! + digits[2]!, 16)
  };
}

function colour(h: number, saturation: number, lightness: number): PaletteColour {
  const rgb = hsl(h, saturation, lightness);
  const compact = reduced(rgb);

  return {
    hue: hue(h),
    full: hex(rgb),
    reduced: compact,
    luminance: luminance(fromReduced(compact))
  };
}

function backgroundColour(sourceHue: number): PaletteColour {
  const backgroundHue = hue(Math.round(sourceHue / 15) * 15);
  const saturation = 0.52;
  const maximumLuminance = 0.04;
  const minimumLightness = 0.06;

  let lightness = 0.28;
  let result = colour(backgroundHue, saturation, lightness);

  while (
    result.luminance > maximumLuminance &&
    lightness > minimumLightness
  ) {
    lightness = Math.max(minimumLightness, lightness - 0.01);
    result = colour(backgroundHue, saturation, lightness);
  }

  return result;
}

function paletteFromHue(centreHue: number): Palette {
  const hues = [centreHue - 60, centreHue, centreHue + 60] as const;
  const source = hues.map((value) => colour(value, 0.85, 0.67)) as [
    PaletteColour,
    PaletteColour,
    PaletteColour
  ];

  const ordered = source
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value.luminance - right.value.luminance);

  const darkest = ordered[0]!;
  const foregrounds = ordered
    .slice(1)
    .map(({ value }) => value)
    .sort((left, right) => right.luminance - left.luminance);

  return {
    background: backgroundColour(darkest.value.hue),
    layer0: foregrounds[0]!,
    layer1: foregrounds[1]!,
    source
  };
}

function paletteKey(value: Palette): string {
  return [
    value.background.reduced,
    value.layer0.reduced,
    value.layer1.reduced
  ].join("|");
}

const codebook = paletteHues.map((value) => paletteFromHue(value));
const paletteIndices = new Map(
  codebook.map((value, index) => [paletteKey(value), index])
);

if (paletteIndices.size !== paletteHues.length) {
  throw new Error("visual palette codebook must contain 64 unique palettes");
}

export function paletteForIndex(index: number): Palette {
  if (!Number.isInteger(index) || index < 0 || index >= codebook.length) {
    throw new Error("palette index must be between 0 and 63");
  }

  return codebook[index]!;
}

export function paletteIndexFromReduced(
  background: string,
  layer0: string,
  layer1: string
): number {
  const index = paletteIndices.get([background, layer0, layer1].join("|"));
  if (index === undefined) throw new Error("colours are not a visual seed palette");
  return index;
}

export function palette(seed: string): Palette {
  return paletteForIndex(seedPaletteIndex(seed));
}
