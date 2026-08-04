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
import { inspectFrame, loadOpenCv, type FrameQuality } from "./opencv.ts";
import { canvas as layoutCanvas, placements, ringPlacements } from "./layout.ts";
import { CaptureSeries, type CaptureSnapshot } from "./scan-series.ts";
import {
  observeSeed,
  recoverSeedObservations,
  type NibbleObservation,
  type SeedReading
} from "./scan-seed.ts";
import { classifySigns, type SignReading } from "./scan-sign.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface ScanResult extends IdenticonInput {
  paletteIndex: number;
  orientation: number;
  uncertainStars: number;
  correctedBytes: number;
  cumulativeFrames: number;
  captureMilliseconds: number;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

interface Calibration {
  offset: number;
  swapped: boolean;
}

interface FrameEvidence {
  canvas: HTMLCanvasElement;
  data: ImageData;
  palette: ObservedPalette;
  angle: number;
  observations: readonly NibbleObservation[];
  reading: SeedReading | undefined;
  quality: FrameQuality;
  score: number;
}

interface CameraCapabilities extends MediaTrackCapabilities {
  focusMode?: readonly string[];
  exposureMode?: readonly string[];
  whiteBalanceMode?: readonly string[];
}

const automaticInterval = 180;
const focusSettleMilliseconds = 750;
const evidenceResetMilliseconds = 1_500;
const analysisSize = 512;
const orientationOffsets = [0, 90, 180, 270] as const;
const fineOffsets = [0, -1.5, 1.5] as const;
const verificationConfidence = 0.004;
const layoutPlaceholder: IdenticonInput = {
  seed: "capture-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "aries",
  imumCoeli: "aries"
};
const centreRegions = placements(layoutPlaceholder);
const ringRegions = ringPlacements(layoutPlaceholder);

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

function imageData(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function normalisedAngle(value: number): number {
  return ((value % 360) + 360) % 360;
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

function copyCanvas(source: HTMLCanvasElement, size = source.width): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = size;
  target.height = size;
  context(target).drawImage(source, 0, 0, size, size);
  return target;
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

    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    }, { once: true });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected photo could not be opened"));
    }, { once: true });

    image.src = url;
  });
}

