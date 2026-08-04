import { input } from "./input.ts";
import { base64Url } from "./seed-value.ts";
import type { IdenticonInput } from "./types.ts";

const decoder = new TextDecoder("utf-8", { fatal: true });
const magic = "ASTRPKG4";
const fixed = 32;
const saltSize = 16;
const nonceSize = 12;
const keySize = 32;
const keyOffset = fixed + saltSize + nonceSize;
const signOffset = keyOffset + keySize;
const maxPublic = 256;
const maxPayload = 64 * 1024 * 1024;
const fields = [
  ["solar_sign", "solar"],
  ["lunar_sign", "lunar"],
  ["ascending_sign", "ascendant"],
  ["midheaven_sign", "midheaven"],
  ["descending_sign", "descendant"],
  ["imum_coeli_sign", "imumCoeli"]
] as const;

function u32(value: Uint8Array, offset: number): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength)
    .getUint32(offset, false);
}

function ascii(value: Uint8Array): string {
  return String.fromCharCode(...value);
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
  if (lines.length !== fields.length) {
    throw new Error("Astral public sign block must contain six fields");
  }

  const result: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 1) {
    const [label, name] = fields[index]!;
    const prefix = `${label}=`;
    const line = lines[index]!;
    if (!line.startsWith(prefix)) {
      throw new Error(`Astral public sign field ${label} is missing or out of order`);
    }
    result[name] = line.slice(prefix.length);
  }
  return result;
}

export function astralInput(data: Uint8Array): IdenticonInput {
  if (data.byteLength < signOffset + 16) {
    throw new Error("Astral container is truncated");
  }
  if (ascii(data.slice(0, 8)) !== magic) {
    throw new Error("Identicons require an ASTRPKG4 packaged astral file");
  }
  if (data[8] !== 4 || data[9] !== 0) throw new Error("Unsupported astral container version");
  if (data[10] !== 1 || data[11] !== 1 || data[13] !== 2) {
    throw new Error("Unsupported astral container algorithms");
  }
  if (![0, 1, 2, 3].includes(data[12]!)) throw new Error("Unsupported astral compression codec");
  if (data[14] !== 0 || data[15] !== 0) throw new Error("Unsupported astral container flags");

  const rawSize = u32(data, 20);
  const cipherSize = u32(data, 24);
  const headSize = u32(data, 28);
  if (rawSize < 1 || rawSize > maxPayload || cipherSize < 16 || cipherSize > maxPayload) {
    throw new Error("Astral container length is unsafe");
  }
  if (headSize < signOffset || headSize > signOffset + maxPublic) {
    throw new Error("Astral public header length is invalid");
  }
  if (data.byteLength !== headSize + cipherSize) {
    throw new Error("Astral container is truncated or extended");
  }

  const rawKey = data.slice(keyOffset, keyOffset + keySize);
  const values = publicSigns(data.slice(signOffset, headSize));
  return input({
    seed: base64Url(rawKey),
    solar: values.solar,
    lunar: values.lunar,
    ascendant: values.ascendant,
    midheaven: values.midheaven,
    descendant: values.descendant,
    imumCoeli: values.imumCoeli
  });
}
