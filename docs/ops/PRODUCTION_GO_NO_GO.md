# Production Go/No-Go Standard

> Purpose: classify release readiness into four final decisions.

## Decision Summary

| Decision | Meaning | Production action |
| --- | --- | --- |
| GO | Release is approved for production. | Proceed through approved production runbook. |
| GO WITH CONDITIONS | Release may proceed only under listed constraints, usually gray rollout or extra monitoring. | Proceed only after conditions are accepted by approver. |
| HOLD | Release must pause. | Do not deploy; resolve blockers and re-verify. |
| ROLLBACK | Current release is unsafe or has regressed. | Execute rollback runbook. |

## GO Conditions

All must be true:

1. Required CI checks passed.
2. Staging deployment and smoke passed where applicable.
3. No unresolved P0/P1 defects.
4. No unapproved frozen item touched.
5. Rollback plan and owner are recorded.
6. Production approver is recorded.
7. Security/data/finance/third-party checks relevant to the scope passed.

## GO WITH CONDITIONS Conditions

Allowed only when all are true:

1. No P0/P1, no security bypass, no data integrity risk.
2. Remaining gaps are explicit and accepted, such as limited monitoring evidence or non-critical CI pending.
3. Gray release or limited blast radius is defined.
4. Rollback can be executed quickly.
5. Approver accepts the conditions in writing.

Examples:

| Condition | Required control |
| --- | --- |
| CI pending but local verification passed | CI must pass before merge or production if it covers release-critical paths. |
| Limited staging data | Gray rollout and post-release data checks required. |
| Low-risk docs/process-only change | Production action may be unnecessary; record no-deploy decision. |

## HOLD Conditions

Any one is enough:

1. Required CI failed or is missing for high-risk scope.
2. Staging smoke failed.
3. Rollback plan is missing.
4. Frozen item touched without approval.
5. Security, finance, master data, third-party, or migration impact is unresolved.
6. Release candidate changed after verification.
7. Approver is missing.

## ROLLBACK Conditions

Any one is enough after deployment:

1. Auth/RBAC bypass, privilege escalation, or secret exposure.
2. Data loss, corruption, or unsafe financial result.
3. Critical workflow unavailable for production users.
4. Migration caused production incompatibility.
5. Third-party sync/signature failure creates business or data risk.
6. Error rate/health checks exceed agreed threshold and cannot be stabilized inside the observation window.

## Decision Record Template

| Field | Value |
| --- | --- |
| Requirement/PR |  |
| Commit/image |  |
| Decision | GO / GO WITH CONDITIONS / HOLD / ROLLBACK |
| Approver |  |
| Conditions |  |
| Rollback owner |  |
| Monitoring window |  |
| Evidence links |  |
