import {
  codeAnchorPoint,
  codeAnchors,
  rotatePoint
} from "./code-layout.ts";
import { centre } from "./layout.ts";
import { paletteForIndex } from "./palette.ts";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ObservedPalette {
  background: Rgb;
  layer0: Rgb;
  layer1: Rgb;
  index: number;
  confidence: number;
}

interface Cluster {
  colour: Rgb;
  values: Rgb[];
}

const liveCaptureConfidenceCeiling = 0.39;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function distance(left: Rgb, right: Rgb): number {
  return Math.hypot(
    left.r - right.r,
    left.g - right.g,
    left.b - right.b
  );
}

function brightness(value: Rgb): number {
  return value.r * 0.2126 + value.g * 0.7152 + value.b * 0.0722;
}

function mean(values: readonly Rgb[]): Rgb {
  if (values.length === 0) return { r: 0, g: 0, b: 0 };

  let red = 0;
  let green = 0;
  let blue = 0;

  for (const value of values) {
    red += value.r;
    green += value.g;
    blue += value.b;
  }

  return {
    r: red / values.length,
    g: green / values.length,
    b: blue / values.length
  };
}

export function pixel(image: ImageData, x: number, y: number): Rgb {
  const column = clamp(Math.round(x), 0, image.width - 1);
  const row = clamp(Math.round(y), 0, image.height - 1);
  const index = (row * image.width + column) * 4;

  return {
    r: image.data[index]!,
    g: image.data[index + 1]!,
    b: image.data[index + 2]!
  };
}

function reducedRgb(value: string): Rgb {
  const digits = value.slice(1).split("");

  return {
    r: Number.parseInt(digits[0]! + digits[0]!, 16),
    g: Number.parseInt(digits[1]! + digits[1]!, 16),
    b: Number.parseInt(digits[2]! + digits[2]!, 16)
  };
}

function chroma(value: Rgb): Rgb {
  const total = Math.max(1, value.r + value.g + value.b);

  return {
    r: value.r / total,
    g: value.g / total,
    b: value.b / total
  };
}

function colourCost(observed: Rgb, expected: Rgb): number {
  const observedChroma = chroma(observed);
  const expectedChroma = chroma(expected);
  const chromaCost = distance(observedChroma, expectedChroma) * 480;
  const observedLight = brightness(observed) / 255;
  const expectedLight = brightness(expected) / 255;
  const lightCost = Math.abs(observedLight - expectedLight) * 0.35;

  return chromaCost + lightCost;
}

function paletteCost(
  background: Rgb,
  layer0: Rgb,
  layer1: Rgb,
  index: number
): number {
  const value = paletteForIndex(index);

  return (
    colourCost(background, reducedRgb(value.background.reduced)) * 1.6 +
    colourCost(layer0, reducedRgb(value.layer0.reduced)) +
    colourCost(layer1, reducedRgb(value.layer1.reduced)) * 1.25
  );
}

function cornerColour(image: ImageData): Rgb {
  const values: Rgb[] = [];
  const margin = Math.max(8, Math.round(image.width * 0.035));
  const corners = [
    [margin, margin],
    [image.width - margin, margin],
    [margin, image.height - margin],
    [image.width - margin, image.height - margin]
  ] as const;

  for (const [x, y] of corners) {
    for (let offsetY = -4; offsetY <= 4; offsetY += 2) {
      for (let offsetX = -4; offsetX <= 4; offsetX += 2) {
        values.push(pixel(image, x + offsetX, y + offsetY));
      }
    }
  }

  return mean(values);
}

function ringColour(image: ImageData): Rgb {
  const values: Rgb[] = [];
  const scale = image.width / 1024;

  for (let angle = 0; angle < 360; angle += 3) {
    const radians = (angle * Math.PI) / 180;

    for (const radius of [394, 396, 398, 484, 486, 488]) {
      values.push(pixel(
        image,
        image.width / 2 + Math.sin(radians) * radius * scale,
        image.height / 2 - Math.cos(radians) * radius * scale
      ));
    }
  }

  return mean(values);
}