function captureImage(image: HTMLImageElement, canvas: HTMLCanvasElement): void {
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

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function observationScore(
  observations: readonly NibbleObservation[],
  reading: SeedReading | undefined,
  anchorConfidence: number,
  quality: FrameQuality
): number {
  const visible = observations.filter((value) => value.value !== null);
  const confidence = visible.reduce((sum, value) => sum + value.confidence, 0);
  const payload = reading
    ? 2_000 - reading.erasures * 20 - reading.uncertainStars * 2
    : 0;

  return (
    payload +
    visible.length * 4 +
    confidence +
    anchorConfidence * 20 +
    quality.score * 100
  );
}

function tryReading(
  observations: readonly NibbleObservation[]
): SeedReading | undefined {
  try {
    return recoverSeedObservations(observations);
  } catch {
    return undefined;
  }
}

function candidate(
  source: HTMLCanvasElement,
  palette: ObservedPalette,
  angle: number,
  anchorConfidence: number,
  cv: Awaited<ReturnType<typeof loadOpenCv>>
): FrameEvidence {
  const canvas = rotated(source, angle);
  const data = imageData(canvas);
  const quality = inspectFrame(cv, data);
  const observations = observeSeed(data, palette);
  const reading = tryReading(observations);

  return {
    canvas,
    data,
    palette,
    angle,
    observations,
    reading,
    quality,
    score: observationScore(
      observations,
      reading,
      anchorConfidence,
      quality
    )
  };
}

function better(left: FrameEvidence | undefined, right: FrameEvidence): FrameEvidence {
  if (!left) return right;

  if (Boolean(left.reading) !== Boolean(right.reading)) {
    return right.reading ? right : left;
  }

  if (left.reading && right.reading && left.reading.erasures !== right.reading.erasures) {
    return right.reading.erasures < left.reading.erasures ? right : left;
  }

  return right.score > left.score ? right : left;
}

function calibrate(
  source: HTMLCanvasElement,
  raw: ImageData,
  observed: ObservedPalette,
  cv: Awaited<ReturnType<typeof loadOpenCv>>
): { calibration: Calibration; frame: FrameEvidence } {
  let best: FrameEvidence | undefined;
  let bestCalibration: Calibration | undefined;

  for (const swapped of [false, true]) {
    const palette = swapped ? swapPalette(observed) : observed;
    const anchor = findOrientation(raw, palette);

    for (const offset of orientationOffsets) {
      const angle = normalisedAngle(anchor.angle + offset);
      const value = candidate(source, palette, angle, anchor.confidence, cv);
      const selected = better(best, value);

      if (selected !== value) continue;
      best = value;
      bestCalibration = { offset, swapped };
    }
  }

  if (!best || !bestCalibration) {
    throw new Error("Could not calibrate the identicon orientation");
  }

  return { calibration: bestCalibration, frame: best };
}

function calibratedFrame(
  source: HTMLCanvasElement,
  raw: ImageData,
  observed: ObservedPalette,
  calibration: Calibration,
  cv: Awaited<ReturnType<typeof loadOpenCv>>
): FrameEvidence {
  const palette = calibration.swapped ? swapPalette(observed) : observed;
  const anchor = findOrientation(raw, palette);
  const base = normalisedAngle(anchor.angle + calibration.offset);
  let best: FrameEvidence | undefined;

  for (const offset of fineOffsets) {
    best = better(
      best,
      candidate(
        source,
        palette,
        normalisedAngle(base + offset),
        anchor.confidence,
        cv
      )
    );
  }

  return best!;
}

function qualityMessage(quality: FrameQuality): string {
  if (quality.sharpness < 36) return "Identicon found. Let the camera finish focusing…";
  if (quality.exposure < 0.42) return "Identicon found. Waiting for exposure to settle…";
  if (quality.contrast < 14) return "Identicon found. Increase contrast or reduce glare…";
  if (quality.edgeDensity < 0.006) return "Identicon found. Move slightly closer so its details are readable…";
  return "Identicon found. Collecting clear details across several frames…";
}

function signRoles(value: IdenticonInput): readonly [
  keyof Omit<IdenticonInput, "seed">,
  string
][] {
  return [
    ["solar", value.solar],
    ["lunar", value.lunar],
    ["ascendant", value.ascendant],
    ["midheaven", value.midheaven],
    ["descendant", value.descendant],
    ["imumCoeli", value.imumCoeli]
  ];
}

function signsVerified(reading: SignReading, value: IdenticonInput): boolean {
  if (reading.constellation.sign !== value.solar) return false;
  if (reading.constellation.score < 0.08) return false;

  for (const [role, expected] of signRoles(value)) {
    const observed = reading[role];
    if (observed.sign !== expected) return false;
    if (observed.score < 0.07) return false;
    if (observed.confidence < verificationConfidence) return false;
  }

  return true;
}

function progressMessage(snapshot: CaptureSnapshot): string {
  const seconds = Math.min(5, snapshot.elapsed / 1_000).toFixed(1);
  const stars = `${snapshot.observedStars}/128 stars`;
  const centre = `${snapshot.centreFound}/9 centre signs`;
  const ring = `${snapshot.ringFound}/12 ring signs`;
  return `Reading ${seconds}s · ${stars} · ${centre} · ${ring}`;
}

export class Scanner {
  readonly #dialog = required<HTMLDialogElement>("#scan-dialog");
  readonly #stage = required<HTMLElement>(".scan-stage");
  readonly #guide = required<HTMLElement>(".scan-guide");
  readonly #video = required<HTMLVideoElement>("#scan-video");
  readonly #capture = required<HTMLCanvasElement>("#scan-capture");
  readonly #normalised = required<HTMLCanvasElement>("#scan-normalised");
  readonly #status = required<HTMLParagraphElement>("#scan-status");
  readonly #upload = required<HTMLButtonElement>("#scan-upload");
  readonly #file = required<HTMLInputElement>("#scan-file");
  readonly #close = required<HTMLButtonElement>("#scan-close");
  readonly #frozen: HTMLCanvasElement;
  readonly #mosaic: HTMLCanvasElement;
  readonly #series = new CaptureSeries();
  readonly #options: ScannerOptions;
  readonly #centreMosaicScores = Array<number>(centreRegions.length)
    .fill(Number.NEGATIVE_INFINITY);
  readonly #ringMosaicScores = Array<number>(ringRegions.length)
    .fill(Number.NEGATIVE_INFINITY);

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;
  #timer: number | undefined;
  #busy = false;
  #session = 0;
  #lastCircleAt = 0;
  #calibration: Calibration | undefined;
  #bestFrame: FrameEvidence | undefined;
  #lastVerificationKey = "";
  #baseMosaicScore = Number.NEGATIVE_INFINITY;

  constructor(options: ScannerOptions) {
    this.#options = options;
    this.#frozen = document.createElement("canvas");
    this.#mosaic = document.createElement("canvas");

    for (const canvas of [this.#frozen, this.#mosaic]) {
      canvas.width = analysisSize;
      canvas.height = analysisSize;
    }

    this.#frozen.setAttribute("aria-label", "Captured identicon frame");
    Object.assign(this.#frozen.style, {
      position: "absolute",
      inset: "0",
      inlineSize: "100%",
      blockSize: "100%",
      maxInlineSize: "100%",
      display: "none",
      background: "#050507"
    });
    this.#stage.append(this.#frozen);

    const copy = document.querySelector<HTMLElement>(".scan-copy p");
    if (copy) {
      copy.textContent =
        "The scanner waits briefly for focus and exposure, then combines clear details from a rolling 2–5 second series. It freezes only after the complete protected payload and expected signs are readable.";
    }

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
    this.message("Preparing local computer vision and requesting camera access…");

    await nextPaint();

    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      this.cameraError(
        new TypeError("This browser does not provide an in-page camera API")
      );
      return;
    }

    try {
      const [stream] = await Promise.all([
        requestCamera(devices),
        loadOpenCv()
      ]);

      if (session !== this.#session || !this.#dialog.open) {
        stopStream(stream);
        return;
      }

      this.#stream = stream;
      this.#video.srcObject = stream;
      await startVideo(this.#video);
      await this.configureCamera(stream);

      if (session !== this.#session || !this.#dialog.open) {
        this.stop();
        return;
      }

      this.message("Camera ready. Letting autofocus and exposure settle…");
      await pause(focusSettleMilliseconds);

      if (session !== this.#session || !this.#dialog.open) return;

      this.message(
        "Place the complete identicon inside the guide. Clear details will accumulate across several frames."
      );
      this.scheduleAutomatic(0);
    } catch (error) {
      if (session !== this.#session) return;
      this.cameraError(error);
    }
  }

  private async configureCamera(stream: MediaStream): Promise<void> {
    const track = stream.getVideoTracks()[0];
    if (!track?.getCapabilities) return;

    const capabilities = track.getCapabilities() as CameraCapabilities;
    const advanced: Record<string, string>[] = [];

    if (capabilities.focusMode?.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
    }
    if (capabilities.exposureMode?.includes("continuous")) {
      advanced.push({ exposureMode: "continuous" });
    }
    if (capabilities.whiteBalanceMode?.includes("continuous")) {
      advanced.push({ whiteBalanceMode: "continuous" });
    }

    if (advanced.length === 0) return;

    try {
      await track.applyConstraints({ advanced } as MediaTrackConstraints);
    } catch {
      // Browsers expose these capabilities inconsistently. Automatic capture
      // still works when the track rejects an otherwise supported hint.
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
    this.#busy = false;
    this.resetViewport();
    this.#upload.disabled = false;
  }

  private resetEvidence(): void {
    this.#series.clear();
    this.#calibration = undefined;
    this.#bestFrame = undefined;
    this.#lastVerificationKey = "";
    this.#baseMosaicScore = Number.NEGATIVE_INFINITY;
    this.#centreMosaicScores.fill(Number.NEGATIVE_INFINITY);
    this.#ringMosaicScores.fill(Number.NEGATIVE_INFINITY);
    context(this.#mosaic).clearRect(0, 0, this.#mosaic.width, this.#mosaic.height);
  }

  private resetViewport(): void {
    this.resetEvidence();
    this.#stage.classList.remove("captured", "analysing");
    this.#video.style.display = "";
    this.#guide.style.display = "";
    this.#frozen.style.display = "none";

    context(this.#normalised).clearRect(
      0,
      0,
      this.#normalised.width,
      this.#normalised.height
    );
    context(this.#frozen).clearRect(0, 0, this.#frozen.width, this.#frozen.height);
  }

  private showFrozen(source: HTMLCanvasElement): void {
    this.#frozen.width = source.width;
    this.#frozen.height = source.height;
    const frozenContext = context(this.#frozen);
    frozenContext.clearRect(0, 0, this.#frozen.width, this.#frozen.height);
    frozenContext.drawImage(source, 0, 0);
    this.#video.style.display = "none";
    this.#guide.style.display = "none";
    this.#frozen.style.display = "block";
  }

  private freeze(source: HTMLCanvasElement): void {
    this.stopCamera();
    this.#stage.classList.remove("analysing");
    this.#stage.classList.add("captured");
    this.showFrozen(source);
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
    if (!this.#stream || !this.#dialog.open || this.#busy) return;

    this.#busy = true;

    try {
      const cv = await loadOpenCv();
      captureVideo(this.#video, this.#capture);
      const circle = findOuterCircle(this.#capture);
      const now = performance.now();

      if (!circle) {
        if (this.#lastCircleAt > 0 && now - this.#lastCircleAt > evidenceResetMilliseconds) {
          this.resetEvidence();
        }

        this.message("Looking for the complete outer circle…");
        return;
      }

      this.#lastCircleAt = now;
      normaliseCircle(this.#capture, circle, this.#normalised, analysisSize);
      const source = copyCanvas(this.#normalised, analysisSize);
      const raw = imageData(source);
      const rawQuality = inspectFrame(cv, raw);

      if (
        rawQuality.sharpness < 28 ||
        rawQuality.exposure < 0.3 ||
        rawQuality.contrast < 10 ||
        rawQuality.edgeDensity < 0.004
      ) {
        this.message(qualityMessage(rawQuality));
        return;
      }

      const observed = observePalette(raw);
      let frame: FrameEvidence;

      if (!this.#calibration) {
        const result = calibrate(source, raw, observed, cv);
        this.#calibration = result.calibration;
        frame = result.frame;
      } else {
        frame = calibratedFrame(source, raw, observed, this.#calibration, cv);
      }

      if (!frame.quality.ready) {
        this.message(qualityMessage(frame.quality));
        return;
      }

      this.#stage.classList.add("analysing");
      this.accumulateMosaic(frame);
      this.#bestFrame = better(this.#bestFrame, frame);

      const snapshot = this.#series.add({
        at: now,
        observations: frame.observations,
        quality: frame.quality.score,
        centre: frame.quality.centre,
        ring: frame.quality.ring
      });

      this.message(progressMessage(snapshot));

      if (!snapshot.ready || !snapshot.reading) return;
      await this.tryComplete(snapshot, frame);
    } catch (error) {
      this.processingError(error, true);
    } finally {
      this.#busy = false;
      this.scheduleAutomatic();
    }
  }

  private accumulateMosaic(frame: FrameEvidence): void {
    const target = context(this.#mosaic);

    if (frame.quality.score > this.#baseMosaicScore) {
      this.#baseMosaicScore = frame.quality.score;
      target.drawImage(frame.canvas, 0, 0);
    }

    const scale = this.#mosaic.width / layoutCanvas;

    const copyRegion = (
      x: number,
      y: number,
      size: number
    ): void => {
      const padding = size * 0.28;
      const sourceX = Math.max(0, (x - size / 2 - padding) * scale);
      const sourceY = Math.max(0, (y - size / 2 - padding) * scale);
      const sourceSize = Math.min(
        this.#mosaic.width - sourceX,
        this.#mosaic.height - sourceY,
        (size + padding * 2) * scale
      );

      target.drawImage(
        frame.canvas,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize
      );
    };

    for (let index = 0; index < centreRegions.length; index += 1) {
      const score = frame.quality.centreScores[index] ?? 0;
      if (score <= this.#centreMosaicScores[index]!) continue;

      this.#centreMosaicScores[index] = score;
      const region = centreRegions[index]!;
      copyRegion(region.x, region.y, region.size);
    }

    for (let index = 0; index < ringRegions.length; index += 1) {
      const score = frame.quality.ringScores[index] ?? 0;
      if (score <= this.#ringMosaicScores[index]!) continue;

      this.#ringMosaicScores[index] = score;
      const region = ringRegions[index]!;
      copyRegion(region.x, region.y, region.size * 1.25);
    }
  }

  private async tryComplete(
    snapshot: CaptureSnapshot,
    current: FrameEvidence
  ): Promise<void> {
    const reading = snapshot.reading!;
    const value = reading.value;
    const verificationKey = [
      value.seed,
      value.solar,
      value.lunar,
      value.ascendant,
      value.midheaven,
      value.descendant,
      value.imumCoeli,
      snapshot.frames
    ].join("|");

    if (verificationKey === this.#lastVerificationKey) return;
    this.#lastVerificationKey = verificationKey;

    const paletteIndex = seedPaletteIndex(value.seed);
    const aligned = alignPaletteToIndex(current.palette, paletteIndex);
    const verification = await classifySigns(imageData(this.#mosaic), aligned);

    if (!signsVerified(verification, value)) {
      this.message(
        `${progressMessage(snapshot)} · payload recovered; collecting clearer sign evidence…`
      );
      return;
    }

    const source = this.#bestFrame?.canvas ?? current.canvas;
    this.freeze(source);
    this.message("Read complete. Applying the exact seed and signs…", "success");
    await nextPaint();

    this.#options.apply({
      ...value,
      paletteIndex,
      orientation: current.angle,
      uncertainStars: reading.uncertainStars,
      correctedBytes: reading.erasures,
      cumulativeFrames: snapshot.frames,
      captureMilliseconds: Math.round(snapshot.elapsed)
    });
    this.close();
  }

  private async readPhoto(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file containing an astral identicon");
    }

    this.#upload.disabled = true;
    this.message("Opening the selected photo…");

    try {
      const cv = await loadOpenCv();
      const image = await loadImage(file);
      captureImage(image, this.#capture);
      const circle = findOuterCircle(this.#capture) ?? guideCircle(this.#capture);
      normaliseCircle(this.#capture, circle, this.#normalised, analysisSize);
      const source = copyCanvas(this.#normalised, analysisSize);
      const raw = imageData(source);
      const observed = observePalette(raw);
      const result = calibrate(source, raw, observed, cv);
      const frame = result.frame;

      if (!frame.quality.ready) {
        throw new Error("The selected photo is too blurred, clipped or incomplete to reconstruct safely");
      }

      const reading = frame.reading ?? recoverSeedObservations(frame.observations);
      const paletteIndex = seedPaletteIndex(reading.value.seed);
      const aligned = alignPaletteToIndex(frame.palette, paletteIndex);
      const verification = await classifySigns(frame.data, aligned);

      if (!signsVerified(verification, reading.value)) {
        throw new Error("The selected photo does not contain every expected identicon element clearly enough");
      }

      this.freeze(frame.canvas);
      this.message("Photo verified. Applying its exact fields…", "success");
      await nextPaint();

      this.#options.apply({
        ...reading.value,
        paletteIndex,
        orientation: frame.angle,
        uncertainStars: reading.uncertainStars,
        correctedBytes: reading.erasures,
        cumulativeFrames: 1,
        captureMilliseconds: 0
      });
      this.close();
    } finally {
      this.#busy = false;
      this.#upload.disabled = false;
    }
  }

  private cameraError(error: unknown): void {
    this.stopCamera();
    this.message(cameraErrorMessage(error), "error");
    this.#upload.disabled = false;
  }

  private processingError(error: unknown, recoverable = false): void {
    const value = error instanceof Error ? error.message : String(error);

    if (recoverable && this.#stream && this.#dialog.open) {
      this.message(`Still collecting: ${value}`);
      return;
    }

    this.stopCamera();
    this.message(value, "error");
    this.#upload.disabled = false;
  }

  private message(value: string, state: "" | "error" | "success" = ""): void {
    this.#status.textContent = value;
    this.#status.className = `scan-status${state ? ` ${state}` : ""}`;
  }
}
