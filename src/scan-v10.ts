import {
  cameraErrorMessage,
  nextPaint,
  requestCamera,
  startVideo,
  stopStream
} from "./camera.ts";
import { captureVideo, type Circle } from "./scan-cv.ts";
import {
  findV10OuterCircle,
  normaliseV10Circle,
  v10GuideCircle
} from "./scan-v10-cv.ts";
import {
  mergeV10Frames,
  observeV10Frame,
  type V10FrameObservation
} from "./scan-v10-frame.ts";
import { observeV10Orientation } from "./scan-v10-orientation.ts";
import { inspectFrame, loadOpenCv, type FrameQuality } from "./opencv.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface V10ScanResult extends IdenticonInput {
  readonly paletteIndex: number;
  readonly orientation: number;
  readonly uncertainStars: number;
  readonly correctedBytes: number;
  readonly reconstructedStars: number;
  readonly cumulativeFrames: number;
  readonly captureMilliseconds: number;
}

interface ScannerOptions {
  apply(result: V10ScanResult): void;
}

interface CapturedFrame {
  readonly canvas: HTMLCanvasElement;
  readonly quality: FrameQuality;
  readonly orientation: number;
  readonly orientationConfidence: number;
  readonly score: number;
  readonly at: number;
}

interface CameraCapabilities extends MediaTrackCapabilities {
  focusMode?: readonly string[];
  exposureMode?: readonly string[];
  whiteBalanceMode?: readonly string[];
}

const analysisSize = 512;
const automaticInterval = 160;
const focusSettleMilliseconds = 1800;
const retainedFrameLimit = 12;
const minimumFrames = 10;
const minimumUsefulMilliseconds = 2400;
const retryAdditionalFrames = 5;
const retryAdditionalMilliseconds = 1200;
const minimumSharpness = 36;
const minimumContrast = 14;
const minimumExposure = 0.42;
const minimumEdgeDensity = 0.006;
const minimumOrientationConfidence = 0.10;
const minimumStableFrames = 4;
const maximumExposureDelta = 0.055;
const maximumContrastDelta = 4;
const minimumRelativeSharpness = 0.82;
const rejectedRelativeSharpness = 0.72;

