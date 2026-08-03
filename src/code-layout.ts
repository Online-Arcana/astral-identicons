import { centre, innerRingRadius, ringStroke } from "./layout.ts";
import {
  paletteCorrectionSectorCount,
  paletteCorrectionTrackCount,
  seedSlotCount
} from "./seed.ts";

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
export const codeTrackCount = paletteCorrectionTrackCount;
export const codeSectorCount = paletteCorrectionSectorCount;
export const codeBitOffset = 12;
export const codeBitSeparation = codeBitOffset * 2;
export const codeTrackRadii = [175, 230, 285, 340] as const;

if (codeTrackRadii.length !== codeTrackCount) {
  throw new Error("correction track geometry does not match the palette code");
}

export const codeAnchors: readonly CodeAnchor[] = [
  { angle: -90, radius: 374, size: 20 },
  { angle: 134, radius: 372, size: 16 },
  { angle: 246, radius: 370, size: 12 }
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

function codeSlotGeometry(slot: number): {
  angle: number;
  radius: number;
  track: number;
  sector: number;
} {
  if (!Number.isInteger(slot) || slot < 0 || slot >= seedSlotCount) {
    throw new Error(`correction slot must be between 0 and ${seedSlotCount - 1}`);
  }

  const track = Math.floor(slot / codeSectorCount);
  const sector = slot % codeSectorCount;
  const phase = track % 2 === 0 ? 0 : 0.5;
  const angle = ((sector + phase) / codeSectorCount) * Math.PI * 2 - Math.PI / 2;

  return {
    angle,
    radius: codeTrackRadii[track]!,
    track,
    sector
  };
}

export function codeSlotPoint(slot: number): Point {
  const geometry = codeSlotGeometry(slot);

  return {
    x: centre + Math.cos(geometry.angle) * geometry.radius,
    y: centre + Math.sin(geometry.angle) * geometry.radius
  };
}

export function codeSymbolPoint(slot: number, bit: 0 | 1): Point {
  if (bit !== 0 && bit !== 1) {
    throw new Error("palette correction symbols must be binary");
  }

  const geometry = codeSlotGeometry(slot);
  const radius = geometry.radius + (bit === 0 ? -codeBitOffset : codeBitOffset);

  return {
    x: centre + Math.cos(geometry.angle) * radius,
    y: centre + Math.sin(geometry.angle) * radius
  };
}
