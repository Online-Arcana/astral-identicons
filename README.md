# Astral Identicons

Deterministic astrological SVG identicons built from one exact visual seed and six resolved chart signs.

Each identicon is both a repeatable visual mark and a structured visual record. The palette, constellation, inner grid, astrological ring and coded stars are independent observations of the same source fields, allowing the browser scanner to reconstruct the values required to generate the image again.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Inner interpretation:** the Solar sign selects the large upright constellation and artistic sign illustration. A fixed 3 × 3 grid places upright references for the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli.
- **Astrological ring:** twelve equally spaced glyphs sit between two concentric circles. Solar glyphs occupy the cardinal points, Lunar glyphs occupy the alternating points, and the four chart angles fill the remaining positions. Imum Coeli is on the left and Descendant is on the right, matching the inner grid.
- **Palette:** one of 64 reduced three-colour palettes is drawn by a deterministic SHA-256 counter-mode PRNG from the exact seed and its nonce. It acts as an additional camera check rather than replacing the seed.
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

## Palette nonces and target colours

Every seed has a deterministic 256-bit nonce. Palette selection always follows the same rule:

```text
palette index = SHA-256 counter-mode PRNG(seed, nonce)
```

Ordinary seeds receive a nonce derived cryptographically from the seed. Selected seeds may instead use a tuned nonce from `config/palette-targets.json`. This is not a seed-to-colour exception and it does not bypass the PRNG. The tuner searches the normal nonce space until the PRNG reaches the exact requested palette, or the closest palette available in the 64-entry codebook under a CIE Lab colour-distance calculation.

The configured example makes `6270f2-example` resolve through the normal PRNG path to:

```text
background  #525
layer 0     #6EB
layer 1     #69E
```

After adding or changing a target in the JSON file, calculate its nonce with:

```sh
bun run palette:tune
```

## Camera scanner

The public frontend includes an in-page camera scanner. Camera frames and reconstructed image data stay in the browser and are not uploaded. The browser fetches OpenCV.js to perform the local quality and edge analysis.

1. Select **Scan identicon**.
2. Keep the complete outer circle inside the guide.
3. Allow the camera briefly to settle focus, exposure and white balance.
4. The scanner collects useful evidence from a rolling 2–5 second series of frames.
5. It freezes only after the protected payload and every expected visual region are recoverable.
6. **Use photo** remains available for a saved image.

The user does not need to hold one perfect frame continuously. Clear stars, centre glyphs and ring glyphs observed at different moments are accumulated into one reconstruction. After a successful read, the scanner closes automatically and applies the exact recovered seed and six signs to the builder. It can be opened again for another scan.

The recognition pipeline uses all visual evidence together:

```text
camera autofocus, exposure and white-balance settling
    → short initial delay before evidence collection

paired outer-circle detection
    → scale and centre normalisation

OpenCV Canny edges + Laplacian sharpness
    → blur, contrast, exposure and regional-presence gates

observed palette + asymmetric anchors
    → layer order and candidate orientation

rolling 2–5 second evidence window
    → cumulative protected-star votes and best-region mosaic

128 coded stars + Reed-Solomon recovery
    → exact seed and authoritative six-sign payload

expected constellation + 9 centre glyphs + 12 ring glyphs
    → independent final reconstruction verification
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
.github/workflows/       GitHub Pages deployment
assets/                  constellation, star and zodiac SVG assets
config/                  palette target and tuned nonce configuration
examples/                generated example output
public/                  responsive web interface
scripts/
  build-pages.ts         static-site build
  tune-palette.ts        exact or nearest palette nonce search
src/
  build.ts               shared SVG renderer
  camera.ts              bounded high-resolution camera startup
  code-layout.ts         coded-star and registration geometry
  layout.ts              ring and inner-grid geometry
  opencv.ts              local Canny, blur, exposure and region analysis
  palette.ts             64-entry visual palette codebook
  palette-nonce.ts       nonce selection for every seed
  prng.ts                SHA-256 counter-mode deterministic PRNG
  rs.ts                  Reed-Solomon encoding and erasure recovery
  scan.ts                cumulative camera and photo scanner orchestration
  scan-colour.ts         colour clustering and orientation recovery
  scan-cv.ts             local paired-ring detection and normalisation
  scan-seed.ts           complete protected-payload decoding
  scan-series.ts         rolling multi-frame evidence fusion
  scan-sign.ts           general constellation and glyph classification
  scan-verify.ts         fast expected-element verification
  seed.ts                exact seed, sign payload and star-symbol mapping
  sha256.ts              synchronous SHA-256 implementation
  cli.ts                 command-line interface
  server.ts              Bun web server
  web.ts                 browser controls and preview
  xml.ts                 SVG parsing and rewriting
tests/                   deterministic and recovery tests
```

## Checks

```sh
bun run check
bun test
bun run build:pages
```
