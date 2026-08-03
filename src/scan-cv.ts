import {
  canvas,
  innerRingRadius,
  outerRingRadius
} from "./layout.ts";

export interface Circle {
  x: number;
  y: number;
  radius: number;
  confidence: number;
}

export interface PixelFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface NormalisationCrop {
  x: number;
  y: number;
  size: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface RingProfile {
  average: number;
  coverage: number;
}

interface Candidate extends Circle {
  score: number;
  outer: RingProfile;
  inner: RingProfile;
}

const detectionSize = 224;
const circleSamples = 112;
const ringRatio = innerRingRadius / outerRingRadius;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function pixel(frame: PixelFrame, x: number, y: number): Rgb {
  const column = clamp(Math.round(x), 0, frame.width - 1);
  const row = clamp(Math.round(y), 0, frame.height - 1);
  const index = (row * frame.width + column) * 4;

  return {
    r: frame.data[index]!,
    g: frame.data[index + 1]!,
    b: frame.data[index + 2]!
  };
}

function mean(left: Rgb, right: Rgb): Rgb {
  return {
    r: (left.r + right.r) / 2,
    g: (left.g + right.g) / 2,
    b: (left.b + right.b) / 2
  };
}

function distance(left: Rgb, right: Rgb): number {
  return Math.hypot(
    left.r - right.r,
    left.g - right.g,
    left.b - right.b
  );
}

function luminance(value: Rgb): number {
  return value.r * 0.2126 + value.g * 0.7152 + value.b * 0.0722;
}

function radialPoint(
  centreX: number,
  centreY: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: centreX + Math.cos(angle) * radius,
    y: centreY + Math.sin(angle) * radius
  };
}

function ringEvidence(
  frame: PixelFrame,
  centreX: number,
  centreY: number,
  radius: number,
  angle: number,
  delta: number
): number {
  const innerPoint = radialPoint(centreX, centreY, radius - delta, angle);
  const outerPoint = radialPoint(centreX, centreY, radius + delta, angle);
  const surrounding = mean(
    pixel(frame, innerPoint.x, innerPoint.y),
    pixel(frame, outerPoint.x, outerPoint.y)
  );

  let strongest = 0;

  for (const offset of [-1, 0, 1]) {
    const point = radialPoint(centreX, centreY, radius + offset, angle);
    const value = pixel(frame, point.x, point.y);
    const chroma = distance(value, surrounding) / Math.sqrt(3 * 255 * 255);
    const light = Math.max(0, luminance(value) - luminance(surrounding)) / 255;
    strongest = Math.max(strongest, chroma * 0.72 + light * 0.28);
  }

  return strongest;
}

function ringProfile(
  frame: PixelFrame,
  centreX: number,
  centreY: number,
  radius: number,
  delta: number
): RingProfile {
  let total = 0;
  let covered = 0;

  for (let sample = 0; sample < circleSamples; sample += 1) {
    const angle = sample / circleSamples * Math.PI * 2;
    const evidence = ringEvidence(
      frame,
      centreX,
      centreY,
      radius,
      angle,
      delta
    );

    total += evidence;
    if (evidence >= 0.065) covered += 1;
  }

  return {
    average: total / circleSamples,
    coverage: covered / circleSamples
  };
}

function profileScore(profile: RingProfile): number {
  return profile.average * 0.82 + profile.coverage * 0.18;
}

function scoreCircle(
  frame: PixelFrame,
  centreX: number,
  centreY: number,
  radius: number
): Candidate {
  const delta = Math.max(2, Math.min(frame.width, frame.height) * 0.012);
  const outer = ringProfile(frame, centreX, centreY, radius, delta);
  const inner = ringProfile(frame, centreX, centreY, radius * ringRatio, delta);
  const radiusPreference = radius / Math.min(frame.width, frame.height);

  /*
   * The identicon contains two rings. Treating the first strong circle as the
   * outer ring can select the inner ring and scale the entire code incorrectly.
   * A valid outer-ring candidate must also contain the second ring at the
   * canonical inner/outer radius ratio.
   */
  const score =
    profileScore(outer) * 0.62 +
    profileScore(inner) * 0.34 +
    radiusPreference * 0.04;

  return {
    x: centreX,
    y: centreY,
    radius,
    score,
    outer,
    inner,
    confidence: 0
  };
}

