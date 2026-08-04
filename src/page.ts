export interface PageAssets {
  script: string;
  stylesheet: string;
  opencv?: string;
}

const lockedViewport =
  'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"';
const responsiveViewport =
  'content="width=device-width, initial-scale=1, viewport-fit=cover"';
const browserEntry = 'src="/app.js"';

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

export function page(source: string, assets: PageAssets): string {
  if (!source.includes(lockedViewport)) {
    throw new Error("Could not locate the locked viewport declaration");
  }

  if (!source.includes(browserEntry)) {
    throw new Error("Could not locate the browser entry point");
  }

  if (!source.includes("</head>")) {
    throw new Error("Could not locate the document head");
  }

  const openCv = assets.opencv
    ? [
      `  <meta name="opencv-runtime" content="${attribute(assets.opencv)}">`,
      `  <link rel="preload" as="script" href="${attribute(assets.opencv)}">`
    ].join("\n") + "\n"
    : "";

  return source
    .replace(lockedViewport, responsiveViewport)
    .replace(
      "</head>",
      `${openCv}  <link rel="stylesheet" href="${attribute(assets.stylesheet)}">\n</head>`
    )
    .replace(browserEntry, `src="${attribute(assets.script)}"`);
}
