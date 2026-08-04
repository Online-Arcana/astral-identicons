# Astral Identicon visual contract v9

V9 separates literal astrology, exact identity encoding, error correction and decoration.

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

The record is protected with RS(72,40), producing 32 parity bytes.

Short text seeds remain supported by the legacy renderer. They are not labelled v9-scannable.

## Literal astrology

The astrology remains literal and does not carry identity bits:

- the large constellation depicts the solar sign;
- the nine-position inner grid retains its fixed role arrangement;
- the zodiac ring retains its fixed solar, lunar and angle placements.

Repeated signs provide recognition evidence and can be repaired through the canonical record, but their fixed role positions do not encode identity.

## Calibration

The North Star remains the fixed upright orientation and scale reference. It uses the same foreground colour as the parity stars, but its state is fixed and it encodes nothing.

The central Sun `☉` is fixed and encodes no data. It uses the same visual scale as the planetary glyphs. Twelve short fixed rays mark the twelve 30-degree rotation levels.

The Sun contains no nested zodiac glyph, background knockout or other overlay. The literal solar sign remains represented by the constellation, fixed grid and zodiac ring.

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

The six planetary sizes are `26`, `30`, `34`, `38`, `42` and `46` SVG units, exactly twice the previous deployed values.

The satellite state count is `P(6,3) = 120`.

The location channel is the full ordered selection:

```text
P(256,11)
```

All eleven placements must be distinct. The identity is treated as one unsigned 256-bit integer and mapped through deterministic permutation ranking and mixed-radix rank/unrank. Configurations ranking at or above `2^256` are reserved invalid states.

The decoder retains ranked alternatives for each glyph and does not commit to one global identity before parity validation.

## Colour

Colour is deterministic decoration only. It is never used to reconstruct or validate data.

All eleven planetary glyphs, all thirty-three satellites and the fixed central Sun use one foreground colour. The thirty-two parity stars and fixed North Star use the other foreground colour. The decoder ignores that separation and remains compatible with greyscale, monochrome and recoloured copies.

## Parity stars

V9 renders thirty-two indexed parity stars plus the fixed North Star.

Every parity symbol is one clean eight-point star. The decorative multi-shape `star.svg` artwork is not used as a parity symbol.

Each parity group has eight local placements. A star carries one parity byte through:

- eight placements;
- six sizes;
- six fading levels.

Stroke thickness and shape deformation never carry data.

This gives 288 states. Exactly 256 map to byte values and 32 are reserved. One unreadable star is one Reed–Solomon erasure; indices never shift.

The planetary map and literal signs are systematic data. The scanner never waits for every parity star.

## Runtime versions

The page footer independently displays:

- the application version from `package.json`;
- the active scanner implementation version.

The normal application path uses Scanner v9. Appending `?scanner=v8` selects the legacy scanner for comparison or compatibility testing, and the footer reflects that selection after each refresh.