function required<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing scanner element: ${selector}`);
  return value;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = canvas.getContext("2d", { willReadFrequently: true });
  if (!value) throw new Error("Could not access the v10 scanner canvas");
  return value;
}

function imageData(canvas: HTMLCanvasElement): ImageData {
  return context(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

function copyCanvas(source: HTMLCanvasElement, size = source.width): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = size;
  target.height = size;
  context(target).drawImage(source, 0, 0, size, size);
  return target;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

function usable(quality: FrameQuality, orientationConfidence: number): boolean {
  return (
    quality.ready &&
    quality.sharpness >= minimumSharpness &&
    quality.contrast >= minimumContrast &&
    quality.exposure >= minimumExposure &&
    quality.edgeDensity >= minimumEdgeDensity &&
    orientationConfidence >= minimumOrientationConfidence
  );
}

export class V10Scanner {
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
  readonly #frozen = document.createElement("canvas");
  readonly #progress = document.createElement("div");
  readonly #progressFill = document.createElement("div");
  readonly #progressText = document.createElement("p");
  readonly #options: ScannerOptions;
  readonly #frames: CapturedFrame[] = [];
  readonly #observations: V10FrameObservation[] = [];
  readonly #analysed = new Set<HTMLCanvasElement>();

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;
  #timer: number | undefined;
  #busy = false;
  #processing = false;
  #session = 0;
  #framesCaptured = 0;
  #usefulMilliseconds = 0;
  #lastUsefulAt: number | undefined;
  #retryAfterFrames = minimumFrames;
  #retryAfterMilliseconds = minimumUsefulMilliseconds;
  #bestScore = Number.NEGATIVE_INFINITY;
  #bestSharpness = 0;
  #stableFrames = 0;
  #lastQuality: FrameQuality | undefined;

  constructor(options: ScannerOptions) {
    this.#options = options;
    this.installFrozenFrame();
    this.installProgress();
    this.installEvents();
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

  private installFrozenFrame(): void {
    this.#frozen.width = analysisSize;
    this.#frozen.height = analysisSize;
    this.#frozen.setAttribute("aria-label", "Clearest captured v10 chart identicon frame");
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
  }

  private installProgress(): void {
    this.#progress.setAttribute("role", "progressbar");
    this.#progress.setAttribute("aria-valuemin", "0");
    this.#progress.setAttribute("aria-valuemax", "100");
    Object.assign(this.#progress.style, {
      display: "none",
      margin: "0.85rem 0",
      gap: "0.45rem"
    });
    const track = document.createElement("div");
    Object.assign(track.style, {
      blockSize: "0.6rem",
      overflow: "hidden",
      border: "1px solid #38384b",
      borderRadius: "999px",
      background: "#20202d"
    });
    Object.assign(this.#progressFill.style, {
      inlineSize: "0%",
      blockSize: "100%",
      borderRadius: "inherit",
      background: "linear-gradient(90deg, #8f8fc1, #d7d7ef)",
      transition: "inline-size 180ms ease"
    });
    Object.assign(this.#progressText.style, {
      margin: "0",
      color: "#c7c7d6",
      fontSize: "0.86rem",
      lineHeight: "1.4"
    });
    track.append(this.#progressFill);
    this.#progress.append(track, this.#progressText);
    this.#stage.insertAdjacentElement("afterend", this.#progress);
  }

  private installEvents(): void {
    this.#close.addEventListener("click", () => this.close());
    this.#upload.addEventListener("click", () => this.#file.click());
    this.#file.addEventListener("change", () => {
      const file = this.#file.files?.[0];
      this.#file.value = "";
      if (!file) return;
      void this.readPhoto(file).catch((error) => this.photoError(error));
    });
    this.#dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });
    this.#dialog.addEventListener("close", () => this.stop());
  }

  private async start(): Promise<void> {
    const session = ++this.#session;
    this.reset();
    this.#dialog.showModal();
    this.#upload.disabled = false;
    const copy = document.querySelector<HTMLElement>(".scan-copy p");
    if (copy) {
      copy.textContent =
        "Keep the complete astrology wheel inside the guide. V10 reads only the Reed–Solomon star field inside the aspect area; chart glyphs and colour are ignored for identity recovery.";
    }
    await this.acquireCamera(session, "Requesting camera access…");
  }

  private async acquireCamera(session: number, message: string): Promise<void> {
    this.message(message);
    await nextPaint();
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      this.cameraError(new TypeError("This browser does not provide an in-page camera API"));
      return;
    }

    try {
      const vision = loadOpenCv();
      const stream = await requestCamera(devices);
      if (session !== this.#session || !this.#dialog.open) {
        stopStream(stream);
        return;
      }
      this.#stream = stream;
      this.#video.srcObject = stream;
      await startVideo(this.#video);
      await this.configureCamera(stream);
      await vision;
      if (session !== this.#session || !this.#dialog.open) {
        this.stopCamera();
        return;
      }
      this.message("Holding the camera open while focus and exposure settle…");
      await pause(focusSettleMilliseconds);
      if (session !== this.#session || !this.#dialog.open) return;
      this.#stableFrames = 0;
      this.#lastQuality = undefined;
      this.message(
        "Bring the complete chart identicon into the guide and hold steady. Only sharp, stable frames will count."
      );
      this.schedule(0);
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
    if (capabilities.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
    if (capabilities.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" });
    if (capabilities.whiteBalanceMode?.includes("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
    if (advanced.length === 0) return;
    try {
      await track.applyConstraints({ advanced } as MediaTrackConstraints);
    } catch {
      // Optional camera hints only.
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
    this.#processing = false;
    this.#upload.disabled = false;
  }

  private reset(): void {
    this.stopCamera();
    this.#frames.length = 0;
    this.#observations.length = 0;
    this.#analysed.clear();
    this.#framesCaptured = 0;
    this.#usefulMilliseconds = 0;
    this.#lastUsefulAt = undefined;
    this.#retryAfterFrames = minimumFrames;
    this.#retryAfterMilliseconds = minimumUsefulMilliseconds;
    this.#bestScore = Number.NEGATIVE_INFINITY;
    this.#bestSharpness = 0;
    this.#stableFrames = 0;
    this.#lastQuality = undefined;
    this.#stage.classList.remove("captured", "analysing");
    this.#video.style.display = "";
    this.#guide.style.display = "";
    this.#frozen.style.display = "none";
    this.hideProgress();
    context(this.#frozen).clearRect(0, 0, this.#frozen.width, this.#frozen.height);
    context(this.#normalised).clearRect(0, 0, this.#normalised.width, this.#normalised.height);
  }

  private schedule(delay = automaticInterval): void {
    if (!this.#stream || !this.#dialog.open || this.#processing) return;
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => {
      this.#timer = undefined;
      void this.automaticFrame();
    }, delay);
  }

  private relativelySharp(quality: FrameQuality): boolean {
    if (this.#bestSharpness === 0) return true;
    return quality.sharpness >= this.#bestSharpness * rejectedRelativeSharpness;
  }

  private stable(quality: FrameQuality): boolean {
    const previous = this.#lastQuality;
    const previousBest = this.#bestSharpness;
    this.#bestSharpness = Math.max(this.#bestSharpness, quality.sharpness);
    this.#lastQuality = quality;
    if (!previous) {
      this.#stableFrames = 0;
      return false;
    }
    const focusStillImproving = previousBest > 0 && quality.sharpness > previousBest * 1.08;
    const focusStable = quality.sharpness >= this.#bestSharpness * minimumRelativeSharpness;
    const exposureStable = Math.abs(quality.exposure - previous.exposure) <= maximumExposureDelta;
    const contrastStable = Math.abs(quality.contrast - previous.contrast) <= maximumContrastDelta;
    if (focusStillImproving || !focusStable || !exposureStable || !contrastStable) {
      this.#stableFrames = 0;
      return false;
    }
    this.#stableFrames += 1;
    return this.#stableFrames >= minimumStableFrames;
  }

  private frameScore(quality: FrameQuality, orientationConfidence: number): number {
    return (
      quality.score * 100 +
      Math.min(80, Math.sqrt(Math.max(0, quality.sharpness)) * 6) +
      orientationConfidence * 40
    );
  }

  private async automaticFrame(): Promise<void> {
    if (!this.#stream || !this.#dialog.open || this.#busy || this.#processing) return;
    this.#busy = true;
    try {
      const vision = await loadOpenCv();
      captureVideo(this.#video, this.#capture);
      const circle = findV10OuterCircle(this.#capture);
      if (!circle) {
        this.message("Looking for the complete astrology wheel and its zodiac boundary…");
        return;
      }

      normaliseV10Circle(this.#capture, circle, this.#normalised, analysisSize);
      const canvas = copyCanvas(this.#normalised, analysisSize);
      const data = imageData(canvas);
      const quality = inspectFrame(vision, data);
      const orientation = observeV10Orientation(data);
      if (!usable(quality, orientation.confidence)) {
        this.message(this.qualityMessage(quality, orientation.confidence));
        return;
      }
      if (!this.relativelySharp(quality)) {
        this.message("That frame is blurrier than the clearest frame already seen. Discarded.");
        return;
      }

      const at = performance.now();
      const frame: CapturedFrame = {
        canvas,
        quality,
        orientation: orientation.angle,
        orientationConfidence: orientation.confidence,
        score: this.frameScore(quality, orientation.confidence),
        at
      };
      this.considerBest(frame);
      if (!this.stable(quality)) {
        this.message(
          `A clear frame is visible, but it is not eligible for decoding until focus and exposure remain stable (${this.#stableFrames}/${minimumStableFrames})…`
        );
        return;
      }

      this.remember(frame);
      this.#framesCaptured += 1;
      this.#usefulMilliseconds += this.#lastUsefulAt === undefined
        ? automaticInterval
        : Math.max(80, Math.min(300, at - this.#lastUsefulAt));
      this.#lastUsefulAt = at;
      this.message(
        `${this.#framesCaptured} stable clear frames · ${(this.#usefulMilliseconds / 1000).toFixed(1)}s useful capture · RS geometry locked`
      );
      if (
        this.#framesCaptured >= this.#retryAfterFrames &&
        this.#usefulMilliseconds >= this.#retryAfterMilliseconds
      ) await this.process(false);
    } catch (error) {
      if (!this.#processing) {
        this.message(error instanceof Error ? error.message : String(error), "error");
      }
    } finally {
      this.#busy = false;
      this.schedule();
    }
  }

  private qualityMessage(quality: FrameQuality, orientationConfidence: number): string {
    if (quality.sharpness < minimumSharpness) {
      return `Image is blurred (sharpness ${quality.sharpness.toFixed(1)}). Holding for autofocus…`;
    }
    if (quality.exposure < minimumExposure) {
      return "Exposure is still clipped or changing. Holding for camera compensation…";
    }
    if (quality.contrast < minimumContrast) {
      return "Contrast is too low. Reduce glare and hold the phone steady…";
    }
    if (quality.edgeDensity < minimumEdgeDensity || !quality.ready) {
      return "The chart identicon is incomplete or too soft to trust. No frame was retained…";
    }
    if (orientationConfidence < minimumOrientationConfidence) {
      return "Looking for the asymmetric Reed–Solomon star geometry inside the chart…";
    }
    return "Waiting for a sharper, more complete frame…";
  }

  private considerBest(frame: CapturedFrame): void {
    if (frame.score <= this.#bestScore) return;
    this.#bestScore = frame.score;
    this.updateBestFrame(frame.canvas);
  }

  private remember(frame: CapturedFrame): void {
    this.#frames.push(frame);
    this.#frames.sort((left, right) => right.score - left.score);
    if (this.#frames.length > retainedFrameLimit) this.#frames.length = retainedFrameLimit;
  }

  private updateBestFrame(source: HTMLCanvasElement): void {
    this.#frozen.width = source.width;
    this.#frozen.height = source.height;
    const target = context(this.#frozen);
    target.clearRect(0, 0, this.#frozen.width, this.#frozen.height);
    target.drawImage(source, 0, 0);
  }

  private showFrozen(): void {
    if (this.#frozen.width === 0 || this.#frozen.height === 0) {
      this.updateBestFrame(this.#normalised);
    }
    this.#video.style.display = "none";
    this.#guide.style.display = "none";
    this.#frozen.style.display = "block";
  }

  private showProgress(value: number, text: string): void {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    this.#progress.style.display = "grid";
    this.#progress.setAttribute("aria-valuenow", String(progress));
    this.#progressFill.style.inlineSize = `${progress}%`;
    this.#progressText.textContent = text;
  }

  private hideProgress(): void {
    this.#progress.style.display = "none";
    this.#progress.setAttribute("aria-valuenow", "0");
    this.#progressFill.style.inlineSize = "0%";
    this.#progressText.textContent = "";
    this.#progressText.style.color = "#c7c7d6";
  }

  private async process(photo: boolean): Promise<void> {
    if (this.#processing) return;
    this.#processing = true;
    this.#upload.disabled = true;
    this.stopCamera();
    this.#stage.classList.add("captured");
    this.showFrozen();
    this.showProgress(5, "Camera stopped. Analysing the stable retained v10 frames…");
    await nextPaint();

    try {
      const pending = this.#frames.filter((frame) => !this.#analysed.has(frame.canvas));
      for (let index = 0; index < pending.length; index += 1) {
        const frame = pending[index]!;
        this.showProgress(
          10 + (index / Math.max(1, pending.length)) * 72,
          `Reading orientation and Reed–Solomon stars from frame ${index + 1}/${pending.length}…`
        );
        await nextPaint();
        const observation = await observeV10Frame(frame.canvas);
        this.#observations.push(observation);
        this.#analysed.add(frame.canvas);
      }

      const merged = mergeV10Frames(this.#observations);
      const reading = merged.recovered;
      if (!reading) {
        if (photo) {
          throw new Error(
            "The photo did not provide enough reliable v10 Reed–Solomon evidence. Use a sharper or higher-resolution image."
          );
        }
        await this.resumeCapture(
          "The saved Reed–Solomon evidence is still insufficient. It has been kept for the next stable clear frames."
        );
        return;
      }

      const missingParity = merged.parity.filter((value) => value.value === null).length;
      this.showProgress(100, "V10 record validated. Applying the exact identity and signs…");
      this.#options.apply({
        ...reading.value,
        paletteIndex: seedPaletteIndex(reading.value),
        orientation: this.#frames[0]?.orientation ?? 0,
        uncertainStars: missingParity,
        correctedBytes: reading.errors,
        reconstructedStars: missingParity,
        cumulativeFrames: this.#framesCaptured,
        captureMilliseconds: Math.round(this.#usefulMilliseconds)
      });
      await pause(220);
      if (this.#dialog.open) this.close();
    } catch (error) {
      if (photo) {
        this.#processing = false;
        this.#upload.disabled = false;
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      await this.resumeCapture(`Processing could not validate a v10 record: ${reason}`);
    }
  }

  private async resumeCapture(reason: string): Promise<void> {
    this.#retryAfterFrames = this.#framesCaptured + retryAdditionalFrames;
    this.#retryAfterMilliseconds = this.#usefulMilliseconds + retryAdditionalMilliseconds;
    this.showProgress(100, `${reason} All prior evidence and the best frame are preserved.`);
    this.message("More stable clear frames are needed. Previous evidence is preserved.");
    await pause(600);
    if (!this.#dialog.open) return;
    this.#processing = false;
    this.#upload.disabled = false;
    this.#stage.classList.remove("captured", "analysing");
    this.#frozen.style.display = "none";
    this.#video.style.display = "";
    this.#guide.style.display = "";
    this.hideProgress();
    await this.acquireCamera(
      this.#session,
      "Restarting the camera with all previous v10 evidence preserved…"
    );
  }

  private async readPhoto(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file containing an astral chart identicon");
    }
    this.#upload.disabled = true;
    this.message("Opening and checking the selected photo for blur…");

    try {
      const vision = await loadOpenCv();
      const image = await loadImage(file);
      captureImage(image, this.#capture);
      const circle: Circle = findV10OuterCircle(this.#capture) ?? v10GuideCircle(this.#capture);
      normaliseV10Circle(this.#capture, circle, this.#normalised, analysisSize);
      const canvas = copyCanvas(this.#normalised, analysisSize);
      const data = imageData(canvas);
      const quality = inspectFrame(vision, data);
      const orientation = observeV10Orientation(data);
      if (!usable(quality, orientation.confidence)) {
        throw new Error(
          `The selected photo is too blurred, clipped or incomplete for safe v10 reconstruction (sharpness ${quality.sharpness.toFixed(1)})`
        );
      }

      const frame: CapturedFrame = {
        canvas,
        quality,
        orientation: orientation.angle,
        orientationConfidence: orientation.confidence,
        score: this.frameScore(quality, orientation.confidence),
        at: performance.now()
      };
      this.considerBest(frame);
      this.remember(frame);
      this.#framesCaptured = 1;
      this.#usefulMilliseconds = automaticInterval;
      await this.process(true);
    } finally {
      this.#busy = false;
      if (!this.#processing) this.#upload.disabled = false;
    }
  }

  private cameraError(error: unknown): void {
    this.stopCamera();
    this.#processing = false;
    this.message(cameraErrorMessage(error), "error");
    this.#upload.disabled = false;
  }

  private photoError(error: unknown): void {
    const value = error instanceof Error ? error.message : String(error);
    this.stopCamera();
    this.#processing = false;
    this.showProgress(100, value);
    this.#progressText.style.color = "#ff9eaa";
    this.message(
      "That photo could not be reconstructed. Choose a sharper photo or reopen the camera.",
      "error"
    );
    this.#upload.disabled = false;
  }

  private message(value: string, state: "" | "error" | "success" = ""): void {
    this.#status.textContent = value;
    this.#status.className = `scan-status${state ? ` ${state}` : ""}`;
  }
}
