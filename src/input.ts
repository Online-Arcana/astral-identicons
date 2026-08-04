import { seedBytes, seedKind } from "./seed-value.ts";
import { sign } from "./sign.ts";
import type { IdenticonInput, RawIdenticonInput } from "./types.ts";

export function input(raw: RawIdenticonInput): IdenticonInput {
  if (typeof raw.seed !== "string" || raw.seed.trim().length === 0) {
    throw new Error("seed must be a non-empty string");
  }

  const kind = seedKind(raw.seedKind);
  const seed = raw.seed.trim();
  const value: IdenticonInput = {
    seed,
    seedKind: kind,
    solar: sign(raw.solar, "solar"),
    lunar: sign(raw.lunar, "lunar"),
    ascendant: sign(raw.ascendant, "ascendant"),
    midheaven: sign(raw.midheaven, "midheaven"),
    descendant: sign(raw.descendant, "descendant"),
    imumCoeli: sign(raw.imumCoeli, "imumCoeli")
  };

  seedBytes(value);
  return value;
}
