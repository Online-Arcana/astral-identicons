import type {
  PublicWheelAspect,
  PublicWheelHouse,
  PublicWheelMeta
} from "../vendor/astral-chart-wheel/dist/index.js";
import { input } from "./input.ts";
import { base64Url, bindPublicKey } from "./seed-value.ts";
import type { IdenticonInput } from "./types.ts";

const decoder = new TextDecoder("utf-8", { fatal: true });
const magic4 = "ASTRPKG4";
const magic5 = "ASTRPKG5";
const fixed = 32;
const saltSize = 16;
const nonceSize = 12;
const keySize = 32;
const keyOffset = fixed + saltSize + nonceSize;
const publicOffset = keyOffset + keySize;
const maxLegacyPublic = 256;
const maxPublicMeta = 64 * 1024;
const maxPayload = 64 * 1024 * 1024;
const minIterations = 100_000;
const maxIterations = 10_000_000;
const legacyFields = [
  ["solar_sign", "solar"],
  ["lunar_sign", "lunar"],
  ["ascending_sign", "ascendant"],
  ["midheaven_sign", "midheaven"],
  ["descending_sign", "descendant"],
  ["imum_coeli_sign", "imumCoeli"]
] as const;
const pointIds = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
  "north_node_true", "south_node_true", "north_node_mean", "south_node_mean",
  "ascendant", "descendant", "midheaven", "imum_coeli", "vertex", "antivertex", "east_point",
  "part_of_fortune", "part_of_spirit", "lilith_mean", "lilith_true"
] as const;
const pointIdSet = new Set<string>(pointIds);
const houseSystems = new Set(["placidus", "whole_sign", "equal", "porphyry"]);
const houseStatuses = new Set(["calculated", "fallback", "unavailable"]);
const aspectKinds = new Set([
  "conjunction", "opposition", "trine", "square", "sextile", "quincunx",
  "semisextile", "semisquare", "sesquiquadrate", "quintile", "biquintile"
]);
const aspectClasses = new Set(["major", "minor"]);
const aspectCharacters = new Set(["flowing", "challenging", "contextual", "adjusting", "creative"]);
const publicWheels = new Map<string, PublicWheelMeta | null>();

export interface AstralIdenticonSource {
  readonly input: IdenticonInput;
  readonly wheel: PublicWheelMeta | null;
  readonly containerVersion: 4 | 5;
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

function bindWheel(value: IdenticonInput, wheel: PublicWheelMeta | null): void {
  publicWheels.set(identityKey(value), wheel);
  while (publicWheels.size > 16) {
    const oldest = publicWheels.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    publicWheels.delete(oldest);
  }
}

export function boundAstralWheel(value: IdenticonInput): PublicWheelMeta | null | undefined {
  return publicWheels.get(identityKey(value));
}

function u32(value: Uint8Array, offset: number): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength)
    .getUint32(offset, false);
}

