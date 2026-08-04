# Astral Identicons

Deterministic astrological SVG identicons built from one exact recoverable seed and six resolved chart signs.

Each identicon is both a visual mark and a recoverable record. Its palette, Solar constellation, centre grid, astrological ring, glyph data marks and parity stars form independent but cooperating recognition channels.

<p align="center">
  <img src="./examples/capricorn.svg" alt="Example Capricorn astral identicon" width="420">
</p>

## Packaged astral input

The browser builder and CLI can open an `ASTRPKG4` `.astral` file without its password. They read only the public header:

```text
offset 60–91   exact raw 32-byte Ed25519 public key
offset 92–end  Solar, Lunar, Ascendant, Midheaven,
               Descendant and Imum Coeli signs
```

The file is not decrypted, rewritten or repackaged. Its 32 key bytes are copied unchanged into the visual payload and used directly by the palette PRNG. They are never hashed, shortened or substituted with another seed.

The key is displayed using its unique canonical 43-character unpadded base64url representation. That text is only a view of the retained source bytes. Preview generation, SVG export and scanner recovery continue to use the exact 32 bytes.

The public header is covered by the container's AES-GCM authentication, but the identicon tool cannot verify that tag without the password. It validates the header structure and represents the public bytes exactly. Opening the container with Astral Packager later verifies the header against the encrypted identity.

Older `ASTRPKG1–3` files are not accepted for direct identicon ingestion because they do not expose the version-4 raw-key contract. Repackage the original raw chart with Astral Packager 0.6.0 or later.

## Visual grammar

- **Solar layer:** a large upright constellation and artistic sign interpretation establish the Solar sign and orientation.
- **Centre grid:** nine upright glyphs repeat the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli roles.
- **Astrological ring:** twelve rotated glyphs repeat those roles between two concentric circles.
- **Palette:** one of 64 reduced three-colour palettes is selected by a SHA-256 counter-mode PRNG from the exact seed material and its nonce.
- **Glyph data:** twenty centre and ring glyph carriers hold the complete 40-byte systematic payload, two bytes per carrier.
- **Parity stars:** 128 stars contain expanded Reed–Solomon parity used only to repair or disambiguate incomplete glyph reads.

The stars are not the primary payload. The glyph carriers contain the data. The star field supplies redundant correction evidence.

## Visual-code version 6

The systematic section remains exactly 40 bytes:

```text
byte 0       magic A5
byte 1       payload form
byte 2       seed length
bytes 3–34   exact seed material
bytes 35–37  six packed signs
bytes 38–39  CRC-16
```

Payload forms:

```text
1  exact UTF-8 text seed, 1–32 bytes
2  exact raw Ed25519 public key, always 32 bytes
```

The public-key payload therefore fits without adding carriers or reducing error correction. The same twenty glyph carriers still hold two bytes each.

The systematic payload receives 24 Reed–Solomon parity bytes, allowing repair of up to 24 missing or deliberately discarded glyph bytes. Those parity bytes are expanded into a 128-byte Reed–Solomon star codeword.

Each star byte is represented by:

- one of sixteen positions inside its polar slot;
- one of four star sizes;
- one of four opacity levels.

Only twenty-four correct star bytes are mathematically required to reconstruct the complete parity section. Fifty percent plus one of the 128 stars remains comfortably above the recovery threshold.

Ordinary text seeds are still recovered exactly. Public-key payloads recover the same 32 source bytes and present their canonical base64url text.

## Human camera capture

The public frontend includes a self-contained browser scanner. Camera frames and reconstructed data remain in the browser. GitHub Pages does not download or initialise OpenCV, WebAssembly or another external vision runtime.

The user is not expected to hold the camera steady for several seconds.

1. Open **Scan identicon**.
2. Bring the complete circle into the guide for one or two clear moments.
3. The scanner saves every useful glyph byte, parity star, colour sample and clear visual region.
4. Blur, hand shake or temporarily moving the identicon out of view does not erase progress.
5. Evidence remains available for the whole scanner session, even after long gaps.
6. As soon as the payload is recoverable and all six sign roles have cumulative coverage, the scanner snaps the reconstruction and stops the camera.
7. A progress bar then shows payload reconstruction, parity repair, palette checking and sign verification. The user no longer needs to keep the camera raised while processing runs.

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
    → redundant Reed–Solomon correction observations

persistent evidence votes + best-region mosaic
    → progress survives shake and out-of-frame gaps

recoverable payload + cumulative six-role coverage
    → freeze reconstruction and stop camera

offline progress phase
    → parity repair, palette agreement, constellation and role verification
```

A saved photo can be processed through the same reconstruction and verification path.

## Palette nonces and target colours

Every seed has a deterministic 256-bit nonce. Palette selection follows:

```text
palette index = SHA-256 counter-mode PRNG(seed material, nonce)
```

Text seeds preserve the existing configured target-nonce behaviour. Public-key identicons use the exact 32 raw bytes as seed material and receive a deterministic nonce from those bytes. Their 43-character display text is not used by the PRNG.

The configured example makes `6270f2-example` resolve to:

```text
background  #525
layer 0     #6EB
layer 1     #69E
```

Recalculate configured text-seed targets with:

```sh
bun run palette:tune
```

## Web builder

Requires Bun for local development.

```sh
bun run start
```

Open `http://127.0.0.1:4769`.

Choose **Packaged astral file** to fill the exact public key and all six signs automatically. Manual text seeds and signs remain supported.

For automatic reload:

```sh
bun run dev
```

For LAN access:

```sh
HOST=0.0.0.0 PORT=4769 bun run start
```

The browser preview and downloaded file use the same `buildIdenticon()` renderer. File parsing, rendering and scanning stay local.

## GitHub Pages

The generator and scanner deploy as a static site. Visitors do not need Bun, a server API or a runtime image-processing download.

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main` or run the workflow manually.

```text
https://kitty-crow.github.io/astral-identicons/
```

Build the same static artefact locally with:

```sh
bun run build:pages
```

Application assets use content-addressed filenames so a previous mobile bundle cannot silently remain active after deployment.

## CLI

Generate directly from a packaged identity:

```sh
bun run identicon -- \
  --astral profile.astral \
  --out identicon.svg
```

Seed and sign overrides are rejected with `--astral`, so the output represents the file header unchanged.

Manual input remains available:

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
- deterministic for the same exact input bytes, signs and assets;
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
