# Astrological identicon

Bun TypeScript CLI and responsive web builder for deterministic astrological SVG identicons.

It composes the supplied zodiac constellation/illustration and sigil assets. It does not generate artwork.

## Palette

The seed selects three analogous hues at `H − 60°`, `H`, and `H + 60°`.

1. All three begin as clear colours at 85% saturation and 67% lightness.
2. The colour with the lowest relative luminance is selected as the background source.
3. Its hue is nudged to the nearest 15° family, then its saturation and lightness are reduced. It is darkened further when required to keep the background luminance below 0.085.
4. The lightest remaining colour becomes foreground 0.
5. The other remaining colour becomes foreground 1.
6. Every colour is rounded to its nearest reduced `#RGB` value.

This is analogous colour selection rather than the earlier ternary palette.

## Run the web builder

```sh
bun run start
```

Open `http://127.0.0.1:3000`.

The live preview combines the source SVGs in the browser and recolours them with CSS variables. **Save standalone SVG** sends the inputs to the shared TypeScript builder and downloads one final SVG with all vector elements and colours embedded. The saved file has no CSS colour dependency.

For LAN access:

```sh
HOST=0.0.0.0 PORT=3000 bun run start
```

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

Or use a JSON input:

```sh
bun run identicon -- --json input.json --out identicon.svg
```

Without `--out`, the CLI writes the SVG to stdout.

## Structure

```text
assets/
  constellations/   matching constellation and faded sign illustration
  sigils/           vector zodiac glyphs
src/
  build.ts          shared standalone SVG generator
  cli.ts            command-line entry point
  server.ts         Bun HTTP server and export endpoint
  web.ts            browser preview UI
```

## Invariants

- Square 1024 × 1024 SVG output
- Case-insensitive canonical zodiac validation
- Deterministic palette and composition
- Matching solar illustration and central solar sigil
- Four lunar sigils in a cross
- Ascendant, Midheaven, Imum Coeli and Descendant at the corners
- Exactly three reduced `#RGB` colours
- No raster images or external asset references in the exported SVG
