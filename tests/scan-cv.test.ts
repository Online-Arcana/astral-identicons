import { describe, expect, test } from "bun:test";
import {
  opencvSources,
  opencvSourceTimeout
} from "../src/scan-cv.ts";

describe("OpenCV loader", () => {
  test("uses pinned CDN fallbacks", () => {
    expect(opencvSources).toEqual([
      "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js",
      "https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js",
      "https://docs.opencv.org/4.10.0/opencv.js"
    ]);
  });

  test("bounds each CDN attempt", () => {
    expect(opencvSourceTimeout).toBe(8_000);
  });
});
