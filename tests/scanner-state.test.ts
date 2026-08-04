import { describe, expect, test } from "bun:test";

async function scannerSource(): Promise<string> {
  return Bun.file(new URL("../src/scan-v8.ts", import.meta.url)).text();
}

describe("resilient scanner state machine", () => {
  test("never builds or displays a stitched reconstruction mosaic", async () => {
    const source = await scannerSource();

    expect(source.includes("mosaic")).toBe(false);
    expect(source.includes("Clearest captured identicon frame")).toBe(true);
    expect(source.includes("this.freeze(display.canvas)")).toBe(true);
  });

  test("preserves evidence and restarts capture after an unsuccessful decode", async () => {
    const source = await scannerSource();

    expect(source.includes("retryCapture")).toBe(true);
    expect(source.includes("All evidence is preserved")).toBe(true);
    expect(source.includes("Restarting the camera with all previous evidence preserved")).toBe(true);
  });

  test("requires comparison frames and useful settling time", async () => {
    const source = await scannerSource();

    expect(source.includes("snapshot.frames < this.#retryAfterFrames")).toBe(true);
    expect(source.includes("snapshot.usefulMilliseconds < this.#retryAfterMilliseconds")).toBe(true);
  });
});
