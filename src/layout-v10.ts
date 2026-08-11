import {
  parityAnchorPoint,
  parityStarSizes,
  v9InnerClipRadius
} from "./layout-v9.ts";

export interface V10Point {
  readonly x: number;
  readonly y: number;
}

export const v10Canvas = 800;
export const v10Centre = v10Canvas / 2;
export const v10OuterRingRadius = 372;
export const v10ZodiacInnerRadius = 316;
export const v10AspectRadius = 210;
export const v10OverlayRadius = v10AspectRadius - 8;
export const v10OverlayScale = v10OverlayRadius / v9InnerClipRadius;
export const v10RingRatio = v10ZodiacInnerRadius / v10OuterRingRadius;

export const v10ParityStarSizes = parityStarSizes.map((size) => {
  return size * v10OverlayScale;
}) as readonly number[];

export function v10ParityAnchorPoint(group: number, position: number): V10Point {
  const source = parityAnchorPoint(group, position);
  return {
    x: v10Centre + (source.x - 512) * v10OverlayScale,
    y: v10Centre + (source.y - 512) * v10OverlayScale
  };
}

export function rotateV10Point(point: V10Point, angleDegrees: number): V10Point {
  if (angleDegrees === 0) return point;
  const angle = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = point.x - v10Centre;
  const y = point.y - v10Centre;
  return {
    x: v10Centre + x * cosine - y * sine,
    y: v10Centre + x * sine + y * cosine
  };
}
