import packageMetadata from "../package.json";
import { installFormatStatus } from "./format-status.ts";
import { installVersionFooter } from "./footer.ts";
import { Scanner as V8Scanner } from "./scan-v8.ts";
import { V9Scanner } from "./scan-v9.ts";
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

const v8Selected = typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("scanner") === "v8";

export const appVersion = packageMetadata.version;
export const scannerVersion = v8Selected ? 8 : 9;

installVersionFooter(appVersion, scannerVersion);
installFormatStatus(scannerVersion);

export class Scanner {
  readonly #scanner: V8Scanner | V9Scanner;

  constructor(options: ScannerOptions) {
    this.#scanner = v8Selected
      ? new V8Scanner(options)
      : new V9Scanner(options);
  }

  open(): Promise<void> {
    return this.#scanner.open();
  }

  close(): void {
    this.#scanner.close();
  }
}
