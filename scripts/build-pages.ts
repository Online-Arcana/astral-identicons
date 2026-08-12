import { createHash } from "node:crypto";
import { cp, mkdir, rm } from "node:fs/promises";
import { page } from "../src/page.ts";

const root = `${import.meta.dir}/..`;
const outputRoot = `${root}/dist`;
const sharedAssets = `${root}/vendor/astral-chart-wheel/assets`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const build = await Bun.build({
  entrypoints: [`${root}/src/page-entry.ts`],
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

const sourceIndex = await Bun.file(`${root}/public/index.html`).text();
const index = page(sourceIndex, {
  script: `./${bundleName}`,
  stylesheet: "./responsive.css"
});

await Bun.write(`${outputRoot}/index.html`, index);
await cp(`${root}/public/responsive.css`, `${outputRoot}/responsive.css`);
await cp(`${root}/assets`, `${outputRoot}/assets`, { recursive: true });
await cp(`${sharedAssets}/constellations`, `${outputRoot}/assets/constellations`, { recursive: true });
await cp(`${sharedAssets}/astrology-glyphs`, `${outputRoot}/assets/astrology-glyphs`, { recursive: true });
await mkdir(`${outputRoot}/assets/decor`, { recursive: true });
await cp(`${sharedAssets}/reed-solomon/star.svg`, `${outputRoot}/assets/decor/star.svg`);
await Bun.write(`${outputRoot}/.nojekyll`, "");

console.log(
  `Self-contained GitHub Pages site built at ${outputRoot} as ${bundleName}`
);
