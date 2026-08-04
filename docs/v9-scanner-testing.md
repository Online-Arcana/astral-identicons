# Scanner selection

The application now defaults to the v9 camera and photo recogniser so its normal scan path matches the v9 identicons generated from exact 32-byte identities.

Append this query parameter to select the legacy v8 scanner explicitly:

```text
?scanner=v8
```

The footer always shows the implementation selected for that refresh:

- `Scanner v9` for the normal application path;
- `Scanner v8` when `?scanner=v8` is present.

This switch affects only the camera and photo recogniser. Exact 32-byte identities render through visual format v9. Legacy short text seeds continue to render through v8.

The v9 recogniser ignores RGB colour and performs:

1. outer-circle normalisation;
2. North Star orientation recovery;
3. literal sign classification from the constellation, grid and ring;
4. ranked recognition of all eleven planetary glyphs and satellites;
5. independent observation of the thirty-two parity stars;
6. multi-frame evidence merging;
7. RS(72,40), CRC, magic, version and fixed-length validation.
