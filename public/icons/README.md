# PWA icons — CURRENTLY PLACEHOLDERS

Every PNG in this directory is **generated**, not hand-authored. Do not edit them
directly; they are overwritten by:

```
npm run icons        # scripts/generate-icons.ts
```

## Status

`public/icon-source.png` (the owner-supplied square logo, PLAN.md §9 Q6) **does not
exist in the repo yet**, so these files were produced from the script's built-in
placeholder mark: a white speech bubble on the brand slate background. They are valid,
correctly sized and correctly padded, which is enough for the manifest to be valid and
for the app to be installable — but they are **not final artwork**.

To ship the real icons: drop the square source image at `public/icon-source.png`
(1024×1024 or larger, PNG), run `npm run icons`, and commit the regenerated files.
Nothing else changes — the manifest already points at these filenames.

## Files

| File | Size | Used for |
|---|---|---|
| `icon-192.png` | 192×192 | manifest, `purpose: "any"` |
| `icon-512.png` | 512×512 | manifest, `purpose: "any"` (also the install/splash icon) |
| `icon-maskable-192.png` | 192×192 | manifest, `purpose: "maskable"` — mark inset to the central 80% safe zone |
| `icon-maskable-512.png` | 512×512 | manifest, `purpose: "maskable"` |
| `apple-touch-icon.png` | 180×180 | iOS home screen (`<link rel="apple-touch-icon">`); iOS ignores the manifest icons |
