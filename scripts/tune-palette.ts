import { paletteForIndex } from "../src/palette.ts";
import { paletteDraw } from "../src/prng.ts";
import { paletteCount } from "../src/seed.ts";
import { hexBytes, sha256 } from "../src/sha256.ts";

interface TargetColours {
  background: string;
  layer0: string;
  layer1: string;
}

interface TargetEntry {
  target: TargetColours;
  nonce?: string;
  paletteIndex?: number;
  distance?: number;
}

interface Configuration {
  version: number;
  algorithm: string;
  targets: Record<string, TargetEntry>;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

const path = `${import.meta.dir}/../config/palette-targets.json`;
const config = await Bun.file(path).json() as Configuration;
const noncePattern = /^[0-9a-f]{64}$/u;
const colourPattern = /^#[0-9A-F]{3}$/u;
const maximumAttempts = 1_000_000;

function rgb(value: string): readonly [number, number, number] {
  if (!colourPattern.test(value)) {
    throw new Error(`Palette target colour must use uppercase reduced hex: ${value}`);
  }

  return value.slice(1).split("").map((digit) => {
    return Number.parseInt(digit + digit, 16);
  }) as unknown as readonly [number, number, number];
}

function linear(value: number): number {
  const normalised = value / 255;
  return normalised <= 0.04045
    ? normalised / 12.92
    : ((normalised + 0.055) / 1.055) ** 2.4;
}

function lab(value: string): Lab {
  const [red, green, blue] = rgb(value).map(linear) as [number, number, number];
  const x = (
    red * 0.4124564 +
    green * 0.3575761 +
    blue * 0.1804375
  ) / 0.95047;
  const y = (
    red * 0.2126729 +
    green * 0.7151522 +
    blue * 0.0721750
  );
  const z = (
    red * 0.0193339 +
    green * 0.1191920 +
    blue * 0.9503041
  ) / 1.08883;
  const delta = 6 / 29;
  const transform = (channel: number): number => {
    return channel > delta ** 3
      ? Math.cbrt(channel)
      : channel / (3 * delta * delta) + 4 / 29;
  };
  const fx = transform(x);
  const fy = transform(y);
  const fz = transform(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function delta(left: Lab, right: Lab): number {
  return Math.hypot(
    left.l - right.l,
    left.a - right.a,
    left.b - right.b
  );
}

function paletteDistance(index: number, target: TargetColours): number {
  const value = paletteForIndex(index);

  return (
    delta(lab(value.background.reduced), lab(target.background)) * 1.4 +
    delta(lab(value.layer0.reduced), lab(target.layer0)) +
    delta(lab(value.layer1.reduced), lab(target.layer1))
  );
}

function nearest(target: TargetColours): { index: number; distance: number } {
  let index = 0;
  let distance = Number.POSITIVE_INFINITY;

  for (let candidate = 0; candidate < paletteCount; candidate += 1) {
    const candidateDistance = paletteDistance(candidate, target);
    if (candidateDistance >= distance) continue;
    index = candidate;
    distance = candidateDistance;
  }

  return { index, distance };
}

function candidateNonce(seed: string, attempt: number): string {
  return hexBytes(sha256(
    `astral-identicon/palette-tune/v1\u0000${seed}\u0000${attempt}`
  ));
}

function nonceFor(seed: string, index: number, current?: string): string {
  if (
    current &&
    noncePattern.test(current) &&
    paletteDraw(seed, current, paletteCount) === index
  ) {
    return current;
  }

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const nonce = candidateNonce(seed, attempt);
    if (paletteDraw(seed, nonce, paletteCount) === index) return nonce;
  }

  throw new Error(
    `Could not tune ${seed} to palette ${index} within ${maximumAttempts} attempts`
  );
}

for (const [seed, entry] of Object.entries(config.targets)) {
  const result = nearest(entry.target);
  const nonce = nonceFor(seed, result.index, entry.nonce);

  entry.nonce = nonce;
  entry.paletteIndex = result.index;
  entry.distance = Number(result.distance.toFixed(6));

  const palette = paletteForIndex(result.index);
  console.log([
    seed,
    `nonce=${nonce}`,
    `palette=${result.index.toString(16).padStart(2, "0").toUpperCase()}`,
    `${palette.background.reduced}/${palette.layer0.reduced}/${palette.layer1.reduced}`,
    `distance=${entry.distance}`
  ].join(" "));
}

await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
