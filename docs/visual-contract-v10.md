# Visual contract V10

V10 is a geocentric astrology wheel with a Reed-Solomon identicon field inside it.

## Zodiac ring

The outer ring always contains all twelve zodiac signs in their normal 30 degree sectors. The ring is rotated by the chart Ascendant, so a scanner must reason about glyph position relative to the zodiac sectors rather than assuming a fixed screen angle for a sign.

## Visible chart points

V10 renders the ten geocentric planetary points:

```text
Sun
Moon
Mercury
Venus
Mars
Jupiter
Saturn
Uranus
Neptune
Pluto
```

Earth is not rendered because this is a geocentric natal chart.

V10 additionally renders the four cardinal angle glyphs:

```text
Ascendant
Midheaven
Descendant
Imum Coeli
```

It does not render Vertex, Antivertex, East Point, lunar nodes, lots or Lilith in the V10 identicon wheel.

## Six sign carriers

The six signs stored in the protected record are visible through six chart-point positions against the twelve-sign zodiac ring:

```text
Solar sign       Sun glyph position
Lunar sign       Moon glyph position
Ascendant sign   Ascendant glyph position
Midheaven sign   Midheaven glyph position
Descendant sign  Descendant glyph position
Imum Coeli sign  Imum Coeli glyph position
```

These are spatial observations. V10 does not draw a separate literal six-sign grid.

The ten planetary glyphs are ordinary astrology chart points and do not encode identity bits through glyph choice, size, rotation, fading or satellites.

## Reed-Solomon field

The centre contains all 128 parity stars from the existing RS(168,40) codec. This is the identity-bearing correction field.

The protected record contains the 32-byte package identity, the six packed signs and CRC. Sign observations from the wheel can contribute bounded hypotheses for the packed sign bytes, while the Reed-Solomon field validates, corrects and disambiguates those hypotheses. The stars remain the source of identity recovery.

## Deliberately absent

V10 remains houseless and aspectless. It does not render house divisions, house numbers, aspect lines, point leader lines or the old V9 encoded-planet/satellite system.
