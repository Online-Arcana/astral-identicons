# Astral Identicons

Deterministic astrological SVG identicons built from one exact visual seed and six resolved chart signs.

Each identicon is both a repeatable visual mark and a structured visual record. The palette, constellation, inner grid, astrological ring and coded stars are independent observations of the same source fields, allowing the browser scanner to reconstruct the values required to generate the image again.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Inner interpretation:** the Solar sign selects the large upright constellation and artistic sign illustration. A fixed 3 × 3 grid places upright references for the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions. Imum Coeli is on the left and Descendant is on the right, matching the inner grid.
- **Palette:** one of 64 reduced three-colour palettes is derived from the exact seed and acts as an additional camera check rather than replacing the seed.
- **Protected star payload:** 128 stars encode the exact seed and all six signs in a Reed-Solomon-protected visual codeword.

The upright constellation and asymmetric registration stars establish orientation. The inner grid and ring independently identify the signs. The coded stars carry the authoritative recoverable payload and resolve fields whose visual glyph readings are uncertain.

## Exact payload and error correction

Visual-code version 5 stores a 64-byte codeword:

```text
40 data bytes
    exact UTF-8 seed, up to 32 bytes
    Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli
    format header and checksum

24 Reed-Solomon parity bytes
    recovery of up to 24 erased or deliberately discarded bytes
```

Each of the 128 stars represents one hexadecimal nibble by occupying one of sixteen positions in its polar cell. Two stars form one codeword byte. Weak or conflicting camera observations are progressively treated as erasures until the Reed-Solomon codeword, payload checksum, UTF-8 seed, signs and palette relationship validate together.

The seed is not reduced to a palette number and is not replaced by a hash. For example, an identicon generated with:

```text
62-70-F2-Example
```

is scanned back as exactly:

```text
62-70-F2-Example
```

Seeds longer than 32 UTF-8 bytes are rejected because they cannot be represented exactly within this visual code version.

## Camera scanner

The public frontend includes an in-page camera scanner. It runs locally and does not upload the image or download an external image-processing runtime.

1. Select **Scan identicon**.
2. Keep the complete outer circle inside the guide.
3. The scanner reads automatically once the circle and protected payload are stable.
4. **Use photo** remains available for a saved image.

There is no manual **Read frame** step. After a successful read, the scanner closes automatically and applies the exact recovered seed and six signs to the builder. It can be opened again for another scan.

The recognition pipeline uses all visual evidence together:

```text
paired outer-circle detection
    → scale and centre normalisation

observed palette + asymmetric anchors
    → layer order and candidate orientation

upright constellation
    → Solar sign and orientation evidence

128 coded stars + Reed-Solomon recovery
    → exact seed and authoritative six-sign payload

inner grid + rotated ring glyphs
    → independent sign confirmation
```

A shifted camera palette or a low-confidence glyph does not become the final field value. The protected payload resolves it, while the palette and duplicated glyphs help reject incorrect orientation and layer interpretations.

## Scope

This project is a visual interpreter, SVG compositor and browser-side identicon reader. It expects already resolved signs for Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli. It does not calculate a natal chart or generate the source zodiac artwork.

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

Build the same static artefact locally with:

```sh
bun run build:pages
```

## CLI

```sh
bun run identicon -- \
  --seed 62-70-F2-Example \
  --solar capricorn \
  --lunar virgo \
  --ascendant capricorn \
  --midheaven libra \
  --descendant cancer \
  --imum-coeli aries \
  --out identicon.svg
```

Without `--out`, the generated SVG is written to standard output. JSON input is also supported with `--json`, and a different asset root can be supplied with `--assets`.

## Output

Every generated identicon is:

- a standalone 1024 × 1024 SVG;
- deterministic for the same inputs and assets;
- composed entirely from vector elements;
- restricted to three reduced `#RGB` colours;
- free of raster images and external asset references;
- labelled with accessible and machine-readable SVG metadata;
- equipped with an exactly recoverable seed and six-sign protected payload.

## Project structure

```text
.github/workflows/  GitHub Pages deployment
assets/              constellation, star and zodiac SVG assets
examples/            generated example output
public/              responsive web interface
scripts/             static-site build tools
src/
  build.ts           shared SVG renderer
  camera.ts          bounded high-resolution camera startup
  code-layout.ts     coded-star and registration geometry
  layout.ts          ring and inner-grid geometry
  palette.ts         64-entry visual palette codebook
  rs.ts              Reed-Solomon encoding and erasure recovery
  scan.ts            automatic camera and photo scanner orchestration
  scan-colour.ts     colour clustering and orientation recovery
  scan-cv.ts         local paired-ring detection and normalisation
  scan-seed.ts       complete protected-payload decoding
  scan-sign.ts       constellation and glyph classification
  seed.ts            exact seed, sign payload and star-symbol mapping
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
