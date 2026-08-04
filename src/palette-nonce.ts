import configuration from "../config/palette-targets.json";
import { defaultNonce } from "./prng.ts";
import type { IdenticonInput } from "./types.ts";

interface PaletteTarget {
  readonly nonce: string;
}

interface PaletteConfiguration {
  readonly version: number;
  readonly targets: Readonly<Record<string, PaletteTarget>>;
}

const config = configuration as PaletteConfiguration;
const noncePattern = /^[0-9a-f]{64}$/u;

if (config.version !== 1) {
  throw new Error(`Unsupported palette target configuration version: ${config.version}`);
}

for (const [seed, value] of Object.entries(config.targets)) {
  if (seed.length === 0) throw new Error("Palette target seed must not be empty");
  if (!noncePattern.test(value.nonce)) {
    throw new Error(`Palette nonce for ${seed} must contain exactly 64 lowercase hex digits`);
  }
}

export function paletteNonce(
  seed: string | Uint8Array,
  value?: Pick<IdenticonInput, "seed" | "seedKind">
): string {
  if (typeof seed === "string") return config.targets[seed]?.nonce ?? defaultNonce(seed);
  if (value?.seedKind === "text") return config.targets[value.seed]?.nonce ?? defaultNonce(seed);
  return defaultNonce(seed);
}

export function configuredPaletteNonce(seed: string): string | undefined {
  return config.targets[seed]?.nonce;
}
