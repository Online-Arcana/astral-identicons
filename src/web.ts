import type { PublicWheelMeta } from "../vendor/astral-chart-wheel/dist/index.js";
import {
  astralSource,
  boundAstralWheel
} from "./astral.ts";
import { buildIdenticon } from "./build.ts";
import { palette } from "./palette.ts";
import { Scanner } from "./scan.ts";
import { seedDataByteCount, seedPaletteIndex, seedSlotCount } from "./seed.ts";
import {
  base64Url,
  bindPublicKey,
  boundPublicKey,
  isPublicKey
} from "./seed-value.ts";
import { label, signs, type Sign } from "./sign.ts";
import { testChartPreview } from "./test-wheel.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

const fields = [
  ["solar", "Sun"],
  ["lunar", "Moon"],
  ["ascendant", "Ascendant"],
  ["midheaven", "Midheaven"],
  ["descendant", "Descendant"],
  ["imumCoeli", "Imum Coeli"]
] as const;

const svgNamespace = "http://www.w3.org/2000/svg";
const previewClipId = "astral-preview-circle-clip";

function randomPublicKey(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function identityKey(value: IdenticonInput): string {
  return [
    value.seed,
    value.solar,
    value.lunar,
    value.ascendant,
    value.midheaven,
    value.descendant,
    value.imumCoeli
  ].join("|");
}

const defaultPreview = testChartPreview(randomPublicKey());
const defaults = defaultPreview.input;
const form = document.querySelector<HTMLFormElement>("#builder")!;
const astralWrap = document.createElement("div");
const astralLabel = document.createElement("label");
const astralFile = document.createElement("input");
astralWrap.className = "field";
astralLabel.htmlFor = "astral-file";
astralLabel.textContent = "Packaged astral file";
astralFile.id = "astral-file";
astralFile.type = "file";
astralFile.accept = ".astral,application/octet-stream";
astralWrap.append(astralLabel, astralFile);
form.prepend(astralWrap);

const seedField = document.querySelector<HTMLInputElement>("#seed")!;
const fieldHost = document.querySelector<HTMLDivElement>("#sign-fields")!;
const preview = document.querySelector<HTMLDivElement>("#preview")!;
const paletteHost = document.querySelector<HTMLDivElement>("#palette")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const scan = document.querySelector<HTMLButtonElement>("#scan")!;
const randomButton = document.querySelector<HTMLButtonElement>("#random")!;
const previewPanel = preview.closest<HTMLElement>(".preview-panel")!;

seedField.value = defaults.seed;
previewPanel.style.display = "grid";
previewPanel.style.justifyItems = "center";
preview.style.inlineSize = "min(100%, 70vmin, 32rem)";
preview.style.maxInlineSize = "100%";
preview.style.marginInline = "auto";
preview.style.background = "transparent";
preview.style.borderColor = "transparent";
paletteHost.style.inlineSize = "100%";

const assetCache = new Map<string, Promise<string>>();
let renderVersion = 0;
let latestSvg = "";
let assetsWarmed = false;
let activeRaw: Uint8Array | undefined;
let activeTestWheel: PublicWheelMeta | null = defaultPreview.wheel;
let activeTestKey = identityKey(defaults);

for (const [name, title] of fields) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const labelElement = document.createElement("label");
  labelElement.htmlFor = name;
  labelElement.textContent = title;

  const select = document.createElement("select");
  select.id = name;
  select.name = name;

  for (const sign of signs) {
    const option = document.createElement("option");
    option.value = sign;
    option.textContent = label(sign);
    option.selected = defaults[name] === sign;
    select.append(option);
  }

  wrapper.append(labelElement, select);
  fieldHost.append(wrapper);
}

function value(): IdenticonInput {
  const data = new FormData(form);
  const result: IdenticonInput = {
    seed: String(data.get("seed") ?? "").trim(),
    solar: String(data.get("solar")) as Sign,
    lunar: String(data.get("lunar")) as Sign,
    ascendant: String(data.get("ascendant")) as Sign,
    midheaven: String(data.get("midheaven")) as Sign,
    descendant: String(data.get("descendant")) as Sign,
    imumCoeli: String(data.get("imumCoeli")) as Sign
  };

  if (activeRaw && base64Url(activeRaw) === result.seed) {
    return bindPublicKey(result, activeRaw);
  }
  return result;
}

function apply(input: IdenticonInput): void {
  activeRaw = boundPublicKey(input);
  seedField.value = input.seed;

  for (const [name] of fields) {
    form.querySelector<HTMLSelectElement>(`#${name}`)!.value = input[name];
  }
}

