# Legacy Upload To File Metadata Gate Run

Date: 2026-06-24

## Summary

- Gate: `APPROVE_LEGACY_UPLOAD_TO_FILE_METADATA_GATE`
- Result: GO WITH CONDITIONS
- Backend code changed: yes, limited to `apps/api/src/modules/upload/**`
- Runtime deploy/restart: no
- Migration: no
- Push: no
- Historical file delete/move: no

## Key Evidence

- Legacy upload source no longer returns `/uploads/contracts/${file.filename}`.
- New upload source writes `file_metadata`.
- New upload response returns `fileId`, safe metadata, `rawUrl: null`, `url: null`.
- `storage_path` is not returned.
- Generic protected file endpoint is not available yet.
- Remote SSH smoke failed with banner timeout, so no fresh remote row-count evidence was collected.

## Validation

| Check | Result |
| --- | --- |
| Security regression gate | PASS |
| Freeze boundary gate with approved override | PASS with warning |
| W5 closeout gate with approved override | PASS |
| API build | BLOCKED: local dependencies missing |
| Remote smoke | BLOCKED: SSH banner timeout |

