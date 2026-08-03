# Astral Identicons

Deterministic astrological SVG identicons built from a seed and six chart signs.

Each identicon translates a compact astrological profile into a repeatable visual mark. The same inputs and source assets always produce the same standalone SVG.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

The composition has three layers:

- **Inner interpretation:** the Solar sign selects the large constellation and artistic sign illustration. A faint 3 × 3 sigil grid places the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli inside the inner circle.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions.
- **Seeded atmosphere:** the seed selects the reduced analogous palette and the deterministic star field contained within the inner circle.

Ring glyphs rotate towards the centre. The Solar illustration is clipped to the inner field, while the faded internal sigils remain subordinate to the constellation artwork.

## Scope

This project is a visual interpreter and SVG compositor. It expects already resolved signs for:

- Sun
- Moon
- Ascendant
- Midheaven
- Descendant
- Imum Coeli

It does not calculate a natal chart or generate the source zodiac artwork.

## Web builder

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run start
```

Open `http://127.0.0.1:3000`.

For development with automatic reload:

```sh
bun run dev
```

For LAN access:

```sh
HOST=0.0.0.0 PORT=3000 bun run start
```

The browser preview and downloaded file both use the same `buildIdenticon()` renderer, so the preview is the exported SVG rather than a separate approximation.

## CLI

```sh
bun run identicon -- \
  --seed 6270f2-example-seed \
  --solar capricorn \
  --lunar virgo \
  --ascendant capricorn \
  --midheaven libra \
  --descendant cancer \
  --imum-coeli aries \
  --out identicon.svg
```

Without `--out`, the generated SVG is written to standard output.

JSON input is also supported:

```json
{
  "seed": "6270f2-example-seed",
  "solar": "capricorn",
  "lunar": "virgo",
  "ascendant": "capricorn",
  "midheaven": "libra",
  "descendant": "cancer",
  "imumCoeli": "aries"
}
```

```sh
bun run identicon -- --json input.example.json --out identicon.svg
```

A different asset root can be supplied with `--assets`.

## Output

Every generated identicon is:

- a standalone 1024 × 1024 SVG;
- deterministic for the same inputs and assets;
- composed entirely from vector elements;
- restricted to three reduced `#RGB` colours;
- free of raster images and external asset references;
- labelled with accessible SVG metadata.

The seed controls the visual palette and decorative star field. The six signs control the semantic composition.

## Palette

The seed selects three analogous hues at `H − 60°`, `H`, and `H + 60°`.

The darkest source hue is transformed into a very dark background. The lightest remaining colour becomes foreground 0 for the constellation and stars, while the final colour becomes foreground 1 for the sigils and ring. All three are quantised to reduced `#RGB` values.

## Project structure

```text
assets/
  constellations/   constellation and artistic sign SVGs
  decor/            decorative vector assets
  sigils/           zodiac glyph SVGs
examples/            generated example output
public/              responsive web interface
src/
  build.ts           shared SVG renderer
  layout.ts          ring and inner-grid geometry
  palette.ts         deterministic colour selection
  cli.ts             command-line interface
  server.ts          Bun web server
  web.ts             browser controls and preview
  xml.ts             SVG parsing and rewriting
tests/                deterministic core tests
```

## Checks

```sh
bun run check
bun test
```
