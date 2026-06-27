# Production Readiness P0-004 - Legacy Upload Runtime Verification Report

Date: 2026-06-24

Task ID: `PRD-P0-004`

Conclusion: `GO WITH CONDITIONS / RUNTIME STATIC VERIFIED`

## Purpose

Verify whether the currently running production API contains the hardened legacy upload behavior that returns protected `fileId` metadata references instead of naked `/uploads` URLs.

This gate was intentionally read-only. It did not upload a file, write `file_metadata`, execute a migration, restart services, deploy, clean up files, or push.

## Evidence Directory

`docs/ops/runs/production-readiness-p0-004-legacy-upload-runtime-verification-20260624-172048`

Evidence files:

- `context.txt`
- `public_uploads_smoke.txt`
- `remote_api_upload_runtime_static.txt`
- `local_upload_ui_static_refs.txt`

No secret values are intentionally recorded.

## Runtime Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| API health | `PASS` | `https://erp.eggslao.com/api/health` returned production health with DB connected and JWT fallback disabled. |
| Public `/uploads/` root | `PASS WITH CONDITIONS` | Public request returned `404`, not a directory listing or raw file listing. |
| Public `/uploads/contracts/nonexistent...` | `PASS WITH CONDITIONS` | Public request returned `404`; no raw file was exposed. |
| Running API image captured | `PASS` | Remote API image ID recorded from `phoenix-v3-api`. |
| Running upload controller contains `fileId` | `PASS` | `/app/dist/modules/upload/upload.controller.js` contains `fileId`. |
| Running upload controller returns `rawUrl: null` | `PASS` | Runtime dist grep shows `rawUrl: null`. |
| Running upload controller returns compatibility `url` as protected `FILE-*` | `SUPERSEDED BY FIX` | Follow-up fix changes `url` from `null` to protected `fileId` to support old frontend clients without returning naked `/uploads`. |
| Running upload controller marks legacy owner as `LEGACY_PENDING` | `PASS` | Runtime dist grep shows `LEGACY_PENDING`. |
| Running upload controller keeps `deprecatedLegacyPath: false` | `PASS` | Runtime dist grep shows `deprecatedLegacyPath: false`. |
| API static `/uploads` mount still present | `CONDITION` | `/app/dist/main.js` still contains `app.useStaticAssets(uploadsDir, { prefix: '/uploads' })`. Public Nginx/API behavior currently returns `404` for tested paths, but static mount remains a hardening follow-up. |
| Runtime write response probe | `NOT EXECUTED` | Upload POST would write a file and metadata; this gate did not have write-probe approval. |

## Local Frontend Compatibility Evidence

| Check | Result |
| --- | --- |
| `AttachmentUploader` accepts `fileId` | `PASS` |
| `AttachmentUploader` disables `/uploads` / `http(s)` raw refs | `PASS` |
| `FileUploadInput` accepts `fileId` | `PASS` |
| `FileUploadInput` disables naked raw refs | `PASS` |
| Generic UI claims preview/download availability | `PASS`: no generic protected endpoint claim is made. |

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Running upload controller code contains the hardened response shape.
2. Runtime dist evidence originally showed `rawUrl: null` and `url: null`; follow-up compatibility fix keeps `rawUrl: null` and sets `url` to protected `FILE-*`.
3. Runtime dist evidence shows legacy owner fallback remains fail-closed as `LEGACY_PENDING`.
4. Public `/uploads` probes did not expose raw files or directory listing.
5. Local generic frontend components no longer render raw upload references as clickable links.

Conditions:

1. The API still mounts `/uploads` internally through `useStaticAssets`; public probes did not expose files, but a future hardening Gate should remove or firewall this legacy static mount if all modules use protected metadata.
2. A true upload response smoke requires a separate `APPROVE_LEGACY_UPLOAD_RUNTIME_WRITE_PROBE` because it writes a binary and `file_metadata` row.
3. Generic protected file preview/download endpoint remains a separate product/security Gate.

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Runtime evidence was collected without DB writes, upload writes, service restarts, deployment, or cleanup.
2. The remote API health endpoint was reachable.
3. The running container source shape matches the hardened upload controller.

Conditions:

1. This is not an upload write probe.
2. W5 closeout must pass after this report is committed.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | No |
| API code changed | No in this gate |
| Web code changed | No in this gate |
| DB write | No |
| File upload write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed by this report | No |

## Final Result

`PRD-P0-004` is `GO WITH CONDITIONS / RUNTIME STATIC VERIFIED`.

The production runtime now appears to contain the hardened legacy upload response code. The remaining conditions are a separately approved write probe, removal or stricter isolation of the legacy `/uploads` static mount, and a future generic protected file endpoint decision.
