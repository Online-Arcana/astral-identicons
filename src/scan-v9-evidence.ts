export interface GreyReference {
  readonly background: number;
  readonly polarity: "lighter" | "darker" | "mixed";
  readonly contrast: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function luminanceAt(image: ImageData, x: number, y: number): number {
  const column = clamp(Math.round(x), 0, image.width - 1);
  const row = clamp(Math.round(y), 0, image.height - 1);
  const index = (row * image.width + column) * 4;
  return (
    image.data[index]! * 0.2126 +
    image.data[index + 1]! * 0.7152 +
    image.data[index + 2]! * 0.0722
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!;
}

function strongest(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  const start = Math.floor(values.length * 0.8);
  return median(values.slice(start));
}

export function greyReference(image: ImageData): GreyReference {
  const margin = Math.max(3, Math.round(image.width * 0.025));
  const backgroundSamples: number[] = [];
  const corners = [
    [margin, margin],
    [image.width - margin, margin],
    [margin, image.height - margin],
    [image.width - margin, image.height - margin]
  ] as const;

  for (const [x, y] of corners) {
    for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        backgroundSamples.push(luminanceAt(image, x + offsetX, y + offsetY));
      }
    }
  }

  const background = median(backgroundSamples);
  const brighter: number[] = [];
  const darker: number[] = [];
  const step = Math.max(4, Math.round(image.width / 96));
  const centre = image.width / 2;
  const radius = image.width * 0.48;

  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      if (Math.hypot(x - centre, y - centre) > radius) continue;
      const difference = luminanceAt(image, x, y) - background;
      if (difference > 0) brighter.push(difference);
      if (difference < 0) darker.push(-difference);
    }
  }

  const brightContrast = strongest(brighter);
  const darkContrast = strongest(darker);
  const maximum = Math.max(brightContrast, darkContrast, 1);
  const ratio = Math.min(brightContrast, darkContrast) / maximum;
  const polarity = ratio > 0.42
    ? "mixed"
    : brightContrast >= darkContrast
      ? "lighter"
      : "darker";

  return {
    background,
    polarity,
    contrast: maximum
  };
}

export function foregroundEvidence(
  image: ImageData,
  reference: GreyReference,
  x: number,
  y: number
): number {
  const difference = luminanceAt(image, x, y) - reference.background;
  const directed = reference.polarity === "lighter"
    ? difference
    : reference.polarity === "darker"
      ? -difference
      : Math.abs(difference);
  const normalised = directed / Math.max(12, reference.contrast);
  return clamp(normalised, 0, 1);
}

export function patchEvidence(
  image: ImageData,
  reference: GreyReference,
  x: number,
  y: number,
  radius: number
): number {
  const step = Math.max(1, Math.round(image.width / 512));
  let total = 0;
  let weight = 0;

  for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += step) {
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > radius) continue;
      const radialWeight = 1 - distance / Math.max(radius, 1);
      const sampleWeight = 0.35 + radialWeight * 0.65;
      total += foregroundEvidence(
        image,
        reference,
        x + offsetX,
        y + offsetY
      ) * sampleWeight;
      weight += sampleWeight;
    }
  }

  return weight === 0 ? 0 : total / weight;
}
