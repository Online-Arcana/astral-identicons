import {
  cameraErrorMessage,
  nextPaint,
  requestCamera,
  startVideo,
  stopStream
} from "./camera.ts";
import {
  captureVideo,
  findOuterCircle,
  normaliseCircle,
  type Circle
} from "./scan-cv.ts";
import {
  findOrientation,
  observePalette,
  swapPalette,
  type ObservedPalette
} from "./scan-colour.ts";
import {
  readSeed,
  type SeedReading
} from "./scan-seed.ts";
import {
  classifyConstellation,
  classifySigns,
  type SignReading,
  type SignResult
} from "./scan-sign.ts";
import {
  seedPaletteIndex,
  seedParityByteCount
} from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface ScanResult extends IdenticonInput {
  paletteIndex: number;
  orientation: number;
  uncertainStars: number;
  correctedBytes: number;
  visualSignMismatches: number;
  signs: SignReading;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

interface EvaluatedFrame {
  canvas: HTMLCanvasElement;
  data: ImageData;
  angle: number;
  constellation: SignResult;
  palette: ObservedPalette;
  seed: SeedReading | undefined;
  signs: SignReading | undefined;
  score: number;
}

const automaticInterval = 260;
const retryInterval = 520;
const stableFrameCount = 3;

function required<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing scanner element: ${selector}`);
  return value;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Could not access the scanner canvas");
  return value;
}

function rotated(source: HTMLCanvasElement, angle: number): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;

  const targetContext = context(target);
  targetContext.translate(target.width / 2, target.height / 2);
  targetContext.rotate(-angle * Math.PI / 180);
  targetContext.drawImage(source, -source.width / 2, -source.height / 2);

  return target;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function normalisedAngle(value: number): number {
  return ((value % 360) + 360) % 360;
}

function guideCircle(canvas: HTMLCanvasElement): Circle {
  return {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: canvas.width * 0.44,
    confidence: 0
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(url);
        resolve(image);
      },
      { once: true }
    );

    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(url);
        reject(new Error("The selected photo could not be opened"));
      },
      { once: true }
    );

    image.src = url;
  });
}

function captureImage(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement
): void {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width === 0 || height === 0) {
    throw new Error("The selected photo has no readable image dimensions");
  }

  const sourceSize = Math.min(width, height);
  const targetSize = Math.min(1440, Math.max(1024, sourceSize));
  const sourceX = (width - sourceSize) / 2;
  const sourceY = (height - sourceSize) / 2;

  canvas.width = targetSize;
  canvas.height = targetSize;
  context(canvas).drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    targetSize,
    targetSize
  );
}

const signRoles = [
  "solar",
  "lunar",
  "ascendant",
  "midheaven",
  "descendant",
  "imumCoeli"
] as const;

function signEvidence(signs: SignReading, value: IdenticonInput): number {
  let score = 0;

  for (const role of signRoles) {
    const observation = signs[role];
    const confidence = Math.min(0.4, observation.confidence * 8);
    score += observation.sign === value[role]
      ? 0.35 + confidence
      : -confidence;
  }

  return score;
}

function frameScore(
  constellation: SignResult,
  palette: ObservedPalette,
  seed: SeedReading | undefined,
  signs: SignReading | undefined
): number {
  if (!seed) return constellation.score;

  let score = 8 + seed.confidence * 2;
  score -= seed.erasures / Math.max(1, seedParityByteCount);

  if (seed.value.solar === constellation.sign) {
    score += 2 + Math.min(1, constellation.confidence * 12);
  }

  if (seedPaletteIndex(seed.value.seed) === palette.index) {
    score += Math.max(0, palette.confidence);
  }

  if (signs) score += signEvidence(signs, seed.value);
  return score;
}

async function evaluateFrame(
  source: HTMLCanvasElement,
  palette: ObservedPalette,
  angle: number
): Promise<EvaluatedFrame> {
  const canvas = rotated(source, angle);
  const data = imageData(canvas);
  const constellation = await classifyConstellation(data, palette);
  let seed: SeedReading | undefined;
  let signs: SignReading | undefined;

  try {
    seed = readSeed(data, palette);
    signs = await classifySigns(data, palette, constellation);
  } catch {
    seed = undefined;
    signs = undefined;
  }

  return {
    canvas,
    data,
    angle,
    constellation,
    palette,
    seed,
    signs,
    score: frameScore(constellation, palette, seed, signs)
  };
}

function better(
  current: EvaluatedFrame | undefined,
  candidate: EvaluatedFrame
): EvaluatedFrame {
  if (!current) return candidate;
  if (Boolean(candidate.seed) !== Boolean(current.seed)) {
    return candidate.seed ? candidate : current;
  }
  return candidate.score > current.score ? candidate : current;
}

async function orientationCandidates(
  source: HTMLCanvasElement,
  palette: ObservedPalette,
  anchorAngle: number
): Promise<EvaluatedFrame> {
  const coarseAngles = [0, 90, 180, 270].map((offset) => {
    return normalisedAngle(anchorAngle + offset);
  });
  const coarse: EvaluatedFrame[] = [];
  let best: EvaluatedFrame | undefined;

  for (const angle of coarseAngles) {
    const candidate = await evaluateFrame(source, palette, angle);
    coarse.push(candidate);
    best = better(best, candidate);
  }

  const valid = coarse
    .filter((candidate) => candidate.seed)
    .sort((left, right) => right.score - left.score);
  const bases = valid.length > 0
    ? valid.slice(0, 1)
    : [...coarse]
      .sort((left, right) => right.constellation.score - left.constellation.score)
      .slice(0, 2);

  for (const base of bases) {
    for (const offset of [-4, -2, -1, 1, 2, 4]) {
      const angle = normalisedAngle(base.angle + offset);
      const candidate = await evaluateFrame(source, palette, angle);
      best = better(best, candidate);
    }
  }

  if (!best) throw new Error("Could not determine identicon orientation");
  return best;
}

async function bestOrientation(
  source: HTMLCanvasElement,
  rawData: ImageData,
  observed: ObservedPalette
): Promise<EvaluatedFrame> {
  const palettes = [observed, swapPalette(observed)];
  let best: EvaluatedFrame | undefined;

  for (const palette of palettes) {
    const anchor = findOrientation(rawData, palette);
    const candidate = await orientationCandidates(source, palette, anchor.angle);
    best = better(best, candidate);
  }

  if (!best?.seed) {
    throw new Error("The exact seed and sign payload is not stable yet");
  }

  return best;
}

function visualSignMismatches(
  signs: SignReading,
  value: IdenticonInput
): number {
  return signRoles.filter((role) => signs[role].sign !== value[role]).length;
}

function softFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("payload") ||
    message.includes("Reed-Solomon") ||
    message.includes("star")
  ) {
    return "Identicon found. Reconstructing the exact seed and signs from the correction stars…";
  }

  if (message.includes("orientation") || message.includes("orient")) {
    return "Identicon found. Resolving its upright orientation…";
  }

  return "Identicon found. Hold it steady while the scanner resolves the details…";
}

function circlesMatch(left: Circle, right: Circle): boolean {
  const tolerance = Math.max(6, right.radius * 0.035);
  const centreShift = Math.hypot(left.x - right.x, left.y - right.y);
  const radiusShift = Math.abs(left.radius - right.radius);

  return centreShift <= tolerance && radiusShift <= tolerance;
}

export class Scanner {
  readonly #dialog = required<HTMLDialogElement>("#scan-dialog");
  readonly #video = required<HTMLVideoElement>("#scan-video");
  readonly #capture = required<HTMLCanvasElement>("#scan-capture");
  readonly #normalised = required<HTMLCanvasElement>("#scan-normalised");
  readonly #status = required<HTMLParagraphElement>("#scan-status");
  readonly #upload = required<HTMLButtonElement>("#scan-upload");
  readonly #file = required<HTMLInputElement>("#scan-file");
  readonly #close = required<HTMLButtonElement>("#scan-close");
  readonly #options: ScannerOptions;

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;
  #timer: number | undefined;
  #lastCircle: Circle | undefined;
  #stableFrames = 0;
  #decoding = false;
  #session = 0;

  constructor(options: ScannerOptions) {
    this.#options = options;

    this.#close.addEventListener("click", () => this.close());
    this.#upload.addEventListener("click", () => this.#file.click());
    this.#file.addEventListener("change", () => {
      const file = this.#file.files?.[0];
      this.#file.value = "";
      if (!file) return;

      void this.readPhoto(file).catch((error) => this.processingError(error));
    });

    this.#dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });

    this.#dialog.addEventListener("close", () => this.stop());
  }

  async open(): Promise<void> {
    if (this.#dialog.open) return;
    if (this.#openRequest) return this.#openRequest;

    this.#openRequest = this.start().finally(() => {
      this.#openRequest = undefined;
    });

    return this.#openRequest;
  }

  close(): void {
    this.#session += 1;
    this.#openRequest = undefined;
    this.stop();
    if (this.#dialog.open) this.#dialog.close();
  }

  private async start(): Promise<void> {
    const session = ++this.#session;

    this.#dialog.showModal();
    this.#upload.disabled = false;
    this.message(
      "Scanner ready. Requesting camera access… You can use a saved photo immediately."
    );

    await nextPaint();

    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      this.cameraError(
        new TypeError("This browser does not provide an in-page camera API")
      );
      return;
    }

    try {
      const stream = await requestCamera(devices);

      if (session !== this.#session || !this.#dialog.open) {
        stopStream(stream);
        return;
      }

      this.#stream = stream;
      this.#video.srcObject = stream;
      await startVideo(this.#video);

      if (session !== this.#session || !this.#dialog.open) {
        this.stop();
        return;
      }

      this.message(
        "Camera ready. Keep the complete outer circle inside the guide; recognition is automatic."
      );
      this.scheduleAutomatic(0);
    } catch (error) {
      if (session !== this.#session) return;
      this.cameraError(error);
    }
  }

  private stop(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#lastCircle = undefined;
    this.#stableFrames = 0;
    this.#decoding = false;

    if (this.#stream) stopStream(this.#stream);
    this.#stream = undefined;
    this.#video.srcObject = null;
    this.#upload.disabled = false;
  }

  private scheduleAutomatic(delay = automaticInterval): void {
    if (!this.#stream || !this.#dialog.open) return;
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);

    this.#timer = window.setTimeout(() => {
      this.#timer = undefined;
      void this.automaticFrame();
    }, delay);
  }

  private updateStability(circle: Circle): number {
    const stable = this.#lastCircle && circlesMatch(this.#lastCircle, circle);
    this.#stableFrames = stable ? this.#stableFrames + 1 : 1;
    this.#lastCircle = circle;
    return this.#stableFrames;
  }

  private async automaticFrame(): Promise<void> {
    if (!this.#stream || !this.#dialog.open) return;
    if (this.#decoding) {
      this.scheduleAutomatic();
      return;
    }

    try {
      captureVideo(this.#video, this.#capture);
      const circle = findOuterCircle(this.#capture);

      if (!circle) {
        this.#lastCircle = undefined;
        this.#stableFrames = 0;
        this.message("Looking for the complete outer circle…");
        this.scheduleAutomatic();
        return;
      }

      if (this.updateStability(circle) < stableFrameCount) {
        this.message("Outer circle found. Hold the identicon steady…");
        this.scheduleAutomatic();
        return;
      }

      this.#decoding = true;
      this.message("Identicon recognised. Recovering its exact fields…");

      const result = await this.decodeCircle(circle);
      this.#options.apply(result);
      this.close();
    } catch (error) {
      this.message(softFailure(error));
      this.scheduleAutomatic(retryInterval);
    } finally {
      this.#decoding = false;
    }
  }

  private async readPhoto(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file containing an astral identicon");
    }

    this.#upload.disabled = true;
    this.message("Opening the selected photo…");

    try {
      const image = await loadImage(file);
      captureImage(image, this.#capture);
      const circle = findOuterCircle(this.#capture) ?? guideCircle(this.#capture);
      const result = await this.decodeCircle(circle);

      this.#options.apply(result);
      this.close();
    } finally {
      this.#upload.disabled = false;
    }
  }

  private async decodeCircle(circle: Circle): Promise<ScanResult> {
    normaliseCircle(this.#capture, circle, this.#normalised);

    const rawData = imageData(this.#normalised);
    const observed = observePalette(rawData);
    const oriented = await bestOrientation(
      this.#normalised,
      rawData,
      observed
    );
    const reading = oriented.seed!;

    const normalisedContext = context(this.#normalised);
    normalisedContext.clearRect(
      0,
      0,
      this.#normalised.width,
      this.#normalised.height
    );
    normalisedContext.drawImage(oriented.canvas, 0, 0);

    const signs = oriented.signs ?? await classifySigns(
      oriented.data,
      oriented.palette,
      oriented.constellation
    );
    const value = reading.value;

    return {
      ...value,
      paletteIndex: seedPaletteIndex(value.seed),
      orientation: oriented.angle,
      uncertainStars: reading.uncertainStars,
      correctedBytes: reading.erasures,
      visualSignMismatches: visualSignMismatches(signs, value),
      signs
    };
  }

  private message(value: string, busy = true): void {
    this.#status.textContent = value;
    this.#status.className = busy ? "scan-status busy" : "scan-status success";
  }

  private cameraError(error: unknown): void {
    this.stop();
    this.#status.textContent = `${cameraErrorMessage(error)} A saved photo can still be scanned.`;
    this.#status.className = "scan-status error";
  }

  private processingError(error: unknown): void {
    this.#status.textContent = error instanceof Error ? error.message : String(error);
    this.#status.className = "scan-status error";
    this.#upload.disabled = false;
  }
}
