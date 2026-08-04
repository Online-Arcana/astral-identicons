import { describe, expect, test } from "bun:test";

const root = `${import.meta.dir}/..`;

async function text(path: string): Promise<string> {
  return Bun.file(`${root}/${path}`).text();
}

describe("self-contained GitHub Pages scanner", () => {
  test("does not download or initialise an external vision runtime", async () => {
    const [build, page, vision] = await Promise.all([
      text("scripts/build-pages.ts"),
      text("src/page.ts"),
      text("src/opencv.ts")
    ]);
    const combined = `${build}\n${page}\n${vision}`;

    expect(combined.includes("docs.opencv.org")).toBe(false);
    expect(combined.includes("opencv-runtime")).toBe(false);
    expect(combined.includes("RuntimeLoader")).toBe(false);
    expect(build.includes("downloadOpenCv")).toBe(false);
    expect(build.includes("fetch(")).toBe(false);
    expect(vision.includes("document.createElement(\"script\")")).toBe(false);
  });
});
