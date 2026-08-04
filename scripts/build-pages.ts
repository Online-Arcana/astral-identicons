import { createHash } from "node:crypto";
import { cp, mkdir, rm } from "node:fs/promises";
import { page } from "../src/page.ts";

const root = `${import.meta.dir}/..`;
const outputRoot = `${root}/dist`;
const vendorRoot = `${outputRoot}/vendor`;
const openCvVersion = "4.12.0";
const openCvSource = `https://docs.opencv.org/${openCvVersion}/opencv.js`;

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

const openCvResponse = await fetch(openCvSource);
if (!openCvResponse.ok) {
  throw new Error(
    `Could not download OpenCV.js ${openCvVersion}: ${openCvResponse.status} ${openCvResponse.statusText}`
  );
}

const openCvBytes = new Uint8Array(await openCvResponse.arrayBuffer());
if (openCvBytes.byteLength < 1_000_000) {
  throw new Error(
    `Downloaded OpenCV.js is unexpectedly small (${openCvBytes.byteLength} bytes)`
  );
}

const openCvHash = createHash("sha256")
  .update(openCvBytes)
  .digest("hex")
  .slice(0, 12);
const openCvName = `opencv.${openCvHash}.js`;
await Bun.write(`${vendorRoot}/${openCvName}`, openCvBytes);

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
  `GitHub Pages site built at ${outputRoot} with OpenCV.js ${openCvVersion}`
);
