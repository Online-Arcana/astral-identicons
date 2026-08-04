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
5. literal sign classification from the constellation, unchanged nine-position grid and zodiac ring;
6. ranked recognition of all eleven planetary SVG outlines and satellites using the calibrated two-to-one glyph/star size relationship;
7. enforcement that the eleven planetary candidates occupy eleven different, widely separated macro-groups;
8. independent observation of 128 indexed parity stars in their deterministic interior blue-noise field;
9. multi-frame evidence merging;
10. RS(168,40), CRC, magic, version and fixed-length validation.

The planetary renderer and scanner template generator use the same SVG paths extracted from the Unicode glyph contours. Recognition therefore does not depend on the phone, browser or operating-system symbol font.

## Camera acceptance

The scanner deliberately does not accept the first recognisable image.

After opening the camera it:

- requests continuous focus, exposure and white-balance modes when the browser exposes them;
- leaves the camera running for 1.8 seconds before counting evidence;
- rejects frames below strict sharpness, contrast, exposure and edge-density thresholds;
- rejects a frame materially blurrier than the best frame already observed;
- requires at least four consecutive stable focus/exposure comparisons;
- requires at least ten stable clear frames and 2.4 seconds of useful stable capture before attempting reconstruction;
- stores only the twelve highest-quality frames;
- redraws the retained snapshot whenever a better frame is found.

If decoding remains ambiguous, the scanner restarts the live camera while preserving prior numerical evidence and the clearest retained frame.

## Geometry checks

Automated checks must verify all of these invariants:

- exactly 12 fixed calibration stars outside the outer ring;
- zero parity stars on the circumference;
- exactly 128 parity groups scattered inside the inner clip;
- no circular-track, row or band layout for parity groups;
- all parity envelopes remain mutually separated;
- exactly 256 legal planetary anchor IDs;
- the 256 anchors are partitioned into 24 widely separated groups;
- every encoded identity selects eleven distinct groups;
- the minimum inter-group planet-envelope gap remains above the camera safety threshold;
- the full reversible planetary configuration space remains greater than `2^256`.

## Manual device checks

Use a generated v9 SVG whose exact 32-byte public key and six signs are known. Test all of the following on a branch-only local HTTPS page before any deployment:

- pristine source SVG;
- normal phone-camera view after autofocus and exposure settle;
- deliberate motion blur, which must be rejected rather than retained;
- focus improvement over several seconds, where the retained snapshot must update to the sharper frame;
- reduced exposure;
- inverted monochrome;
- greyscale or recoloured copy;
- all eleven planetary symbols, especially the closed Mars outline, at several rotations and sizes;
- partial obstruction with enough parity remaining for `2e + s <= 128`.

Every successful case must recover the exact original 32 bytes and all six literal signs.
