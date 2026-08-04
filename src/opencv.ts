import { placements, ringPlacements } from "./layout.ts";
import { RuntimeLoader, type RuntimeEnvironment } from "./runtime-loader.ts";
import type { IdenticonInput } from "./types.ts";

interface CvMat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data64F: Float64Array;
  delete(): void;
}

interface CvSize {
  readonly width: number;
  readonly height: number;
}

export interface CvApi {
  Mat: new () => CvMat;
  Size: new (width: number, height: number) => CvSize;
  COLOR_RGBA2GRAY: number;
  CV_64F: number;
  BORDER_DEFAULT: number;
  matFromImageData(image: ImageData): CvMat;
  cvtColor(source: CvMat, target: CvMat, code: number): void;
  GaussianBlur(
    source: CvMat,
    target: CvMat,
    size: CvSize,
    sigmaX: number,
    sigmaY: number,
    borderType: number
  ): void;
  Canny(
    source: CvMat,
    target: CvMat,
    low: number,
    high: number,
    aperture: number,
    l2gradient: boolean
  ): void;
  Laplacian(
    source: CvMat,
    target: CvMat,
    depth: number,
    kernelSize: number,
    scale: number,
    delta: number,
    borderType: number
  ): void;
  meanStdDev(source: CvMat, mean: CvMat, standardDeviation: CvMat): void;
  countNonZero(source: CvMat): number;
}

interface CvGlobal {
  cv?: CvApi | Promise<CvApi>;
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

const fallbackSource = "https://docs.opencv.org/4.x/opencv.js";
const placeholder: IdenticonInput = {
  seed: "quality-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};

function complete(value: unknown): value is CvApi {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CvApi>;
  return typeof candidate.Mat === "function" && typeof candidate.Canny === "function";
}

function globalValue(): CvGlobal & typeof globalThis {
  return globalThis as typeof globalThis & CvGlobal;
}

function configuredSource(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="opencv-runtime"]'
  );
  const value = meta?.content.trim();
  return value || fallbackSource;
}

function removeRuntimeScript(): void {
  document.querySelectorAll<HTMLScriptElement>("#opencv-runtime")
    .forEach((element) => element.remove());
}

function clearRuntime(): void {
  removeRuntimeScript();
  const global = globalValue();

  try {
    delete global.cv;
  } catch {
    global.cv = undefined;
  }
}

const environment: RuntimeEnvironment<CvApi> = {
  current() {
    return globalValue().cv;
  },
  clear() {
    clearRuntime();
  },
  create(url, loaded, failed) {
    removeRuntimeScript();

    const element = document.createElement("script");
    element.id = "opencv-runtime";
    element.src = url;
    element.async = true;
    element.dataset.state = "loading";

    element.addEventListener("load", () => {
      element.dataset.state = "loaded";
      loaded();
    }, { once: true });

    element.addEventListener("error", () => {
      element.dataset.state = "error";
      failed(new Error(`OpenCV.js failed to load from ${url}`));
    }, { once: true });

    document.head.append(element);

    return {
      remove() {
        element.remove();
      }
    };
  },
  now() {
    return performance.now();
  },
  sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
};

const loader = new RuntimeLoader<CvApi>(environment, {
  url: configuredSource(),
  ready: complete,
  attempts: 2,
  timeoutMilliseconds: 20_000,
  pollMilliseconds: 40
});

export function loadOpenCv(): Promise<CvApi> {
  return loader.load();
}

