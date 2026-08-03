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
  alignPaletteToIndex,
  findOrientation,
  observePalette,
  swapPalette,
  type ObservedPalette
} from "./scan-colour.ts";
import {
  readSeed,
  type SeedReading
} from "./scan-seed.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface ScanResult extends IdenticonInput {
  paletteIndex: number;
  orientation: number;
  uncertainStars: number;
  correctedBytes: number;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

interface PayloadCandidate {
  canvas: HTMLCanvasElement;
  data: ImageData;
  angle: number;
  palette: ObservedPalette;
  reading: SeedReading;
  score: number;
}

const automaticInterval = 120;
const coarseOffsets = [0, 90, 180, 270] as const;
const fallbackOffsets = [-3, -1.5, 1.5, 3] as const;
const refineOffsets = [-2, -1, -0.5, 0.5, 1, 2] as const;

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

function payloadScore(
  reading: SeedReading,
  palette: ObservedPalette,
  anchorConfidence: number
): number {
  const expectedPalette = seedPaletteIndex(reading.value.seed);
  const paletteAgreement = expectedPalette === palette.index
    ? 5 + palette.confidence * 3
    : 0;

  return (
    20 +
    reading.confidence * 8 +
    anchorConfidence * 2 +
    paletteAgreement -
    reading.erasures * 0.8 -
    reading.uncertainStars * 0.06
  );
}

function readCandidate(
  source: HTMLCanvasElement,
  palette: ObservedPalette,
  angle: number,
  anchorConfidence: number
): PayloadCandidate | undefined {
  const canvas = rotated(source, angle);
  const data = imageData(canvas);

  try {
    const reading = readSeed(data, palette);

    return {
      canvas,
      data,
      angle,
      palette,
      reading,
      score: payloadScore(reading, palette, anchorConfidence)
    };
  } catch {
    return undefined;
  }
}

function better(
  current: PayloadCandidate | undefined,
  candidate: PayloadCandidate
): PayloadCandidate {
  if (!current) return candidate;
  if (candidate.reading.erasures !== current.reading.erasures) {
    return candidate.reading.erasures < current.reading.erasures
      ? candidate
      : current;
  }

  return candidate.score > current.score ? candidate : current;
}

function isStrong(candidate: PayloadCandidate): boolean {
  return (
    candidate.reading.erasures <= 4 &&
    candidate.reading.uncertainStars <= 12
  );
}

function refinePayload(
  source: HTMLCanvasElement,
  candidate: PayloadCandidate
): PayloadCandidate {
  if (isStrong(candidate)) return candidate;

  const paletteIndex = seedPaletteIndex(candidate.reading.value.seed);
  const palette = alignPaletteToIndex(candidate.palette, paletteIndex);
  let best = candidate;

  for (const offset of refineOffsets) {
    const angle = normalisedAngle(candidate.angle + offset);
    const refined = readCandidate(source, palette, angle, 1);
    if (!refined) continue;
    best = better(best, refined);
    if (isStrong(best)) break;
  }

  return best;
}

function bestPayload(
  source: HTMLCanvasElement,
  rawData: ImageData,
  observed: ObservedPalette
): PayloadCandidate {
  const palettes = [observed, swapPalette(observed)];
  let best: PayloadCandidate | undefined;

  for (const palette of palettes) {
    const anchor = findOrientation(rawData, palette);
    const bases = coarseOffsets.map((offset) => {
      return normalisedAngle(anchor.angle + offset);
    });

    for (const angle of bases) {
      const candidate = readCandidate(
        source,
        palette,
        angle,
        anchor.confidence
      );

      if (!candidate) continue;
      best = better(best, candidate);
      if (isStrong(candidate)) return candidate;
    }

    if (best) continue;

    for (const base of bases) {
      for (const offset of fallbackOffsets) {
        const candidate = readCandidate(
          source,
          palette,
          normalisedAngle(base + offset),
          anchor.confidence
        );

        if (!candidate) continue;
        best = better(best, candidate);
        if (isStrong(candidate)) return candidate;
      }
    }
  }

  if (!best) {
    throw new Error("The captured star payload could not be reconstructed");
  }

  return refinePayload(source, best);
}

