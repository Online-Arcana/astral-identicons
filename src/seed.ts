import { rsEncode, rsRecoverErasures, rsValid } from "./rs.ts";

export interface SeedSymbol {
  byte: number;
  half: "high" | "low";
  nibble: number;
  slot: number;
  value: number;
  parity: boolean;
}

export const seedByteCount = 32;
export const seedParityByteCount = 32;
export const seedCodewordByteCount = seedByteCount + seedParityByteCount;
export const seedNibbleCount = seedCodewordByteCount * 2;
export const seedSlotCount = seedNibbleCount;

const slotStride = 17;

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

function derivedSeed(value: string): string {
  const parts: string[] = [];

  for (let index = 0; index < 8; index += 1) {
    parts.push(
      hash32(`astrological-identicon/visual-seed/v1:${index}:${value}`)
        .toString(16)
        .padStart(8, "0")
    );
  }

  return parts.join("").toUpperCase();
}

export function seedCode(seed: string): string {
  const value = seed.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toUpperCase();
  return derivedSeed(value);
}

export function seedBytes(seed: string): Uint8Array {
  const code = seedCode(seed);
  const result = new Uint8Array(seedByteCount);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(code.slice(index * 2, index * 2 + 2), 16);
  }

  return result;
}

export function seedPaletteIndex(seed: string): number {
  return seedBytes(seed)[0]! >>> 2;
}

export function seedCodeword(seed: string): Uint8Array {
  return rsEncode(seedBytes(seed), seedParityByteCount);
}

export function seedNibbleSlot(nibble: number): number {
  if (!Number.isInteger(nibble) || nibble < 0 || nibble >= seedNibbleCount) {
    throw new Error(`seed nibble must be between 0 and ${seedNibbleCount - 1}`);
  }

  return (nibble * slotStride) % seedSlotCount;
}

export function seedSymbols(seed: string): readonly SeedSymbol[] {
  const codeword = seedCodeword(seed);
  const result: SeedSymbol[] = [];

  for (let byte = 0; byte < codeword.length; byte += 1) {
    const value = codeword[byte]!;

    for (let halfIndex = 0; halfIndex < 2; halfIndex += 1) {
      const half = halfIndex === 0 ? "high" : "low";
      const nibble = byte * 2 + halfIndex;
      const nibbleValue = halfIndex === 0 ? value >>> 4 : value & 0x0f;

      result.push({
        byte,
        half,
        nibble,
        slot: seedNibbleSlot(nibble),
        value: nibbleValue,
        parity: byte >= seedByteCount
      });
    }
  }

  return result.sort((left, right) => left.slot - right.slot);
}

export function encodedSeedNibbles(seed: string): readonly number[] {
  const slots = Array<number>(seedSlotCount).fill(0);

  for (const symbol of seedSymbols(seed)) {
    slots[symbol.slot] = symbol.value;
  }

  return slots;
}

function bytesToCode(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function decodeSeedNibbles(
  slots: readonly (number | null)[],
  paletteIndex: number
): string {
  if (slots.length !== seedSlotCount) {
    throw new Error(`seed slot sample must contain exactly ${seedSlotCount} values`);
  }

  if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= 64) {
    throw new Error("palette index must be between 0 and 63");
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

  const recovered = erasures.length === 0
    ? codeword
    : rsRecoverErasures(codeword, seedParityByteCount, erasures);

  if (!rsValid(recovered, seedParityByteCount)) {
    throw new Error("seed star codeword failed Reed-Solomon validation");
  }

  const seed = recovered.slice(0, seedByteCount);
  if ((seed[0]! >>> 2) !== paletteIndex) {
    throw new Error("palette does not match the decoded visual seed");
  }

  return bytesToCode(seed);
}
