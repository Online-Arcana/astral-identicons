import {
  v10Canvas,
  v10Centre,
  v10OverlayScale
} from "./layout-v10.ts";
import {
  observeV9Parity,
  type V9ParityObservation
} from "./scan-v9-parity.ts";

const expandedSize = 512;
const v9Canvas = 1024;
const v9Centre = v9Canvas / 2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function sample(
  image: ImageData,
  x: number,
  y: number,
  channel: number
): number {
  const left = clamp(Math.floor(x), 0, image.width - 1);
  const top = clamp(Math.floor(y), 0, image.height - 1);
  const right = clamp(left + 1, 0, image.width - 1);
  const bottom = clamp(top + 1, 0, image.height - 1);
  const dx = clamp(x - left, 0, 1);
  const dy = clamp(y - top, 0, 1);
  const index = (row: number, column: number): number =>
    (row * image.width + column) * 4 + channel;
  const upper = image.data[index(top, left)]! * (1 - dx) +
    image.data[index(top, right)]! * dx;
  const lower = image.data[index(bottom, left)]! * (1 - dx) +
    image.data[index(bottom, right)]! * dx;
  return upper * (1 - dy) + lower * dy;
}

/**
 * V10 draws the unchanged v9 parity geometry through a centre-preserving scale
 * into the natal wheel's aspect area. Expand that exact affine transform back
 * into the scanner's established v9 parity coordinate space so the mature
 * star classifier remains the single decoder for position, size and fading.
 */
export function expandV10ParityImage(image: ImageData): ImageData {
  if (image.width !== image.height || image.width < 128) {
    throw new Error("v10 parity expansion requires a square normalised image");
  }

  const data = new Uint8ClampedArray(expandedSize * expandedSize * 4);
  const inputScale = image.width / v10Canvas;

  for (let y = 0; y < expandedSize; y += 1) {
    const v9Y = (y + 0.5) / expandedSize * v9Canvas;
    const v10Y = v10Centre + (v9Y - v9Centre) * v10OverlayScale;
    const sourceY = v10Y * inputScale - 0.5;

    for (let x = 0; x < expandedSize; x += 1) {
      const v9X = (x + 0.5) / expandedSize * v9Canvas;
      const v10X = v10Centre + (v9X - v9Centre) * v10OverlayScale;
      const sourceX = v10X * inputScale - 0.5;
      const target = (y * expandedSize + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        data[target + channel] = Math.round(sample(image, sourceX, sourceY, channel));
      }
    }
  }

  return { width: expandedSize, height: expandedSize, data } as ImageData;
}

export function observeV10Parity(
  image: ImageData
): readonly V9ParityObservation[] {
  return observeV9Parity(expandV10ParityImage(image));
}
