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
    ? `  <script id="opencv-runtime" src="${assets.opencv}" async></script>\n`
    : "";

  return source
    .replace(lockedViewport, responsiveViewport)
    .replace(
      "</head>",
      `${openCv}  <link rel="stylesheet" href="${assets.stylesheet}">\n</head>`
    )
    .replace(browserEntry, `src="${assets.script}"`);
}
