# Production PRE snapshot admission remediation

```ini
BASE_MAIN=c4ac174a6d5900824b7fc3c58985e5d9392743c1
REMEDIATION_PR=PENDING
MERGED_MAIN_SHA=PENDING
BLOCKED_DEPLOY_RUN=38014260423
PASSED_READONLY_AUDIT_RUN=38013979358
PRODUCTION_FLOOR=V2_HOLD
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
```

## Failure and root cause

Run `38014260423` passed SSH, trusted-path, FD9, clean-main, fetch, and target-ref checks. It exited immediately after `git fetch origin main`, before the staged helper could persist PRE evidence. The candidate helper treated all three containers identically and required `org.opencontainers.image.revision` on the database image. Production uses the third-party `postgres:16-alpine` image, whose `Config.Labels` is null or empty. The exception was then reduced to the generic `DEPLOY_EVIDENCE_HOLD=FAILED`, which hid the failing stage.

The repaired contract keeps application revision labels mandatory for API and Web. DB evidence requires the immutable `sha256` Image ID, container ID, Created/StartedAt, RestartCount, health, and mounts; the DB `ociRevision` field is explicitly `null` for the third-party image. Web/DB identity comparisons continue to require ID, StartedAt, Image, health, and mounts to remain unchanged.

## Error handling

The staged helper now emits a non-sensitive stage marker and a stable fail-closed class. Docker inspect errors, missing metadata, missing or malformed API/Web revision labels, invalid binding, persistence failure, and unexpected errors are distinguishable. The original exception remains attached in memory for restricted local diagnostics and is never printed or persisted. PRE failure still stops before floor promotion, container switching, or migration.

For an approved config floor promotion, the workflow now forces `run_mig=false` at change detection and checks the value before PRE, floor state changes, or any database operation. A non-API mode or an inherited true migration flag fails closed.

## Verification

The evidence tests cover null and empty DB labels, required API/Web revision labels, immutable DB image identity, Docker inspect failures, malformed metadata, error classification, real stdout/stderr capture, and a real isolated `postgres:16-alpine` container. The deployment contract test verifies PRE ordering and the early migration guard.

```ini
POSTGRES_IMAGE_LABEL_BEHAVIOR=DB_NULL_OR_EMPTY_ALLOWED; API_WEB_REQUIRED
API_WEB_REVISION_GUARD=PASS
DB_IMAGE_ID_GUARD=PASS
STAGED_HELPER_COMPATIBILITY=PASS_LOCAL_HELPER_AND_CONTRACT
PRE_SNAPSHOT_REAL_DOCKER=PASS
POST_SNAPSHOT_CONTRACT=PASS_EXISTING_CONTRACT
LIVE_REINSPECT=PASS_EXISTING_CONTRACT
ERROR_CLASSIFICATION=PASS
EVIDENCE_REDACTION=PASS
MIGRATION_FLAG_AUDIT=PASS
```

No production deployment, floor promotion, database mutation, container restart, or Chanjet operation was performed during this remediation.
