export interface SeedSymbol {
  slot: number;
  track: number;
  sector: number;
  bit: 0 | 1;
}

export const paletteCount = 64;
export const paletteCorrectionTrackCount = 4;
export const paletteCorrectionSectorCount = 32;
export const seedSlotCount = paletteCorrectionTrackCount * paletteCorrectionSectorCount;

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

function explicitPaletteIndex(value: string): number | undefined {
  const match = /^palette-([0-9a-f]{2})$/i.exec(value);
  if (!match) return undefined;

  const index = Number.parseInt(match[1]!, 16);
  return index < paletteCount ? index : undefined;
}

export function canonicalPaletteSeed(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= paletteCount) {
    throw new Error(`palette index must be between 0 and ${paletteCount - 1}`);
  }

  return `palette-${index.toString(16).padStart(2, "0").toUpperCase()}`;
}

export function seedCode(seed: string): string {
  const value = seed.trim();
  const explicit = explicitPaletteIndex(value);

  if (explicit !== undefined) {
    const first = (explicit << 2).toString(16).padStart(2, "0");
    return `${first}${"0".repeat(62)}`.toUpperCase();
  }

  if (/^[0-9a-f]{64}$/i.test(value)) return value.toUpperCase();
  return derivedSeed(value);
}

export function seedBytes(seed: string): Uint8Array {
  const code = seedCode(seed);
  const result = new Uint8Array(32);

  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(code.slice(index * 2, index * 2 + 2), 16);
  }

  return result;
}

export function seedPaletteIndex(seed: string): number {
  const explicit = explicitPaletteIndex(seed.trim());
  if (explicit !== undefined) return explicit;
  return seedBytes(seed)[0]! >>> 2;
}

function parity(value: number): 0 | 1 {
  let bits = value >>> 0;
  bits ^= bits >>> 16;
  bits ^= bits >>> 8;
  bits ^= bits >>> 4;
  bits &= 0x0f;
  return ((0x6996 >>> bits) & 1) as 0 | 1;
}

function correctionMask(track: number, sector: number): 0 | 1 {
  const first = sector >>> (track % 5);
  const second = sector >>> ((track + 2) % 5);
  return ((first ^ second ^ track) & 1) as 0 | 1;
}

export function paletteCorrectionBit(index: number, slot: number): 0 | 1 {
  if (!Number.isInteger(index) || index < 0 || index >= paletteCount) {
    throw new Error(`palette index must be between 0 and ${paletteCount - 1}`);
  }

  if (!Number.isInteger(slot) || slot < 0 || slot >= seedSlotCount) {
    throw new Error(`correction slot must be between 0 and ${seedSlotCount - 1}`);
  }

  const track = Math.floor(slot / paletteCorrectionSectorCount);
  const sector = slot % paletteCorrectionSectorCount;
  const constant = (index >>> 5) & 1;
  const coefficients = index & 0x1f;
  const hadamard = constant ^ parity(coefficients & sector);

  return (hadamard ^ correctionMask(track, sector)) as 0 | 1;
}

export function paletteCorrectionBits(index: number): readonly (0 | 1)[] {
  return Array.from(
    { length: seedSlotCount },
    (_unused, slot) => paletteCorrectionBit(index, slot)
  );
}

export function seedSymbols(seed: string): readonly SeedSymbol[] {
  const index = seedPaletteIndex(seed);

  return paletteCorrectionBits(index).map((bit, slot) => ({
    slot,
    track: Math.floor(slot / paletteCorrectionSectorCount),
    sector: slot % paletteCorrectionSectorCount,
    bit
  }));
}
