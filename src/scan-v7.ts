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
import { observeStarParity } from "./scan-star-parity.ts";
import {
  verifyExpectedSigns,
  type SignVerification
} from "./scan-verify.ts";
import { seedDataByteCount, seedPaletteIndex, seedSlotCount } from "./seed.ts";
import type { ByteObservation } from "./star-parity.ts";
import type { IdenticonInput } from "./types.ts";
import {
  VisualCaptureSeries,
  type VisualCaptureSnapshot
} from "./visual-series.ts";

export interface ScanResult extends IdenticonInput {
  paletteIndex: number;
  orientation: number;
  uncertainStars: number;
  correctedBytes: number;
  reconstructedStars: number;
  cumulativeFrames: number;
  captureMilliseconds: number;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

interface FrameEvidence {
  readonly canvas: HTMLCanvasElement;
  readonly palette: ObservedPalette;
  readonly angle: number;
  readonly quality: FrameQuality;
  readonly stars: readonly ByteObservation[];
  readonly score: number;
}

interface CameraCapabilities extends MediaTrackCapabilities {
  focusMode?: readonly string[];
  exposureMode?: readonly string[];
  whiteBalanceMode?: readonly string[];
}

type Role = keyof Omit<IdenticonInput, "seed">;

const automaticInterval = 90;
const focusSettleMilliseconds = 450;
const analysisSize = 512;
const minimumSharpness = 12;
const minimumContrast = 7;
const minimumExposure = 0.18;
const minimumEdgeDensity = 0.0015;
const roles: readonly Role[] = [
  "solar",
  "lunar",
  "ascendant",
  "midheaven",
  "descendant",
  "imumCoeli"
];
const roleMap: Readonly<Record<string, Role>> = {
  Sun: "solar",
  Moon: "lunar",
  Ascendant: "ascendant",
  Midheaven: "midheaven",
  Descendant: "descendant",
  "Imum Coeli": "imumCoeli"
};
const layoutPlaceholder: IdenticonInput = {
  seed: "capture-layout",
  solar: "aries",
  lunar: "aries",
  ascendant: "aries",
  midheaven: "aries",
  descendant: "cancer",
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

function readable(values: readonly ByteObservation[]): number {
  return values.filter((value) => value.value !== null).length;
}

function usable(quality: FrameQuality): boolean {
  return (
    quality.sharpness >= minimumSharpness &&
    quality.contrast >= minimumContrast &&
    quality.exposure >= minimumExposure &&
    quality.edgeDensity >= minimumEdgeDensity
  );
}

function chooseAlignment(
  source: HTMLCanvasElement,
  observed: ObservedPalette,
  vision: Awaited<ReturnType<typeof loadOpenCv>>
): FrameEvidence {
  const raw = imageData(source);
  const variants = [observed, swapPalette(observed)] as const;
  let selected = variants[0];
  let selectedAngle = 0;
  let selectedConfidence = Number.NEGATIVE_INFINITY;

  for (const palette of variants) {
    const orientation = findOrientation(raw, palette);
    if (orientation.confidence <= selectedConfidence) continue;
    selected = palette;
    selectedAngle = orientation.angle;
    selectedConfidence = orientation.confidence;
  }

  const canvas = rotated(source, selectedAngle);
  const data = imageData(canvas);
  const quality = inspectFrame(vision, data);
  const stars = observeStarParity(data, selected);

  return {
    canvas,
    palette: selected,
    angle: selectedAngle,
    quality,
    stars,
    score: quality.score * 100 + readable(stars) * 1.5
  };
}

function progressMessage(snapshot: VisualCaptureSnapshot): string {
  const useful = (snapshot.usefulMilliseconds / 1_000).toFixed(1);
  return [
    `${useful}s useful capture`,
    `${snapshot.observedStars}/${seedSlotCount} recovery stars`,
    `${snapshot.requiredStars} required`,
    `${snapshot.centreFound}/9 centre regions`,
    `${snapshot.ringFound}/12 ring regions`
  ].join(" · ");
}

function emptyRoleMap(): Record<Role, boolean> {
  return Object.fromEntries(
    roles.map((role) => [role, false])
  ) as Record<Role, boolean>;
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
  readonly #frozen = document.createElement("canvas");
  readonly #mosaic = document.createElement("canvas");
  readonly #series = new VisualCaptureSeries();
  readonly #options: ScannerOptions;
  readonly #progress = document.createElement("div");
  readonly #progressFill = document.createElement("div");
  readonly #progressText = document.createElement("p");
  readonly #centreMosaicScores = Array<number>(centreRegions.length)
    .fill(Number.NEGATIVE_INFINITY);
  readonly #ringMosaicScores = Array<number>(ringRegions.length)
    .fill(Number.NEGATIVE_INFINITY);

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;
  #timer: number | undefined;
  #busy = false;
  #processing = false;
  #session = 0;
  #bestFrame: FrameEvidence | undefined;
  #baseMosaicScore = Number.NEGATIVE_INFINITY;

  constructor(options: ScannerOptions) {
    this.#options = options;

    for (const canvas of [this.#frozen, this.#mosaic]) {
      canvas.width = analysisSize;
      canvas.height = analysisSize;
    }

    this.#frozen.setAttribute("aria-label", "Captured identicon reconstruction");
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

    const copy = document.querySelector<HTMLElement>(".scan-copy p");
    if (copy) {
      copy.textContent =
        "Move normally. Every clear star, colour and approved glyph region is saved. Forty reliable stars can reconstruct the complete record. Once enough evidence exists, the camera stops and processing continues from the captured reconstruction.";
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
    this.message("Requesting camera access…");
    await nextPaint();

    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      this.cameraError(
        new TypeError("This browser does not provide an in-page camera API")
      );
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
        this.stop();
        return;
      }

      this.message("Letting focus and exposure settle briefly…");
      await pause(focusSettleMilliseconds);
      if (session !== this.#session || !this.#dialog.open) return;

      this.message(
        "Bring the identicon into the guide for one or two clear moments. You do not need to hold still."
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
      // Optional camera hints. Evidence collection remains cumulative.
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
    this.resetViewport();
    this.#upload.disabled = false;
  }

  private resetEvidence(): void {
    this.#series.clear();
    this.#bestFrame = undefined;
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
    this.hideProgress();
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

  private showProgress(value: number, text: string): void {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    this.#progress.style.display = "grid";
    this.#progress.setAttribute("aria-valuenow", String(progress));
    this.#progressFill.style.inlineSize = `${progress}%`;
    this.#progressText.textContent = text;
    this.message(text);
  }

  private hideProgress(): void {
    this.#progress.style.display = "none";
    this.#progress.setAttribute("aria-valuenow", "0");
    this.#progressFill.style.inlineSize = "0%";
    this.#progressText.textContent = "";
    this.#progressText.style.color = "#c7c7d6";
  }

  private scheduleAutomatic(delay = automaticInterval): void {
    if (!this.#stream || !this.#dialog.open || this.#processing) return;
    if (this.#timer !== undefined) window.clearTimeout(this.#timer);

    this.#timer = window.setTimeout(() => {
      this.#timer = undefined;
      void this.automaticFrame();
    }, delay);
  }

  private async automaticFrame(): Promise<void> {
    if (!this.#stream || !this.#dialog.open || this.#busy || this.#processing) return;
    this.#busy = true;

    try {
      const vision = await loadOpenCv();
      captureVideo(this.#video, this.#capture);
      const circle = findOuterCircle(this.#capture);

      if (!circle) {
        const snapshot = this.#series.snapshot();
        this.message(snapshot.frames === 0
          ? "Looking for the outer circle…"
          : `${progressMessage(snapshot)} · progress saved; bring it back into view.`
        );
        return;
      }

      normaliseCircle(this.#capture, circle, this.#normalised, analysisSize);
      const source = copyCanvas(this.#normalised, analysisSize);
      const observed = observePalette(imageData(source));
      const frame = chooseAlignment(source, observed, vision);
      const before = this.#series.snapshot();

      if (!usable(frame.quality)) {
        this.message(this.qualityMessage(frame.quality, before));
        return;
      }

      this.#stage.classList.add("analysing");
      this.accumulateMosaic(frame);
      if (!this.#bestFrame || frame.score > this.#bestFrame.score) {
        this.#bestFrame = frame;
      }

      const snapshot = this.#series.add({
        at: performance.now(),
        stars: frame.stars,
        quality: frame.quality.score,
        centre: frame.quality.centre,
        ring: frame.quality.ring
      });

      this.message(progressMessage(snapshot));
      if (!this.captureEnough(snapshot, frame)) return;
      await this.processCaptured(snapshot, frame);
    } catch (error) {
      this.processingError(error, true);
    } finally {
      this.#busy = false;
      this.scheduleAutomatic();
    }
  }

  private qualityMessage(
    quality: FrameQuality,
    snapshot: VisualCaptureSnapshot
  ): string {
    const saved = snapshot.frames > 0
      ? ` Progress saved: ${snapshot.observedStars}/${seedSlotCount} recovery stars.`
      : "";

    if (quality.sharpness < minimumSharpness) {
      return `That instant was blurred. Move naturally and let the camera catch the next clear moment.${saved}`;
    }
    if (quality.exposure < minimumExposure) {
      return `Waiting for a better-exposed moment.${saved}`;
    }
    if (quality.contrast < minimumContrast) {
      return `Reduce glare or move slightly closer.${saved}`;
    }
    return `Collecting whichever approved elements are clear in each moment.${saved}`;
  }

  private capturedRoles(): ReadonlySet<Role> {
    const found = new Set<Role>();

    for (let index = 0; index < centreRegions.length; index += 1) {
      if (!Number.isFinite(this.#centreMosaicScores[index]!)) continue;
      found.add(roleMap[centreRegions[index]!.role]!);
    }
    for (let index = 0; index < ringRegions.length; index += 1) {
      if (!Number.isFinite(this.#ringMosaicScores[index]!)) continue;
      found.add(roleMap[ringRegions[index]!.role]!);
    }
    return found;
  }

  private captureEnough(
    snapshot: VisualCaptureSnapshot,
    frame: FrameEvidence
  ): boolean {
    const reading = snapshot.reading;
    if (!snapshot.ready || !reading) return false;
    if (this.capturedRoles().size < 4) return false;
    if (snapshot.centreFound < 4 || snapshot.ringFound < 4) return false;

    const expectedPalette = seedPaletteIndex(reading.value);
    return (
      frame.palette.index === expectedPalette ||
      frame.palette.confidence < 0.4
    );
  }

  private accumulateMosaic(frame: FrameEvidence): void {
    const target = context(this.#mosaic);
    const scale = this.#mosaic.width / layoutCanvas;

    const copyRegion = (
      source: HTMLCanvasElement,
      x: number,
      y: number,
      size: number
    ): void => {
      const padding = size * 0.32;
      const sourceX = Math.max(0, (x - size / 2 - padding) * scale);
      const sourceY = Math.max(0, (y - size / 2 - padding) * scale);
      const sourceSize = Math.min(
        this.#mosaic.width - sourceX,
        this.#mosaic.height - sourceY,
        (size + padding * 2) * scale
      );

      target.drawImage(
        source,
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

    if (!Number.isFinite(this.#baseMosaicScore)) {
      this.#baseMosaicScore = frame.quality.score;
      target.drawImage(frame.canvas, 0, 0);
    }

    for (let index = 0; index < centreRegions.length; index += 1) {
      if (!(frame.quality.centre[index] ?? false)) continue;
      const score = frame.quality.centreScores[index] ?? 0;
      if (score <= this.#centreMosaicScores[index]!) continue;
      this.#centreMosaicScores[index] = score;
      const region = centreRegions[index]!;
      copyRegion(frame.canvas, region.x, region.y, region.size);
    }

    for (let index = 0; index < ringRegions.length; index += 1) {
      if (!(frame.quality.ring[index] ?? false)) continue;
      const score = frame.quality.ringScores[index] ?? 0;
      if (score <= this.#ringMosaicScores[index]!) continue;
      this.#ringMosaicScores[index] = score;
      const region = ringRegions[index]!;
      copyRegion(frame.canvas, region.x, region.y, region.size * 1.35);
    }
  }

  private async processCaptured(
    snapshot: VisualCaptureSnapshot,
    current: FrameEvidence
  ): Promise<void> {
    if (this.#processing || !snapshot.reading) return;
    this.#processing = true;
    this.#upload.disabled = true;
    const session = this.#session;
    const reading = snapshot.reading;
    const value = reading.value;
    const paletteIndex = seedPaletteIndex(value);

    this.freeze(this.#mosaic);
    this.showProgress(8, "Capture complete. Camera stopped. You no longer need to hold it up.");
    await nextPaint();
    await pause(70);
    if (session !== this.#session) return;

    this.showProgress(28, `Reconstructing the complete record from ${reading.observedStars} reliable stars…`);
    await nextPaint();
    await pause(40);

    this.showProgress(48, `Reed–Solomon restored ${reading.reconstructedStars} missing or discarded star symbols…`);
    await nextPaint();
    await pause(40);

    this.showProgress(58, "Checking the recovered identity against the captured colour palette…");
    await nextPaint();
    const aligned = alignPaletteToIndex(current.palette, paletteIndex);

    const sources: Array<{
      canvas: HTMLCanvasElement;
      palette: ObservedPalette;
      label: string;
    }> = [{
      canvas: this.#mosaic,
      palette: aligned,
      label: "cumulative reconstruction"
    }];

    if (this.#bestFrame && this.#bestFrame.canvas !== current.canvas) {
      sources.push({
        canvas: this.#bestFrame.canvas,
        palette: alignPaletteToIndex(this.#bestFrame.palette, paletteIndex),
        label: "clearest captured moment"
      });
    }
    sources.push({
      canvas: current.canvas,
      palette: aligned,
      label: "final captured moment"
    });

    const roleFound = emptyRoleMap();
    let constellationFound = false;
    let centreFound = 0;
    let ringFound = 0;

    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index]!;
      const progress = 64 + (index / Math.max(1, sources.length)) * 24;
      this.showProgress(
        progress,
        `Verifying the approved glyphs and constellation from the ${source.label}…`
      );
      await nextPaint();

      const verification = await verifyExpectedSigns(
        imageData(source.canvas),
        source.palette,
        value
      );
      this.mergeVerification(
        verification,
        roleFound,
        (found) => { constellationFound ||= found; }
      );
      centreFound = Math.max(centreFound, verification.centreFound);
      ringFound = Math.max(ringFound, verification.ringFound);
      if (session !== this.#session) return;
    }

    const rolesFound = roles.filter((role) => roleFound[role]).length;
    const verified = (
      constellationFound &&
      rolesFound >= 4 &&
      centreFound >= 4 &&
      ringFound >= 4
    );

    if (!verified) {
      throw new Error(
        `The star record reconstructed correctly, but visual verification only confirmed ${rolesFound}/6 sign roles, ${centreFound}/9 centre regions and ${ringFound}/12 ring regions`
      );
    }

    this.showProgress(94, "Final consistency check across stars, palette, constellation, grid and ring…");
    await nextPaint();
    await pause(60);
    if (session !== this.#session) return;

    this.showProgress(100, "Processing complete. Applying the exact identity and signs…");
    await nextPaint();

    this.#options.apply({
      ...value,
      paletteIndex,
      orientation: current.angle,
      uncertainStars: seedSlotCount - reading.observedStars,
      correctedBytes: reading.reconstructedStars,
      reconstructedStars: reading.reconstructedStars,
      cumulativeFrames: snapshot.frames,
      captureMilliseconds: Math.round(snapshot.usefulMilliseconds)
    });

    await pause(220);
    if (session === this.#session) this.close();
  }

  private mergeVerification(
    verification: SignVerification,
    roleFound: Record<Role, boolean>,
    constellation: (found: boolean) => void
  ): void {
    for (const role of roles) {
      roleFound[role] ||= verification.roleFound[role];
    }
    constellation(verification.constellationFound);
  }

  private async readPhoto(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose an image file containing an astral identicon");
    }

    this.#upload.disabled = true;
    this.message("Opening the selected photo…");

    try {
      const vision = await loadOpenCv();
      const image = await loadImage(file);
      captureImage(image, this.#capture);
      const circle = findOuterCircle(this.#capture) ?? guideCircle(this.#capture);
      normaliseCircle(this.#capture, circle, this.#normalised, analysisSize);
      const source = copyCanvas(this.#normalised, analysisSize);
      const observed = observePalette(imageData(source));
      const frame = chooseAlignment(source, observed, vision);

      if (!usable(frame.quality)) {
        throw new Error("The selected photo is too blurred, clipped or incomplete to reconstruct safely");
      }

      this.accumulateMosaic(frame);
      this.#bestFrame = frame;
      const snapshot = this.#series.add({
        at: performance.now(),
        stars: frame.stars,
        quality: frame.quality.score,
        centre: frame.quality.centre,
        ring: frame.quality.ring
      });

      if (!snapshot.reading) {
        throw new Error(
          `The photo yielded ${snapshot.observedStars}/${seedSlotCount} readable recovery stars; at least ${seedDataByteCount} consistent stars are required`
        );
      }

      await this.processCaptured(snapshot, frame);
    } finally {
      this.#busy = false;
      if (!this.#processing) this.#upload.disabled = false;
    }
  }

  private cameraError(error: unknown): void {
    this.stopCamera();
    this.message(cameraErrorMessage(error), "error");
    this.#upload.disabled = false;
  }

  private processingError(error: unknown, recoverable = false): void {
    const value = error instanceof Error ? error.message : String(error);

    if (recoverable && this.#stream && this.#dialog.open && !this.#processing) {
      const snapshot = this.#series.snapshot();
      this.message(
        snapshot.frames > 0
          ? `${progressMessage(snapshot)} · progress saved. ${value}`
          : `Still looking: ${value}`
      );
      return;
    }

    this.stopCamera();
    this.#processing = false;
    this.showProgress(100, value);
    this.#progressText.style.color = "#ff9eaa";
    this.message(value, "error");
    this.#upload.disabled = false;
  }

  private message(value: string, state: "" | "error" | "success" = ""): void {
    this.#status.textContent = value;
    this.#status.className = `scan-status${state ? ` ${state}` : ""}`;
  }
}
