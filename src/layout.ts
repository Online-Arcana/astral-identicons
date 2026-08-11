import { literalSignGridPlacements } from "./legacy/renderer/literalSignGrid.ts";
import type { LiteralSignGridPlacement } from "./legacy/renderer/literalSignGrid.ts";
import type { IdenticonInput } from "./types.ts";
import type { Sign } from "./sign.ts";

export type SigilPlacement = LiteralSignGridPlacement;

export interface RingPlacement {
  key: string;
  sign: Sign;
  x: number;
  y: number;
  size: number;
  role: string;
  angle: number;
}

export const canvas = 1024;
export const centre = canvas / 2;

export const outerRingRadius = 486;
export const innerRingRadius = 396;
export const ringStroke = 8;
export const ringGlyphRadius = (outerRingRadius + innerRingRadius) / 2;

export function layer0Bounds(): { x: number; y: number; size: number } {
  const size = (innerRingRadius * 2) / Math.SQRT2;
  const x = centre - size / 2;
  const y = centre - size / 2;

  return { x, y, size };
}

function point(angle: number, radius = ringGlyphRadius): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;

  return {
    x: centre + Math.sin(radians) * radius,
    y: centre - Math.cos(radians) * radius
  };
}

function ringItem(
  key: string,
  sign: Sign,
  angle: number,
  size: number,
  role: string
): RingPlacement {
  const { x, y } = point(angle);

  return {
    key,
    sign,
    x,
    y,
    size,
    role,
    angle
  };
}

export function placements(value: IdenticonInput): readonly SigilPlacement[] {
  return literalSignGridPlacements(value, { centre, offset: 230 });
}

export function ringPlacements(value: IdenticonInput): readonly RingPlacement[] {
  return [
    ringItem("solar-top", value.solar, 0, 88, "Sun"),
    ringItem("midheaven-ring", value.midheaven, 30, 58, "Midheaven"),
    ringItem("moon-north-east", value.lunar, 60, 72, "Moon"),
    ringItem("solar-right", value.solar, 90, 88, "Sun"),
    ringItem("moon-south-east", value.lunar, 120, 72, "Moon"),
    ringItem("descendant-ring", value.descendant, 150, 58, "Descendant"),
    ringItem("solar-bottom", value.solar, 180, 88, "Sun"),
    ringItem("imum-coeli-ring", value.imumCoeli, 210, 58, "Imum Coeli"),
    ringItem("moon-south-west", value.lunar, 240, 72, "Moon"),
    ringItem("solar-left", value.solar, 270, 88, "Sun"),
    ringItem("moon-north-west", value.lunar, 300, 72, "Moon"),
    ringItem("ascendant-ring", value.ascendant, 330, 58, "Ascendant")
  ] as const;
}
