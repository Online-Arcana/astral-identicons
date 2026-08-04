# Astral Identicons

Deterministic astrological SVG identicons built from one exact UTF-8 seed and six resolved chart signs.

Each identicon is both a visual mark and a recoverable record. Its palette, Solar constellation, centre grid, astrological ring, glyph data marks and parity stars form independent but cooperating recognition channels.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Visual grammar

- **Solar layer:** a large upright constellation and artistic sign interpretation establish the Solar sign and orientation.
- **Centre grid:** nine upright glyphs repeat the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli roles.
- **Astrological ring:** twelve rotated glyphs repeat those roles between two concentric circles.
- **Palette:** one of 64 reduced three-colour palettes is selected by a SHA-256 counter-mode PRNG from the exact seed and its nonce.
- **Glyph data:** twenty centre and ring glyph carriers hold the complete 40-byte systematic payload, two bytes per carrier.
- **Parity stars:** 128 stars contain expanded Reed-Solomon parity used only to repair or disambiguate incomplete glyph reads.

The stars are not the primary payload. The glyph carriers contain the data. The star field supplies redundant correction evidence.

## Visual-code version 6

The recoverable payload contains:

```text
40 systematic data bytes
    exact UTF-8 seed, up to 32 bytes
    Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli
    format header and CRC

24 Reed-Solomon parity bytes
    repair of up to 24 missing or deliberately discarded glyph bytes
```

The forty data bytes are distributed across twenty glyph carriers. Each carrier has eight small radial marks. Every mark uses one of four clearly separated positions, encoding two bits. Eight marks therefore store two bytes while the glyph itself still visually identifies its astrological sign and role.

The twenty-four payload parity bytes are expanded into a 128-byte Reed-Solomon star codeword. Each star byte is represented by:

- one of sixteen positions inside its polar slot;
- one of four star sizes;
- one of four opacity levels.

Only twenty-four correct star bytes are mathematically required to reconstruct the complete parity section. Fifty percent plus one of the 128 stars is therefore comfortably above the recovery threshold. The recovered star parity can then repair as many as twenty-four missing glyph data bytes.

The seed is never replaced by a hash or palette number. For example:

```text
62-70-F2-Example
```

is recovered exactly as:

```text
62-70-F2-Example
```

Seeds longer than 32 UTF-8 bytes are rejected because visual-code version 6 cannot represent them exactly.

## Human camera capture

The public frontend includes a fully self-contained browser scanner. Camera frames and reconstructed data remain in the browser. GitHub Pages does not download or initialise OpenCV, WebAssembly or another external vision runtime.

The user is not expected to hold the camera steady for several seconds.

1. Open **Scan identicon**.
2. Bring the complete circle into the guide for one or two clear moments.
3. The scanner saves every useful glyph byte, parity star, colour sample and clear visual region.
4. Blur, hand shake or temporarily moving the identicon out of view does not erase progress.
5. Evidence remains available for the whole scanner session, even after long gaps.
6. As soon as the payload is recoverable and all six sign roles have cumulative coverage, the scanner snaps the reconstruction and stops the camera.
7. A progress bar then shows payload reconstruction, parity repair, palette checking and sign verification. The user no longer needs to keep the camera raised while this processing runs.

The scanner accepts useful moments rather than demanding one perfect frame. Its cumulative mosaic preserves the clearest observed version of each centre and ring region.

```text
camera focus, exposure and white-balance settling
    → brief initial preparation

paired outer-circle detection
    → scale and centre normalisation

local TypeScript Gaussian smoothing, Canny-style edges,
Laplacian sharpness, contrast and clipping analysis
    → reject only unusable moments

palette + asymmetric anchors
    → layer order and orientation

glyph data marks
    → primary 40-byte payload observations

parity-star position + size + opacity
    → redundant Reed-Solomon correction observations

persistent evidence votes + best-region mosaic
    → progress survives shake and out-of-frame gaps

recoverable payload + cumulative six-role coverage
    → freeze reconstruction and stop camera

offline progress phase
    → parity repair, palette agreement, constellation and role verification
```

A saved photo can be processed through the same reconstruction and verification path.

## Palette nonces and target colours

Every seed has a deterministic 256-bit nonce. Palette selection always follows the same generic rule:

```text
palette index = SHA-256 counter-mode PRNG(seed, nonce)
```

Ordinary seeds receive a cryptographically derived nonce. Selected seeds may use a tuned nonce from `config/palette-targets.json`. The tuner still uses the normal PRNG path. It searches for the exact requested palette, or the nearest available palette under CIE Lab distance.

The configured example makes `6270f2-example` resolve to:

```text
background  #525
layer 0     #6EB
layer 1     #69E
```

Recalculate configured targets with:

```sh
bun run palette:tune
```

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

The generator and scanner deploy as a static site. Visitors do not need Bun, a server API or a runtime image-processing download.

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

Application assets use content-addressed filenames so a previous mobile bundle cannot silently remain active after deployment.

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

Without `--out`, the SVG is written to standard output. JSON input is supported with `--json`, and a different asset root can be supplied with `--assets`.

## Output

Every generated identicon is:

- a standalone 1024 × 1024 SVG;
- deterministic for the same inputs and assets;
- composed entirely from vector elements;
- restricted to three reduced `#RGB` colours;
- free of raster images and external asset references;
- labelled with accessible and machine-readable SVG metadata;
- equipped with an exactly recoverable seed and six-sign payload;
- protected by glyph-distributed data and parity-only stars.

## Checks

```sh
bun run check
bun test
bun run build:pages
```
