# Production Deploy Chain Hardening Plan

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_HARDENING_DRY_RUN_APPROVAL.

The production deploy chain remains HOLD until remote checkout drift, Nginx hardening state, backup artifacts, push-main behavior, and rollback ownership are reconciled. This plan does not deploy, push, restart, mutate Nginx, or change production configuration.

## Source Evidence

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`
- `docs/ops/PRODUCTION_GO_NO_GO.md`
- `docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`

## Current Risks

| Severity | Risk | Evidence |
| --- | --- | --- |
| P1 | Remote checkout dirty | `nginx/erp.eggslao.com.conf` modified and backup files untracked |
| P1 | Push-main can trigger production deployment | `deploy.yml` exists and must remain gated |
| P1 | On-host Nginx hardening may be overwritten by blind deploy | `/uploads` hardening was applied on host |
| P2 | Staging path exists but must not be conflated with production | `staging-deploy.yml`, `docker-compose.staging.yml` |

## Hardening Dry-Run Scope

The next dry-run should:

1. Snapshot remote git status.
2. Classify every dirty/untracked file as:
   - source-controlled candidate,
   - backup artifact,
   - runtime-only artifact,
   - manual review required.
3. Produce a proposed reconciliation manifest.
4. Produce a rollback manifest.
5. Propose whether Nginx hardening should be source-controlled.
6. Confirm push/deploy workflow trigger boundaries.

## Forbidden Until Execution Approval

- Do not run `git checkout`, `git reset`, `git clean`, or file delete on the server.
- Do not push.
- Do not deploy.
- Do not restart.
- Do not reload Nginx.
- Do not mutate compose/env files.
- Do not run migration.
- Do not write DB.

## A6 Acceptance Criteria

1. Remote dirty files are classified.
2. A safe reconciliation plan exists.
3. Rollback owner and rollback commands are documented.
4. Deploy and push paths are explicitly separated.
5. Staging and production gates use different language, evidence, and approvals.

## A2 Acceptance Criteria

1. `/uploads` hardening is not weakened.
2. Nginx source-control reconciliation does not expose raw files.
3. Production secrets are not printed or committed.
4. No deployment bypass is introduced.

## A1 Acceptance Criteria

1. W5 static gates pass after docs update.
2. Any future script added for deploy-chain inspection is syntax-checked.
3. Dry-run evidence is recorded under `docs/ops/runs/**`.

## Next Gate

`APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN`

This next Gate should remain read-only and produce a reconciliation manifest only.