function previewWheel(value: IdenticonInput): {
  readonly wheel: PublicWheelMeta | null;
  readonly source: "astral" | "legacy-astral" | "test" | "none";
} {
  const astralWheel = boundAstralWheel(value);
  if (astralWheel !== undefined) {
    return {
      wheel: astralWheel,
      source: astralWheel === null ? "legacy-astral" : "astral"
    };
  }

  if (activeTestWheel !== null && activeTestKey === identityKey(value)) {
    return { wheel: activeTestWheel, source: "test" };
  }

  return { wheel: null, source: "none" };
}

function assetPath(path: string): string {
  return new URL(path.replace(/^\/+/, ""), document.baseURI).href;
}

function getAsset(path: string): Promise<string> {
  const resolved = assetPath(path);
  let request = assetCache.get(resolved);

  if (!request) {
    request = fetch(resolved).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load asset: ${resolved}`);
      return response.text();
    });
    assetCache.set(resolved, request);
  }

  return request;
}

function warmAssets(): void {
  if (assetsWarmed) return;
  assetsWarmed = true;

  const requests = [
    getAsset("assets/decor/star.svg"),
    ...signs.flatMap((sign) => [
      getAsset(`assets/constellations/${sign}.svg`),
      getAsset(`assets/sigils/${sign}.svg`),
      getAsset(`assets/astrology-glyphs/svg/zodiac/${sign}.svg`)
    ])
  ];

  void Promise.all(requests).catch(() => {
    assetsWarmed = false;
  });
}

const browserAssets: AssetSource = {
  constellation: (sign) => getAsset(`assets/constellations/${sign}.svg`),
  sigil: (sign) => getAsset(`assets/sigils/${sign}.svg`),
  star: () => getAsset("assets/decor/star.svg"),
  astrologyGlyph: (path) => getAsset(`assets/astrology-glyphs/svg/${path}`)
};

function showPalette(valuePalette: ReturnType<typeof palette>): void {
  paletteHost.replaceChildren();

  const colours = [
    ["Background", valuePalette.background],
    ["Foreground 0", valuePalette.layer0],
    ["Foreground 1", valuePalette.layer1]
  ] as const;

  for (const [name, colour] of colours) {
    const item = document.createElement("div");
    item.className = "swatch";

    const colourElement = document.createElement("div");
    colourElement.className = "swatch-colour";
    colourElement.style.background = colour.reduced;

    const copy = document.createElement("div");
    copy.className = "swatch-copy";

    const heading = document.createElement("strong");
    heading.textContent = name;

    const code = document.createElement("code");
    code.textContent = colour.reduced;

    copy.append(heading, code);
    item.append(colourElement, copy);
    paletteHost.append(item);
  }
}

function circularPreviewClip(
  documentValue: XMLDocument,
  root: SVGSVGElement
): void {
  const viewBox = root.getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    !viewBox ||
    viewBox.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  ) {
    throw new Error("Generated SVG has an invalid viewBox");
  }

  const [x, y, width, height] = viewBox as [number, number, number, number];
  let defs = Array.from(root.children).find((child) => child.localName === "defs");
  if (!defs) {
    defs = documentValue.createElementNS(svgNamespace, "defs");
    root.prepend(defs);
  }

  const clip = documentValue.createElementNS(svgNamespace, "clipPath");
  clip.setAttribute("id", previewClipId);
  clip.setAttribute("clipPathUnits", "userSpaceOnUse");

  const circle = documentValue.createElementNS(svgNamespace, "circle");
  circle.setAttribute("cx", String(x + width / 2));
  circle.setAttribute("cy", String(y + height / 2));
  circle.setAttribute("r", String(Math.min(width, height) / 2));
  clip.append(circle);
  defs.append(clip);

  const layer = documentValue.createElementNS(svgNamespace, "g");
  layer.setAttribute("clip-path", `url(#${previewClipId})`);
  for (const child of Array.from(root.children)) {
    if (
      child === defs ||
      child.localName === "title" ||
      child.localName === "metadata"
    ) {
      continue;
    }
    layer.append(child);
  }
  root.append(layer);
}

function showSvg(source: string): void {
  const documentValue = new DOMParser().parseFromString(source, "image/svg+xml");
  const error = documentValue.querySelector("parsererror");
  if (error) throw new Error("Generated output is not valid SVG");

  const root = documentValue.documentElement;
  if (root.localName !== "svg") throw new Error("Generated output is not an SVG document");
  circularPreviewClip(documentValue, root as unknown as SVGSVGElement);
  preview.replaceChildren(document.importNode(root, true));
}

async function render(): Promise<void> {
  const version = ++renderVersion;
  const data = value();

  if (!data.seed) {
    latestSvg = "";
    preview.replaceChildren();
    return;
  }

  status.textContent = "Building preview...";
  status.className = "status";

  const resolvedWheel = previewWheel(data);
  const svg = await buildIdenticon(data, browserAssets, resolvedWheel.wheel);
  if (version !== renderVersion) return;

  latestSvg = svg;
  showSvg(svg);
  showPalette(palette(data));

  const paletteIndex = seedPaletteIndex(data);
  const seedLabel = isPublicKey(data.seed) ? "32-byte public key" : "exact seed";
  const wheelCopy = resolvedWheel.source === "astral"
    ? "The public deterministic natal wheel supplies its houses and real chart points; aspect lines are replaced by the identicon field."
    : resolvedWheel.source === "test"
      ? "The front-end test generator supplies deterministic TEST-ONLY wheel geometry so houses and chart glyph positions are exercised in the preview. Imported .astral files never use this fixture."
      : resolvedWheel.source === "legacy-astral"
        ? "This older packaged chart has no public natal-wheel metadata, so no chart positions are invented."
        : "No natal wheel metadata is attached, so the preview uses the chart-wheel shell without inventing houses or planetary positions.";
  status.textContent = `The ${seedLabel} and all six signs are protected across ${seedSlotCount} Reed–Solomon stars; any ${seedDataByteCount} reliable stars can reconstruct the complete record. Palette ${paletteIndex.toString(16).padStart(2, "0").toUpperCase()} colours the wheel. The Solar constellation and Reed–Solomon field fill the chart's aspect-line area. ${wheelCopy}`;
  status.className = "status";
}

function showError(error: unknown): void {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.className = "status error";
}

let timer = 0;
function schedule(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void render().catch(showError);
  }, 90);
}

