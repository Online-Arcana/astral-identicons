import { createHash } from "node:crypto";
import { cp, mkdir, rm } from "node:fs/promises";
import { page } from "../src/page.ts";

const root = `${import.meta.dir}/..`;
const outputRoot = `${root}/dist`;
const vendorRoot = `${outputRoot}/vendor`;
const openCvSources = [
  "https://docs.opencv.org/4.x/opencv.js",
  "https://docs.opencv.org/4.10.0/opencv.js"
] as const;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(vendorRoot, { recursive: true });

const build = await Bun.build({
  entrypoints: [`${root}/src/web.ts`],
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "none"
});

if (!build.success || !build.outputs[0]) {
  const messages = build.logs.map((log) => log.message).join("\n");
  throw new Error(`Could not build GitHub Pages application: ${messages}`);
}

/*
 * The development server serves assets from the domain root. GitHub Pages
 * hosts project sites below /<repository>/, so the static bundle uses paths
 * relative to the generated index instead.
 */
const browserSource = await build.outputs[0].text();
const browserBundle = browserSource.replaceAll("/assets/", "./assets/");
const bundleHash = createHash("sha256")
  .update(browserBundle)
  .digest("hex")
  .slice(0, 12);
const bundleName = `app.${bundleHash}.js`;

await Bun.write(`${outputRoot}/${bundleName}`, browserBundle);

async function downloadOpenCv(): Promise<{
  bytes: Uint8Array;
  source: string;
}> {
  const failures: string[] = [];

  for (const source of openCvSources) {
    try {
      const response = await fetch(source);

      if (!response.ok) {
        failures.push(`${source}: ${response.status} ${response.statusText}`);
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 1_000_000) {
        failures.push(`${source}: unexpectedly small (${bytes.byteLength} bytes)`);
        continue;
      }

      return { bytes, source };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${source}: ${message}`);
    }
  }

  throw new Error(
    `Could not download a valid OpenCV.js runtime:\n${failures.join("\n")}`
  );
}

const openCv = await downloadOpenCv();
const openCvHash = createHash("sha256")
  .update(openCv.bytes)
  .digest("hex")
  .slice(0, 12);
const openCvName = `opencv.${openCvHash}.js`;
await Bun.write(`${vendorRoot}/${openCvName}`, openCv.bytes);

const sourceIndex = await Bun.file(`${root}/public/index.html`).text();
const index = page(sourceIndex, {
  script: `./${bundleName}`,
  stylesheet: "./responsive.css",
  opencv: `./vendor/${openCvName}`
});

await Bun.write(`${outputRoot}/index.html`, index);
await cp(`${root}/public/responsive.css`, `${outputRoot}/responsive.css`);
await cp(`${root}/assets`, `${outputRoot}/assets`, { recursive: true });
await Bun.write(`${outputRoot}/.nojekyll`, "");

console.log(
  `GitHub Pages site built at ${outputRoot} with OpenCV.js from ${openCv.source}`
);
