# Rollback Runbook

> Purpose: provide a controlled rollback path. Rollback decisions must prioritize data integrity and security over speed.

## Rollback Triggers

| Trigger | Default action |
| --- | --- |
| Production health check fails after release | ROLLBACK unless fix is trivial and approved. |
| Auth/RBAC bypass or privilege escalation | Immediate HOLD/ROLLBACK and security review. |
| Financial amount, receivable/payable, invoice, or ledger inconsistency | Stop release and evaluate rollback with finance owner. |
| Data loss/corruption or unsafe migration | Stop writes where possible; require data owner/DBA review. |
| Chanjet/Yonyou signature or sync regression | Disable affected release path or rollback after owner review. |
| User-blocking frontend/API regression | Rollback if not resolved inside approved observation window. |

## Roll Back To Previous Commit Or Image

1. Identify the previous known-good commit/image from the release packet.
2. Confirm whether the failed release ran any migration or data script.
3. If no migration/data mutation ran, redeploy the previous known-good image/commit through the approved workflow.
4. If a migration/data mutation ran, follow the database section before redeploying.
5. Record operator, approver, start/end time, and verification evidence.

## Backup Before Rollback

| Scenario | Backup requirement |
| --- | --- |
| No data writes after release | Snapshot/log capture recommended. |
| Data writes occurred | Backup current state before rollback. |
| Migration ran | Backup current DB and preserve migration logs before any reverse action. |
| Security incident | Preserve logs and artifacts for investigation. |

## Rollback Verification

| Check | Expected result |
| --- | --- |
| API health | Healthy after rollback. |
| Web health | Healthy after rollback. |
| Login/current user | Works and rejects invalid token. |
| Affected workflow | Restored to previous known-good behavior. |
| Logs | No repeated 5xx, migration loop, or secret leakage. |
| Data | Counts/invariants match expected post-rollback state. |

## Database Rollback: No Migration Ran

If the release did not run a migration and did not mutate production data:

1. Redeploy previous image/commit.
2. Run smoke tests.
3. Compare affected data read paths.
4. Keep logs for the incident record.

## Database Rollback: Migration Ran

If a migration ran:

1. Do not assume `down()` is safe for production.
2. Classify migration type: additive, destructive, data backfill, data transform, index/constraint, permission seed.
3. Prefer forward repair for additive compatible changes when data integrity is safe.
4. Use restore or carefully reviewed reverse script only with DBA/data owner approval.
5. Preserve both pre-rollback and post-rollback snapshots/logs.

## Log Retention

Retain release logs, deploy logs, API/web logs, DB migration logs, CI logs, and communication records for the incident window. Security and finance incidents require extended retention according to owner policy.

## Notification Mechanism

| Audience | When |
| --- | --- |
| Business owner | Immediately for user-visible or financial impact. |
| Technical owner | Immediately for all rollback triggers. |
| Security owner | Auth/RBAC/log/secret incident. |
| Data owner | Migration, master data, or data integrity incident. |
| External integration owner | Chanjet/Yonyou or third-party incident. |
