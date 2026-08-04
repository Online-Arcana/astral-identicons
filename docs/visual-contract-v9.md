# Astral Identicon visual contract v9

V9 separates literal astrology, exact identity encoding, error correction, calibration and decoration.

## Record

A v9-scannable identicon represents an exact 32-byte identity and six literal zodiac signs.

| Bytes | Meaning |
| ---: | --- |
| 1 | Magic |
| 1 | Format version, `9` |
| 1 | Identity length, always `32` |
| 32 | Exact identity bytes |
| 3 | Solar, lunar, ascendant, midheaven, descendant and Imum Coeli signs packed as nibbles |
| 2 | CRC-16 |
| 40 | Total systematic record |

The record is protected with RS(168,40), producing 128 parity bytes. It can recover any mixture satisfying:

```text
2e + s <= 128
```

where `e` is the number of wrong bytes and `s` is the number of missing bytes.

Short text seeds remain supported by the legacy renderer. They are not labelled v9-scannable.

## Literal astrology

The astrology remains literal and does not carry identity bits:

- the large constellation depicts the solar sign;
- the nine-position inner grid retains its fixed role arrangement;
- the zodiac ring retains its fixed solar, lunar and angle placements.

Repeated signs provide recognition evidence and can be repaired through the canonical record, but their fixed role positions do not encode identity.

## Calibration

### Circumference stars

Twelve fixed calibration stars sit outside the outer zodiac ring, one every 30 degrees. They encode no payload and cannot collide with the 128 parity stars.

Clockwise from North, the stars use the following known level pattern for both size and fading:

```text
6, 1, 5, 2, 4, 3, 6, 3, 4, 2, 5, 1
```

North and South are both level 6. Every level occurs twice. The scanner uses these known positions and values to:

- resolve orientation;
- measure all six apparent star sizes;
- measure all six captured fading levels;
- calibrate the parity-star decoder;
- derive all six planetary-glyph sizes because every planetary level is exactly twice its corresponding star level.

The star sizes are `13`, `15`, `17`, `19`, `21` and `23` SVG units. Planetary glyph sizes are therefore `26`, `30`, `34`, `38`, `42` and `46`.

### Solar rays

The central Sun `☉` is fixed and encodes no data. It uses the largest planetary-glyph size.

Its twelve short rays calibrate fading only. They do not calibrate or encode size. Clockwise from North, their fixed fading pattern is:

```text
6, 1, 5, 2, 4, 3, 4, 3, 5, 2, 1, 6
```

The scanner combines the known ray intensities with the circumference-star intensities to estimate the captured six-level fading curve.

The Sun contains no nested zodiac glyph, background knockout or other overlay. The original literal solar sign remains in the fixed centre grid.

No orientation notches, carriers, background badges or extra marker glyphs are added.

## Exact identity

The eleven identity glyphs, in canonical order, are:

1. Moon `☽`
2. Mercury `☿`
3. Venus `♀`
4. Earth `♁`
5. Mars `♂`
6. Jupiter `♃`
7. Saturn `♄`
8. Uranus `♅`
9. Neptune `♆`
10. Pluto `♇`
11. Ceres `⚳`

Each appears exactly once and carries:

- one of 256 legal global placements;
- one of twelve rotations at 30-degree intervals;
- one of six sizes;
- one of six fading levels;
- three satellites, one small, one medium and one large, occupying three distinct positions among six.

Stroke thickness is fixed. It never carries data and the renderer does not outline or distort the glyphs.

The satellite state count is `P(6,3) = 120`.

The location channel is the full ordered selection:

```text
P(256,11)
```

All eleven placements must be distinct. The identity is treated as one unsigned 256-bit integer and mapped through deterministic permutation ranking and mixed-radix rank/unrank. Configurations ranking at or above `2^256` are reserved invalid states.

The decoder retains ranked alternatives for each glyph and does not commit to one global identity before parity validation.

## Colour

Colour is deterministic decoration only. It is never used to reconstruct or validate data.

All eleven planetary glyphs, all thirty-three satellites, the fixed central Sun and its rays use one foreground colour. The 128 parity stars and twelve fixed circumference calibration stars use the other foreground colour. The decoder ignores that separation and remains compatible with greyscale, monochrome and recoloured copies.

## Parity stars

V9 renders 128 indexed payload parity stars. The twelve circumference stars are calibration references and are not part of the Reed–Solomon codeword.

Every parity symbol is one clean eight-point star. The decorative multi-shape `star.svg` artwork is not used as a parity symbol.

Each indexed parity group has eight local placements. A star carries one parity byte through:

- eight placements;
- six sizes;
- six fading levels.

Stroke thickness and shape deformation never carry data.

This gives 288 visual states. Exactly 256 map to byte values and 32 are reserved. One unreadable star is one Reed–Solomon erasure; indices never shift.

The planetary map and literal signs provide the systematic 40-byte record. The scanner does not need to read every parity star.

## Camera capture

The camera scanner must not accept the first recognisable frame.

It keeps the camera open long enough for autofocus, exposure and white balance to settle, rejects frames below the strict blur and exposure thresholds, requires several consecutive stable frames, and continually replaces its retained snapshot whenever a sharper overall frame is captured.

Cumulative evidence remains available across retries, but a blurry frame never displaces a clearer retained frame.

## Runtime versions

The page footer independently displays:

- the application version from `package.json`;
- the active scanner implementation version.

The normal application path uses Scanner v9. Appending `?scanner=v8` selects the legacy scanner for comparison or compatibility testing, and the footer reflects that selection after each refresh.
