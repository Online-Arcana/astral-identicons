import type { IdenticonInput } from "./types.ts";
import type { Sign } from "./sign.ts";

export interface SigilPlacement {
  key: string;
  sign: Sign;
  x: number;
  y: number;
  size: number;
  role: string;
}

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
  const offset = 230;

  return [
    {
      key: "ascendant",
      sign: value.ascendant,
      x: centre - offset,
      y: centre - offset,
      size: 154,
      role: "Ascendant"
    },
    {
      key: "moon-top",
      sign: value.lunar,
      x: centre,
      y: centre - offset,
      size: 146,
      role: "Moon"
    },
    {
      key: "midheaven",
      sign: value.midheaven,
      x: centre + offset,
      y: centre - offset,
      size: 154,
      role: "Midheaven"
    },
    {
      key: "moon-left",
      sign: value.lunar,
      x: centre - offset,
      y: centre,
      size: 146,
      role: "Moon"
    },
    {
      key: "sun",
      sign: value.solar,
      x: centre,
      y: centre,
      size: 214,
      role: "Sun"
    },
    {
      key: "moon-right",
      sign: value.lunar,
      x: centre + offset,
      y: centre,
      size: 146,
      role: "Moon"
    },
    {
      key: "imum-coeli",
      sign: value.imumCoeli,
      x: centre - offset,
      y: centre + offset,
      size: 154,
      role: "Imum Coeli"
    },
    {
      key: "moon-bottom",
      sign: value.lunar,
      x: centre,
      y: centre + offset,
      size: 146,
      role: "Moon"
    },
    {
      key: "descendant",
      sign: value.descendant,
      x: centre + offset,
      y: centre + offset,
      size: 154,
      role: "Descendant"
    }
  ] as const;
}

export function ringPlacements(value: IdenticonInput): readonly RingPlacement[] {
  return [
    ringItem("solar-top", value.solar, 0, 88, "Sun"),
    ringItem("midheaven-ring", value.midheaven, 30, 58, "Midheaven"),
    ringItem("moon-north-east", value.lunar, 60, 72, "Moon"),
    ringItem("solar-right", value.solar, 90, 88, "Sun"),
    ringItem("moon-south-east", value.lunar, 120, 72, "Moon"),
    ringItem("imum-coeli-ring", value.imumCoeli, 150, 58, "Imum Coeli"),
    ringItem("solar-bottom", value.solar, 180, 88, "Sun"),
    ringItem("descendant-ring", value.descendant, 210, 58, "Descendant"),
    ringItem("moon-south-west", value.lunar, 240, 72, "Moon"),
    ringItem("solar-left", value.solar, 270, 88, "Sun"),
    ringItem("moon-north-west", value.lunar, 300, 72, "Moon"),
    ringItem("ascendant-ring", value.ascendant, 330, 58, "Ascendant")
  ] as const;
}