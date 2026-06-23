# Next Actions

Last updated: 2026-06-23

1. `USER_APPROVES_STAGING_TARGET_DERIVED_FROM_SERVER_CARD`.
2. `USER_APPROVES_SAME_HOST_STAGING_ISOLATION_OR_PROVIDES_SEPARATE_STAGING_HOST`.
3. `USER_CONFIGURES_GITHUB_STAGING_SECRETS`.
4. `USER_APPROVES_STAGING_WORKFLOW_RUN`.
5. `STAGING_DEPLOY_EXECUTION_GATE`.

## Recommended Immediate Sequence

1. Decide whether the production host may be used as a same-host staging candidate.
2. If yes, approve strict isolation: `/opt/phoenix-erp-staging`, `phoenix_erp_staging`, and `/data/phoenix-erp-staging/files`.
3. Configure GitHub Environment `staging` with approval reviewers.
4. Provide `STAGING_*` secrets listed in `docs/ops/STORE_PAYMENT_GITHUB_STAGING_SECRETS_SETUP_FROM_SERVER_CARD.md`.
5. Keep `/uploads` and raw URL exposure forbidden.
6. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
