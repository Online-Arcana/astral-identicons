# Astral Identicons

Deterministic astrological SVG identicons built from one exact recoverable identity and six resolved chart signs.

The approved visual grammar is limited to the three-colour palette, Solar constellation, centre glyph grid, astrological ring, one fixed North Star and the recovery-star field. No extra radial lines, ticks or data marks are added around the sigils.

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

The file is not decrypted, rewritten or repackaged. Its 32 key bytes are retained unchanged and displayed in canonical 43-character unpadded base64url form.

## Visual grammar

- **Solar layer:** a large upright constellation and artistic sign interpretation establish the Solar sign.
- **Centre grid:** nine upright glyphs repeat the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli roles.
- **Astrological ring:** twelve rotated glyphs repeat those roles between two concentric circles.
- **Palette:** one of 64 reduced three-colour palettes is selected by a SHA-256 counter-mode PRNG from the exact seed material and its nonce.
- **North Star:** one invariant star appears at the top of every identicon with the same canonical position, size and opacity. It defines upright orientation and calibrates the apparent scale and relative brightness of the recovery stars.
- **Recovery stars:** 128 approved stars carry Reed–Solomon parity used to repair and disambiguate the primary palette, constellation, grid and ring record.

There is no separate glyph-data layer. The sigils remain visually clean.

## Visual-code version 8

The protected record contains 40 source bytes:

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

The 40-byte record is protected as a Reed–Solomon `RS(168,40)` codeword. The systematic 40-byte section is represented by the approved palette, Solar constellation and duplicated sign glyphs. Only the 128 parity symbols are rendered as recovery stars.

Each parity-star symbol is encoded by all three approved star properties:

- one of sixteen positions inside its polar slot;
- one of four clearly separated sizes: 8, 14, 20 or 26 canonical units;
- one of four visible opacity levels: 0.70, 0.80, 0.90 or 1.00.

The North Star is always fixed at the top, size 34 and opacity 1.00. The scanner measures every other star relative to that reference instead of assuming an absolute screen brightness, camera exposure or pixel scale.

Any 40 correctly calibrated parity stars are mathematically sufficient to reconstruct the protected 40-byte record. Additional stars provide error correction for missing, blurred or incorrectly classified symbols.

## Human camera capture

The browser scanner is self-contained TypeScript and Canvas code. It does not load OpenCV, WebAssembly or a CDN runtime.

The user is not expected to hold the camera steady for several seconds:

1. Bring the complete circle into the guide for one or two clear moments.
2. The fixed North Star establishes orientation, apparent size and relative brightness.
3. Position, size and opacity evidence are accumulated independently for every recovery star.
4. Every useful colour sample and approved glyph region is retained alongside the star evidence.
5. Blur, hand shake or moving briefly out of view does not erase captured progress.
6. Once enough consistent parity evidence reconstructs the record and the approved visual regions have cumulative coverage, the scanner freezes the reconstruction and stops the camera.
7. A progress bar continues Reed–Solomon repair, palette checking and glyph/constellation verification. The user can lower the device immediately.

A later shaky frame cannot reduce the saved evidence or veto an already reconstructed record. A saved photo uses the same recovery and verification path.

## Palette nonces

Every identity follows the same rule:

```text
palette index = SHA-256 counter-mode PRNG(seed material, nonce)
```

Configured targets remain inside that generic path. Public-key targets are keyed by their canonical base64url display string, while the PRNG still consumes the exact raw 32 key bytes.

Configured examples:

```text
6270f2-example
    #525 / #6EB / #69E

Kcgr43Hr1qJgeG7ICVVq4yAEzGvnGMkBrRdSQ0f4Z0I
    #133 / #DE6 / #6E7
```

Recalculate target nonces with:

```sh
bun run palette:tune
```

## Web builder

Each page load starts with:

- a newly generated canonical 32-byte public-key string;
- independently randomised Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli fields.

The **New seed** action also generates another canonical 32-byte public-key string.

```sh
bun run start
```

Open `http://127.0.0.1:4769`.

## CLI

From a packaged identity:

```sh
bun run identicon -- \
  --astral profile.astral \
  --out identicon.svg
```

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

## Checks

```sh
bun run check
bun test
bun run build:pages
```
