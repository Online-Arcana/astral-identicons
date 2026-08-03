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

  const sourceSize = circle.radius * 2;
  context.clearRect(0, 0, size, size);
  context.drawImage(
    source,
    circle.x - circle.radius,
    circle.y - circle.radius,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );
}
