# Bug Intake Attachment Missing File Crash Fix Report

## Summary

Production logs showed repeated API process crashes when a bug report attachment was requested but the underlying file was missing from `storage/bug-reports`.

## Production Evidence

- Container: `phoenix-v3-api`
- Error: `ENOENT: no such file or directory`
- Missing file example: `/app/storage/bug-reports/2026/07/05/BUG-20260705-0003/01-1783258328672-32c6fb39.png`
- Downstream symptom in web logs: `socket hang up` and `ECONNREFUSED` while proxying API requests.

## Root Cause

`BugIntakeService.getAttachment()` created a read stream without first verifying that the file existed and was a regular file. When the file was missing, the stream emitted an `error` event without a handler, crashing the Node.js process.

## Fix

- Added file existence and regular-file checks before creating the stream.
- Tightened storage-root path validation.
- Added a stream `error` handler in the controller as a second safety layer.
- Missing attachment binaries now fail closed as a controlled 404 instead of crashing the API.

## Changed Files

- `apps/api/src/modules/bug-intake/bug-intake.service.ts`
- `apps/api/src/modules/bug-intake/bug-intake.controller.ts`
- `docs/ops/BUG_INTAKE_ATTACHMENT_MISSING_FILE_CRASH_FIX_REPORT.md`

## Verification

- API typecheck: PASS
- W5 closeout gate: PASS

## Safety

- Business code changed: yes, limited to `bug-intake` attachment handling.
- DB write: no.
- Migration: no.
- Deploy config changed: no.
- Push: pending at report creation time.

## Conclusion

GO. The production crash root cause is fixed locally and ready for CI/CD deployment.
