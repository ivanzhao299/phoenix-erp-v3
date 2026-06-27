# App Logo Redesign - 2026-06-26

## Goal

Remove the visible white circular badge around the Phoenix ERP app icon and make the icon feel more like a production-grade app logo.

## Changes

- Replaced the PWA icon with a full-bleed rounded-square app icon.
- Removed the old white circular emblem wrapper.
- Kept the Phoenix ERP visual language:
  - deep blue app background
  - red phoenix/chicken mark
  - gold egg elements
- Rebuilt the browser SVG icon as a maintainable vector asset instead of a large embedded PNG.
- Regenerated favicon variants from the same simplified mark.

## Changed Files

- `apps/web/public/icon-256.png`
- `apps/web/public/icon-32.png`
- `apps/web/src/app/favicon.ico`
- `apps/web/src/app/icon.svg`

## Result

The app icon no longer shows a white outer circle. The icon now reads as a compact app icon rather than a badge placed inside another rounded-square container.

## Production Notes

- No business code changed.
- No database migration executed.
- No database write performed.
- Web deploy is required for browsers and PWA installs to pick up the updated icon.

## Conclusion

GO.
