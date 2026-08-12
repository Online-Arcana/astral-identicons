import type { PlaceData } from "../vendor/astral-chart-wheel/dist/web.js";
import { astralSource, type AstralIdenticonSource } from "./astral.ts";
import { birthAstralPreview, normaliseAstralTransport } from "./random-preview.ts";
import { rawPublicKey } from "./seed-value.ts";
import { label, signs, type Sign } from "./sign.ts";

const readyFiles = new WeakSet<File>();

interface CountryRow {
  readonly name: string;
  readonly iso2: string;
  readonly region: string;
  readonly subregion: string;
}

interface StateRow {
  readonly name: string;
  readonly iso2: string;
  readonly timezone: string | null;
}

interface CityRow {
  readonly id: number;
  readonly name: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly timezone: string | null;
}

interface CountryMeta extends CountryRow {
  readonly timezones: ReadonlyArray<{ readonly zoneName: string }>;
}

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

type DisplayedField = keyof typeof displayedPoints;
const signLabels = new Map<DisplayedField, HTMLOutputElement>();

const clearSignLabels = (): void => {
  for (const output of signLabels.values()) {
    output.textContent = "Not calculated";
    output.classList.add("empty");
  }
};

const showSignLabels = (input: AstralIdenticonSource["input"]): void => {
  for (const field of Object.keys(displayedPoints) as DisplayedField[]) {
    const output = signLabels.get(field);
    if (output === undefined) continue;
    output.textContent = label(input[field]);
    output.classList.remove("empty");
  }
};

const syncSignLabelsFromControls = (): void => {
  for (const field of Object.keys(displayedPoints) as DisplayedField[]) {
    const select = document.querySelector<HTMLSelectElement>(`#${field}`);
    const output = signLabels.get(field);
    if (select === null || output === undefined) continue;
    output.textContent = label(select.value as Sign);
    output.classList.remove("empty");
  }
};

const clearPositions = (): void => {
  for (const output of document.querySelectorAll<HTMLElement>(".chart-position")) output.remove();
};

