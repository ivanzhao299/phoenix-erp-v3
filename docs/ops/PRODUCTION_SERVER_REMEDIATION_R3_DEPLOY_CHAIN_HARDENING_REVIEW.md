# Production Server Remediation R3 - Deploy Chain Hardening Review

Date: 2026-06-24

## Conclusion

Current conclusion: HOLD FOR DEPLOY-CHAIN HARDENING.

The deploy-chain review was read-only. It confirmed running containers are healthy, but the remote app checkout has local Nginx config modifications and backup files. Deployment, restart, push, and config mutation were not executed.

## Evidence

Remote evidence directory:

`/opt/phoenix-erp-backups/remediation-r3-high-throughput-batch1-20260624-124012`

Local evidence files:

- `docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/deploy_chain_file_review.txt`
- `docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/deploy_chain_readonly_review.txt`

## Running Containers

Observed Phoenix containers:

- `phoenix-v3-web`: healthy
- `phoenix-v3-api`: healthy
- `phoenix-v3-db`: healthy

Other unrelated production containers were present on the same host and were not modified.

## Remote Checkout State

| Field | Value |
| --- | --- |
| remote branch | `main` |
| remote commit | `7507b12a` |
| modified files | `nginx/erp.eggslao.com.conf` |
| untracked files | `docker-compose.yml.bak-20260522-180813`, Nginx backup files |

## Migration History

Recent DB history includes Store Payment and File Metadata migrations:

- `1782042418112 CreateFileMetadata`
- `1782041418112 CreateStorePaymentTables`

## Workflow / Deploy Surface

Observed workflow files:

- `ci-build.yml`
- `ci-security.yml`
- `ci-smoke.yml`
- `deploy.yml`
- `dump-prod-schema.yml`
- `regression.yml`
- `staging-deploy.yml`

Observed deploy files:

- `deploy/server-setup.sh`
- `deploy/staging/README.md`
- `docker-compose.staging.yml`
- `docker-compose.yml`

## Findings

| Severity | Finding |
| --- | --- |
| P0 | None proven by read-only review. |
| P1 | Remote checkout is dirty because Nginx hardening was applied on-host and backup files remain untracked. |
| P1 | `push main` / deploy path must remain gated because production deployment automation exists. |
| P2 | Staging deploy path exists, but it should not be treated as production-safe without a deploy-chain Gate. |

## A6 Review

Conclusion: HOLD FOR HARDENING PLAN.

The next action should be a deploy-chain hardening plan that reconciles on-host Nginx hardening changes with source-controlled deploy assets without triggering production deployment.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

Raw `/uploads` public exposure appears hardened through Nginx, but the remote dirty checkout must not be overwritten by a blind deploy.

## A1 Review

Conclusion: PASS WITH CONDITIONS.

Read-only evidence exists. No deploy, restart, push, migration, DB write, Nginx change, or env change occurred in this batch.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Nginx changed | No |
| Env changed | No |
| DB write | No |
| Migration executed | No |

## Next Recommended Gate

`APPROVE_DEPLOY_CHAIN_HARDENING_PLAN`

This should stay planning-only until the user explicitly approves any config, deploy, restart, or push action.
