# Astral Identicons

Deterministic astrological SVG identicons built from one palette seed and six resolved chart signs.

Each identicon is both a repeatable visual mark and a structured visual record. The constellation and glyph arrangement identify the astrological components. The three-colour palette identifies the visual seed, while the star field exists only to correct palette ambiguity introduced by screens, cameras, exposure and white balance.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Inner interpretation:** the Solar sign selects the large upright constellation and artistic sign illustration. A fixed 3 × 3 grid places upright references for the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions. Imum Coeli is on the left and Descendant is on the right, matching the inner grid.
- **Palette seed:** one of 64 reduced three-colour palettes is the recoverable six-bit visual seed.
- **Error-correction stars:** 128 stars redundantly encode only the palette index. They do not encode a separate text or 256-bit seed.

The upright inner references disambiguate glyph identity after radial rotation. The asymmetric registration stars provide an initial angle, while the non-symmetrical upright constellation independently confirms orientation and identifies the Solar sign.

## Palette error correction

Camera colour is deliberately treated as a hint rather than an authority. A screen may shift hue, brightness and saturation enough to make two nearby palette entries appear ambiguous. The correction stars resolve that ambiguity.

Visual-code version 4 uses a repeated masked Hadamard code:

```text
observed three-colour palette
    → weak palette candidate only

128 binary radial star positions
    → four redundant 32-bit correction tracks

nearest valid correction pattern
    → authoritative palette seed
```

Each correction star has two possible radial positions separated by 24 SVG units. The 64 valid correction patterns have a minimum Hamming distance of 64 across the full field, so substantial blur, obstruction and individual star errors can be tolerated.

A colour reading that disagrees with the stars does not make decoding fail. The stars choose the palette, and the observed colours remain useful for isolating the constellation and glyph layers.

## Seed model

A canonical recoverable seed names one palette directly:

```text
palette-00
palette-01
...
palette-3F
```

The builder also accepts arbitrary non-empty text such as:

```text
6270f2-example
```

Arbitrary text is deterministically mapped to one of the 64 palette seeds. Camera recognition returns the canonical `palette-XX` seed because the palette and its correction stars are the information physically represented in the image. The original arbitrary source text is not encoded by the stars.

## Camera scanner

The public frontend includes an in-page camera scanner. It does not open a separate native camera application or download an external image-processing runtime.

1. Select **Scan identicon**.
2. Keep the complete outer circle inside the guide.
3. The scanner reads automatically once the circle is stable and the correction pattern is recognisable.
4. **Use photo** remains available for a saved image.

There is no manual **Read frame** step.

The scanner requests a high-resolution rear-camera stream when the browser supports it, then performs:

```text
paired outer-circle detection
    → scale and centre normalisation

foreground clustering + asymmetric anchors
    → layer order and initial angle

upright constellation templates
    → orientation confirmation and Solar sign

128 binary correction stars
    → authoritative palette seed

fixed inner sigils + rotated ring comparisons
    → six chart signs
```

Circle, palette, star and template recognition are implemented in local TypeScript and browser Canvas APIs. Camera and video startup are bounded, and a saved photo remains available when a browser denies or fails to start the camera.

The scanner keeps analysing live frames until it has a stable result. Intermediate colour disagreement is not shown as a terminal failure.

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
  --seed 6270f2-example \
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
- equipped with a recoverable palette seed and redundant visual error correction.

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
  camera.ts          bounded high-resolution camera startup
  code-layout.ts     binary correction-star and anchor geometry
  layout.ts          ring and inner-grid geometry
  palette.ts         64-entry visual palette codebook
  scan.ts            automatic camera and photo scanner orchestration
  scan-colour.ts     colour clustering and orientation recovery
  scan-cv.ts         local paired-ring detection and normalisation
  scan-seed.ts       palette error-correction decoding
  scan-sign.ts       constellation and glyph classification
  seed.ts            palette seed and Hadamard correction mapping
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
