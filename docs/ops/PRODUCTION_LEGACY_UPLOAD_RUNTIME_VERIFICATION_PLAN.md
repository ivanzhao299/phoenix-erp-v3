# Production Legacy Upload Runtime Verification Plan

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_RUNTIME_VERIFICATION_APPROVAL.

The source-level legacy upload hardening exists, but the production-side running API has not been proven to serve the hardened response. This plan defines a verification Gate and does not deploy, restart, push, migrate, or write DB.

## Source Evidence

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_UPLOADS_EXPOSURE_HARDENING_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_REPORT.md`

## Current Evidence

| Area | Status |
| --- | --- |
| Source upload response | Updated to return `fileId`, `rawUrl: null`, `url: null` |
| Runtime deploy/restart | Not executed in the source hardening Gate |
| Public Nginx `/uploads` | Hardened to 403 |
| Internal API static `/uploads` | Still returns 200 by prior evidence |
| file_metadata historical rows | 15 AUTO rows inserted |
| unresolved historical files | 59 remain HOLD |
| generic protected file endpoint | Not available by prior report |

## Runtime Verification Scope

The next Gate should verify, without writing production data if possible:

1. Current running API image / commit.
2. Current upload controller source mounted in the container.
3. Whether `POST /api/upload/contract` response still contains raw `/uploads` or `url`.
4. Whether test upload can be avoided by source/container inspection.
5. If a test upload is unavoidable, require a separate explicit DB/file write approval and rollback plan.

## Preferred No-Write Checks

1. Inspect running container code path for `rawUrl: null`.
2. Inspect logs/config for current deployed image.
3. Re-check public `/uploads` returns 403.
4. Re-check Store Payment protected endpoints fail closed.
5. Confirm no front-end path is still using raw upload response for Store Payment.

## If Write Probe Is Required

Hold and request a new Gate:

`APPROVE_LEGACY_UPLOAD_RUNTIME_WRITE_PROBE`

That Gate must include:

1. test file path,
2. owner marker,
3. file_metadata rollback,
4. uploaded binary cleanup policy,
5. A2 approval,
6. A1 validation.

## A2 Security Requirements

1. No raw URL in runtime response.
2. No `storage_path` exposure.
3. No public `/uploads` reopen.
4. No generic protected endpoint claims unless implemented.
5. No auto-claim of unresolved historical files.

## A1 Validation Requirements

1. W5 static gates pass.
2. Runtime evidence is captured.
3. If SSH fails, record it as `EVIDENCE_UNAVAILABLE`, not as PASS.

## Next Gate

`APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`

This Gate should be read-only first. It must not restart API or write upload test data unless explicitly widened.
