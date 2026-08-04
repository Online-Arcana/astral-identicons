import { placements, ringPlacements } from "./layout.ts";
import type { IdenticonInput } from "./types.ts";

/**
 * Compatibility marker retained so the scanner orchestration does not need a
 * second behavioural rewrite. No OpenCV, CDN script, WebAssembly runtime or
 * asynchronous library initialisation exists behind this type.
 */
export interface CvApi {
  readonly local: true;
}

export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface FrameQuality {
  sharpness: number;
  contrast: number;
  exposure: number;
  edgeDensity: number;
  centre: readonly boolean[];
  ring: readonly boolean[];
  centreScores: readonly number[];
  ringScores: readonly number[];
  ready: boolean;
  score: number;
}

interface GrayFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

interface EdgeFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const localVision: CvApi = Object.freeze({ local: true });
const analysisMaximum = 256;
const placeholder: IdenticonInput = {
  seed: "quality-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};

/**
 * Kept under the old exported name for source compatibility. It resolves
 * immediately to the local TypeScript implementation and performs no fetch.
 */
export function loadOpenCv(): Promise<CvApi> {
  return Promise.resolve(localVision);
}

export function resetOpenCv(): void {
  // There is no external runtime or cached rejected promise to reset.
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function pixelIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function rgbaIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function grayscale(image: PixelImage): GrayFrame {
  if (image.width <= 0 || image.height <= 0) {
    throw new Error("Vision analysis requires a non-empty image");
  }

  if (image.data.length < image.width * image.height * 4) {
    throw new Error("Vision analysis received incomplete RGBA pixel data");
  }

  const ratio = Math.min(
    1,
    analysisMaximum / Math.max(image.width, image.height)
  );
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const data = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = clamp(
      Math.round((y + 0.5) / height * image.height - 0.5),
      0,
      image.height - 1
    );

    for (let x = 0; x < width; x += 1) {
      const sourceX = clamp(
        Math.round((x + 0.5) / width * image.width - 0.5),
        0,
        image.width - 1
      );
      const source = rgbaIndex(image.width, sourceX, sourceY);
      const red = image.data[source] ?? 0;
      const green = image.data[source + 1] ?? 0;
      const blue = image.data[source + 2] ?? 0;

      data[pixelIndex(width, x, y)] =
        red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }
  }

  return { width, height, data };
}

function gaussian(frame: GrayFrame): GrayFrame {
  const horizontal = new Float32Array(frame.data.length);
  const result = new Float32Array(frame.data.length);
  const weights = [1, 4, 6, 4, 1] as const;
  const radius = 2;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      let total = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = clamp(x + offset, 0, frame.width - 1);
        total += frame.data[pixelIndex(frame.width, sampleX, y)]! *
          weights[offset + radius]!;
      }

      horizontal[pixelIndex(frame.width, x, y)] = total / 16;
    }
  }

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      let total = 0;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = clamp(y + offset, 0, frame.height - 1);
        total += horizontal[pixelIndex(frame.width, x, sampleY)]! *
          weights[offset + radius]!;
      }

      result[pixelIndex(frame.width, x, y)] = total / 16;
    }
  }

  return { width: frame.width, height: frame.height, data: result };
}

function percentileThreshold(
  magnitudes: Float32Array,
  percentile: number
): number {
  const histogram = new Uint32Array(256);
  let count = 0;

  for (const magnitude of magnitudes) {
    if (magnitude <= 0) continue;
    const bucket = clamp(Math.round(magnitude / 4), 0, 255);
    histogram[bucket] += 1;
    count += 1;
  }

  if (count === 0) return 255;

  const target = count * percentile;
  let cumulative = 0;

  for (let bucket = 0; bucket < histogram.length; bucket += 1) {
    cumulative += histogram[bucket]!;
    if (cumulative >= target) return bucket * 4;
  }

  return 255 * 4;
}

/**
 * A local Canny-style edge detector:
 *
 * 1. Gaussian smoothing
 * 2. Sobel gradient magnitude
 * 3. adaptive dual thresholds
 * 4. eight-neighbour hysteresis from strong into weak edges
 *
 * It deliberately avoids an external runtime while retaining the quality and
 * structural edge evidence required by cumulative capture.
 */
