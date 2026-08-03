import { buildIdenticon } from "./build.ts";
import { palette } from "./palette.ts";
import { Scanner } from "./scan.ts";
import { seedCode } from "./seed.ts";
import { label, signs, type Sign } from "./sign.ts";
import type { AssetSource, IdenticonInput } from "./types.ts";

const defaults: IdenticonInput = {
  seed: "6270f2-example-seed",
  solar: "capricorn",
  lunar: "virgo",
  ascendant: "capricorn",
  midheaven: "libra",
  descendant: "cancer",
  imumCoeli: "aries"
};

const fields = [
  ["solar", "Sun"],
  ["lunar", "Moon"],
  ["ascendant", "Ascendant"],
  ["midheaven", "Midheaven"],
  ["descendant", "Descendant"],
  ["imumCoeli", "Imum Coeli"]
] as const;

const form = document.querySelector<HTMLFormElement>("#builder")!;
const fieldHost = document.querySelector<HTMLDivElement>("#sign-fields")!;
const preview = document.querySelector<HTMLDivElement>("#preview")!;
const paletteHost = document.querySelector<HTMLDivElement>("#palette")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const scan = document.querySelector<HTMLButtonElement>("#scan")!;
const randomButton = document.querySelector<HTMLButtonElement>("#random")!;
const previewPanel = preview.closest<HTMLElement>(".preview-panel")!;

previewPanel.style.display = "grid";
previewPanel.style.justifyItems = "center";
preview.style.inlineSize = "min(100%, 70vmin, 32rem)";
preview.style.maxInlineSize = "100%";
preview.style.marginInline = "auto";
paletteHost.style.inlineSize = "100%";

const assetCache = new Map<string, Promise<string>>();

let renderVersion = 0;
let latestSvg = "";

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

  return {
    seed: String(data.get("seed") ?? "").trim(),
    solar: String(data.get("solar")) as Sign,
    lunar: String(data.get("lunar")) as Sign,
    ascendant: String(data.get("ascendant")) as Sign,
    midheaven: String(data.get("midheaven")) as Sign,
    descendant: String(data.get("descendant")) as Sign,
    imumCoeli: String(data.get("imumCoeli")) as Sign
  };
}

function apply(value: IdenticonInput): void {
  form.querySelector<HTMLInputElement>("#seed")!.value = value.seed;

  for (const [name] of fields) {
    form.querySelector<HTMLSelectElement>(`#${name}`)!.value = value[name];
  }
}

function getAsset(path: string): Promise<string> {
  let request = assetCache.get(path);

  if (!request) {
    request = fetch(path).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Could not load asset: ${path}`);
      }

      return response.text();
    });

    assetCache.set(path, request);
  }

  return request;
}

const browserAssets: AssetSource = {
  constellation: (sign) => {
    return getAsset(`/assets/constellations/${sign}.svg`);
  },

  sigil: (sign) => {
    return getAsset(`/assets/sigils/${sign}.svg`);
  },

  star: () => {
    return getAsset("/assets/decor/star.svg");
  }
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

function showSvg(source: string): void {
  const documentValue = new DOMParser().parseFromString(
    source,
    "image/svg+xml"
  );

  const error = documentValue.querySelector("parsererror");

  if (error) {
    throw new Error("Generated output is not valid SVG");
  }

  const root = documentValue.documentElement;

  if (root.localName !== "svg") {
    throw new Error("Generated output is not an SVG document");
  }

  const node = document.importNode(root, true);
  preview.replaceChildren(node);
}

async function render(): Promise<void> {
  const version = ++renderVersion;
  const data = value();

  if (!data.seed) {
    latestSvg = "";
    preview.replaceChildren();
    return;
  }

  status.textContent = "Building preview…";
  status.className = "status";

  const svg = await buildIdenticon(data, browserAssets);

  if (version !== renderVersion) {
    return;
  }

  latestSvg = svg;

  showSvg(svg);
  showPalette(palette(data.seed));

  status.textContent =
    `Visual seed ${seedCode(data.seed)}. Colours and coded stars can reproduce it.`;
  status.className = "status";
}

function showError(error: unknown): void {
  status.textContent = error instanceof Error
    ? error.message
    : String(error);

  status.className = "status error";
}

let timer = 0;

function schedule(): void {
  window.clearTimeout(timer);

  timer = window.setTimeout(() => {
    void render().catch(showError);
  }, 90);
}

const scanner = new Scanner({
  apply(result) {
    apply(result);

    void render().then(() => {
      status.textContent =
        `Camera decoded ${result.seed} and all six signs with ${result.erasedBytes} corrected or uncertain byte${result.erasedBytes === 1 ? "" : "s"}.`;
      status.className = "status";
    }).catch(showError);
  }
});

form.addEventListener("input", schedule);

scan.addEventListener("click", () => {
  void scanner.open().catch(showError);
});

randomButton.addEventListener("click", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  const seed = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  form.querySelector<HTMLInputElement>("#seed")!.value = seed;
  schedule();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  save.disabled = true;
  status.textContent = "Preparing SVG…";
  status.className = "status";

  try {
    const data = value();

    const svg = await buildIdenticon(data, browserAssets);
    latestSvg = svg;

    const blob = new Blob([latestSvg], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `astrological-identicon-${data.solar}-${seedCode(data.seed)}.svg`;
    link.click();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);

    status.textContent =
      `Saved standalone SVG with visual seed ${seedCode(data.seed)}.`;
  } catch (error) {
    showError(error);
  } finally {
    save.disabled = false;
  }
});

void render().catch(showError);