function better(
  candidate: Candidate,
  current: Candidate | undefined
): boolean {
  return !current || candidate.score > current.score;
}

function refine(frame: PixelFrame, coarse: Candidate, step: number): Candidate {
  let best = coarse;
  const centreRange = step * 1.5;

  for (
    let y = coarse.y - centreRange;
    y <= coarse.y + centreRange;
    y += 1
  ) {
    for (
      let x = coarse.x - centreRange;
      x <= coarse.x + centreRange;
      x += 1
    ) {
      for (
        let radius = coarse.radius - 4;
        radius <= coarse.radius + 4;
        radius += 1
      ) {
        const candidate = scoreCircle(frame, x, y, radius);
        if (better(candidate, best)) best = candidate;
      }
    }
  }

  return best;
}

export function detectOuterCircle(frame: PixelFrame): Circle | null {
  if (frame.width < 48 || frame.height < 48) return null;
  if (frame.data.length < frame.width * frame.height * 4) return null;

  const size = Math.min(frame.width, frame.height);
  const centreX = frame.width / 2;
  const centreY = frame.height / 2;
  const centreRange = size * 0.13;
  const centreStep = Math.max(3, Math.round(size / 56));
  const radiusMinimum = size * 0.34;
  const radiusMaximum = size * 0.49;
  const radiusStep = Math.max(2, Math.round(size / 90));

  let best: Candidate | undefined;
  let second: Candidate | undefined;

  for (
    let y = centreY - centreRange;
    y <= centreY + centreRange;
    y += centreStep
  ) {
    for (
      let x = centreX - centreRange;
      x <= centreX + centreRange;
      x += centreStep
    ) {
      for (
        let radius = radiusMinimum;
        radius <= radiusMaximum;
        radius += radiusStep
      ) {
        const candidate = scoreCircle(frame, x, y, radius);

        if (better(candidate, best)) {
          second = best;
          best = candidate;
          continue;
        }

        if (better(candidate, second)) second = candidate;
      }
    }
  }

  if (!best) return null;

  const refined = refine(frame, best, centreStep);
  const separation = Math.max(0, refined.score - (second?.score ?? 0));
  const confidence = clamp(
    refined.score * 1.55 +
    separation * 4 +
    refined.outer.coverage * 0.15 +
    refined.inner.coverage * 0.2,
    0,
    1
  );

  if (
    refined.score < 0.05 ||
    refined.outer.coverage < 0.18 ||
    refined.inner.coverage < 0.12
  ) {
    return null;
  }

  return {
    x: refined.x,
    y: refined.y,
    radius: refined.radius,
    confidence
  };
}

function detectionFrame(canvas: HTMLCanvasElement): PixelFrame {
  const target = document.createElement("canvas");
  target.width = detectionSize;
  target.height = detectionSize;

  const context = target.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access the circle detector canvas");

  context.drawImage(canvas, 0, 0, detectionSize, detectionSize);
  const image = context.getImageData(0, 0, detectionSize, detectionSize);

  return {
    width: image.width,
    height: image.height,
    data: image.data
  };
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

export function findOuterCircle(canvas: HTMLCanvasElement): Circle | null {
  const detected = detectOuterCircle(detectionFrame(canvas));
  if (!detected) return null;

  const scaleX = canvas.width / detectionSize;
  const scaleY = canvas.height / detectionSize;

  return {
    x: detected.x * scaleX,
    y: detected.y * scaleY,
    radius: detected.radius * Math.min(scaleX, scaleY),
    confidence: detected.confidence
  };
}

export function normalisationCrop(circle: Circle): NormalisationCrop {
  const radius = circle.radius * (canvas / 2) / outerRingRadius;

  return {
    x: circle.x - radius,
    y: circle.y - radius,
    size: radius * 2
  };
}

export function normaliseCircle(
  source: HTMLCanvasElement,
  circle: Circle,
  target: HTMLCanvasElement,
  size = canvas
): void {
  const context = target.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not access the scanner canvas");

  target.width = size;
  target.height = size;

  const crop = normalisationCrop(circle);
  context.clearRect(0, 0, size, size);
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    size,
    size
  );
}