function canny(frame: GrayFrame): EdgeFrame {
  const blurred = gaussian(frame);
  const magnitudes = new Float32Array(frame.data.length);

  for (let y = 1; y < frame.height - 1; y += 1) {
    for (let x = 1; x < frame.width - 1; x += 1) {
      const topLeft = blurred.data[pixelIndex(frame.width, x - 1, y - 1)]!;
      const top = blurred.data[pixelIndex(frame.width, x, y - 1)]!;
      const topRight = blurred.data[pixelIndex(frame.width, x + 1, y - 1)]!;
      const left = blurred.data[pixelIndex(frame.width, x - 1, y)]!;
      const right = blurred.data[pixelIndex(frame.width, x + 1, y)]!;
      const bottomLeft = blurred.data[pixelIndex(frame.width, x - 1, y + 1)]!;
      const bottom = blurred.data[pixelIndex(frame.width, x, y + 1)]!;
      const bottomRight = blurred.data[pixelIndex(frame.width, x + 1, y + 1)]!;

      const horizontal =
        -topLeft - 2 * left - bottomLeft +
        topRight + 2 * right + bottomRight;
      const vertical =
        -topLeft - 2 * top - topRight +
        bottomLeft + 2 * bottom + bottomRight;

      magnitudes[pixelIndex(frame.width, x, y)] = Math.hypot(
        horizontal,
        vertical
      );
    }
  }

  const high = clamp(percentileThreshold(magnitudes, 0.82), 48, 360);
  const low = high * 0.42;
  const state = new Uint8Array(frame.data.length);
  const queue = new Int32Array(frame.data.length);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < magnitudes.length; index += 1) {
    const magnitude = magnitudes[index]!;

    if (magnitude >= high) {
      state[index] = 2;
      queue[tail] = index;
      tail += 1;
      continue;
    }

    if (magnitude >= low) state[index] = 1;
  }

  while (head < tail) {
    const index = queue[head]!;
    head += 1;
    const x = index % frame.width;
    const y = Math.floor(index / frame.width);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const neighbourY = y + offsetY;
      if (neighbourY < 0 || neighbourY >= frame.height) continue;

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const neighbourX = x + offsetX;
        if (neighbourX < 0 || neighbourX >= frame.width) continue;

        const neighbour = pixelIndex(frame.width, neighbourX, neighbourY);
        if (state[neighbour] !== 1) continue;

        state[neighbour] = 2;
        queue[tail] = neighbour;
        tail += 1;
      }
    }
  }

  const edges = new Uint8Array(frame.data.length);
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] === 2) edges[index] = 255;
  }

  return { width: frame.width, height: frame.height, data: edges };
}

function variance(values: Float32Array): number {
  if (values.length === 0) return 0;

  let sum = 0;
  let squareSum = 0;

  for (const value of values) {
    sum += value;
    squareSum += value * value;
  }

  const mean = sum / values.length;
  return Math.max(0, squareSum / values.length - mean * mean);
}

function contrast(frame: GrayFrame): number {
  return Math.sqrt(variance(frame.data));
}

function sharpness(frame: GrayFrame): number {
  if (frame.width < 3 || frame.height < 3) return 0;

  const values = new Float32Array((frame.width - 2) * (frame.height - 2));
  let target = 0;

  for (let y = 1; y < frame.height - 1; y += 1) {
    for (let x = 1; x < frame.width - 1; x += 1) {
      const centre = frame.data[pixelIndex(frame.width, x, y)]!;
      const laplacian =
        frame.data[pixelIndex(frame.width, x - 1, y)]! +
        frame.data[pixelIndex(frame.width, x + 1, y)]! +
        frame.data[pixelIndex(frame.width, x, y - 1)]! +
        frame.data[pixelIndex(frame.width, x, y + 1)]! -
        centre * 4;

      values[target] = laplacian;
      target += 1;
    }
  }

  return variance(values);
}

