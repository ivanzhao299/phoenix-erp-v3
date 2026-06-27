# Production Readiness Remediation Batch - Attachment Link Convergence

Date: 2026-06-25

## Objective

Continue the P1 attachment-chain remediation by preventing new frontend writes of raw `/uploads` or external HTTP attachment URLs, and by removing a direct raw-link rendering path from shareholder capital detail.

## Changes

1. `AttachmentUploader`
   - Keeps accepting controlled `fileId`.
   - Rejects server-returned raw `/uploads` or `http(s)` URL fallbacks.
   - Shows a clear error instead of writing unsafe refs into business forms.

2. `FileUploadInput`
   - Reuses the shared attachment safety helpers.
   - Rejects unsafe `json.url` fallback values returned by upload endpoints.

3. Shareholder capital detail
   - Replaced direct `<a href={attachment}>` and image rendering with read-only `AttachmentUploader`.
   - Historical raw links are displayed as disabled unsafe references instead of clickable links.

## Validation

| Check | Result |
| --- | --- |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |

## Safety

- API changed: no.
- Frontend changed: yes.
- Migration executed: no.
- Database write executed locally: no.
- Deploy status: pending CI/CD after push.

## Remaining Backlog

1. Continue scanning legacy pages for raw attachment rendering.
2. Add backend protected preview/download endpoints for remaining modules that need real document access.
3. Add a CI guard for unsafe attachment refs in frontend render paths.
