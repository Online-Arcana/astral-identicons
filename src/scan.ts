import {
  captureVideo,
  findOuterCircle,
  normaliseCircle,
  readyOpenCv,
  warmOpenCv,
  type Circle
} from "./scan-cv.ts";
import {
  findOrientation,
  observePalette,
  type ObservedPalette
} from "./scan-colour.ts";
import { readSeed } from "./scan-seed.ts";
import {
  classifyConstellation,
  classifySigns,
  type SignReading,
  type SignResult
} from "./scan-sign.ts";
import type { IdenticonInput } from "./types.ts";

export interface ScanResult extends IdenticonInput {
  paletteIndex: number;
  orientation: number;
  erasedBytes: number;
  signs: SignReading;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

interface OrientedFrame {
  canvas: HTMLCanvasElement;
  data: ImageData;
  angle: number;
  constellation: SignResult;
}

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

async function orientationCandidates(
  source: HTMLCanvasElement,
  palette: ObservedPalette,
  anchorAngle: number
): Promise<OrientedFrame> {
  const coarse = [0, 90, 180, 270].map((offset) => {
    return normalisedAngle(anchorAngle + offset);
  });

  let best: OrientedFrame | undefined;

  for (const angle of coarse) {
    const canvas = rotated(source, angle);
    const data = imageData(canvas);
    const constellation = await classifyConstellation(data, palette);

    if (!best || constellation.score > best.constellation.score) {
      best = { canvas, data, angle, constellation };
    }
  }

  if (!best) throw new Error("Could not determine identicon orientation");

  const refined = [-4, -2, -1, 0, 1, 2, 4].map((offset) => {
    return normalisedAngle(best!.angle + offset);
  });

  for (const angle of refined) {
    if (angle === best.angle) continue;

    const canvas = rotated(source, angle);
    const data = imageData(canvas);
    const constellation = await classifyConstellation(data, palette);

    if (constellation.score <= best.constellation.score) continue;
    best = { canvas, data, angle, constellation };
  }

  return best;
}

function confidenceWarning(signs: SignReading): string | undefined {
  const values = [
    signs.solar,
    signs.lunar,
    signs.ascendant,
    signs.midheaven,
    signs.descendant,
    signs.imumCoeli
  ];

  const uncertain = values.filter((value) => value.confidence < 0.025).length;
  if (uncertain === 0) return undefined;
  return `${uncertain} sign${uncertain === 1 ? " is" : "s are"} low-confidence`;
}

function resultText(result: ScanResult): string {
  const warning = confidenceWarning(result.signs);
  const details = [
    `Seed ${result.seed}`,
    `${result.erasedBytes} corrected or uncertain byte${result.erasedBytes === 1 ? "" : "s"}`,
    warning
  ].filter(Boolean);

  return details.join(" · ");
}

export class Scanner {
  readonly #dialog = required<HTMLDialogElement>("#scan-dialog");
  readonly #video = required<HTMLVideoElement>("#scan-video");
  readonly #capture = required<HTMLCanvasElement>("#scan-capture");
  readonly #normalised = required<HTMLCanvasElement>("#scan-normalised");
  readonly #status = required<HTMLParagraphElement>("#scan-status");
  readonly #read = required<HTMLButtonElement>("#scan-read");
  readonly #close = required<HTMLButtonElement>("#scan-close");
  readonly #options: ScannerOptions;

  #stream: MediaStream | undefined;
  #openRequest: Promise<void> | undefined;

  constructor(options: ScannerOptions) {
    this.#options = options;

    this.#close.addEventListener("click", () => this.close());
    this.#read.addEventListener("click", () => {
      void this.read().catch((error) => this.error(error));
    });

    this.#dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close();
    });

    this.#dialog.addEventListener("close", () => this.stop());
  }

  async open(): Promise<void> {
    if (this.#openRequest) return this.#openRequest;

    this.#openRequest = this.start()
      .catch((error) => {
        this.error(error);
        throw error;
      })
      .finally(() => {
        this.#openRequest = undefined;
      });

    return this.#openRequest;
  }

  close(): void {
    this.stop();
    if (this.#dialog.open) this.#dialog.close();
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not provide an in-page camera API");
    }

    if (!this.#dialog.open) this.#dialog.showModal();
    this.message("Requesting camera access…");
    this.#read.disabled = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    this.#stream = stream;
    this.#video.srcObject = stream;
    await this.#video.play();

    warmOpenCv();
    this.#read.disabled = false;
    this.message(
      "Keep the complete outer circle inside the guide. Automatic circle detection is warming in the background."
    );
  }

  private stop(): void {
    for (const track of this.#stream?.getTracks() ?? []) track.stop();
    this.#stream = undefined;
    this.#video.srcObject = null;
    this.#read.disabled = false;
  }

  private async read(): Promise<void> {
    this.#read.disabled = true;
    this.message("Finding and normalising the identicon…");

    try {
      captureVideo(this.#video, this.#capture);

      const cv = readyOpenCv();
      const detectedCircle = cv
        ? findOuterCircle(cv, this.#capture)
        : null;

      const circle = detectedCircle ?? guideCircle(this.#capture);

      if (!cv) {
        this.message(
          "Using the camera guide now; automatic circle detection is still loading in the background…"
        );
      } else if (!detectedCircle) {
        this.message(
          "The outer circle was not detected automatically; using the camera guide alignment…"
        );
      }

      normaliseCircle(this.#capture, circle, this.#normalised);
      const rawData = imageData(this.#normalised);
      const palette = observePalette(rawData);
      const anchor = findOrientation(rawData, palette);

      this.message("Checking the upright constellation and fixed sign references…");
      const oriented = await orientationCandidates(
        this.#normalised,
        palette,
        anchor.angle
      );

      const normalisedContext = context(this.#normalised);
      normalisedContext.clearRect(
        0,
        0,
        this.#normalised.width,
        this.#normalised.height
      );
      normalisedContext.drawImage(oriented.canvas, 0, 0);

      this.message("Reading the coded stars and correcting uncertain bytes…");
      const seed = readSeed(oriented.data, palette);

      this.message("Classifying the upright and ring glyphs…");
      const signs = await classifySigns(
        oriented.data,
        palette,
        oriented.constellation
      );

      const result: ScanResult = {
        seed: seed.seed,
        solar: signs.solar.sign,
        lunar: signs.lunar.sign,
        ascendant: signs.ascendant.sign,
        midheaven: signs.midheaven.sign,
        descendant: signs.descendant.sign,
        imumCoeli: signs.imumCoeli.sign,
        paletteIndex: palette.index,
        orientation: oriented.angle,
        erasedBytes: seed.erasures,
        signs
      };

      this.#options.apply(result);
      this.message(resultText(result), false);
    } finally {
      this.#read.disabled = false;
    }
  }

  private message(value: string, busy = true): void {
    this.#status.textContent = value;
    this.#status.className = busy ? "scan-status busy" : "scan-status success";
  }

  private error(error: unknown): void {
    this.stop();
    this.#status.textContent = error instanceof Error ? error.message : String(error);
    this.#status.className = "scan-status error";
    this.#read.disabled = false;
  }
}
