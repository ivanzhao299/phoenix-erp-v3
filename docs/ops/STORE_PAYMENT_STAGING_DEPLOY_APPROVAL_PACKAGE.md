# Store Payment Staging Deploy Approval Package

Date: 2026-06-23

## 1. Current Project Stage

Current stage: `STORE_PAYMENT_CONTROLLED_PILOT_READY`.

Active decision: GO WITH CONDITIONS.

This package prepares user approval for Store Payment staging deployment. It does not deploy, push, write remote DB, run staging migration, run production migration, seed, cleanup, reset, or modify business code.

## 2. A7 Final QA Gate Conclusion

A7 Final QA Gate conclusion: GO WITH CONDITIONS.

Confirmed:

1. Store Payment controlled pilot is allowed with conditions.
2. Staging deploy may be requested.
3. Production deploy remains blocked.
4. Push remains blocked.
5. Remote DB write remains blocked.
6. Production migration remains blocked.
7. A2 final: PASS WITH CONDITIONS.
8. A1 final: PASS WITH CONDITIONS.
9. A5 final: GO WITH CONDITIONS.

## 3. Controlled Pilot Conditions

The controlled pilot is limited to:

1. `STORE-VTE-001 / 万象直营店`.
2. `COMP-LAO-AGRI`.
3. Store Payment protected attachment endpoints only.
4. no naked raw URL.
5. no `/uploads` exposure.
6. no `storage_path` exposure.
7. UAT fixtures clearly separated from real business evidence.
8. staging deployment only after explicit approval.
9. push only after explicit approval.
10. remote DB writes / migrations only after explicit Gate approval.

## 4. Staging Deploy Goal

Prepare a safe, auditable approval path to deploy Store Payment to a staging environment for controlled business UAT, without granting production release or automatic infrastructure changes.

## 5. Staging Deploy Scope

In scope after explicit approval:

1. Push candidate branch / main to remote if approved.
2. Confirm staging environment readiness.
3. Confirm staging DB backup.
4. Confirm and, if separately approved, execute staging DB migration.
5. Confirm and, if separately approved, sync Store Payment menu / role data.
6. Configure staging file storage if approved.
7. Deploy API/Web to staging if approved.
8. Execute staging smoke and business UAT.

## 6. Not Included

This approval package does not include:

1. actual push.
2. actual staging deploy.
3. actual staging DB migration.
4. actual remote DB write.
5. production deployment.
6. production migration.
7. seed.
8. cleanup.
9. reset.
10. destructive data operation.
11. broad rollout beyond `STORE-VTE-001`.

## 7. Required User Approvals

The user must explicitly approve or reject:

1. push to remote.
2. staging deploy.
3. staging DB migration.
4. staging menu / role sync.
5. staging file storage configuration.
6. staging file metadata verification / fixture setup.
7. staging `STORE-VTE-001 / COMP-LAO-AGRI` verification.
8. staging UAT users and role scope.
9. protected attachment staging smoke.
10. business UAT users and schedule.
11. production decision, default HOLD.

## 8. Recommended Execution Sequence

| Step | Action | Risk | Responsible Agent | Human Confirmation | Auto Execute |
| --- | --- | --- | --- | --- | --- |
| 1 | Review push approval package, do not push | L1 | Codex-Orchestrator | Yes | No |
| 2 | Staging env readiness check | L2 | A6 | Yes | No |
| 3 | Staging DB backup confirmation | L4 | A6 + A5 | Yes | No |
| 4 | Staging migration approval | L5 | A1 + A2 + A6 | Yes | No |
| 5 | Staging menu / role sync approval | L4 | A2 + A5 | Yes | No |
| 6 | Staging file storage configuration approval | L4 | A2 + A6 | Yes | No |
| 7 | Staging deploy approval | L4 | A6 | Yes | No |
| 8 | Staging smoke | L3 | A1 + A2 + A5 | Yes | No |
| 9 | Business UAT user scope approval | L3 | A5 + A2 | Yes | No |
| 10 | Controlled pilot business UAT | L3 | A4 + A5 + A2 + A1 | Yes | No |
| 11 | Production decision, default HOLD | L5 | A7 | Yes | No |

## 9. Rollback Per Step

| Step | Rollback Plan |
| --- | --- |
| Push | Revert via normal git revert or stop before deployment; no force push |
| Staging env check | No runtime change; record failed readiness |
| DB backup | No runtime change; do not proceed without backup |
| Staging migration | Use approved migration down() or DB restore under rollback Gate |
| Menu / role sync | Remove or disable Store Payment grants under approved access rollback Gate |
| File storage | Disable protected preview/download and remove staging-only fixture references |
| Staging deploy | Revert staging to previous commit |
| Staging smoke | No rollback unless smoke wrote approved UAT fixtures |
| Business UAT | Pause pilot, disable menu/roles/accounts, preserve evidence |
| Production decision | Default HOLD; no rollback because no action |

## 10. Validation Per Step

| Step | Validation |
| --- | --- |
| Push | remote commit hash matches approved hash |
| Env readiness | env variables, host, service ports, storage roots verified |
| DB backup | backup timestamp and restore owner confirmed |
| Migration | tables/columns/indexes exist, no unexpected data changes |
| Menu / role sync | `MENU_STORE_PAYMENT*` and role grants present |
| File storage | protected file root configured, no `/uploads` exposure |
| Deploy | API/Web health, `/store-payment`, menu visibility |
| Smoke | API/Web typecheck, W5 gate, attachment no-auth 401, missing 404 |
| Business UAT | role-based workflows pass for clerk, manager, finance, admin |
| Production decision | A7 GO/HOLD/ROLLBACK report |

## 11. Responsible Agents

| Area | Agent |
| --- | --- |
| Approval package | Codex-Orchestrator |
| CI / typecheck / gates | A1-CI-Runtime-Gate |
| Security review | A2-Security-Regression-Gate |
| Backend defect response if needed | A3-Backend-Critical-Path |
| Frontend defect response if needed | A4-Frontend-UIUX-UAT |
| Data readiness | A5-Data-Readiness |
| Staging runbook / deploy execution plan | A6-Staging-Deploy-Runbook |
| Final GO/HOLD/ROLLBACK | A7-Final-QA-Gate |

## 12. Final Recommendation

Recommendation: READY_FOR_USER_APPROVAL.

The safest next step is to ask the user to approve or reject each item in `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_MATRIX.md`. No staging deployment, push, or remote DB action should run until those approvals are explicit.