function ascii(value: Uint8Array): string {
  return String.fromCharCode(...value);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function word(value: unknown, allowed: ReadonlySet<string>, label: string): string {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Invalid astral public ${label}`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw new Error(`Invalid astral public ${label}`);
  }
  return value;
}

function longitude(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new Error(`Invalid astral public ${label}`);
  }
  return value;
}

function publicSigns(value: Uint8Array): Record<string, string> {
  let source: string;
  try {
    source = decoder.decode(value);
  } catch {
    throw new Error("Astral public sign block is not valid UTF-8");
  }

  if (!source.startsWith("\n") || !source.endsWith("\n")) {
    throw new Error("Astral public sign block is malformed");
  }

  const lines = source.slice(1, -1).split("\n");
  if (lines.length !== legacyFields.length) {
    throw new Error("Astral public sign block must contain six fields");
  }

  const result: Record<string, string> = {};
  for (let index = 0; index < legacyFields.length; index += 1) {
    const [label, name] = legacyFields[index]!;
    const prefix = `${label}=`;
    const line = lines[index]!;
    if (!line.startsWith(prefix)) {
      throw new Error(`Astral public sign field ${label} is missing or out of order`);
    }
    result[name] = line.slice(prefix.length);
  }
  return result;
}

function checkedInput(rawKey: Uint8Array, values: Record<string, unknown>): IdenticonInput {
  const value = input({
    seed: base64Url(rawKey),
    solar: values.solar,
    lunar: values.lunar,
    ascendant: values.ascendant,
    midheaven: values.midheaven,
    descendant: values.descendant,
    imumCoeli: values.imumCoeli
  });
  return bindPublicKey(value, rawKey);
}

function parseWheel(value: unknown): PublicWheelMeta | null {
  if (value === null) return null;
  if (!object(value) || value.schema !== "astral-public-wheel/1.0.0") {
    throw new Error("Invalid astral public wheel metadata");
  }

  const primaryHouseSystem = word(value.primaryHouseSystem, houseSystems, "primary house system") as PublicWheelMeta["primaryHouseSystem"];
  const calculationFingerprint = text(value.calculationFingerprint, "calculation fingerprint");

  if (!object(value.points)) throw new Error("Invalid astral public wheel points");
  const points: Record<string, number | null> = {};
  for (const id of pointIds) {
    points[id] = longitude(value.points[id], `${id} longitude`);
  }

  if (!object(value.houses) || !object(value.houses.houses)) {
    throw new Error("Invalid astral public wheel houses");
  }
  const houses: Record<string, PublicWheelHouse> = {};
  for (let number = 1; number <= 12; number += 1) {
    const source = value.houses.houses[String(number)];
    if (!object(source) || source.number !== number) {
      throw new Error(`Invalid astral public house ${number}`);
    }
    houses[String(number)] = {
      number: number as PublicWheelHouse["number"],
      cuspLongitudeDegrees: longitude(source.cuspLongitudeDegrees, `house ${number} cusp longitude`),
      endLongitudeDegrees: longitude(source.endLongitudeDegrees, `house ${number} end longitude`)
    };
  }

  if (!Array.isArray(value.aspects)) throw new Error("Invalid astral public wheel aspects");
  const aspects: PublicWheelAspect[] = value.aspects.map((raw, index) => {
    if (!object(raw)) throw new Error(`Invalid astral public aspect ${index}`);
    const a = text(raw.a, `aspect ${index} endpoint A`);
    const b = text(raw.b, `aspect ${index} endpoint B`);
    if (!pointIdSet.has(a) || !pointIdSet.has(b)) {
      throw new Error(`Invalid astral public aspect ${index} endpoint`);
    }
    return {
      id: text(raw.id, `aspect ${index} id`),
      a: a as PublicWheelAspect["a"],
      b: b as PublicWheelAspect["b"],
      kind: word(raw.kind, aspectKinds, `aspect ${index} kind`) as PublicWheelAspect["kind"],
      class: word(raw.class, aspectClasses, `aspect ${index} class`) as PublicWheelAspect["class"],
      character: word(raw.character, aspectCharacters, `aspect ${index} character`) as PublicWheelAspect["character"]
    };
  });

  return {
    schema: "astral-public-wheel/1.0.0",
    calculationFingerprint,
    primaryHouseSystem,
    points: points as PublicWheelMeta["points"],
    houses: {
      status: word(value.houses.status, houseStatuses, "primary house status") as PublicWheelMeta["houses"]["status"],
      houses
    },
    aspects
  };
}

function publicMeta(value: Uint8Array): { inputValues: Record<string, unknown>; wheel: PublicWheelMeta | null } {
  let source: string;
  try {
    source = decoder.decode(value);
  } catch {
    throw new Error("Astral public metadata block is not valid UTF-8");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    throw new Error("Astral public metadata block is malformed");
  }
  if (!object(decoded) || decoded.schema !== "astral-public-meta/1.0.0" || !object(decoded.signs)) {
    throw new Error("Invalid astral public metadata block");
  }

  return {
    inputValues: {
      solar: decoded.signs.solar,
      lunar: decoded.signs.lunar,
      ascendant: decoded.signs.ascending,
      midheaven: decoded.signs.midheaven,
      descendant: decoded.signs.descending,
      imumCoeli: decoded.signs.imumCoeli
    },
    wheel: parseWheel(decoded.wheel)
  };
}

function validateContainer(data: Uint8Array, version: 4 | 5): { headSize: number; rawKey: Uint8Array } {
  if (data.byteLength < publicOffset + 16) throw new Error("Astral container is truncated");
  if (data[8] !== version || data[9] !== 0) throw new Error("Unsupported astral container version");
  if (data[10] !== 1 || data[11] !== 1 || data[13] !== 2) {
    throw new Error("Unsupported astral container algorithms");
  }
  if (![0, 1, 2, 3].includes(data[12]!)) throw new Error("Unsupported astral compression codec");
  if (data[14] !== 0 || data[15] !== 0) throw new Error("Unsupported astral container flags");

  const iterations = u32(data, 16);
  const rawSize = u32(data, 20);
  const cipherSize = u32(data, 24);
  const headSize = u32(data, 28);
  if (iterations < minIterations || iterations > maxIterations) {
    throw new Error("Astral password KDF cost is unsafe");
  }
  if (rawSize < 1 || rawSize > maxPayload || cipherSize < 16 || cipherSize > maxPayload) {
    throw new Error("Astral container length is unsafe");
  }
  const maximum = version === 5 ? maxPublicMeta : maxLegacyPublic;
  if (headSize < publicOffset || headSize > publicOffset + maximum) {
    throw new Error("Astral public header length is invalid");
  }
  if (version === 5 && headSize === publicOffset) {
    throw new Error("ASTRPKG5 public metadata is missing");
  }
  if (data.byteLength !== headSize + cipherSize) {
    throw new Error("Astral container is truncated or extended");
  }

  return {
    headSize,
    rawKey: data.slice(keyOffset, keyOffset + keySize)
  };
}

export function astralSource(data: Uint8Array): AstralIdenticonSource {
  const magic = ascii(data.slice(0, 8));
  if (magic !== magic4 && magic !== magic5) {
    throw new Error("Identicons require an ASTRPKG4 or ASTRPKG5 packaged astral file");
  }
  const version = magic === magic5 ? 5 : 4;
  const { headSize, rawKey } = validateContainer(data, version);

  let source: AstralIdenticonSource;
  if (version === 4) {
    const values = publicSigns(data.slice(publicOffset, headSize));
    source = {
      input: checkedInput(rawKey, values),
      wheel: null,
      containerVersion: 4
    };
  } else {
    const meta = publicMeta(data.slice(publicOffset, headSize));
    source = {
      input: checkedInput(rawKey, meta.inputValues),
      wheel: meta.wheel,
      containerVersion: 5
    };
  }

  bindWheel(source.input, source.wheel);
  return source;
}

export function astralInput(data: Uint8Array): IdenticonInput {
  return astralSource(data).input;
}

export function astralWheel(data: Uint8Array): PublicWheelMeta | null {
  return astralSource(data).wheel;
}
