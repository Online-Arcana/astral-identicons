import { crc16 } from "./crc.ts";
import {
  rsEncode,
  rsRecoverErrorsAndErasures,
  rsValid,
  type ReedSolomonRecovery
} from "./rs.ts";
import {
  base64Url,
  bindPublicKey,
  isPublicSeed,
  seedBytes
} from "./seed-value.ts";
import { signs, type Sign } from "./sign.ts";
import type { IdenticonInput } from "./types.ts";

export interface V9ByteObservation {
  readonly value: number | null;
  readonly confidence: number;
}

export interface V9RecordObservations {
  readonly data: readonly V9ByteObservation[];
  readonly parity: readonly V9ByteObservation[];
}

export interface RecoveredV9Record {
  readonly value: IdenticonInput;
  readonly record: Uint8Array;
  readonly codeword: Uint8Array;
  readonly correctedPositions: readonly number[];
  readonly errors: number;
  readonly erasures: number;
  readonly confidence: number;
}

export const v9RecordMagic = 0xa5;
export const v9RecordVersion = 9;
export const v9IdentityByteCount = 32;
export const v9DataByteCount = 40;
export const v9ParityByteCount = 128;
export const v9CodewordByteCount = v9DataByteCount + v9ParityByteCount;

const identityLengthOffset = 2;
const identityOffset = 3;
const signsOffset = identityOffset + v9IdentityByteCount;
const crcOffset = v9DataByteCount - 2;

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
  if (!sign) throw new Error("v9 record contains an invalid zodiac sign");
  return sign;
}

export function v9IdentityBytes(value: IdenticonInput): Uint8Array {
  if (!isPublicSeed(value)) {
    throw new Error(
      "v9 scanning requires an exact 32-byte identity; short text seeds remain legacy-only"
    );
  }

  const bytes = seedBytes(value);
  if (bytes.byteLength !== v9IdentityByteCount) {
    throw new Error("v9 identity must contain exactly 32 bytes");
  }
  return bytes;
}

export function v9Record(value: IdenticonInput): Uint8Array {
  const result = new Uint8Array(v9DataByteCount);
  result[0] = v9RecordMagic;
  result[1] = v9RecordVersion;
  result[identityLengthOffset] = v9IdentityByteCount;
  result.set(v9IdentityBytes(value), identityOffset);
  result.set(packedSigns(value), signsOffset);

  const checksum = crc16(result.slice(0, crcOffset));
  result[crcOffset] = checksum >>> 8;
  result[crcOffset + 1] = checksum & 0xff;
  return result;
}

export function decodeV9Record(record: Uint8Array): IdenticonInput {
  if (record.byteLength !== v9DataByteCount) {
    throw new Error(`v9 record must contain exactly ${v9DataByteCount} bytes`);
  }
  if (record[0] !== v9RecordMagic) {
    throw new Error("v9 record magic is invalid");
  }
  if (record[1] !== v9RecordVersion) {
    throw new Error("v9 record version is unsupported");
  }
  if (record[identityLengthOffset] !== v9IdentityByteCount) {
    throw new Error("v9 identity length is invalid");
  }

  const expectedCrc = (record[crcOffset]! << 8) | record[crcOffset + 1]!;
  const actualCrc = crc16(record.slice(0, crcOffset));
  if (actualCrc !== expectedCrc) {
    throw new Error("v9 record checksum failed");
  }

  const first = record[signsOffset]!;
  const second = record[signsOffset + 1]!;
  const third = record[signsOffset + 2]!;
  const identity = record.slice(identityOffset, identityOffset + v9IdentityByteCount);
  const value: IdenticonInput = {
    seed: base64Url(identity),
    solar: unpackSign(first >>> 4),
    lunar: unpackSign(first & 0x0f),
    ascendant: unpackSign(second >>> 4),
    midheaven: unpackSign(second & 0x0f),
    descendant: unpackSign(third >>> 4),
    imumCoeli: unpackSign(third & 0x0f)
  };

  return bindPublicKey(value, identity);
}

export function v9Codeword(value: IdenticonInput): Uint8Array {
  return rsEncode(v9Record(value), v9ParityByteCount);
}

export function v9Parity(value: IdenticonInput): Uint8Array {
  return v9Codeword(value).slice(v9DataByteCount);
}

export function decodeV9Codeword(codeword: Uint8Array): IdenticonInput {
  if (codeword.byteLength !== v9CodewordByteCount) {
    throw new Error(`v9 codeword must contain exactly ${v9CodewordByteCount} bytes`);
  }
  if (!rsValid(codeword, v9ParityByteCount)) {
    throw new Error("v9 codeword failed Reed-Solomon validation");
  }
  return decodeV9Record(codeword.slice(0, v9DataByteCount));
}

function validateObservation(
  observation: V9ByteObservation,
  label: string
): void {
  if (!Number.isFinite(observation.confidence)) {
    throw new Error(`${label} confidence must be finite`);
  }
  if (observation.value === null) return;
  if (
    !Number.isInteger(observation.value) ||
    observation.value < 0 ||
    observation.value > 255
  ) {
    throw new Error(`${label} must contain a byte or null`);
  }
}

function recoveryConfidence(
  observations: readonly V9ByteObservation[],
  corrected: ReadonlySet<number>
): number {
  let total = 0;
  let count = 0;

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    if (observation.value === null || corrected.has(index)) continue;
    total += Math.max(0, Math.min(1, observation.confidence));
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

export function recoverV9Record(
  observations: V9RecordObservations
): RecoveredV9Record {
  if (observations.data.length !== v9DataByteCount) {
    throw new Error(`v9 data observations must contain ${v9DataByteCount} slots`);
  }
  if (observations.parity.length !== v9ParityByteCount) {
    throw new Error(`v9 parity observations must contain ${v9ParityByteCount} slots`);
  }

  const all = [...observations.data, ...observations.parity];
  const damaged = new Uint8Array(v9CodewordByteCount);
  const erasures: number[] = [];

  for (let index = 0; index < all.length; index += 1) {
    const observation = all[index]!;
    validateObservation(observation, `v9 observation ${index}`);
    if (observation.value === null) {
      erasures.push(index);
      continue;
    }
    damaged[index] = observation.value;
  }

  const recovery: ReedSolomonRecovery = rsRecoverErrorsAndErasures(
    damaged,
    v9ParityByteCount,
    erasures
  );
  const record = recovery.codeword.slice(0, v9DataByteCount);
  const value = decodeV9Record(record);
  const corrected = new Set(recovery.positions);

  return {
    value,
    record,
    codeword: recovery.codeword,
    correctedPositions: recovery.positions,
    errors: recovery.errors,
    erasures: recovery.erasures,
    confidence: recoveryConfidence(all, corrected)
  };
}
