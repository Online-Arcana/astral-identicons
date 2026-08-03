import { outerRingRadius, ringStroke } from "./layout.ts";

export interface Circle {
  x: number;
  y: number;
  radius: number;
  confidence: number;
}

type CvMat = {
  cols: number;
  rows: number;
  data32F?: Float32Array;
  delete(): void;
};

type CvApi = {
  Mat: new () => CvMat;
  Size: new (width: number, height: number) => unknown;
  imread(source: HTMLCanvasElement): CvMat;
  cvtColor(source: CvMat, target: CvMat, code: number): void;
  GaussianBlur(
    source: CvMat,
    target: CvMat,
    size: unknown,
    sigmaX: number,
    sigmaY: number,
    border: number
  ): void;
  HoughCircles(
    source: CvMat,
    target: CvMat,
    method: number,
    dp: number,
    minimumDistance: number,
    firstThreshold: number,
    secondThreshold: number,
    minimumRadius: number,
    maximumRadius: number
  ): void;
  COLOR_RGBA2GRAY: number;
  BORDER_DEFAULT: number;
  HOUGH_GRADIENT: number;
};

declare global {
  interface Window {
    cv?: CvApi | Promise<CvApi>;
  }
}

const opencvUrl = "https://docs.opencv.org/4.10.0/opencv.js";
let cvRequest: Promise<CvApi> | undefined;

function api(value: unknown): value is CvApi {
  if (!value || typeof value !== "object") return false;
  return "Mat" in value && "HoughCircles" in value;
}

async function existingApi(): Promise<CvApi | undefined> {
  const value = window.cv;
  if (!value) return undefined;

  const resolved = value instanceof Promise ? await value : value;
  return api(resolved) ? resolved : undefined;
}

function waitForApi(timeout = 30_000): Promise<CvApi> {
  const started = performance.now();

  return new Promise((resolve, reject) => {
    const inspect = (): void => {
      void existingApi()
        .then((value) => {
          if (value) {
            resolve(value);
            return;
          }

          if (performance.now() - started >= timeout) {
            reject(new Error("OpenCV.js did not finish initialising"));
            return;
          }

          window.setTimeout(inspect, 50);
        })
        .catch(reject);
    };

    inspect();
  });
}

export function loadOpenCv(): Promise<CvApi> {
  if (cvRequest) return cvRequest;

  cvRequest = (async () => {
    const current = await existingApi();
    if (current) return current;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-opencv-source="${opencvUrl}"]`
    );

    if (!existing) {
      const script = document.createElement("script");
      script.async = true;
      script.src = opencvUrl;
      script.dataset.opencvSource = opencvUrl;

      const loaded = new Promise<void>((resolve, reject) => {
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener(
          "error",
          () => reject(new Error("Could not load OpenCV.js")),
          { once: true }
        );
      });

      document.head.append(script);
      await loaded;
    }

    return waitForApi();
  })();

  return cvRequest;
}

export function captureVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  size = 720
): void {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (width === 0 || height === 0) {
    throw new Error("The camera has not produced a frame yet");
  }

  canvas.width = size;
  canvas.height = size;

  const sourceSize = Math.min(width, height);
  const sourceX = (width - sourceSize) / 2;
  const sourceY = (height - sourceSize) / 2;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Could not access the camera canvas");

  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );
}

export function findOuterCircle(cv: CvApi, canvas: HTMLCanvasElement): Circle | null {
  const source = cv.imread(canvas);
  const grey = new cv.Mat();
  const blurred = new cv.Mat();
  const circles = new cv.Mat();

  try {
    cv.cvtColor(source, grey, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(
      grey,
      blurred,
      new cv.Size(9, 9),
      2,
      2,
      cv.BORDER_DEFAULT
    );

    const minimum = Math.round(canvas.width * 0.27);
    const maximum = Math.round(canvas.width * 0.49);

    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      1.2,
      canvas.width * 0.25,
      120,
      42,
      minimum,
      maximum
    );

    const values = circles.data32F;
    if (!values || values.length < 3) return null;

    const centre = canvas.width / 2;
    let best: Circle | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index + 2 < values.length; index += 3) {
      const x = values[index]!;
      const y = values[index + 1]!;
      const radius = values[index + 2]!;
      const offset = Math.hypot(x - centre, y - centre) / centre;
      const radiusRatio = radius / centre;
      const score = radiusRatio * 2 - offset;

      if (score <= bestScore) continue;

      bestScore = score;
      best = {
        x,
        y,
        radius,
        confidence: Math.max(0, Math.min(1, 1 - offset))
      };
    }

    return best;
  } finally {
    source.delete();
    grey.delete();
    blurred.delete();
    circles.delete();
  }
}

function backgroundFromAnnulus(canvas: HTMLCanvasElement): string {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "#000";

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const centre = canvas.width / 2;
  const scale = canvas.width / 1024;
  const samples: Array<{ r: number; g: number; b: number; light: number }> = [];

  for (let angle = 0; angle < 360; angle += 2) {
    const radians = angle * Math.PI / 180;

    for (const radius of [410, 416, 422]) {
      const x = Math.round(centre + Math.cos(radians) * radius * scale);
      const y = Math.round(centre + Math.sin(radians) * radius * scale);
      const index = (y * image.width + x) * 4;
      const red = image.data[index]!;
      const green = image.data[index + 1]!;
      const blue = image.data[index + 2]!;

      samples.push({
        r: red,
        g: green,
        b: blue,
        light: red * 0.2126 + green * 0.7152 + blue * 0.0722
      });
    }
  }

  samples.sort((left, right) => left.light - right.light);
  const selected = samples.slice(0, Math.max(12, Math.round(samples.length * 0.35)));
  const total = selected.reduce((value, sample) => {
    value.r += sample.r;
    value.g += sample.g;
    value.b += sample.b;
    return value;
  }, { r: 0, g: 0, b: 0 });

  const count = Math.max(1, selected.length);
  return `rgb(${Math.round(total.r / count)} ${Math.round(total.g / count)} ${Math.round(total.b / count)})`;
}

export function normaliseCircle(
  source: HTMLCanvasElement,
  circle: Circle,
  target: HTMLCanvasElement,
  size = 1024
): void {
  const context = target.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access the scanner canvas");

  target.width = size;
  target.height = size;

  const temporary = document.createElement("canvas");
  temporary.width = size;
  temporary.height = size;
  const temporaryContext = temporary.getContext("2d", { willReadFrequently: true });
  if (!temporaryContext) throw new Error("Could not create a normalisation canvas");

  const cropRadius = circle.radius * (size / 2) / outerRingRadius;
  const sourceSize = cropRadius * 2;

  temporaryContext.drawImage(
    source,
    circle.x - cropRadius,
    circle.y - cropRadius,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );

  const background = backgroundFromAnnulus(temporary);
  context.clearRect(0, 0, size, size);
  context.fillStyle = background;
  context.fillRect(0, 0, size, size);

  context.save();
  context.beginPath();
  context.arc(
    size / 2,
    size / 2,
    (outerRingRadius + ringStroke) * size / 1024,
    0,
    Math.PI * 2
  );
  context.clip();
  context.drawImage(temporary, 0, 0);
  context.restore();
}
