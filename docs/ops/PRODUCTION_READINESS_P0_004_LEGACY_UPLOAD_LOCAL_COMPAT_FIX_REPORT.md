# Production Readiness P0-004 - Legacy Upload Local Compatibility Fix

Date: 2026-06-24

## Scope

This batch addresses the local code portion of `PRD-P0-004 Legacy upload runtime verification gate`.

The previous backend hardening changed `POST /api/upload/contract` to return a protected `fileId` with `rawUrl: null` and `url: null`. The local frontend upload components still expected `json.url` and rendered attachment references as clickable links. That created two risks:

1. New hardened upload responses could be treated as failed uploads because `url` is now intentionally null.
2. Historical `/uploads` or absolute URL values could still be rendered as clickable raw links in generic upload UI.

## Modified Files

- `apps/web/src/components/design-system/forms/AttachmentUploader.tsx`
- `apps/web/src/components/ui/FileUploadInput.tsx`

## Changes

1. Generic upload components now prefer `json.fileId` from the hardened upload response.
2. `json.url` remains accepted only as a legacy fallback value, but it is not rendered as a clickable raw link when it is unsafe.
3. Historical `/uploads`, `uploads/`, `http://`, and `https://` attachment references are displayed as disabled legacy references.
4. New `FILE-*` protected references are displayed as controlled attachment identifiers.
5. Generic UI no longer opens raw upload links, no longer displays image previews from raw paths, and no longer constructs `/uploads` access URLs.

## Security Result

| Check | Result |
| --- | --- |
| Accept protected `fileId` upload response | PASS |
| Keep `rawUrl` out of UI links | PASS |
| Disable `/uploads` references | PASS |
| Disable `http(s)` raw references | PASS |
| Avoid generic protected endpoint claims | PASS |
| DB write | No |
| Migration | No |
| Deploy | No |
| Push | No |

## Validation

| Command | Result |
| --- | --- |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `node scripts/ci/check-security-regression.mjs` | PASS |
| `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Remaining Conditions

This local fix does not replace the production runtime verification Gate.

Still required:

1. Verify the running production API serves the hardened upload response.
2. Verify public `/uploads` remains blocked.
3. Verify no production frontend path reintroduces naked upload links.
4. Decide whether a generic protected file endpoint is needed for non-Store-Payment modules.

## Conclusion

GO WITH CONDITIONS.

The local frontend compatibility issue is fixed. `PRD-P0-004` should remain open until the running environment is verified through a dedicated runtime verification Gate.
