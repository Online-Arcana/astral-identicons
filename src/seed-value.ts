import type { IdenticonInput, SeedKind } from "./types.ts";

const encoder = new TextEncoder();
const keyPattern = /^[A-Za-z0-9_-]{43}$/u;

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

export function seedBytes(value: Pick<IdenticonInput, "seed" | "seedKind">): Uint8Array {
  if (value.seedKind === "ed25519") return rawPublicKey(value.seed);
  if (value.seed.length === 0) throw new Error("seed must be a non-empty string");
  if (value.seed.trim() !== value.seed) {
    throw new Error("seed must not contain leading or trailing whitespace");
  }

  const bytes = encoder.encode(value.seed);
  if (bytes.length > 32) {
    throw new Error("seed must contain at most 32 UTF-8 bytes so it can be recovered exactly");
  }
  return bytes;
}

export function seedKind(value: unknown): SeedKind {
  if (value === undefined || value === null || value === "") return "text";
  if (value === "text" || value === "ed25519") return value;
  throw new Error("seedKind must be text or ed25519");
}

export function seedMaterial(value: IdenticonInput): string | Uint8Array {
  return value.seedKind === "text" ? value.seed : seedBytes(value);
}
