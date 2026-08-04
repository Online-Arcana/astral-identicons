import { centre, innerRingRadius, ringStroke } from "./layout.ts";
import { seedSlotCount } from "./seed.ts";

export interface Point {
  x: number;
  y: number;
}

export interface NorthStarReference {
  readonly angle: number;
  readonly radius: number;
  readonly size: number;
  readonly opacity: number;
}

export type CodeAnchor = NorthStarReference;

const innerGap = 8;
export const innerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;
export const codeTrackCount = 4;
export const codeSectorCount = seedSlotCount / codeTrackCount;
export const codeSymbolSpacing = 10;
export const codeTrackRadii = [220, 265, 310, 355] as const;

if (!Number.isInteger(codeSectorCount)) {
  throw new Error("seed slots must divide evenly across code tracks");
}

export const northStar: NorthStarReference = {
  angle: -90,
  radius: 366,
  size: 34,
  opacity: 1
};

export const codeAnchors: readonly CodeAnchor[] = [northStar];

export function rotatePoint(point: Point, angle: number): Point {
  if (angle === 0) return point;

  const radians = (angle * Math.PI) / 180;
  const x = point.x - centre;
  const y = point.y - centre;

  return {
    x: centre + x * Math.cos(radians) - y * Math.sin(radians),
    y: centre + x * Math.sin(radians) + y * Math.cos(radians)
  };
}

export function codeAnchorPoint(anchor: CodeAnchor): Point {
  const radians = (anchor.angle * Math.PI) / 180;

  return {
    x: centre + Math.cos(radians) * anchor.radius,
    y: centre + Math.sin(radians) * anchor.radius
  };
}

export function northStarPoint(): Point {
  return codeAnchorPoint(northStar);
}

function codeSlotGeometry(slot: number): {
  angle: number;
  radius: number;
} {
  if (!Number.isInteger(slot) || slot < 0 || slot >= seedSlotCount) {
    throw new Error(`code slot must be between 0 and ${seedSlotCount - 1}`);
  }

  const track = Math.floor(slot / codeSectorCount);
  const sector = slot % codeSectorCount;
  const phase = track % 2 === 0 ? 0 : 0.5;
  const angle = ((sector + phase) / codeSectorCount) * Math.PI * 2 - Math.PI / 2;

  return {
    angle,
    radius: codeTrackRadii[track]!
  };
}

export function codeSlotPoint(slot: number): Point {
  const geometry = codeSlotGeometry(slot);

  return {
    x: centre + Math.cos(geometry.angle) * geometry.radius,
    y: centre + Math.sin(geometry.angle) * geometry.radius
  };
}

export function codeSymbolPoint(slot: number, value: number): Point {
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    throw new Error("code symbol must be a hexadecimal nibble");
  }

  const geometry = codeSlotGeometry(slot);
  const base = codeSlotPoint(slot);
  const column = value >>> 2;
  const row = value & 0x03;
  const tangent = (column - 1.5) * codeSymbolSpacing;
  const radial = (row - 1.5) * codeSymbolSpacing;
  const radialX = Math.cos(geometry.angle);
  const radialY = Math.sin(geometry.angle);
  const tangentX = -radialY;
  const tangentY = radialX;

  return {
    x: base.x + tangentX * tangent + radialX * radial,
    y: base.y + tangentY * tangent + radialY * radial
  };
}