export class Scanner {
  readonly #dialog = required<HTMLDialogElement>("#scan-dialog");
  readonly #stage = required<HTMLElement>("#scan-stage");
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

    this.resetViewport();
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
        "Camera ready. Put the complete outer circle inside the guide; it will capture immediately."
      );
      this.scheduleAutomatic(0);
    } catch (error) {
      if (session !== this.#session) return;
      this.cameraError(error);
    }
  }

  private stopCamera(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);
    this.#timer = undefined;

    if (this.#stream) stopStream(this.#stream);
    this.#stream = undefined;
    this.#video.srcObject = null;
  }

  private stop(): void {
    this.stopCamera();
    this.#decoding = false;
    this.#stage.classList.remove("captured");
    this.#upload.disabled = false;
  }

  private resetViewport(): void {
    this.#stage.classList.remove("captured");
    const normalisedContext = context(this.#normalised);
    normalisedContext.clearRect(
      0,
      0,
      this.#normalised.width,
      this.#normalised.height
    );
  }

  private freezeViewport(circle: Circle): void {
    normaliseCircle(this.#capture, circle, this.#normalised);
    this.stopCamera();
    this.#stage.classList.add("captured");
  }

  private scheduleAutomatic(delay = automaticInterval): void {
    if (!this.#stream || !this.#dialog.open) return;
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);

    this.#timer = window.setTimeout(() => {
      this.#timer = undefined;
      void this.automaticFrame();
    }, delay);
  }

  private async automaticFrame(): Promise<void> {
    if (!this.#stream || !this.#dialog.open || this.#decoding) return;

    try {
      captureVideo(this.#video, this.#capture);
      const circle = findOuterCircle(this.#capture);

      if (!circle) {
        this.message("Looking for the complete outer circle…");
        this.scheduleAutomatic();
        return;
      }

      this.#decoding = true;
      this.freezeViewport(circle);
      this.message(
        "Captured. You can move the identicon now while its exact fields are reconstructed."
      );
      await nextPaint();

      const result = this.decodeCaptured();
      this.#options.apply(result);
      this.close();
    } catch (error) {
      this.processingError(error);
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

      this.#decoding = true;
      this.freezeViewport(circle);
      this.message("Photo framed. Reconstructing its exact fields…");
      await nextPaint();

      const result = this.decodeCaptured();
      this.#options.apply(result);
      this.close();
    } finally {
      this.#decoding = false;
      this.#upload.disabled = false;
    }
  }

  private decodeCaptured(): ScanResult {
    const rawData = imageData(this.#normalised);
    const observed = observePalette(rawData);
    const candidate = bestPayload(this.#normalised, rawData, observed);
    const reading = candidate.reading;
    const value = reading.value;

    const normalisedContext = context(this.#normalised);
    normalisedContext.clearRect(
      0,
      0,
      this.#normalised.width,
      this.#normalised.height
    );
    normalisedContext.drawImage(candidate.canvas, 0, 0);

    return {
      ...value,
      paletteIndex: seedPaletteIndex(value.seed),
      orientation: candidate.angle,
      uncertainStars: reading.uncertainStars,
      correctedBytes: reading.erasures
    };
  }

  private message(value: string, busy = true): void {
    this.#status.textContent = value;
    this.#status.className = busy ? "scan-status busy" : "scan-status success";
  }

  private cameraError(error: unknown): void {
    this.stopCamera();
    this.#status.textContent = `${cameraErrorMessage(error)} A saved photo can still be scanned.`;
    this.#status.className = "scan-status error";
  }

  private processingError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const frozen = this.#stage.classList.contains("captured");

    this.#status.textContent = frozen
      ? `${message}. The frame is frozen; close and scan again, or choose another photo.`
      : message;
    this.#status.className = "scan-status error";
    this.#upload.disabled = false;
  }
}