function recoverySummary(stars: number): string {
  return stars === 0
    ? "No star symbols needed reconstruction."
    : `Reed–Solomon reconstructed ${stars} missing or discarded star symbol${stars === 1 ? "" : "s"}.`;
}

const scanner = new Scanner({
  apply(result) {
    apply(result);

    void render().then(() => {
      const recovered = isPublicKey(result.seed) ? "public key" : "exact seed";
      status.textContent = `Camera recovered the ${recovered} "${result.seed}" and all six signs from ${result.cumulativeFrames} useful capture${result.cumulativeFrames === 1 ? "" : "s"}. ${recoverySummary(result.reconstructedStars)}`;
      status.className = "status";
    }).catch(showError);
  }
});

form.addEventListener("input", (event) => {
  astralFile.value = "";
  activeTestWheel = null;
  activeTestKey = "";
  if (event.target === seedField) {
    activeRaw = undefined;
  }
  schedule();
});

astralFile.addEventListener("change", () => {
  const selected = astralFile.files?.[0];
  if (!selected) return;

  activeTestWheel = null;
  activeTestKey = "";
  status.textContent = "Reading packaged astral header locally...";
  status.className = "status";
  let loadedWheel = false;
  void selected.arrayBuffer().then((buffer) => {
    const source = astralSource(new Uint8Array(buffer));
    loadedWheel = source.wheel !== null;
    apply(source.input);
    return render();
  }).then(() => {
    status.textContent = loadedWheel
      ? "Loaded the exact raw Ed25519 public key, six signs and public deterministic natal wheel from the packaged astral file. The encrypted payload was not opened or changed."
      : "Loaded the exact raw Ed25519 public key and all six signs from the packaged astral file. This older container has no public natal-wheel metadata, so no chart positions were invented. The encrypted payload was not opened or changed.";
    status.className = "status";
  }).catch(showError);
});

scan.addEventListener("click", () => {
  warmAssets();
  void scanner.open().catch(showError);
});

randomButton.addEventListener("click", () => {
  const generated = testChartPreview(randomPublicKey());
  activeTestWheel = generated.wheel;
  activeTestKey = identityKey(generated.input);
  astralFile.value = "";
  apply(generated.input);
  schedule();
});

function fileSeed(seed: string): string {
  const safe = seed
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  return safe || "seed";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  save.disabled = true;
  status.textContent = "Preparing SVG...";
  status.className = "status";

  try {
    const data = value();
    const resolvedWheel = previewWheel(data);
    const svg = await buildIdenticon(data, browserAssets, resolvedWheel.wheel);
    latestSvg = svg;

    const blob = new Blob([latestSvg], {
      type: "image/svg+xml;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `astrological-identicon-${data.solar}-${fileSeed(data.seed)}.svg`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = isPublicKey(data.seed)
      ? "Saved standalone chart-wheel SVG with the exact recoverable public key and signs."
      : "Saved standalone chart-wheel SVG with the exact recoverable seed and signs.";
  } catch (error) {
    showError(error);
  } finally {
    save.disabled = false;
  }
});

void render()
  .then(() => window.setTimeout(warmAssets, 0))
  .catch(showError);
