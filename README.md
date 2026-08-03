# Astral Identicons

Deterministic astrological SVG identicons built from one visual seed and six resolved chart signs.

Each identicon is both a repeatable visual mark and a structured visual record. The constellation and glyph arrangement identify the astrological components. The palette and coded star field preserve the complete visual seed for a later image interpreter.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Inner interpretation:** the Solar sign selects the large constellation and artistic sign illustration. A faint 3 × 3 sigil grid places the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli inside the inner circle.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions.
- **Visual seed:** the three-colour palette redundantly identifies six seed bits. The star field stores a 48-byte Reed-Solomon codeword containing the 32-byte seed and 16 parity bytes.

Three fixed registration stars provide orientation. The remaining 96 stars are arranged in known cells. Each star's offset within its cell represents one hexadecimal nibble, so two stars represent one codeword byte.

## Seed model

The recoverable visual seed is a 256-bit value written as 64 hexadecimal digits:

```text
0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF
```

A 64-digit hexadecimal input is preserved exactly. Other non-empty strings remain accepted and are deterministically reduced to a 256-bit visual seed. The web builder generates canonical 256-bit seeds by default.

A recogniser can therefore recover the canonical visual seed, not arbitrary source text that was reduced into one.

```text
recognised palette
    → 6-bit seed check

96 sampled star offsets
    → 48 Reed-Solomon bytes

Reed-Solomon recovery and palette verification
    → complete 256-bit visual seed
```

The current decoder can recover up to 16 known erased bytes, such as cells the image recogniser marks as obscured or uncertain. A later camera interpreter can add unknown-error correction and image classification without changing the SVG format.

The six chart signs are read independently from the constellation and glyph arrangement.

## Scope

This project is a visual interpreter and SVG compositor. It expects already resolved signs for:

- Sun
- Moon
- Ascendant
- Midheaven
- Descendant
- Imum Coeli

It does not calculate a natal chart, generate the source zodiac artwork, or currently perform camera recognition.

## Web builder

Requires [Bun](https://bun.sh/) for local development.

```sh
bun run start
```

Open `http://127.0.0.1:4769`.

For automatic reload:

```sh
bun run dev
```

For LAN access:

```sh
HOST=0.0.0.0 PORT=4769 bun run start
```

The browser preview and downloaded file use the same `buildIdenticon()` renderer.

## GitHub Pages

The public generator is deployed as a static site. Visitors do not need Bun or a server-side API.

1. Make the repository public.
2. Open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Run the **GitHub Pages** workflow or push to `main`.

```text
https://kitty-crow.github.io/astral-identicons/
```

Build the same static artifact locally with:

```sh
bun run build:pages
```

## CLI

```sh
bun run identicon -- \
  --seed 0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF \
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
- labelled with accessible and machine-readable SVG metadata;
- equipped with a recoverable 256-bit visual seed.

## Project structure

```text
.github/workflows/  GitHub Pages deployment
assets/
  constellations/   constellation and artistic sign SVGs
  decor/            star vector
  sigils/           zodiac glyph SVGs
examples/            generated example output
public/              responsive web interface
scripts/             static-site build tools
src/
  build.ts           shared SVG renderer
  layout.ts          ring and inner-grid geometry
  palette.ts         64-entry visual palette codebook
  rs.ts              Reed-Solomon encoding and erasure recovery
  seed.ts            visual seed and star-symbol mapping
  cli.ts             command-line interface
  server.ts          Bun web server
  web.ts             browser controls and preview
  xml.ts             SVG parsing and rewriting
tests/                deterministic and recovery tests
```

## Checks

```sh
bun run check
bun test
```
