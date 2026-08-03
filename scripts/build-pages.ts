import { cp, mkdir, rm } from "node:fs/promises";

const root = `${import.meta.dir}/..`;
const outputRoot = `${root}/dist`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

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
await Bun.write(`${outputRoot}/app.js`, browserBundle);

const sourceIndex = await Bun.file(`${root}/public/index.html`).text();
const index = sourceIndex.replace('src="/app.js"', 'src="./app.js"');

if (index === sourceIndex) {
  throw new Error("Could not locate the browser entry point in public/index.html");
}

await Bun.write(`${outputRoot}/index.html`, index);
await cp(`${root}/assets`, `${outputRoot}/assets`, { recursive: true });
await Bun.write(`${outputRoot}/.nojekyll`, "");

console.log(`GitHub Pages site built at ${outputRoot}`);
