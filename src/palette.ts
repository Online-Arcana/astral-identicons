import type { Palette, PaletteColour } from "./types.ts";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hash(value: string): number {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;

  return result >>> 0;
}

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
  else[red, blue] = [c, x];

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

  /*
   * colour() calculates luminance after conversion to reduced #RGB.
   * This means the final exported colour, rather than the temporary
   * full-length colour, is guaranteed to be sufficiently dark.
   */
  while (
    result.luminance > maximumLuminance &&
    lightness > minimumLightness
  ) {
    lightness = Math.max(minimumLightness, lightness - 0.01);
    result = colour(backgroundHue, saturation, lightness);
  }

  return result;
}

export function palette(seed: string): Palette {
  const centreHue = hash(seed) % 360;
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
