import type { Sign } from "../../sign.ts";

export interface LiteralSignIdentity {
  solar: Sign;
  lunar: Sign;
  ascendant: Sign;
  midheaven: Sign;
  descendant: Sign;
  imumCoeli: Sign;
}

export interface LiteralSignGridPlacement {
  key: string;
  sign: Sign;
  x: number;
  y: number;
  size: number;
  role: string;
}

export interface LiteralSignGridGeometry {
  centre: number;
  offset: number;
}

export const defaultLiteralSignGridGeometry: LiteralSignGridGeometry = {
  centre: 512,
  offset: 230,
};

export function literalSignGridPlacements(
  value: LiteralSignIdentity,
  geometry: LiteralSignGridGeometry = defaultLiteralSignGridGeometry,
): readonly LiteralSignGridPlacement[] {
  const { centre, offset } = geometry;
  return [
    {
      key: "ascendant",
      sign: value.ascendant,
      x: centre - offset,
      y: centre - offset,
      size: 154,
      role: "Ascendant",
    },
    {
      key: "moon-top",
      sign: value.lunar,
      x: centre,
      y: centre - offset,
      size: 146,
      role: "Moon",
    },
    {
      key: "midheaven",
      sign: value.midheaven,
      x: centre + offset,
      y: centre - offset,
      size: 154,
      role: "Midheaven",
    },
    {
      key: "moon-left",
      sign: value.lunar,
      x: centre - offset,
      y: centre,
      size: 146,
      role: "Moon",
    },
    {
      key: "sun",
      sign: value.solar,
      x: centre,
      y: centre,
      size: 214,
      role: "Sun",
    },
    {
      key: "moon-right",
      sign: value.lunar,
      x: centre + offset,
      y: centre,
      size: 146,
      role: "Moon",
    },
    {
      key: "imum-coeli",
      sign: value.imumCoeli,
      x: centre - offset,
      y: centre + offset,
      size: 154,
      role: "Imum Coeli",
    },
    {
      key: "moon-bottom",
      sign: value.lunar,
      x: centre,
      y: centre + offset,
      size: 146,
      role: "Moon",
    },
    {
      key: "descendant",
      sign: value.descendant,
      x: centre + offset,
      y: centre + offset,
      size: 154,
      role: "Descendant",
    },
  ] as const;
}
