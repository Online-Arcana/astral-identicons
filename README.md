# Astral Identicons

Deterministic astrological SVG identicons built from one exact recoverable identity and six resolved chart signs.

The approved visual grammar is limited to the three-colour palette, Solar constellation, centre glyph grid, astrological ring, registration stars and recovery stars. No extra radial lines, ticks or data marks are added around the sigils.

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

- **Solar layer:** a large upright constellation and artistic sign interpretation establish the Solar sign and orientation.
- **Centre grid:** nine upright glyphs repeat the Sun, Moon, Ascendant, Midheaven, Descendant and Imum Coeli roles.
- **Astrological ring:** twelve rotated glyphs repeat those roles between two concentric circles.
- **Palette:** one of 64 reduced three-colour palettes is selected by a SHA-256 counter-mode PRNG from the exact seed material and its nonce.
- **Recovery stars:** the existing 128 stars form a Reed–Solomon recovery record for the exact 40-byte identity and sign payload.

There is no separate glyph-data layer. The sigils remain visually clean.

## Visual-code version 7

The recoverable record contains 40 source bytes:

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

Those 40 bytes are encoded as a systematic Reed–Solomon `RS(128,40)` star record. The remaining 88 star symbols are redundancy. Any 40 reliable stars are sufficient to reconstruct the complete record; up to 88 missing star symbols can therefore be treated as erasures.

Each star byte is represented by the existing star's:

- one of sixteen positions inside its polar slot;
- one of four sizes;
- one of four opacity levels.

The palette, Solar constellation, centre grid and ring then independently verify the recovered signs and orientation.

## Human camera capture

The browser scanner is self-contained TypeScript and Canvas code. It does not load OpenCV, WebAssembly or a CDN runtime.

The user is not expected to hold the camera steady for several seconds:

1. Bring the complete circle into the guide for one or two clear moments.
2. Every useful star, colour sample and approved glyph region is accumulated.
3. Blur, hand shake or moving briefly out of view does not erase progress.
4. Once at least 40 consistent stars reconstruct the record, both the centre grid and ring have useful coverage, and at least four independent sign roles agree with the Solar constellation and palette, the scanner freezes the reconstruction and stops the camera.
5. A progress bar continues Reed–Solomon reconstruction, palette checking and glyph/constellation verification. The user can lower the device immediately.

A saved photo uses the same recovery and verification path.

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
