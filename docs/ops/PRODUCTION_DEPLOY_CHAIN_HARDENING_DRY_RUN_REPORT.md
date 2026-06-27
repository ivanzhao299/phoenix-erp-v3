# Production Deploy Chain Hardening Dry-Run Report

Date: 2026-06-24

## Scope

This report executes the planning-only `PRD-P0-003` deploy-chain hardening dry-run.

Allowed:

- Read existing local workflow/deploy files.
- Attempt read-only remote status refresh.
- Produce a reconciliation and hardening manifest.
- Record HOLD / condition items.

Forbidden:

- Push.
- Deploy.
- Restart.
- Nginx reload.
- Remote config mutation.
- DB write.
- Migration.
- Cleanup / reset.

## Evidence

Local evidence:

- `docs/ops/runs/deploy-chain-hardening-dry-run-20260624-1530/manifest.json`
- `docs/ops/runs/deploy-chain-hardening-dry-run-20260624-1530/remote_deploy_chain_readonly.txt`
- `docs/ops/runs/deploy-chain-hardening-dry-run-20260624-1530/remote_deploy_chain_readonly.exit`
- `docs/ops/runs/deploy-chain-hardening-dry-run-20260624-1530/remote_repo_status_short.txt`
- `docs/ops/runs/deploy-chain-hardening-dry-run-20260624-1530/remote_repo_status_short.exit`

Source reports:

- `docs/ops/PRODUCTION_DEPLOY_CHAIN_HARDENING_PLAN.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`

## Remote Evidence Refresh

Result: HOLD.

Two read-only SSH attempts were made with single-command, low-concurrency mode:

1. Full deploy-chain read-only probe: failed with `Connection closed by 47.236.122.224 port 22`.
2. Short repo-status probe: failed with `Connection timed out during banner exchange`.

No remote write, deploy, restart, reload, cleanup, push, migration, or DB write was attempted.

This means the previous R3 remote evidence remains the latest usable remote deploy-chain evidence, but it could not be refreshed in this Gate.

## Last Known Remote Deploy-Chain State

From `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_DEPLOY_CHAIN_HARDENING_REVIEW.md`:

- Remote branch: `main`.
- Remote commit: `7507b12a`.
- Modified file: `nginx/erp.eggslao.com.conf`.
- Untracked files include `docker-compose.yml.bak-20260522-180813` and Nginx backup files.
- Containers observed healthy in previous review: `phoenix-v3-web`, `phoenix-v3-api`, `phoenix-v3-db`.
- No deploy/restart/push/migration/DB write occurred in the previous review.

## Local Deploy Surface

Observed local files:

- `.github/workflows/deploy.yml`
- `.github/workflows/staging-deploy.yml`
- `docker-compose.yml`
- `docker-compose.staging.yml`
- `deploy/server-setup.sh`
- `deploy/staging/README.md`

## Push/Main Risk

`deploy.yml` listens to:

- `push` on `main`
- `pull_request` on `main`
- `workflow_dispatch`

The workflow can select `api`, `web`, `full`, or `fast-css` modes, and API / full modes can run migration. Therefore:

- `push main` remains a production-affecting action.
- Any future push to `main` requires an explicit approval Gate and A6/A7 release decision.
- The current remediation work must not use `push main` as a routine sync mechanism.

## Staging Workflow Boundary

`staging-deploy.yml` exists and is manually triggered by `workflow_dispatch`.

Current useful controls:

- It is bound to `environment: staging`.
- It only allows `w5-codex-orchestrator` or `staging/*` source branches.
- Optional Store Payment migration/menu/file gates are disabled by default and currently fail closed when requested.
- `deploy_application=false` results in a documented no-deploy path.

Condition:

- Staging secrets and a real staging target still require user approval and environment provisioning.
- The staging workflow must not reuse production DB, production file storage, or production secrets without explicit approval.

## Reconciliation Manifest

| Item | Classification | Proposed Handling | Risk | Approval Required |
| --- | --- | --- | --- | --- |
| `nginx/erp.eggslao.com.conf` remote modified | Source-controlled candidate or host-only hardening delta | Refresh remote diff, compare with local Nginx policy, then decide whether to source-control the hardening or preserve as host-only runtime config | P1 | Yes |
| Nginx backup files | Backup artifact | Keep outside Git checkout or move to approved backup path only after explicit approval | P2 | Yes |
| `docker-compose.yml.bak-*` | Backup artifact | Keep outside Git checkout or document as rollback artifact; do not delete automatically | P2 | Yes |
| `deploy.yml` push-main trigger | Production deploy trigger | Keep HOLD for push-main until deploy-chain decision is approved | P1 | Yes |
| `staging-deploy.yml` | Staging-only manual workflow | Keep as explicit manual workflow; do not convert to automatic push trigger | P2 | Yes before real staging |

## A6 Review

Conclusion: HOLD FOR REMOTE REFRESH / GO WITH CONDITIONS FOR LOCAL PLAN.

The local plan confirms the deploy-chain risk boundaries, but remote checkout drift cannot be safely reconciled until SSH command-level reliability is stable enough to refresh evidence.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

Conditions:

1. Do not overwrite remote Nginx hardening with a blind deploy.
2. Do not re-enable public `/uploads`.
3. Do not print or commit production secrets.
4. Keep `push main` gated.

## A1 Review

Conclusion: PASS WITH CONDITIONS.

Conditions:

1. Remote refresh failed due SSH connection instability.
2. W5 gate must remain required after any deploy-chain document or script change.
3. No production deploy or restart evidence can be claimed from this dry-run.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Push executed | No |
| Deploy executed | No |
| Restart executed | No |
| Nginx reload executed | No |
| Remote config changed | No |
| DB write executed | No |
| Migration executed | No |
| Cleanup/reset executed | No |

## Current Conclusion

HOLD WITH CONDITIONS.

`PRD-P0-003` has a valid local hardening manifest, but remote reconciliation cannot proceed until a fresh remote status/diff probe succeeds.

## Next Recommendation

1. Keep `push main` and production deploy HOLD.
2. Run a narrowly scoped SSH stabilization / remote status refresh Gate before any deploy-chain execution.
3. Continue `PRD-P0-004 LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` only as read-only unless the user approves a runtime probe requiring upload or restart.
