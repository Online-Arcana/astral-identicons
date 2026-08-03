import { sign } from "./sign.ts";
import type { IdenticonInput, RawIdenticonInput } from "./types.ts";

export function input(raw: RawIdenticonInput): IdenticonInput {
  if (typeof raw.seed !== "string" || raw.seed.trim().length === 0) {
    throw new Error("seed must be a non-empty string");
  }

  return {
    seed: raw.seed.trim(),
    solar: sign(raw.solar, "solar"),
    lunar: sign(raw.lunar, "lunar"),
    ascendant: sign(raw.ascendant, "ascendant"),
    midheaven: sign(raw.midheaven, "midheaven"),
    descendant: sign(raw.descendant, "descendant"),
    imumCoeli: sign(raw.imumCoeli, "imumCoeli")
  };
}