function exposure(frame: GrayFrame): number {
  const step = Math.max(1, Math.floor(frame.data.length / 16_384));
  let dark = 0;
  let bright = 0;
  let count = 0;

  for (let index = 0; index < frame.data.length; index += step) {
    const value = frame.data[index] ?? 0;
    if (value <= 10) dark += 1;
    if (value >= 245) bright += 1;
    count += 1;
  }

  const clipped = (dark + bright) / Math.max(1, count);
  return clamp(1 - clipped / 0.5, 0, 1);
}

function edgeDensity(
  edges: EdgeFrame,
  centreX: number,
  centreY: number,
  width: number,
  height: number
): number {
  const startX = clamp(Math.floor(centreX - width / 2), 0, edges.width - 1);
  const endX = clamp(Math.ceil(centreX + width / 2), 0, edges.width);
  const startY = clamp(Math.floor(centreY - height / 2), 0, edges.height - 1);
  const endY = clamp(Math.ceil(centreY + height / 2), 0, edges.height);

  let count = 0;
  let total = 0;

  for (let y = startY; y < endY; y += 1) {
    const row = y * edges.width;

    for (let x = startX; x < endX; x += 1) {
      total += 1;
      if ((edges.data[row + x] ?? 0) > 0) count += 1;
    }
  }

  return total === 0 ? 0 : count / total;
}

function regionScores(edges: EdgeFrame): {
  centreScores: readonly number[];
  ringScores: readonly number[];
  centre: readonly boolean[];
  ring: readonly boolean[];
} {
  const scaleX = edges.width / 1024;
  const scaleY = edges.height / 1024;
  const global = Math.max(0.004, Math.min(0.08, edgeDensity(
    edges,
    edges.width / 2,
    edges.height / 2,
    edges.width,
    edges.height
  )));
  const centreThreshold = Math.max(0.005, global * 0.16);
  const ringThreshold = Math.max(0.006, global * 0.2);

  const centreScores = placements(placeholder).map((placement) => {
    return edgeDensity(
      edges,
      placement.x * scaleX,
      placement.y * scaleY,
      placement.size * 1.24 * scaleX,
      placement.size * 1.24 * scaleY
    );
  });

  const ringScores = ringPlacements(placeholder).map((placement) => {
    return edgeDensity(
      edges,
      placement.x * scaleX,
      placement.y * scaleY,
      placement.size * 1.55 * scaleX,
      placement.size * 1.55 * scaleY
    );
  });

  return {
    centreScores,
    ringScores,
    centre: centreScores.map((value) => value >= centreThreshold),
    ring: ringScores.map((value) => value >= ringThreshold)
  };
}

export function inspectFrame(
  _vision: CvApi,
  image: PixelImage
): FrameQuality {
  const gray = grayscale(image);
  const edges = canny(gray);
  const sharpnessValue = sharpness(gray);
  const contrastValue = contrast(gray);
  const exposureScore = exposure(gray);
  const density = edgeDensity(
    edges,
    edges.width / 2,
    edges.height / 2,
    edges.width,
    edges.height
  );
  const regions = regionScores(edges);
  const centreCount = regions.centre.filter(Boolean).length;
  const ringCount = regions.ring.filter(Boolean).length;
  const sharpnessScore = clamp((sharpnessValue - 28) / 180, 0, 1);
  const contrastScore = clamp((contrastValue - 12) / 42, 0, 1);
  const edgeScore = clamp((density - 0.006) / 0.08, 0, 1);
  const structureScore = (
    centreCount / regions.centre.length +
    ringCount / regions.ring.length
  ) / 2;
  const score =
    sharpnessScore * 0.34 +
    contrastScore * 0.18 +
    exposureScore * 0.16 +
    edgeScore * 0.14 +
    structureScore * 0.18;

  return {
    sharpness: sharpnessValue,
    contrast: contrastValue,
    exposure: exposureScore,
    edgeDensity: density,
    centre: regions.centre,
    ring: regions.ring,
    centreScores: regions.centreScores,
    ringScores: regions.ringScores,
    ready: (
      sharpnessValue >= 36 &&
      contrastValue >= 14 &&
      exposureScore >= 0.42 &&
      density >= 0.006 &&
      centreCount >= 3 &&
      ringCount >= 5
    ),
    score
  };
}
