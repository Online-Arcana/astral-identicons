import { placements, ringPlacements } from "./layout.ts";
import { seedDataByteCount, seedPayload } from "./seed.ts";
import type { Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";

export interface GlyphCarrier {
  readonly index: number;
  readonly key: string;
  readonly group: "centre" | "ring";
  readonly sign: Sign;
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly byteOffset: number;
}

export interface GlyphMark {
  readonly carrier: GlyphCarrier;
  readonly index: number;
  readonly digit: number;
  readonly angle: number;
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly length: number;
  readonly radialOffset: number;
}

export const glyphCarrierCount = 20;
export const glyphBytesPerCarrier = 2;
export const glyphMarkCount = 8;
export const glyphMarkOffsets = [0, 10, 20, 30] as const;
export const glyphMarkLength = 6;
export const glyphMarkStroke = 4;
export const glyphMarkHaloStroke = 9;

if (glyphCarrierCount * glyphBytesPerCarrier !== seedDataByteCount) {
  throw new Error("glyph carriers must contain the complete payload data section");
}

function carrierRadius(size: number): number {
  return size * 0.48 + 2;
}

export function glyphCarriers(value: IdenticonInput): readonly GlyphCarrier[] {
  const centre = placements(value)
    .filter((placement) => placement.key !== "sun")
    .map((placement) => ({
      key: placement.key,
      group: "centre" as const,
      sign: placement.sign,
      role: placement.role,
      x: placement.x,
      y: placement.y,
      size: placement.size
    }));
  const ring = ringPlacements(value).map((placement) => ({
    key: placement.key,
    group: "ring" as const,
    sign: placement.sign,
    role: placement.role,
    x: placement.x,
    y: placement.y,
    size: placement.size
  }));
  const values = [...centre, ...ring];

  if (values.length !== glyphCarrierCount) {
    throw new Error(`expected ${glyphCarrierCount} glyph data carriers`);
  }

  return values.map((carrier, index) => ({
    ...carrier,
    index,
    byteOffset: index * glyphBytesPerCarrier
  }));
}

export function glyphCarrierBytes(
  value: IdenticonInput,
  carrier: GlyphCarrier
): readonly [number, number] {
  const payload = seedPayload(value);
  return [
    payload[carrier.byteOffset]!,
    payload[carrier.byteOffset + 1]!
  ];
}

export function glyphCarrierDigits(
  value: IdenticonInput,
  carrier: GlyphCarrier
): readonly number[] {
  const [first, second] = glyphCarrierBytes(value, carrier);
  const word = first | (second << 8);

  return Array.from({ length: glyphMarkCount }, (_unused, index) => {
    return (word >>> (index * 2)) & 0x03;
  });
}

export function glyphMark(
  carrier: GlyphCarrier,
  index: number,
  digit: number
): GlyphMark {
  if (!Number.isInteger(index) || index < 0 || index >= glyphMarkCount) {
    throw new Error(`glyph mark index must be between 0 and ${glyphMarkCount - 1}`);
  }
  if (!Number.isInteger(digit) || digit < 0 || digit > 3) {
    throw new Error("glyph mark digit must be between 0 and 3");
  }

  const angle = -67.5 + index * 45;
  const radians = angle * Math.PI / 180;
  const radialOffset = glyphMarkOffsets[digit]!;
  const radius = carrierRadius(carrier.size) + radialOffset;
  const unitX = Math.cos(radians);
  const unitY = Math.sin(radians);
  const startX = carrier.x + unitX * radius;
  const startY = carrier.y + unitY * radius;

  return {
    carrier,
    index,
    digit,
    angle,
    startX,
    startY,
    endX: startX + unitX * glyphMarkLength,
    endY: startY + unitY * glyphMarkLength,
    length: glyphMarkLength,
    radialOffset
  };
}

export function glyphMarks(value: IdenticonInput): readonly GlyphMark[] {
  return glyphCarriers(value).flatMap((carrier) => {
    const digits = glyphCarrierDigits(value, carrier);
    return digits.map((digit, index) => glyphMark(carrier, index, digit));
  });
}
