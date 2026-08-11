import packageMetadata from "../package.json";
import { installFormatStatus } from "./format-status.ts";
import { installVersionFooter } from "./footer.ts";
import { Scanner as V8Scanner } from "./scan-v8.ts";
import { V9Scanner } from "./scan-v9.ts";
import { V10Scanner } from "./scan-v10.ts";
import {
  exportedV9SvgFile,
  isSvgFile
} from "./scan-v9-svg.ts";
import { seedPaletteIndex } from "./seed.ts";
import type { IdenticonInput } from "./types.ts";

export interface ScanResult extends IdenticonInput {
  readonly paletteIndex: number;
  readonly orientation: number;
  readonly uncertainStars: number;
  readonly correctedBytes: number;
  readonly reconstructedStars: number;
  readonly cumulativeFrames: number;
  readonly captureMilliseconds: number;
}

interface ScannerOptions {
  apply(result: ScanResult): void;
}

const selected = typeof location === "undefined"
  ? null
  : new URLSearchParams(location.search).get("scanner");
const selectedVersion = selected === "v8" ? 8 : selected === "v9" ? 9 : 10;

export const appVersion = packageMetadata.version;
export const scannerVersion = selectedVersion;

installVersionFooter(appVersion, scannerVersion);
installFormatStatus(scannerVersion);

function scanStatus(message: string, error = false): void {
  const status = document.querySelector<HTMLElement>("#scan-status");
  if (!status) return;
  status.textContent = message;
  status.className = `scan-status${error ? " error" : " success"}`;
}

export class Scanner {
  readonly #scanner: V8Scanner | V9Scanner | V10Scanner;

  constructor(options: ScannerOptions) {
    this.#scanner = selectedVersion === 8
      ? new V8Scanner(options)
      : selectedVersion === 9
        ? new V9Scanner(options)
        : new V10Scanner(options);

    if (selectedVersion !== 8) this.installExactSvgInput(options);
  }

  open(): Promise<void> {
    return this.#scanner.open();
  }

  close(): void {
    this.#scanner.close();
  }

  private installExactSvgInput(options: ScannerOptions): void {
    const picker = document.querySelector<HTMLInputElement>("#scan-file");
    if (!picker) return;

    picker.addEventListener("change", (event) => {
      const file = picker.files?.[0];
      if (!file || !isSvgFile(file)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      picker.value = "";
      scanStatus("Validating the original SVG identity record…");

      void exportedV9SvgFile(file)
        .then((value) => {
          if (!value) {
            throw new Error("The selected SVG is not an exported v9 or v10 astral identicon");
          }
          options.apply({
            ...value,
            paletteIndex: seedPaletteIndex(value),
            orientation: 0,
            uncertainStars: 0,
            correctedBytes: 0,
            reconstructedStars: 0,
            cumulativeFrames: 1,
            captureMilliseconds: 0
          });
          scanStatus("Original SVG identity record validated exactly.");
          this.#scanner.close();
        })
        .catch((error: unknown) => {
          scanStatus(error instanceof Error ? error.message : String(error), true);
        });
    }, { capture: true });
  }
}
