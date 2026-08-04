# Scanner selection

The application defaults to the v9 camera and photo recogniser so its normal scan path matches v9 identicons generated from exact 32-byte identities.

Append this query parameter to select the legacy v8 scanner explicitly:

```text
?scanner=v8
```

The footer always shows the implementation selected for that refresh:

- `Scanner v9` for the normal application path;
- `Scanner v8` when `?scanner=v8` is present.

This switch affects only the camera and photo recogniser. Exact 32-byte identities render through visual format v9. Legacy short text seeds continue to render through v8.

## V9 recognition path

The v9 recogniser ignores RGB colour and performs:

1. outer-circle normalisation while retaining the full canvas outside the ring;
2. joint orientation recovery from the twelve fixed circumference stars and twelve solar rays;
3. six-level star-size calibration from the circumference stars;
4. six-level fading calibration from the circumference stars and fading-only solar rays;
5. literal sign classification from the constellation, grid and ring;
6. ranked recognition of all eleven planetary glyphs and satellites using the calibrated two-to-one glyph/star size relationship;
7. independent observation of the 128 indexed parity stars;
8. multi-frame evidence merging;
9. RS(168,40), CRC, magic, version and fixed-length validation.

## Camera acceptance

The scanner deliberately does not accept the first recognisable image.

After opening the camera it:

- requests continuous focus, exposure and white-balance modes when the browser exposes them;
- leaves the camera running for 1.8 seconds before counting evidence;
- rejects frames below the strict sharpness, contrast, exposure and edge-density thresholds;
- rejects a frame that is materially blurrier than the best frame already observed;
- requires at least four consecutive stable focus/exposure comparisons;
- requires at least ten stable clear frames and 2.4 seconds of useful stable capture before attempting reconstruction;
- stores only the twelve highest-quality frames;
- redraws the retained snapshot whenever a better frame is found.

If decoding remains ambiguous, the scanner restarts the live camera while preserving prior numerical evidence and the clearest retained frame.

## Manual device checks

Use a generated v9 SVG whose exact 32-byte public key and six signs are known. Test all of the following on the GitHub Pages HTTPS deployment:

- pristine source SVG;
- normal phone-camera view after autofocus and exposure settle;
- deliberate motion blur, which must be rejected rather than retained;
- focus improvement over several seconds, where the retained snapshot must update to the sharper frame;
- reduced exposure;
- inverted monochrome;
- greyscale or recoloured copy;
- partial obstruction with enough parity remaining for `2e + s <= 128`.

Every successful case must recover the exact original 32 bytes and all six literal signs.
