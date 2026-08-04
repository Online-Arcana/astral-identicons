import {
  glyphCarriers,
  glyphMark,
  glyphMarkCount,
  glyphMarkLengths
} from "./glyph-code.ts";
import {
  colourEvidence,
  pixel,
  type ObservedPalette
} from "./scan-colour.ts";
import type { ByteObservation } from "./star-parity.ts";
import type { IdenticonInput } from "./types.ts";

interface DigitObservation {
  readonly value: number | null;
  readonly confidence: number;
}

const placeholder: IdenticonInput = {
  seed: "glyph-code-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};
const carriers = glyphCarriers(placeholder);
const probeDistances = [2.5, 7.5, 12.5, 17.5] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function probe(
  image: ImageData,
  palette: ObservedPalette,
  x: number,
  y: number,
  unitX: number,
  unitY: number,
  distance: number
): number {
  const scale = image.width / 1024;
  const tangentX = -unitY;
  const tangentY = unitX;
  const values: number[] = [];

  for (const along of [-1, 0, 1]) {
    for (const across of [-2, -1, 0, 1, 2]) {
      const sampleX = (
        x + unitX * (distance + along) + tangentX * across
      ) * scale;
      const sampleY = (
        y + unitY * (distance + along) + tangentY * across
      ) * scale;

      values.push(colourEvidence(
        pixel(image, sampleX, sampleY),
        palette.background,
        palette.layer1
      ));
    }
  }

  values.sort((left, right) => right - left);
  const selected = values.slice(0, Math.max(3, Math.round(values.length * 0.45)));
  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function observeDigit(
  image: ImageData,
  palette: ObservedPalette,
  carrierIndex: number,
  markIndex: number
): DigitObservation {
  const carrier = carriers[carrierIndex]!;
  const reference = glyphMark(carrier, markIndex, 3);
  const radians = reference.angle * Math.PI / 180;
  const unitX = Math.cos(radians);
  const unitY = Math.sin(radians);
  const evidence = probeDistances.map((distance) => {
    return probe(
      image,
      palette,
      reference.startX,
      reference.startY,
      unitX,
      unitY,
      distance
    );
  });
  const scores = glyphMarkLengths.map((_length, digit) => {
    let score = 0;

    for (let index = 0; index < evidence.length; index += 1) {
      const expected = index <= digit;
      const value = evidence[index]!;
      score += expected ? value : (1 - value) * 0.8;
    }

    return score / evidence.length;
  });

  let best = 0;
  let second = Number.NEGATIVE_INFINITY;

  for (let digit = 1; digit < scores.length; digit += 1) {
    if (scores[digit]! > scores[best]!) {
      second = scores[best]!;
      best = digit;
      continue;
    }

    second = Math.max(second, scores[digit]!);
  }

  if (!Number.isFinite(second)) second = 0;
  const margin = scores[best]! - second;
  const confidence = clamp(margin / 0.35, 0, 1);

  if (scores[best]! < 0.58 || margin < 0.055 || evidence[0]! < 0.28) {
    return { value: null, confidence };
  }

  return { value: best, confidence };
}

function byteObservation(
  digits: readonly DigitObservation[]
): ByteObservation {
  if (digits.length !== 4) throw new Error("glyph byte requires four marks");
  if (digits.some((digit) => digit.value === null)) {
    return {
      value: null,
      confidence: Math.min(...digits.map((digit) => digit.confidence))
    };
  }

  let value = 0;
  for (let index = 0; index < digits.length; index += 1) {
    value |= digits[index]!.value! << (index * 2);
  }

  return {
    value,
    confidence: Math.min(...digits.map((digit) => digit.confidence))
  };
}

export function observeGlyphData(
  image: ImageData,
  palette: ObservedPalette
): readonly ByteObservation[] {
  return carriers.flatMap((_carrier, carrierIndex) => {
    const digits = Array.from({ length: glyphMarkCount }, (_unused, markIndex) => {
      return observeDigit(image, palette, carrierIndex, markIndex);
    });

    return [
      byteObservation(digits.slice(0, 4)),
      byteObservation(digits.slice(4, 8))
    ];
  });
}
