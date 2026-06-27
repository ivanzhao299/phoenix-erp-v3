# Release Runbook

> Purpose: standard release procedure from staging candidate to production go/no-go. This document does not authorize direct production deployment.

## Staging Release Flow

1. Confirm the requirement spec, Agent task contracts, and PR template are complete.
2. Confirm no frozen item is touched unless a separate approved exception exists.
3. Confirm required local checks and GitHub Actions checks are PASS or explicitly pending as CI conditions.
4. Deploy the release candidate to staging through the approved staging mechanism.
5. Record commit hash, image tag if applicable, environment variables changed, and migration status.

## Staging Smoke Test

| Check | Expected result |
| --- | --- |
| API health | Health endpoint returns success. |
| Web health | Web entry page loads without server error. |
| Login/current user | Login and current-user path pass with staging-safe user. |
| RBAC/menu | Role-limited user sees expected menus and cannot access forbidden path. |
| Critical module path | At least one affected workflow passes. |
| Logs | No repeated 5xx, auth bypass, secret leakage, or migration errors. |

## Production Pre-Release Checklist

| Item | Required |
| --- | --- |
| GO/GO WITH CONDITIONS decision recorded | Yes |
| Human approver identified | Yes |
| Rollback owner identified | Yes |
| Previous known-good commit/image known | Yes |
| Database backup plan confirmed | Yes |
| Migration plan confirmed | If applicable |
| CI required checks green | Yes, unless explicitly conditional and non-production-blocking |
| Staging smoke passed | Yes |
| Monitoring window staffed | Yes |

## Production Release Steps

1. Reconfirm production freeze restrictions and release scope.
2. Confirm no new commits landed after the verified release candidate, or restart verification.
3. Confirm backup completion when data or migration risk exists.
4. Execute the approved production deployment workflow or runbook.
5. Do not manually patch production outside the recorded release path.
6. Record deployment start time, end time, commit/image, operator, and approver.

## Post-Release Observation

| Check | Window |
| --- | --- |
| API health and web health | Immediate and every 5 minutes during initial window. |
| Error logs | First 30 minutes minimum. |
| Auth/RBAC failures | First 30 minutes minimum. |
| Affected business path | Immediate smoke after deploy. |
| Third-party integration | If affected, verify sandbox/production callback or sync status. |

## Log And Health Checks

1. Check API logs for 5xx spikes, auth errors, migration errors, and unmasked secrets.
2. Check web logs for rendering errors and failed API calls.
3. Check database connection health and migration status if any migration ran.
4. Check external interface logs for signature failures or rate-limit bursts.

## Failure Handling

| Failure | Action |
| --- | --- |
| Health check fails | Stop rollout, collect logs, prepare rollback. |
| Auth/RBAC regression | Stop rollout, classify as HOLD or ROLLBACK depending on exposure. |
| Data integrity risk | Stop rollout, freeze writes if needed, involve A5 and approver. |
| Third-party signature/sync failure | Stop affected integration path, involve A2/A3. |
| Migration failure | Do not retry blindly; follow rollback runbook and DBA review. |

## Release Authority

Production release approval must come from the designated business owner plus technical release owner. A7-Final-QA-Gate records the final recommendation; Codex-Orchestrator records the decision packet.

## Mandatory Stop Conditions

1. Any unresolved P0/P1 issue.
2. Any unapproved frozen item touched.
3. Missing rollback plan for data, migration, auth, finance, or integration changes.
4. Failed required CI check.
5. Missing production approver.
6. Evidence that the release candidate differs from what was verified.
