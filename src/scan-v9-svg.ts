import { input } from "./input.ts";
import { v9IdentityBytes } from "./record-v9.ts";
import type { IdenticonInput, RawIdenticonInput } from "./types.ts";

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attribute(source: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`\\b${escaped}="([^"]*)"`, "u").exec(source);
  return match ? decodeXml(match[1]!) : undefined;
}

function identityHex(value: IdenticonInput): string {
  return [...v9IdentityBytes(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function exportedV9Svg(source: string): IdenticonInput | null {
  const opening = /<svg\b[^>]*>/u.exec(source)?.[0];
  if (!opening) return null;

  const version = attribute(opening, "data-code-version");
  const scannable = attribute(opening, "data-scannable");
  if (version !== "9" || scannable !== "v9") return null;

  const encodedInput = attribute(opening, "data-input");
  const encodedIdentity = attribute(opening, "data-identity-hex");
  if (!encodedInput || !encodedIdentity) {
    throw new Error("The v9 SVG is missing its canonical identity metadata");
  }

  let raw: RawIdenticonInput;
  try {
    raw = JSON.parse(encodedInput) as RawIdenticonInput;
  } catch {
    throw new Error("The v9 SVG contains malformed identity metadata");
  }

  const value = input(raw);
  const expected = identityHex(value);
  if (encodedIdentity.toLowerCase() !== expected) {
    throw new Error("The v9 SVG identity metadata does not match its exact key");
  }
  return value;
}

export function isSvgFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "image/svg+xml" || /\.svg$/iu.test(file.name);
}

export async function exportedV9SvgFile(file: File): Promise<IdenticonInput | null> {
  if (!isSvgFile(file)) return null;
  return exportedV9Svg(await file.text());
}
