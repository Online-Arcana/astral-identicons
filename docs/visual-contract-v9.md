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

Exactly twelve fixed calibration stars sit outside the outer zodiac ring, one every 30 degrees. They encode no payload. They are the only stars placed around the circumference.

Clockwise from North, the stars use this known level pattern for both size and fading:

```text
6, 1, 5, 2, 4, 3, 6, 3, 4, 2, 5, 1
```

North and South are both level 6. Every level occurs twice. The scanner uses the references to:

- resolve orientation;
- measure all six apparent star sizes;
- measure all six captured fading levels;
- calibrate the parity-star decoder;
- derive all six planetary-glyph sizes because every planetary level is exactly twice its corresponding star level.

Star sizes are `13`, `15`, `17`, `19`, `21` and `23` SVG units. Planetary glyph sizes are `26`, `30`, `34`, `38`, `42` and `46`.

### Solar rays

The central Sun `☉` is fixed and encodes no data. It uses the largest planetary-glyph size.

Its twelve short rays calibrate fading only. Clockwise from North, their fixed pattern is:

```text
6, 1, 5, 2, 4, 3, 4, 3, 5, 2, 1, 6
```

The scanner combines the known ray intensities with the circumference-star intensities to estimate the captured six-level fading curve.

The Sun contains no nested zodiac glyph, background knockout or other overlay. The original literal solar sign remains in the fixed centre grid.

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

Their outlines are not rendered through the browser or operating-system font. `scripts/generate-planet-glyphs.py` reads these Unicode characters from `src/planet.ts`, extracts their actual contours from Noto symbol fonts with FontTools, and writes deterministic SVG path data. The renderer and camera templates consume the same generated paths, so the shape is identical on every platform.

Each glyph appears exactly once and carries:

- one of exactly 256 legal anchor IDs;
- one of twelve rotations at 30-degree intervals;
- one of six sizes;
- one of six fading levels;
- three satellites, one small, one medium and one large, occupying three distinct positions among six.

The 256 anchors are partitioned into 24 widely separated macro-groups. Eleven different groups are selected for every identity. Each selected group contributes one of its ten or eleven local micro-anchors. This preserves exactly 256 anchor IDs while preventing two planetary glyph envelopes from approaching closely enough to merge in a camera image.

The location rank is an ordered, weighted selection of eleven distinct groups and one local anchor within each group. Its capacity is combined with the local rotation, size, fading and satellite channels. The implementation asserts that the complete valid configuration space remains greater than `2^256`; therefore every exact 32-byte identity still has a reversible representation. Configurations ranking at or above `2^256` are reserved invalid states.

Stroke thickness is fixed. It never carries data. The decoder retains ranked alternatives for each glyph and does not commit to one global identity before parity validation.

## Parity stars

V9 renders 128 indexed payload parity stars in a deterministic interior blue-noise field. They are deliberately scattered through available interior space instead of being arranged in circular tracks, rings, rows or bands.

The field excludes every planetary macro-group by the full maximum planet envelope, parity envelope and safety gap. It also keeps all parity envelopes inside the inner clipping circle and separated from one another.

The twelve circumference stars are calibration references and are not part of the Reed–Solomon codeword.

Every parity symbol is one clean eight-point star. Each indexed parity group has eight local placements. A star carries one parity byte through:

- eight placements;
- six sizes;
- six fading levels.

This gives 288 visual states. Exactly 256 map to byte values and 32 are reserved. Stroke thickness and shape deformation never carry data. One unreadable star is one Reed–Solomon erasure; indices never shift.

## Colour

Colour is deterministic decoration only. It is never used to reconstruct or validate data.

All eleven planetary glyphs, all thirty-three satellites, the fixed central Sun and its rays use one foreground colour. The 128 parity stars and twelve fixed circumference calibration stars use the other foreground colour. The decoder remains compatible with greyscale, monochrome and recoloured copies.

## Camera capture

The camera scanner must not accept the first recognisable frame.

It keeps the camera open long enough for autofocus, exposure and white balance to settle, rejects frames below strict blur and exposure thresholds, requires several consecutive stable frames, and continually replaces its retained snapshot whenever a sharper overall frame is captured.

Cumulative evidence remains available across retries, but a blurry frame never displaces a clearer retained frame.

## Runtime versions

The page footer independently displays:

- the application version from `package.json`;
- the active scanner implementation version.

The normal application path uses Scanner v9. Appending `?scanner=v8` selects the legacy scanner for comparison or compatibility testing, and the footer reflects that selection after each refresh.
