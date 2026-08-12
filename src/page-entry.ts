import { astralSource, type AstralIdenticonSource } from "./astral.ts";
import { label, signs, type Sign } from "./sign.ts";
import { normaliseAstralTransport, randomAstralPreview } from "./random-preview.ts";

const readyFiles = new WeakSet<File>();
let randomAction: (() => void) | null = null;

const blobBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const setSelectedFile = (input: HTMLInputElement, file: File): void => {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
};

const statusError = (cause: unknown): void => {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  if (status === null) return;
  status.textContent = cause instanceof Error ? cause.message : String(cause);
  status.className = "status error";
};

const signAt = (longitude: number): Sign => signs[Math.floor(((longitude % 360) + 360) % 360 / 30)]!;

const positionText = (longitude: number): string => {
  const normalised = ((longitude % 360) + 360) % 360;
  const sign = signAt(normalised);
  const within = normalised % 30;
  const degrees = Math.floor(within);
  const minutes = Math.floor((within - degrees) * 60);
  const seconds = Math.round((((within - degrees) * 60) - minutes) * 60);
  return `${degrees}° ${minutes.toString().padStart(2, "0")}′ ${seconds.toString().padStart(2, "0")}″ ${label(sign)} · ${normalised.toFixed(4)}° ecliptic`;
};

const displayedPoints = {
  solar: "sun",
  lunar: "moon",
  ascendant: "ascendant",
  midheaven: "midheaven",
  descendant: "descendant",
  imumCoeli: "imum_coeli",
} as const;

const showPositions = (source: AstralIdenticonSource): void => {
  for (const [field, point] of Object.entries(displayedPoints) as Array<[keyof typeof displayedPoints, typeof displayedPoints[keyof typeof displayedPoints]]>) {
    const select = document.querySelector<HTMLSelectElement>(`#${field}`);
    if (select === null) continue;
    const wrapper = select.closest<HTMLElement>(".field");
    if (wrapper === null) continue;
    let output = wrapper.querySelector<HTMLElement>(".chart-position");
    if (output === null) {
      output = document.createElement("small");
      output.className = "chart-position";
      wrapper.append(output);
    }
    const longitude = source.wheel?.points[point] ?? null;
    if (longitude === null) {
      output.textContent = "Exact glyph longitude is not present in this package.";
      continue;
    }
    const derived = signAt(longitude);
    const supplied = source.input[field];
    output.textContent = positionText(longitude);
    output.classList.toggle("mismatch", derived !== supplied);
    if (derived !== supplied) {
      output.textContent += ` · package sign says ${label(supplied)}`;
    }
  }
};

const inspectFile = async (file: File): Promise<void> => {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    showPositions(astralSource(bytes));
  } catch {
    // The ordinary loader owns parse errors and presents them in the main status.
  }
};

const normaliseSelection = async (input: HTMLInputElement, file: File): Promise<void> => {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inner = normaliseAstralTransport(bytes);
    const selected = inner === bytes
      ? file
      : new File([blobBuffer(inner)], file.name, { type: file.type || "application/octet-stream", lastModified: file.lastModified });
    readyFiles.add(selected);
    if (selected !== file) setSelectedFile(input, selected);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (cause: unknown) {
    statusError(cause);
  }
};

// The current TEST chart transport is a 9-byte ASTRTEST1 marker followed by a
// genuine ASTRPKG container. Normalise it before the existing loader sees the
// file, while leaving ordinary ASTRPKG4/5 uploads byte-for-byte untouched.
document.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== "astral-file") return;
  const file = input.files?.[0];
  if (file === undefined) return;
  if (readyFiles.has(file)) {
    void inspectFile(file);
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  void normaliseSelection(input, file);
}, true);

// Install the replacement random-chart action before web.ts installs the old
// seed-only button handler. Capture phase prevents that legacy handler from
// clearing the wheel after we have calculated a complete chart.
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("#random");
  if (button === null || randomAction === null) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  randomAction();
}, true);

await import("./web.ts");

const style = document.createElement("style");
style.textContent = `
  .chart-position {
    display: block;
    margin-top: -0.1rem;
    color: #9696aa;
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .chart-position.mismatch { color: #ff9eaa; }
  select[data-derived-chart-field="true"] {
    pointer-events: none;
    cursor: default;
    opacity: .92;
  }
  input[readonly] { cursor: default; }
`;
document.head.append(style);

const seed = document.querySelector<HTMLInputElement>("#seed");
if (seed !== null) {
  seed.readOnly = true;
  seed.setAttribute("aria-readonly", "true");
  seed.title = "Derived from the current packaged chart identity";
}

for (const select of document.querySelectorAll<HTMLSelectElement>("#sign-fields select")) {
  select.dataset["derivedChartField"] = "true";
  select.tabIndex = -1;
  select.setAttribute("aria-readonly", "true");
  select.title = "Derived from the exact ecliptic longitude shown below";
}

const randomButton = document.querySelector<HTMLButtonElement>("#random");
if (randomButton !== null) randomButton.textContent = "New random chart";
const heading = document.querySelector<HTMLElement>("main > header h1");
if (heading !== null) heading.textContent = "Astrological identicon";
const introduction = document.querySelector<HTMLElement>("main > header p");
if (introduction !== null) {
  introduction.textContent = "Preview a complete V10 identicon from a real deterministic random chart, or load a packaged .astral file. The six displayed signs and their glyph positions come from the same exact chart longitudes.";
}

const loadRandomChart = async (): Promise<void> => {
  const input = document.querySelector<HTMLInputElement>("#astral-file");
  if (input === null) throw new Error("Packaged astral file input is unavailable");
  if (randomButton !== null) randomButton.disabled = true;
  const status = document.querySelector<HTMLParagraphElement>("#status");
  if (status !== null) {
    status.textContent = "Calculating a complete random chart with real planetary and angle longitudes…";
    status.className = "status";
  }

  try {
    const preview = await randomAstralPreview(document.baseURI);
    const name = `RANDOM-${preview.calculation.birth.date}-${(preview.calculation.birth.time ?? "0000").replace(":", "")}.astral`;
    const file = new File([blobBuffer(preview.bytes)], name, { type: "application/octet-stream" });
    readyFiles.add(file);
    setSelectedFile(input, file);
    showPositions(preview.source);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (cause: unknown) {
    statusError(cause);
  } finally {
    if (randomButton !== null) randomButton.disabled = false;
  }
};

randomAction = () => void loadRandomChart();
await loadRandomChart();