function samples(image: ImageData): Rgb[] {
  const values: Rgb[] = [];
  const radius = image.width * 0.49;
  const center = image.width / 2;
  const step = Math.max(4, Math.round(image.width / 150));

  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      if (Math.hypot(x - center, y - center) > radius) continue;
      values.push(pixel(image, x, y));
    }
  }

  return values;
}

function clusterColours(image: ImageData): readonly Cluster[] {
  const values = samples(image);
  const background = cornerColour(image);
  let first = values[0] ?? background;
  let firstDistance = -1;

  for (const value of values) {
    const valueDistance = distance(value, background);
    if (valueDistance <= firstDistance) continue;
    first = value;
    firstDistance = valueDistance;
  }

  let second = values[0] ?? background;
  let secondDistance = -1;

  for (const value of values) {
    const valueDistance = Math.min(
      distance(value, background),
      distance(value, first)
    );

    if (valueDistance <= secondDistance) continue;
    second = value;
    secondDistance = valueDistance;
  }

  let centres = [background, first, second];

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const groups: Rgb[][] = [[], [], []];

    for (const value of values) {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < centres.length; index += 1) {
        const valueDistance = distance(value, centres[index]!);
        if (valueDistance >= nearestDistance) continue;
        nearest = index;
        nearestDistance = valueDistance;
      }

      groups[nearest]!.push(value);
    }

    centres = groups.map((group, index) => {
      return group.length === 0 ? centres[index]! : mean(group);
    });
  }

  return centres.map((colour, index) => ({
    colour,
    values: values.filter((value) => {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let candidate = 0; candidate < centres.length; candidate += 1) {
        const valueDistance = distance(value, centres[candidate]!);
        if (valueDistance >= nearestDistance) continue;
        nearest = candidate;
        nearestDistance = valueDistance;
      }

      return nearest === index;
    })
  }));
}

export function matchPalette(
  background: Rgb,
  layer0: Rgb,
  layer1: Rgb
): { index: number; cost: number; secondCost: number } {
  let index = 0;
  let cost = Number.POSITIVE_INFINITY;
  let secondCost = Number.POSITIVE_INFINITY;

  for (let candidate = 0; candidate < 64; candidate += 1) {
    const candidateCost = paletteCost(background, layer0, layer1, candidate);

    if (candidateCost < cost) {
      secondCost = cost;
      cost = candidateCost;
      index = candidate;
      continue;
    }

    if (candidateCost < secondCost) secondCost = candidateCost;
  }

  return { index, cost, secondCost };
}

export function swapPalette(value: ObservedPalette): ObservedPalette {
  return {
    ...value,
    layer0: value.layer1,
    layer1: value.layer0
  };
}

export function alignPaletteToIndex(
  value: ObservedPalette,
  index: number
): ObservedPalette {
  const normalCost = paletteCost(
    value.background,
    value.layer0,
    value.layer1,
    index
  );
  const swappedCost = paletteCost(
    value.background,
    value.layer1,
    value.layer0,
    index
  );
  const swapped = swappedCost < normalCost;
  const best = swapped ? swappedCost : normalCost;
  const second = swapped ? normalCost : swappedCost;
  const result = swapped ? swapPalette(value) : value;

  return {
    ...result,
    index,
    confidence: clamp((second - best) / Math.max(0.01, second), 0, 1)
  };
}

