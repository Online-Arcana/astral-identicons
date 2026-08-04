import { astralInput } from "./astral.ts";
import { buildIdenticon } from "./build.ts";
import { palette } from "./palette.ts";
import { Scanner } from "./scan.ts";
import { seedPaletteIndex } from "./seed.ts";
import { label, signs, type Sign } from "./sign.ts";
import type { AssetSource, IdenticonInput, SeedKind } from "./types.ts";

const defaults: IdenticonInput = {
  seed: "62-70-F2-Example",
  seedKind: "text",
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

previewPanel.style.display = "grid";
previewPanel.style.justifyItems = "center";
preview.style.inlineSize = "min(100%, 70vmin, 32rem)";
preview.style.maxInlineSize = "100%";
preview.style.marginInline = "auto";
paletteHost.style.inlineSize = "100%";

const assetCache = new Map<string, Promise<string>>();

let renderVersion = 0;
let latestSvg = "";
let assetsWarmed = false;
let activeSeedKind: SeedKind = defaults.seedKind;

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
    seedKind: activeSeedKind,
    solar: String(data.get("solar")) as Sign,
    lunar: String(data.get("lunar")) as Sign,
    ascendant: String(data.get("ascendant")) as Sign,
    midheaven: String(data.get("midheaven")) as Sign,
    descendant: String(data.get("descendant")) as Sign,
    imumCoeli: String(data.get("imumCoeli")) as Sign
  };
}

function apply(value: IdenticonInput): void {
  activeSeedKind = value.seedKind;
  seedField.value = value.seed;

  for (const [name] of fields) {
    form.querySelector<HTMLSelectElement>(`#${name}`)!.value = value[name];
  }
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
      getAsset(`assets/sigils/${sign}.svg`)
    ])
  ];

  void Promise.all(requests).catch(() => {
    assetsWarmed = false;
  });
}

const browserAssets: AssetSource = {
  constellation: (sign) => getAsset(`assets/constellations/${sign}.svg`),
  sigil: (sign) => getAsset(`assets/sigils/${sign}.svg`),
  star: () => getAsset("assets/decor/star.svg")
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
  const documentValue = new DOMParser().parseFromString(source, "image/svg+xml");
  const error = documentValue.querySelector("parsererror");
  if (error) throw new Error("Generated output is not valid SVG");

  const root = documentValue.documentElement;
  if (root.localName !== "svg") throw new Error("Generated output is not an SVG document");

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

  const svg = await buildIdenticon(data, browserAssets);
  if (version !== renderVersion) return;

  latestSvg = svg;
  showSvg(svg);
  showPalette(palette(data));

  const paletteIndex = seedPaletteIndex(data);
  const seedLabel = data.seedKind === "ed25519" ? "public key" : "exact seed";
  status.textContent = `The ${seedLabel} and all six signs are distributed across the glyph carriers. The parity stars repair missing or ambiguous glyph bytes. Palette ${paletteIndex.toString(16).padStart(2, "0").toUpperCase()}, the constellation and the duplicated signs provide independent recognition evidence.`;
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

function correctionSummary(bytes: number): string {
  if (bytes === 0) return "No glyph bytes needed parity repair.";
  return `Parity stars repaired ${bytes} glyph data byte${bytes === 1 ? "" : "s"}.`;
}

const scanner = new Scanner({
  apply(result) {
    apply(result);

    void render().then(() => {
      const recovered = result.seedKind === "ed25519" ? "public key" : "exact seed";
      status.textContent = `Camera recovered the ${recovered} "${result.seed}" and all six signs from ${result.cumulativeFrames} useful capture${result.cumulativeFrames === 1 ? "" : "s"}. ${correctionSummary(result.correctedBytes)}`;
      status.className = "status";
    }).catch(showError);
  }
});

form.addEventListener("input", (event) => {
  if (event.target === seedField) activeSeedKind = "text";
  schedule();
});

astralFile.addEventListener("change", () => {
  const selected = astralFile.files?.[0];
  if (!selected) return;

  status.textContent = "Reading packaged astral header locally...";
  status.className = "status";
  void selected.arrayBuffer().then((buffer) => {
    const data = astralInput(new Uint8Array(buffer));
    apply(data);
    return render();
  }).then(() => {
    status.textContent = "Loaded the exact raw Ed25519 public key and all six signs from the packaged astral file. The encrypted payload was not opened or changed.";
    status.className = "status";
  }).catch(showError);
});

scan.addEventListener("click", () => {
  warmAssets();
  void scanner.open().catch(showError);
});

function randomSeed(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

randomButton.addEventListener("click", () => {
  activeSeedKind = "text";
  seedField.value = randomSeed();
  astralFile.value = "";
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
    const svg = await buildIdenticon(data, browserAssets);
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
    status.textContent = data.seedKind === "ed25519"
      ? "Saved standalone SVG with the exact recoverable public key and signs."
      : "Saved standalone SVG with the exact recoverable seed and signs.";
  } catch (error) {
    showError(error);
  } finally {
    save.disabled = false;
  }
});

void render()
  .then(() => window.setTimeout(warmAssets, 0))
  .catch(showError);
