# Production Readiness Upload Response Compatibility Fix Report

Date: 2026-06-24

## Trigger

The shareholder fund contribution voucher upload UI showed:

`服务端未返回 url`

The uploaded file path was a PDF contribution voucher. The failure happened after the legacy upload endpoint had been hardened to create `file_metadata` and return `fileId` with `rawUrl: null`.

## Root Cause

The backend hardening intentionally stopped returning naked `/uploads/contracts/...` URLs and returned:

- `fileId`
- `rawUrl: null`
- `previewUrl: null`
- `downloadUrl: null`
- `url: null`

Current local frontend upload components already accept `fileId`, but older deployed bundles, cached browser assets, or old upload call sites may still treat `json.url` as the success field. When `url` was `null`, the UI interpreted a successful protected upload as a failed upload.

## Fix

1. `POST /api/upload/contract` now keeps the protected response model and sets:
   - `fileId: FILE-...`
   - `rawUrl: null`
   - `previewUrl: null`
   - `downloadUrl: null`
   - `url: FILE-...`
   - `legacyUrlCompat: true`

2. The compatibility `url` is not a URL. It is the same protected file reference as `fileId`.

3. `AttachmentViewer` now renders attachment references as non-clickable controlled references. It does not create:
   - `<a href="/uploads/...">`
   - `<a href="http(s)://...">`
   - `<img src="/uploads/...">`

4. If a legacy raw URL appears in stored data, `AttachmentViewer` labels it as disabled instead of opening it.

## Modified Files

- `apps/api/src/modules/upload/upload.controller.ts`
- `apps/web/src/components/design-system/detail/AttachmentViewer.tsx`
- `docs/ops/PRODUCTION_READINESS_UPLOAD_RESPONSE_COMPAT_FIX_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`
- `docs/ops/PRODUCTION_READINESS_P0_004_LEGACY_UPLOAD_RUNTIME_VERIFICATION_REPORT.md`
- `docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`

## Security Result

| Check | Result |
| --- | --- |
| Return naked `/uploads` URL | NO |
| Return `http(s)` raw URL | NO |
| Return `rawUrl` | `null` |
| Compatibility `url` value | Protected `FILE-*` reference |
| Frontend opens raw link | NO |
| Frontend displays raw image URL | NO |
| DB migration | NO |
| Seed | NO |
| Deployment | Pending CI/CD after push |

## Validation

Planned local validation before push:

- API typecheck
- Web typecheck
- security regression gate
- W5 closeout gate with approved code-boundary flags
- `git diff --check`

## Conclusion

GO WITH CONDITIONS.

The upload form compatibility bug is fixed without reintroducing raw URL exposure. A real authenticated production upload smoke should be performed after CI/CD deploy because it writes one file and one `file_metadata` row.