export function observePalette(image: ImageData): ObservedPalette {
  const clusters = [...clusterColours(image)];
  const backgroundSample = cornerColour(image);
  const ringSample = ringColour(image);

  clusters.sort((left, right) => {
    return distance(left.colour, backgroundSample) - distance(right.colour, backgroundSample);
  });

  const background = clusters.shift()?.colour ?? backgroundSample;
  if (clusters.length !== 2) throw new Error("Could not isolate identicon colours");

  clusters.sort((left, right) => {
    return distance(left.colour, ringSample) - distance(right.colour, ringSample);
  });

  const firstLayer1 = clusters[0]!.colour;
  const firstLayer0 = clusters[1]!.colour;
  const first = matchPalette(background, firstLayer0, firstLayer1);
  const second = matchPalette(background, firstLayer1, firstLayer0);
  const swapped = second.cost < first.cost;
  const best = swapped ? second : first;
  const layer0 = swapped ? firstLayer1 : firstLayer0;
  const layer1 = swapped ? firstLayer0 : firstLayer1;
  const gap = Math.max(0, best.secondCost - best.cost);
  const confidence = clamp(gap / Math.max(0.01, best.secondCost), 0, 1);

  return {
    background,
    layer0,
    layer1,
    index: best.index,
    // The live frame palette is only an orientation hint. The exact palette is
    // checked after Reed-Solomon reconstruction against the frozen evidence.
    // Keeping this soft prevents a shaky final frame from vetoing capture.
    confidence: Math.min(liveCaptureConfidenceCeiling, confidence)
  };
}

export function colourEvidence(value: Rgb, background: Rgb, target: Rgb): number {
  const red = target.r - background.r;
  const green = target.g - background.g;
  const blue = target.b - background.b;
  const length = red * red + green * green + blue * blue;

  if (length < 1) return 0;

  const valueRed = value.r - background.r;
  const valueGreen = value.g - background.g;
  const valueBlue = value.b - background.b;
  const projection = (
    valueRed * red +
    valueGreen * green +
    valueBlue * blue
  ) / length;

  const projected = {
    r: background.r + red * projection,
    g: background.g + green * projection,
    b: background.b + blue * projection
  };

  const perpendicular = distance(value, projected) / 255;
  return clamp(projection - perpendicular * 1.7, 0, 1);
}

function strongestEvidence(
  image: ImageData,
  x: number,
  y: number,
  radius: number,
  background: Rgb,
  target: Rgb
): number {
  const values: number[] = [];

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;

      values.push(colourEvidence(
        pixel(image, x + offsetX, y + offsetY),
        background,
        target
      ));
    }
  }

  values.sort((left, right) => right - left);
  const count = Math.max(3, Math.round(values.length * 0.18));
  const selected = values.slice(0, count);

  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function anchorScore(
  image: ImageData,
  palette: ObservedPalette,
  angle: number
): number {
  const scale = image.width / 1024;
  let score = 0;

  for (let index = 0; index < codeAnchors.length; index += 1) {
    const anchor = codeAnchors[index]!;
    const point = rotatePoint(codeAnchorPoint(anchor), angle);
    const evidence = strongestEvidence(
      image,
      point.x * scale,
      point.y * scale,
      Math.max(3, Math.round(anchor.size * scale * 0.42)),
      palette.background,
      palette.layer0
    );

    score += evidence * (codeAnchors.length - index);
  }

  return score;
}

export function findOrientation(
  image: ImageData,
  palette: ObservedPalette
): { angle: number; confidence: number } {
  let bestAngle = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondScore = Number.NEGATIVE_INFINITY;

  for (let angle = 0; angle < 360; angle += 2) {
    const score = anchorScore(image, palette, angle);

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestAngle = angle;
      continue;
    }

    if (score > secondScore) secondScore = score;
  }

  let refinedAngle = bestAngle;
  let refinedScore = bestScore;

  for (let offset = -2; offset <= 2; offset += 0.25) {
    const angle = (bestAngle + offset + 360) % 360;
    const score = anchorScore(image, palette, angle);
    if (score <= refinedScore) continue;
    refinedAngle = angle;
    refinedScore = score;
  }

  return {
    angle: refinedAngle,
    confidence: clamp(
      (refinedScore - secondScore) / Math.max(0.01, refinedScore),
      0,
      1
    )
  };
}

export function centreDistance(point: { x: number; y: number }): number {
  return Math.hypot(point.x - centre, point.y - centre);
}
