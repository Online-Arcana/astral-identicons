import { hexBytes, sha256 } from "./sha256.ts";

const encoder = new TextEncoder();

function concatenate(...values: readonly Uint8Array[]): Uint8Array {
  const length = values.reduce((sum, value) => sum + value.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }

  return result;
}

function counterBytes(value: number): Uint8Array {
  return new Uint8Array([
    value >>> 24,
    value >>> 16,
    value >>> 8,
    value
  ]);
}

export class DeterministicRandom {
  readonly #key: Uint8Array;
  #counter = 0;
  #pool = new Uint8Array();
  #offset = 0;

  constructor(domain: string, seed: string, nonce: string) {
    this.#key = sha256(`${domain}\u0000${seed}\u0000${nonce}`);
  }

  byte(): number {
    if (this.#offset >= this.#pool.length) this.refill();
    const value = this.#pool[this.#offset]!;
    this.#offset += 1;
    return value;
  }

  integer(maximum: number): number {
    if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > 0x1_0000_0000) {
      throw new Error("PRNG maximum must be an integer between 1 and 2^32");
    }

    const limit = Math.floor(0x1_0000_0000 / maximum) * maximum;

    while (true) {
      const value = (
        this.byte() * 0x1_0000_00 +
        this.byte() * 0x1_0000 +
        this.byte() * 0x100 +
        this.byte()
      ) >>> 0;

      if (value < limit) return value % maximum;
    }
  }

  private refill(): void {
    const block = sha256(concatenate(
      this.#key,
      encoder.encode("astral-identicon/prng-block/v1"),
      counterBytes(this.#counter)
    ));

    this.#counter = (this.#counter + 1) >>> 0;
    this.#pool = block;
    this.#offset = 0;
  }
}

export function defaultNonce(seed: string): string {
  return hexBytes(sha256(`astral-identicon/palette-nonce/v1\u0000${seed}`));
}

export function paletteDraw(seed: string, nonce: string, count: number): number {
  return new DeterministicRandom(
    "astral-identicon/palette/v6",
    seed,
    nonce
  ).integer(count);
}