export function resetOpenCv(): void {
  loader.reset();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function scalar(mat: CvMat): number {
  return mat.data64F[0] ?? 0;
}

function edgeDensity(
  edges: CvMat,
  centreX: number,
  centreY: number,
  width: number,
  height: number
): number {
  const startX = clamp(Math.floor(centreX - width / 2), 0, edges.cols - 1);
  const endX = clamp(Math.ceil(centreX + width / 2), 0, edges.cols);
  const startY = clamp(Math.floor(centreY - height / 2), 0, edges.rows - 1);
  const endY = clamp(Math.ceil(centreY + height / 2), 0, edges.rows);

  let count = 0;
  let total = 0;

  for (let y = startY; y < endY; y += 1) {
    const row = y * edges.cols;
    for (let x = startX; x < endX; x += 1) {
      total += 1;
      if ((edges.data[row + x] ?? 0) > 0) count += 1;
    }
  }

  return total === 0 ? 0 : count / total;
}

function exposure(gray: CvMat): number {
  const step = Math.max(1, Math.floor(gray.data.length / 16_384));
  let dark = 0;
  let bright = 0;
  let count = 0;

  for (let index = 0; index < gray.data.length; index += step) {
    const value = gray.data[index] ?? 0;
    if (value <= 10) dark += 1;
    if (value >= 245) bright += 1;
    count += 1;
  }

  const clipped = (dark + bright) / Math.max(1, count);
  return clamp(1 - clipped / 0.5, 0, 1);
}

function regionScores(edges: CvMat): {
  centreScores: readonly number[];
  ringScores: readonly number[];
  centre: readonly boolean[];
  ring: readonly boolean[];
} {
  const scaleX = edges.cols / 1024;
  const scaleY = edges.rows / 1024;
  const global = Math.max(0.004, Math.min(0.03, edgeDensity(
    edges,
    edges.cols / 2,
    edges.rows / 2,
    edges.cols,
    edges.rows
  )));
  const centreThreshold = Math.max(0.0035, global * 0.14);
  const ringThreshold = Math.max(0.0045, global * 0.18);

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

export function inspectFrame(cv: CvApi, image: ImageData): FrameQuality {
  const sourceMat = cv.matFromImageData(image);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const laplacian = new cv.Mat();
  const mean = new cv.Mat();
  const deviation = new cv.Mat();
  const grayMean = new cv.Mat();
  const grayDeviation = new cv.Mat();

  try {
    cv.cvtColor(sourceMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0,
      0,
      cv.BORDER_DEFAULT
    );
    cv.Canny(blurred, edges, 45, 125, 3, false);
    cv.Laplacian(
      gray,
      laplacian,
      cv.CV_64F,
      3,
      1,
      0,
      cv.BORDER_DEFAULT
    );
    cv.meanStdDev(laplacian, mean, deviation);
    cv.meanStdDev(gray, grayMean, grayDeviation);

    const sharpness = scalar(deviation) ** 2;
    const contrast = scalar(grayDeviation);
    const exposureScore = exposure(gray);
    const density = cv.countNonZero(edges) / Math.max(1, edges.rows * edges.cols);
    const regions = regionScores(edges);
    const centreCount = regions.centre.filter(Boolean).length;
    const ringCount = regions.ring.filter(Boolean).length;
    const sharpnessScore = clamp((sharpness - 28) / 150, 0, 1);
    const contrastScore = clamp((contrast - 12) / 42, 0, 1);
    const edgeScore = clamp((density - 0.006) / 0.055, 0, 1);
    const structureScore = (
      centreCount / regions.centre.length +
      ringCount / regions.ring.length
    ) / 2;
    const score = (
      sharpnessScore * 0.34 +
      contrastScore * 0.18 +
      exposureScore * 0.16 +
      edgeScore * 0.14 +
      structureScore * 0.18
    );

    return {
      sharpness,
      contrast,
      exposure: exposureScore,
      edgeDensity: density,
      centre: regions.centre,
      ring: regions.ring,
      centreScores: regions.centreScores,
      ringScores: regions.ringScores,
      ready: (
        sharpness >= 36 &&
        contrast >= 14 &&
        exposureScore >= 0.42 &&
        density >= 0.006 &&
        centreCount >= 3 &&
        ringCount >= 5
      ),
      score
    };
  } finally {
    sourceMat.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    laplacian.delete();
    mean.delete();
    deviation.delete();
    grayMean.delete();
    grayDeviation.delete();
  }
}
