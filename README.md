# Astral Identicons

Deterministic astrological SVG identicons built from one visual seed and six resolved chart signs.

Each identicon is both a repeatable visual mark and a structured visual record. The constellation and glyph arrangement identify the astrological components. The palette and coded star field preserve the complete visual seed for camera recovery.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Inner interpretation:** the Solar sign selects the large upright constellation and artistic sign illustration. A fixed 3 × 3 grid places upright references for the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions.
- **Visual seed:** the three-colour palette redundantly identifies six seed bits. The star field stores a 48-byte Reed-Solomon codeword containing the 32-byte seed and 16 parity bytes.

The upright inner references disambiguate ring glyphs after their radial rotation. The asymmetric registration stars use the constellation colour to establish an initial angle, while the non-symmetrical upright constellation independently confirms orientation and identifies the Solar sign.

The remaining 96 stars are arranged in known cells. Each star's offset within its cell represents one hexadecimal nibble, so two stars represent one codeword byte. Visual-code version 2 renders these code stars as small, fixed-size, high-contrast markers in the second foreground colour above the interpretation artwork. That keeps neighbouring nibble positions distinct and prevents the constellation from obscuring the code.

## Seed model

The recoverable visual seed is a 256-bit value written as 64 hexadecimal digits:

```text
0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF
```

A 64-digit hexadecimal input is preserved exactly. Other non-empty strings remain accepted and are deterministically reduced to a 256-bit visual seed. The web builder generates canonical 256-bit seeds by default.

A recogniser recovers the canonical visual seed, not arbitrary source text that was reduced into one.

```text
recognised palette
    → 6-bit seed check

96 sampled star offsets
    → 48 Reed-Solomon bytes

Reed-Solomon recovery and palette verification
    → complete 256-bit visual seed
```

The decoder can reconstruct up to 16 known erased bytes, such as cells marked uncertain or obscured by the image processor.

## Camera scanner

The public frontend includes an in-page camera scanner. It does not open a separate native camera application or download an external image-processing runtime.

1. Select **Scan identicon**.
2. Keep the complete outer circle inside the guide, or select **Use photo**.
3. Hold the image flat and evenly lit.
4. Select **Read frame** when using the live camera.

The scanner then:

```text
paired outer-circle detection
    → scale and centre normalisation

palette clustering + registration stars
    → palette index and initial angle

upright constellation templates
    → orientation confirmation and Solar sign

fixed inner sigils + unrotated ring comparisons
    → six chart signs

96 high-contrast star samples + Reed-Solomon recovery
    → canonical visual seed
```

Circle, palette, star and template recognition are implemented in local TypeScript and browser Canvas APIs. Camera and video startup are bounded, and a saved photo remains available when a browser denies or fails to start the camera.

The scanner is designed for clear, mostly front-on captures. Strong perspective distortion, glare, very small marks or heavily obscured stars may require another frame.

## Scope

This project is a visual interpreter, SVG compositor and browser-side identicon reader. It expects already resolved signs for:

- Sun
- Moon
- Ascendant
- Midheaven
- Descendant
- Imum Coeli

It does not calculate a natal chart or generate the source zodiac artwork.

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

The public generator and scanner are deployed as a static site. Visitors do not need Bun or a server-side API.

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Run the **GitHub Pages** workflow or push to `main`.

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
  camera.ts          bounded camera and video startup
  code-layout.ts     shared star and registration geometry
  layout.ts          ring and inner-grid geometry
  palette.ts         64-entry visual palette codebook
  rs.ts              Reed-Solomon encoding and erasure recovery
  scan.ts            camera and photo scanner orchestration
  scan-colour.ts     palette and orientation recovery
  scan-cv.ts         local paired-ring detection and normalisation
  scan-seed.ts       high-contrast star decoding
  scan-sign.ts       constellation and glyph classification
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
