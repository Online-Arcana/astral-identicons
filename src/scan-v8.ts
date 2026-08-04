import {
  cameraErrorMessage,
  nextPaint,
  requestCamera,
  startVideo,
  stopStream
} from "./camera.ts";
import {
  captureMinimumFrames,
  captureMinimumMilliseconds,
  captureObservationTarget,
  captureReady,
  recoverCaptured
} from "./capture-recovery.ts";
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
import { placements, ringPlacements } from "./layout.ts";
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
  readonly at: number;
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
const retainedFrameLimit = 12;
const retryAdditionalFrames = 4;
const retryAdditionalMilliseconds = 700;
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
  midheaven: "libra",
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
  vision: Awaited<ReturnType<typeof loadOpenCv>>,
  at: number
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
    score: quality.score * 100 + readable(stars) * 1.5,
    at
  };
}

function progressMessage(snapshot: VisualCaptureSnapshot): string {
  const useful = (snapshot.usefulMilliseconds / 1_000).toFixed(1);
  return [
    `${useful}s useful capture`,
    `${snapshot.frames} comparison frames`,
    `${snapshot.observedStars}/${seedSlotCount} distinct recovery stars`,
    `${seedDataByteCount} mathematical minimum`,
    `${captureObservationTarget} capture target`,
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
  readonly #series = new VisualCaptureSeries();
  readonly #options: ScannerOptions;
  readonly #progress = document.createElement("div");
  readonly #progressFill = document.createElement("div");
  readonly #progressText = document.createElement("p");
  readonly #frames: FrameEvidence[] = [];
  readonly #centreScores = Array<number>(centreRegions.length)
    .fill(Number.NEGATIVE_INFINITY);
  readonly #ringScores = Array<number>(ringRegions.length)
    .fill(Number.NEGATIVE_INFINITY);
  readonly #centreFrames = Array<FrameEvidence | undefined>(centreRegions.length)
    .fill(undefined);
  readonly #ringFrames = Array<FrameEvidence | undefined>(ringRegions.length)
    .fill(undefined);

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;
  #timer: number | undefined;
  #busy = false;
  #processing = false;
  #session = 0;
  #bestFrame: FrameEvidence | undefined;
  #retryAfterFrames = captureMinimumFrames;
  #retryAfterMilliseconds = captureMinimumMilliseconds;
  #attempts = 0;

  constructor(options: ScannerOptions) {
    this.#options = options;
    this.#frozen.width = analysisSize;
    this.#frozen.height = analysisSize;
    this.#frozen.setAttribute("aria-label", "Clearest captured identicon frame");
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
        "Move normally. Clear stars, colours and approved glyph regions are saved across several comparison frames. The scanner waits for the image to settle and for at least 1.2 seconds of useful capture before it can stop the camera. If reconstruction needs more evidence, it resumes without losing progress.";
    }

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
    await this.acquireCamera(session, "Requesting camera access…");
  }

  private async acquireCamera(session: number, status: string): Promise<void> {
    this.message(status);
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
        this.stopCamera();
        return;
      }

      this.message("Letting focus and exposure settle before collecting comparison frames…");
      await pause(focusSettleMilliseconds);
      if (session !== this.#session || !this.#dialog.open) return;

      this.message(
        this.#series.snapshot().frames === 0
          ? "Bring the identicon into the guide. Move naturally; several clear moments will be compared."
          : "Saved evidence restored. Bring the identicon back for another clear comparison moment."
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
    this.#frames.length = 0;
    this.#bestFrame = undefined;
    this.#centreScores.fill(Number.NEGATIVE_INFINITY);
    this.#ringScores.fill(Number.NEGATIVE_INFINITY);
    this.#centreFrames.fill(undefined);
    this.#ringFrames.fill(undefined);
    this.#retryAfterFrames = captureMinimumFrames;
    this.#retryAfterMilliseconds = captureMinimumMilliseconds;
    this.#attempts = 0;
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
        this.message(
          snapshot.frames === 0
            ? "Looking for the outer circle…"
            : `${progressMessage(snapshot)} · progress saved; bring it back into view.`
        );
        return;
      }

      normaliseCircle(this.#capture, circle, this.#normalised, analysisSize);
      const source = copyCanvas(this.#normalised, analysisSize);
      const observed = observePalette(imageData(source));
      const at = performance.now();
      const frame = chooseAlignment(source, observed, vision, at);
      const before = this.#series.snapshot();

      if (!usable(frame.quality)) {
        this.message(this.qualityMessage(frame.quality, before));
        return;
      }

      this.#stage.classList.add("analysing");
      this.rememberFrame(frame);
      const snapshot = this.#series.add({
        at,
        stars: frame.stars,
        quality: frame.quality.score,
        centre: frame.quality.centre,
        ring: frame.quality.ring
      });

      this.message(progressMessage(snapshot));
      if (!this.captureEnough(snapshot)) return;
      await this.processCaptured(snapshot, frame, true);
    } catch (error) {
      await this.recoverFromFailure(error);
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
      ? ` Progress saved: ${snapshot.frames} comparison frames and ${snapshot.observedStars}/${seedSlotCount} distinct stars.`
      : "";

    if (quality.sharpness < minimumSharpness) {
      return `That instant was blurred. The next clear moment will be compared with the saved ones.${saved}`;
    }
    if (quality.exposure < minimumExposure) {
      return `Waiting for a better-exposed comparison frame.${saved}`;
    }
    if (quality.contrast < minimumContrast) {
      return `Reduce glare or move slightly closer.${saved}`;
    }
    return `Collecting another clear comparison frame.${saved}`;
  }

  private rememberFrame(frame: FrameEvidence): void {
    if (!this.#bestFrame || frame.score > this.#bestFrame.score) {
      this.#bestFrame = frame;
    }

    this.#frames.push(frame);
    this.#frames.sort((left, right) => right.score - left.score);
    if (this.#frames.length > retainedFrameLimit) this.#frames.length = retainedFrameLimit;

    for (let index = 0; index < centreRegions.length; index += 1) {
      if (!(frame.quality.centre[index] ?? false)) continue;
      const score = frame.quality.centreScores[index] ?? 0;
      if (score <= this.#centreScores[index]!) continue;
      this.#centreScores[index] = score;
      this.#centreFrames[index] = frame;
    }

    for (let index = 0; index < ringRegions.length; index += 1) {
      if (!(frame.quality.ring[index] ?? false)) continue;
      const score = frame.quality.ringScores[index] ?? 0;
      if (score <= this.#ringScores[index]!) continue;
      this.#ringScores[index] = score;
      this.#ringFrames[index] = frame;
    }
  }

  private capturedRoles(): ReadonlySet<Role> {
    const found = new Set<Role>();

    for (let index = 0; index < centreRegions.length; index += 1) {
      if (!this.#centreFrames[index]) continue;
      found.add(roleMap[centreRegions[index]!.role]!);
    }
    for (let index = 0; index < ringRegions.length; index += 1) {
      if (!this.#ringFrames[index]) continue;
      found.add(roleMap[ringRegions[index]!.role]!);
    }
    return found;
  }

  private captureEnough(snapshot: VisualCaptureSnapshot): boolean {
    if (snapshot.frames < this.#retryAfterFrames) return false;
    if (snapshot.usefulMilliseconds < this.#retryAfterMilliseconds) return false;

    return captureReady({
      observedStars: snapshot.observedStars,
      centreFound: snapshot.centreFound,
      ringFound: snapshot.ringFound,
      hasReading: Boolean(snapshot.reading),
      capturedRoles: this.capturedRoles().size,
      frames: snapshot.frames,
      usefulMilliseconds: snapshot.usefulMilliseconds
    });
  }

  private evidenceSources(
    snapshot: VisualCaptureSnapshot,
    current: FrameEvidence
  ): readonly (readonly ByteObservation[])[] {
    const sources: Array<readonly ByteObservation[]> = [snapshot.stars];
    const seen = new Set<HTMLCanvasElement>();

    for (const frame of [current, this.#bestFrame, ...this.#frames]) {
      if (!frame || seen.has(frame.canvas)) continue;
      seen.add(frame.canvas);
      sources.push(frame.stars);
    }

    return sources;
  }

  private verificationFrames(current: FrameEvidence): readonly FrameEvidence[] {
    const candidates = [
      this.#bestFrame,
      current,
      ...this.#centreFrames,
      ...this.#ringFrames,
      ...this.#frames
    ];
    const seen = new Set<HTMLCanvasElement>();
    const selected: FrameEvidence[] = [];

    for (const frame of candidates) {
      if (!frame || seen.has(frame.canvas)) continue;
      seen.add(frame.canvas);
      selected.push(frame);
    }

    return selected.slice(0, retainedFrameLimit);
  }

  private async processCaptured(
    snapshot: VisualCaptureSnapshot,
    current: FrameEvidence,
    cameraCapture: boolean
  ): Promise<void> {
    if (this.#processing) return;
    this.#processing = true;
    this.#upload.disabled = true;
    const session = this.#session;
    const display = this.#bestFrame ?? current;

    this.freeze(display.canvas);
    this.message("Capture complete. Processing several saved comparison frames…");
    this.showProgress(8, "Camera stopped. You no longer need to hold it up.");
    await nextPaint();
    await pause(180);
    if (session !== this.#session) return;

    this.showProgress(
      22,
      `Comparing ${snapshot.frames} usable frames and ${snapshot.observedStars} distinct stars…`
    );
    await nextPaint();

    const reading = snapshot.reading ?? recoverCaptured(
      this.evidenceSources(snapshot, current)
    );
    if (!reading) {
      if (!cameraCapture) {
        throw new Error("The selected photo does not contain a consistent recoverable record")
      }
      await this.retryCapture(
        snapshot,
        "The saved comparison frames did not yet agree on one record."
      );
      return;
    }

    const value = reading.value;
    const paletteIndex = seedPaletteIndex(value);
    this.showProgress(
      42,
      `Reed–Solomon resolved the record and restored ${reading.reconstructedStars} missing or discarded symbols…`
    );
    await nextPaint();
    await pause(60);

    const roleFound = emptyRoleMap();
    let constellationFound = false;
    let centreFound = 0;
    let ringFound = 0;
    const frames = this.verificationFrames(current);

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index]!;
      const progress = 52 + (index / Math.max(1, frames.length)) * 36;
      this.showProgress(
        progress,
        `Checking approved glyphs and constellation across comparison frame ${index + 1}/${frames.length}…`
      );
      await nextPaint();

      const verification = await verifyExpectedSigns(
        imageData(frame.canvas),
        alignPaletteToIndex(frame.palette, paletteIndex),
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
      if (!cameraCapture) {
        throw new Error(
          `The record recovered, but the photo confirmed only ${rolesFound}/6 sign roles, ${centreFound}/9 centre regions and ${ringFound}/12 ring regions`
        );
      }
      await this.retryCapture(
        snapshot,
        `The record recovered, but visual comparison confirmed only ${rolesFound}/6 sign roles, ${centreFound}/9 centre regions and ${ringFound}/12 ring regions.`
      );
      return;
    }

    this.showProgress(96, "Final consistency check across parity, palette and approved glyphs…");
    await nextPaint();
    await pause(80);
    if (session !== this.#session) return;

    this.showProgress(100, "Processing complete. Applying the exact identity and signs…");
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

  private async retryCapture(
    snapshot: VisualCaptureSnapshot,
    reason: string
  ): Promise<void> {
    this.#attempts += 1;
    this.#retryAfterFrames = snapshot.frames + retryAdditionalFrames;
    this.#retryAfterMilliseconds =
      snapshot.usefulMilliseconds + retryAdditionalMilliseconds;
    this.showProgress(
      100,
      `${reason} All evidence is preserved. Restarting the camera for a few more comparison frames.`
    );
    this.message(`Processing attempt ${this.#attempts} needs another clear comparison moment; progress is preserved.`);
    await pause(500);

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
      "Restarting the camera with all previous evidence preserved…"
    );
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
      const at = performance.now();
      const frame = chooseAlignment(source, observed, vision, at);

      if (!usable(frame.quality)) {
        throw new Error("The selected photo is too blurred, clipped or incomplete to reconstruct safely");
      }

      this.rememberFrame(frame);
      const snapshot = this.#series.add({
        at,
        stars: frame.stars,
        quality: frame.quality.score,
        centre: frame.quality.centre,
        ring: frame.quality.ring
      });
      await this.processCaptured(snapshot, frame, false);
    } finally {
      this.#busy = false;
      if (!this.#processing) this.#upload.disabled = false;
    }
  }

  private async recoverFromFailure(error: unknown): Promise<void> {
    const value = error instanceof Error ? error.message : String(error);
    const snapshot = this.#series.snapshot();

    if (this.#processing && this.#dialog.open) {
      await this.retryCapture(snapshot, `Processing was interrupted: ${value}`);
      return;
    }

    this.message(
      snapshot.frames > 0
        ? `${progressMessage(snapshot)} · progress saved. ${value}`
        : `Still looking: ${value}`
    );
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
    this.message("That photo could not be reconstructed. Choose another photo or reopen the camera.", "error");
    this.#upload.disabled = false;
  }

  private message(value: string, state: "" | "error" | "success" = ""): void {
    this.#status.textContent = value;
    this.#status.className = `scan-status${state ? ` ${state}` : ""}`;
  }
}
