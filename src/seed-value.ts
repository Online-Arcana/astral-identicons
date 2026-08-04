import type { IdenticonInput } from "./types.ts";

const encoder = new TextEncoder();
const keyPattern = /^[A-Za-z0-9_-]{43}$/u;
const source = Symbol("astral-identicon/raw-seed");
type BoundInput = IdenticonInput & { [source]?: Uint8Array };

export function base64Url(value: Uint8Array): string {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function rawPublicKey(value: string): Uint8Array {
  if (!keyPattern.test(value)) {
    throw new Error("Ed25519 public key must contain exactly 43 base64url characters");
  }

  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=");
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (bytes.length !== 32 || base64Url(bytes) !== value) {
    throw new Error("Ed25519 public key is not canonical base64url");
  }
  return bytes;
}

export function isPublicKey(value: string): boolean {
  if (!keyPattern.test(value)) return false;
  try {
    return base64Url(rawPublicKey(value)) === value;
  } catch {
    return false;
  }
}

export function bindPublicKey<T extends IdenticonInput>(
  value: T,
  raw: Uint8Array
): T {
  if (raw.byteLength !== 32) throw new Error("Ed25519 public key must contain exactly 32 bytes");
  if (base64Url(raw) !== value.seed) {
    throw new Error("Public-key display does not match the raw key bytes");
  }

  Object.defineProperty(value, source, {
    value: raw.slice(),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return value;
}

export function boundPublicKey(value: Pick<IdenticonInput, "seed">): Uint8Array | undefined {
  const raw = (value as BoundInput)[source];
  return raw?.slice();
}

export function isPublicSeed(value: Pick<IdenticonInput, "seed">): boolean {
  return boundPublicKey(value) !== undefined || isPublicKey(value.seed);
}

export function seedBytes(value: Pick<IdenticonInput, "seed">): Uint8Array {
  const bound = boundPublicKey(value);
  if (bound) return bound;
  if (isPublicKey(value.seed)) return rawPublicKey(value.seed);
  if (value.seed.length === 0) throw new Error("seed must be a non-empty string");
  if (value.seed.trim() !== value.seed) {
    throw new Error("seed must not contain leading or trailing whitespace");
  }

  const bytes = encoder.encode(value.seed);
  if (bytes.length > 32) {
    throw new Error("seed must contain at most 32 UTF-8 bytes or be a 32-byte Ed25519 public key");
  }
  return bytes;
}

export function seedMaterial(value: Pick<IdenticonInput, "seed">): string | Uint8Array {
  const bound = boundPublicKey(value);
  if (bound) return bound;
  return isPublicKey(value.seed) ? rawPublicKey(value.seed) : value.seed;
}
