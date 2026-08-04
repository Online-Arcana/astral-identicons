import {
  glyphCarriers,
  glyphMark,
  glyphMarkCount
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function markEvidence(
  image: ImageData,
  palette: ObservedPalette,
  carrierIndex: number,
  markIndex: number,
  digit: number
): number {
  const mark = glyphMark(carriers[carrierIndex]!, markIndex, digit);
  const radians = mark.angle * Math.PI / 180;
  const unitX = Math.cos(radians);
  const unitY = Math.sin(radians);
  const tangentX = -unitY;
  const tangentY = unitX;
  const centreX = (mark.startX + mark.endX) / 2;
  const centreY = (mark.startY + mark.endY) / 2;
  const scale = image.width / 1024;
  const values: number[] = [];

  for (const along of [-2, -1, 0, 1, 2]) {
    for (const across of [-3, -2, -1, 0, 1, 2, 3]) {
      values.push(colourEvidence(
        pixel(
          image,
          (centreX + unitX * along + tangentX * across) * scale,
          (centreY + unitY * along + tangentY * across) * scale
        ),
        palette.background,
        palette.layer1
      ));
    }
  }

  values.sort((left, right) => right - left);
  const selected = values.slice(0, Math.max(5, Math.round(values.length * 0.34)));
  return selected.reduce((sum, value) => sum + value, 0) /
    Math.max(1, selected.length);
}

function observeDigit(
  image: ImageData,
  palette: ObservedPalette,
  carrierIndex: number,
  markIndex: number
): DigitObservation {
  const evidence = Array.from({ length: 4 }, (_unused, digit) => {
    return markEvidence(image, palette, carrierIndex, markIndex, digit);
  });
  let best = 0;
  let second = 0;

  for (let digit = 1; digit < evidence.length; digit += 1) {
    if (evidence[digit]! > evidence[best]!) {
      second = best;
      best = digit;
      continue;
    }

    if (digit !== best && evidence[digit]! > evidence[second]!) {
      second = digit;
    }
  }

  if (second === best) {
    second = best === 0 ? 1 : 0;
    for (let digit = 0; digit < evidence.length; digit += 1) {
      if (digit === best) continue;
      if (evidence[digit]! > evidence[second]!) second = digit;
    }
  }

  const margin = evidence[best]! - evidence[second]!;
  const confidence = clamp(margin / Math.max(0.12, evidence[best]!), 0, 1);

  if (evidence[best]! < 0.22 || margin < 0.065) {
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
