import { rsEncode, rsRecoverErasures, rsValid } from "./rs.ts";
import { signs, type Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";

export interface SeedSymbol {
  byte: number;
  half: "high" | "low";
  nibble: number;
  slot: number;
  value: number;
  parity: boolean;
}

export const paletteCount = 64;
export const seedMaxByteCount = 32;
export const seedDataByteCount = 40;
export const seedParityByteCount = 24;
export const seedCodewordByteCount = seedDataByteCount + seedParityByteCount;
export const seedNibbleCount = seedCodewordByteCount * 2;
export const seedSlotCount = seedNibbleCount;

const payloadMagic = 0xa5;
const payloadVersion = 1;
const payloadSeedOffset = 3;
const payloadSignsOffset = payloadSeedOffset + seedMaxByteCount;
const payloadCrcOffset = seedDataByteCount - 2;
const slotStride = 17;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function hash32(value: string): number {
  let result = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }

  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;

  return result >>> 0;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;

  for (const byte of bytes) {
    crc ^= byte << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0
        ? ((crc << 1) ^ 0x1021) & 0xffff
        : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

function seedBytes(seed: string): Uint8Array {
  if (seed.length === 0) throw new Error("seed must be a non-empty string");
  if (seed.trim() !== seed) {
    throw new Error("seed must not contain leading or trailing whitespace");
  }

  const bytes = encoder.encode(seed);
  if (bytes.length > seedMaxByteCount) {
    throw new Error(
      `seed must contain at most ${seedMaxByteCount} UTF-8 bytes so it can be recovered exactly`
    );
  }

  return bytes;
}

export function seedByteLength(seed: string): number {
  return seedBytes(seed).length;
}

export function seedPaletteIndex(seed: string): number {
  seedBytes(seed);
  return hash32(`astrological-identicon/palette/v5:${seed}`) & 0x3f;
}

export function canonicalPaletteSeed(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= paletteCount) {
    throw new Error(`palette index must be between 0 and ${paletteCount - 1}`);
  }

  return `palette-${index.toString(16).padStart(2, "0").toUpperCase()}`;
}

function signIndex(value: Sign): number {
  const index = signs.indexOf(value);
  if (index < 0) throw new Error(`unknown zodiac sign: ${value}`);
  return index;
}

function packedSigns(value: IdenticonInput): readonly [number, number, number] {
  return [
    (signIndex(value.solar) << 4) | signIndex(value.lunar),
    (signIndex(value.ascendant) << 4) | signIndex(value.midheaven),
    (signIndex(value.descendant) << 4) | signIndex(value.imumCoeli)
  ];
}

function unpackSign(value: number): Sign {
  const sign = signs[value];
  if (!sign) throw new Error("visual payload contains an invalid zodiac sign");
  return sign;
}

export function seedPayload(value: IdenticonInput): Uint8Array {
  const bytes = seedBytes(value.seed);
  const result = new Uint8Array(seedDataByteCount);

  result[0] = payloadMagic;
  result[1] = payloadVersion;
  result[2] = bytes.length;
  result.set(bytes, payloadSeedOffset);
  result.set(packedSigns(value), payloadSignsOffset);

  const checksum = crc16(result.slice(0, payloadCrcOffset));
  result[payloadCrcOffset] = checksum >>> 8;
  result[payloadCrcOffset + 1] = checksum & 0xff;

  return result;
}

export function seedCodeword(value: IdenticonInput): Uint8Array {
  return rsEncode(seedPayload(value), seedParityByteCount);
}

export function seedNibbleSlot(nibble: number): number {
  if (!Number.isInteger(nibble) || nibble < 0 || nibble >= seedNibbleCount) {
    throw new Error(`seed nibble must be between 0 and ${seedNibbleCount - 1}`);
  }

  return (nibble * slotStride) % seedSlotCount;
}

export function seedSymbols(value: IdenticonInput): readonly SeedSymbol[] {
  const codeword = seedCodeword(value);
  const result: SeedSymbol[] = [];

  for (let byte = 0; byte < codeword.length; byte += 1) {
    const code = codeword[byte]!;

    for (let halfIndex = 0; halfIndex < 2; halfIndex += 1) {
      const half = halfIndex === 0 ? "high" : "low";
      const nibble = byte * 2 + halfIndex;
      const nibbleValue = halfIndex === 0 ? code >>> 4 : code & 0x0f;

      result.push({
        byte,
        half,
        nibble,
        slot: seedNibbleSlot(nibble),
        value: nibbleValue,
        parity: byte >= seedDataByteCount
      });
    }
  }

  return result.sort((left, right) => left.slot - right.slot);
}

export function encodedSeedNibbles(value: IdenticonInput): readonly number[] {
  const slots = Array<number>(seedSlotCount).fill(0);

  for (const symbol of seedSymbols(value)) {
    slots[symbol.slot] = symbol.value;
  }

  return slots;
}

function decodedPayload(data: Uint8Array): IdenticonInput {
  if (data.length !== seedDataByteCount) {
    throw new Error(`visual payload must contain exactly ${seedDataByteCount} data bytes`);
  }

  if (data[0] !== payloadMagic || data[1] !== payloadVersion) {
    throw new Error("visual payload header is invalid");
  }

  const length = data[2]!;
  if (length === 0 || length > seedMaxByteCount) {
    throw new Error("visual payload seed length is invalid");
  }

  for (let index = payloadSeedOffset + length; index < payloadSignsOffset; index += 1) {
    if (data[index] !== 0) throw new Error("visual payload seed padding is invalid");
  }

  const expectedCrc = (data[payloadCrcOffset]! << 8) | data[payloadCrcOffset + 1]!;
  const actualCrc = crc16(data.slice(0, payloadCrcOffset));
  if (actualCrc !== expectedCrc) {
    throw new Error("visual payload checksum failed");
  }

  let seed: string;
  try {
    seed = decoder.decode(data.slice(payloadSeedOffset, payloadSeedOffset + length));
  } catch {
    throw new Error("visual payload seed is not valid UTF-8");
  }

  if (encoder.encode(seed).length !== length || seed.trim() !== seed || seed.length === 0) {
    throw new Error("visual payload seed text is invalid");
  }

  const first = data[payloadSignsOffset]!;
  const second = data[payloadSignsOffset + 1]!;
  const third = data[payloadSignsOffset + 2]!;

  return {
    seed,
    solar: unpackSign(first >>> 4),
    lunar: unpackSign(first & 0x0f),
    ascendant: unpackSign(second >>> 4),
    midheaven: unpackSign(second & 0x0f),
    descendant: unpackSign(third >>> 4),
    imumCoeli: unpackSign(third & 0x0f)
  };
}

export function decodeSeedCodeword(codeword: Uint8Array): IdenticonInput {
  if (codeword.length !== seedCodewordByteCount) {
    throw new Error(`visual codeword must contain exactly ${seedCodewordByteCount} bytes`);
  }

  if (!rsValid(codeword, seedParityByteCount)) {
    throw new Error("visual payload failed Reed-Solomon validation");
  }

  return decodedPayload(codeword.slice(0, seedDataByteCount));
}

export function decodeSeedNibbles(slots: readonly (number | null)[]): IdenticonInput {
  if (slots.length !== seedSlotCount) {
    throw new Error(`seed slot sample must contain exactly ${seedSlotCount} values`);
  }

  const codeword = new Uint8Array(seedCodewordByteCount);
  const erasures: number[] = [];

  for (let byte = 0; byte < seedCodewordByteCount; byte += 1) {
    const high = slots[seedNibbleSlot(byte * 2)];
    const low = slots[seedNibbleSlot(byte * 2 + 1)];

    if (high === null || low === null) {
      erasures.push(byte);
      continue;
    }

    if (
      !Number.isInteger(high) || high < 0 || high > 15 ||
      !Number.isInteger(low) || low < 0 || low > 15
    ) {
      throw new Error("seed star samples must contain hexadecimal nibbles or null");
    }

    codeword[byte] = (high << 4) | low;
  }

  if (erasures.length > seedParityByteCount) {
    throw new Error(
      `visual payload has ${erasures.length} erased bytes; at most ${seedParityByteCount} can be reconstructed`
    );
  }

  const recovered = erasures.length === 0
    ? codeword
    : rsRecoverErasures(codeword, seedParityByteCount, erasures);

  return decodeSeedCodeword(recovered);
}
