import { centre, innerRingRadius, ringStroke } from "./layout.ts";
import { seedSlotCount } from "./seed.ts";

export interface Point {
  x: number;
  y: number;
}

export interface CodeAnchor {
  angle: number;
  radius: number;
  size: number;
}

const innerGap = 8;
export const innerClipRadius = innerRingRadius - ringStroke / 2 - innerGap;
export const starCodeRadius = innerClipRadius - 54;
export const goldenAngle = Math.PI * (3 - Math.sqrt(5));

export const codeAnchors: readonly CodeAnchor[] = [
  { angle: -90, radius: 358, size: 28 },
  { angle: 134, radius: 354, size: 20 },
  { angle: 246, radius: 350, size: 14 }
] as const;

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

export function codeSlotPoint(slot: number): Point {
  if (!Number.isInteger(slot) || slot < 0 || slot >= seedSlotCount) {
    throw new Error(`code slot must be between 0 and ${seedSlotCount - 1}`);
  }

  const fraction = (slot + 0.5) / seedSlotCount;
  const radius = 42 + Math.sqrt(fraction) * (starCodeRadius - 42);
  const angle = slot * goldenAngle - Math.PI / 2;

  return {
    x: centre + Math.cos(angle) * radius,
    y: centre + Math.sin(angle) * radius
  };
}

export function codeSymbolPoint(slot: number, value: number): Point {
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    throw new Error("code symbol must be a hexadecimal nibble");
  }

  const base = codeSlotPoint(slot);
  const column = value >>> 2;
  const row = value & 0x03;
  const spacing = 8;

  return {
    x: base.x + (column - 1.5) * spacing,
    y: base.y + (row - 1.5) * spacing
  };
}
