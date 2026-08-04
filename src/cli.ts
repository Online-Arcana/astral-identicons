import { readFile } from "node:fs/promises";
import { astralInput } from "./astral.ts";
import { fileAssets } from "./assets.ts";
import { buildIdenticon } from "./build.ts";
import { input } from "./input.ts";
import type { IdenticonInput, RawIdenticonInput } from "./types.ts";

interface Arguments {
  values: Record<string, string>;
  flags: Set<string>;
}

const help = `Astrological identicon builder

Usage:
  bun run src/cli.ts --astral profile.astral \\
    [--out identicon.svg] [--assets ./assets]

Manual input:
  bun run src/cli.ts \\
    --seed <value> \\
    --solar <sign> --lunar <sign> \\
    --ascendant <sign> --midheaven <sign> \\
    --descendant <sign> --imum-coeli <sign> \\
    [--out identicon.svg] [--assets ./assets]

Alternative:
  bun run src/cli.ts --json input.json [--out identicon.svg]

Without --out, the SVG is written to stdout.
`;

function argumentsOf(values: string[]): Arguments {
  const parsed: Arguments = { values: {}, flags: new Set() };

  for (let index = 0; index < values.length; index += 1) {
    const token = values[index]!;
    if (token === "--") continue;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);

    const key = token.slice(2);
    if (key === "help" || key === "h") {
      parsed.flags.add("help");
      continue;
    }

    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    parsed.values[key] = value;
    index += 1;
  }

  return parsed;
}

async function fromAstral(args: Arguments): Promise<IdenticonInput | null> {
  const path = args.values.astral;
  if (!path) return null;

  const forbidden = [
    "json",
    "seed",
    "solar",
    "lunar",
    "ascendant",
    "midheaven",
    "descendant",
    "imum-coeli",
    "imumCoeli"
  ];
  const conflict = forbidden.find((name) => args.values[name] !== undefined);
  if (conflict) {
    throw new Error(`--${conflict} cannot override an --astral identity header`);
  }

  return astralInput(new Uint8Array(await readFile(path)));
}

async function raw(args: Arguments): Promise<RawIdenticonInput> {
  let fileInput: Partial<RawIdenticonInput> = {};

  if (args.values.json) {
    const parsed = await Bun.file(args.values.json).json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON input must be an object");
    }
    fileInput = parsed as Partial<RawIdenticonInput>;
  }

  return {
    seed: args.values.seed ?? fileInput.seed,
    solar: args.values.solar ?? fileInput.solar,
    lunar: args.values.lunar ?? fileInput.lunar,
    ascendant: args.values.ascendant ?? fileInput.ascendant,
    midheaven: args.values.midheaven ?? fileInput.midheaven,
    descendant: args.values.descendant ?? fileInput.descendant,
    imumCoeli: args.values["imum-coeli"] ?? args.values.imumCoeli ?? fileInput.imumCoeli
  };
}

async function main(): Promise<void> {
  const args = argumentsOf(Bun.argv.slice(2));
  if (args.flags.has("help")) {
    console.log(help);
    return;
  }

  const value = await fromAstral(args) ?? input(await raw(args));
  const assetsRoot = args.values.assets ?? `${import.meta.dir}/../assets`;
  const svg = await buildIdenticon(value, fileAssets(assetsRoot));
  const output = args.values.out;

  if (output) {
    await Bun.write(output, svg);
    console.error(`Saved ${output}`);
    return;
  }

  console.log(svg);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