const showPositions = (source: AstralIdenticonSource): void => {
  showSignLabels(source.input);
  clearPositions();
  for (const [field, point] of Object.entries(displayedPoints) as Array<[DisplayedField, typeof displayedPoints[DisplayedField]]>) {
    const select = document.querySelector<HTMLSelectElement>(`#${field}`);
    if (select === null) continue;
    const wrapper = select.closest<HTMLElement>(".field");
    if (wrapper === null) continue;
    const output = document.createElement("small");
    output.className = "chart-position";
    wrapper.append(output);
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

// The TEST chart transport can be a 9-byte ASTRTEST1 marker followed by a
// genuine ASTRPKG container. Normalise it before the ordinary loader sees it,
// while leaving normal ASTRPKG4/5 uploads byte-for-byte untouched.
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

await import("./web.ts");

const style = document.createElement("style");
style.textContent = `
  .birth-chart {
    margin: clamp(1rem, 3vw, 1.5rem);
    margin-bottom: 0;
    padding: 1rem;
    border: 1px solid #30303f;
    border-radius: 1rem;
    background: #12121b;
  }
  .birth-chart h2 {
    margin: 0 0 .35rem;
    font-size: 1.05rem;
    letter-spacing: -.02em;
  }
  .birth-copy {
    margin: 0 0 .9rem;
    color: #aaaabb;
    font-size: .84rem;
    line-height: 1.45;
  }
  .birth-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 .7rem;
  }
  .birth-grid .wide { grid-column: 1 / -1; }
  .birth-chart button { width: 100%; }
  .birth-status {
    min-height: 1.25em;
    margin: .65rem 0 0;
    color: #aaaabb;
    font-size: .82rem;
    line-height: 1.4;
  }
  .birth-status.error { color: #ff9eaa; }
  #sign-fields select[hidden] { display: none; }
  .sign-value {
    display: block;
    margin-top: .2rem;
    color: #f1f1f6;
    font-size: 1rem;
    font-weight: 650;
    line-height: 1.35;
  }
  .sign-value.empty {
    color: #77778a;
    font-weight: 500;
  }
  .chart-position {
    display: block;
    margin-top: .18rem;
    color: #9696aa;
    font-size: 0.76rem;
    line-height: 1.35;
  }
  .chart-position.mismatch { color: #ff9eaa; }
  @media (max-width: 460px) {
    .birth-grid { grid-template-columns: 1fr; }
    .birth-grid .wide { grid-column: auto; }
  }
`;
document.head.append(style);

const form = document.querySelector<HTMLFormElement>("#builder");
const seed = document.querySelector<HTMLInputElement>("#seed");
const astralInput = document.querySelector<HTMLInputElement>("#astral-file");
if (form === null || seed === null || astralInput === null) {
  throw new Error("Identicon builder controls are unavailable");
}

for (const field of Object.keys(displayedPoints) as DisplayedField[]) {
  const select = form.querySelector<HTMLSelectElement>(`#${field}`);
  const wrapper = select?.closest<HTMLElement>(".field") ?? null;
  if (select === null || wrapper === null) continue;
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const title = wrapper.querySelector<HTMLLabelElement>("label");
  title?.removeAttribute("for");
  const output = document.createElement("output");
  output.id = `${field}-value`;
  output.className = "sign-value empty";
  output.textContent = "Not calculated";
  wrapper.append(output);
  signLabels.set(field, output);
}

const heading = document.querySelector<HTMLElement>("main > header h1");
if (heading !== null) heading.textContent = "Astrological identicon";
const introduction = document.querySelector<HTMLElement>("main > header p");
if (introduction !== null) {
  introduction.textContent = "Build a V10 chart-wheel identicon from explicit birth data or load an existing packaged .astral file. The six V10 signs are derived from the chart and shown as read-only labels.";
}

const birth = document.createElement("section");
birth.className = "birth-chart";
birth.setAttribute("aria-labelledby", "birth-heading");
birth.innerHTML = `
  <h2 id="birth-heading">Birth chart</h2>
  <p class="birth-copy">Date, exact local time and birthplace are calculated through the same deterministic astrology core used by the V10 wheel. Calculating derives the six V10 signs from the resulting longitudes while keeping the current public-key seed.</p>
  <div class="birth-grid">
    <div class="field">
      <label for="birth-date">Date of birth</label>
      <input id="birth-date" type="date" autocomplete="bday">
    </div>
    <div class="field">
      <label for="birth-time">Time of birth</label>
      <input id="birth-time" type="time" step="60">
    </div>
    <div class="field wide">
      <label for="birth-country">Country</label>
      <select id="birth-country"><option value="">Choose country</option></select>
    </div>
    <div class="field">
      <label for="birth-region">State / region</label>
      <select id="birth-region" disabled><option value="">Choose region</option></select>
    </div>
    <div class="field">
      <label for="birth-city">City</label>
      <select id="birth-city" disabled><option value="">Choose city</option></select>
    </div>
    <div class="wide">
      <button id="birth-calculate" class="secondary" type="button" disabled>Calculate birth chart</button>
      <p id="birth-status" class="birth-status" aria-live="polite">Loading birthplace catalogue…</p>
    </div>
  </div>
`;
form.parentElement?.insertBefore(birth, form);

const birthDate = birth.querySelector<HTMLInputElement>("#birth-date")!;
const birthTime = birth.querySelector<HTMLInputElement>("#birth-time")!;
const countrySelect = birth.querySelector<HTMLSelectElement>("#birth-country")!;
const regionSelect = birth.querySelector<HTMLSelectElement>("#birth-region")!;
const citySelect = birth.querySelector<HTMLSelectElement>("#birth-city")!;
const calculateButton = birth.querySelector<HTMLButtonElement>("#birth-calculate")!;
const birthStatus = birth.querySelector<HTMLParagraphElement>("#birth-status")!;

let countries: CountryRow[] = [];
let regions: StateRow[] = [];
let cities: CityRow[] = [];

const placeJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(new URL(`assets/places/${path}`, document.baseURI), {
    cache: "force-cache",
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`Birthplace data ${path} failed with HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

const option = (value: string, text: string): HTMLOptionElement => {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = text;
  return item;
};

const resetSelect = (select: HTMLSelectElement, placeholder: string): void => {
  select.replaceChildren(option("", placeholder));
  select.value = "";
};

const updateCalculateState = (): void => {
  calculateButton.disabled = !birthDate.value || !birthTime.value || !countrySelect.value || !regionSelect.value || !citySelect.value;
};

const showBirthError = (cause: unknown): void => {
  birthStatus.textContent = cause instanceof Error ? cause.message : String(cause);
  birthStatus.className = "birth-status error";
};

const loadCountries = async (): Promise<void> => {
  try {
    countries = (await placeJson<CountryRow[]>("countries.json"))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    resetSelect(countrySelect, "Choose country");
    for (const country of countries) countrySelect.append(option(country.iso2, country.name));
    countrySelect.disabled = false;
    birthStatus.textContent = "Choose a date, exact local time and birthplace. Nothing is calculated until you press Calculate birth chart.";
    birthStatus.className = "birth-status";
  } catch (cause: unknown) {
    countrySelect.disabled = true;
    showBirthError(cause);
  }
};

countrySelect.addEventListener("change", () => {
  resetSelect(regionSelect, "Choose region");
  resetSelect(citySelect, "Choose city");
  regionSelect.disabled = true;
  citySelect.disabled = true;
  regions = [];
  cities = [];
  updateCalculateState();
  const country = countrySelect.value;
  if (!country) return;

  birthStatus.textContent = "Loading regions…";
  birthStatus.className = "birth-status";
  void placeJson<StateRow[]>(`states/${country}.json`).then((loaded) => {
    if (countrySelect.value !== country) return;
    regions = loaded.slice().sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    for (const region of regions) regionSelect.append(option(region.iso2, region.name));
    regionSelect.disabled = regions.length === 0;
    birthStatus.textContent = regions.length > 0 ? "Choose a state or region." : "No regions are available for this country in the birthplace catalogue.";
  }).catch(showBirthError);
});

regionSelect.addEventListener("change", () => {
  resetSelect(citySelect, "Choose city");
  citySelect.disabled = true;
  cities = [];
  updateCalculateState();
  const country = countrySelect.value;
  const region = regionSelect.value;
  if (!country || !region) return;

  birthStatus.textContent = "Loading cities…";
  birthStatus.className = "birth-status";
  void placeJson<CityRow[]>(`cities/${country}-${region}.json`).then((loaded) => {
    if (countrySelect.value !== country || regionSelect.value !== region) return;
    cities = loaded.slice().sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    for (const city of cities) citySelect.append(option(String(city.id), city.name));
    citySelect.disabled = cities.length === 0;
    birthStatus.textContent = cities.length > 0 ? "Choose the city of birth." : "No cities are available for this region in the birthplace catalogue.";
  }).catch(showBirthError);
});

for (const control of [birthDate, birthTime, citySelect]) {
  control.addEventListener("input", updateCalculateState);
  control.addEventListener("change", updateCalculateState);
}

const selectedPlace = async (): Promise<PlaceData> => {
  const country = countries.find((item) => item.iso2 === countrySelect.value);
  const region = regions.find((item) => item.iso2 === regionSelect.value);
  const city = cities.find((item) => String(item.id) === citySelect.value);
  if (country === undefined || region === undefined || city === undefined) {
    throw new Error("Choose a complete birthplace before calculating the chart");
  }

  const meta = await placeJson<CountryMeta>(`country/${country.iso2}.json`);
  const timeZone = city.timezone
    ?? region.timezone
    ?? (meta.timezones.length === 1 ? meta.timezones[0]?.zoneName ?? null : null);
  if (!timeZone) {
    throw new Error(`The birthplace catalogue has no unambiguous timezone for ${city.name}`);
  }

  const latitude = Number(city.latitude);
  const longitude = Number(city.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`The birthplace catalogue has invalid coordinates for ${city.name}`);
  }

  return {
    id: `ui:${country.iso2}:${region.iso2}:${city.id}`,
    continent: country.region,
    subcontinent: country.subregion || null,
    country: { code: country.iso2, name: country.name },
    region: { code: region.iso2, name: region.name },
    city: { name: city.name },
    latitude,
    longitude,
    elevationMetres: null,
    timeZone,
  };
};

calculateButton.addEventListener("click", () => {
  calculateButton.disabled = true;
  birthStatus.textContent = "Calculating deterministic natal positions…";
  birthStatus.className = "birth-status";

  void (async () => {
    const rawKey = rawPublicKey(seed.value.trim());
    const place = await selectedPlace();
    const preview = await birthAstralPreview(document.baseURI, {
      date: birthDate.value,
      time: birthTime.value,
      place,
      rawPublicKey: rawKey,
    });
    const name = `BIRTH-${preview.calculation.birth.date}-${(preview.calculation.birth.time ?? "0000").replace(":", "")}.astral`;
    const file = new File([blobBuffer(preview.bytes)], name, { type: "application/octet-stream" });
    readyFiles.add(file);
    setSelectedFile(astralInput, file);
    showPositions(preview.source);
    astralInput.dispatchEvent(new Event("change", { bubbles: true }));
    birthStatus.textContent = `Calculated ${place.city.name}, ${place.country.name} at ${birthDate.value} ${birthTime.value} (${place.timeZone}). The seed was preserved and the six V10 sign labels now come from the calculated longitudes.`;
    birthStatus.className = "birth-status";
  })().catch(showBirthError).finally(() => {
    updateCalculateState();
  });
});

form.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "astral-file") return;
  clearPositions();
  clearSignLabels();
});

document.querySelector<HTMLButtonElement>("#random")?.addEventListener("click", () => {
  clearPositions();
  clearSignLabels();
});

const mainStatus = document.querySelector<HTMLParagraphElement>("#status");
if (mainStatus !== null) {
  new MutationObserver(() => {
    if (mainStatus.textContent?.startsWith("Camera recovered")) syncSignLabelsFromControls();
  }).observe(mainStatus, { childList: true, characterData: true, subtree: true });
}

void loadCountries();