# Next Actions

Last updated: 2026-06-23

1. `USER_PROVIDES_STAGING_TARGET`.
2. `USER_CONFIGURES_GITHUB_STAGING_SECRETS`.
3. `USER_APPROVES_STAGING_WORKFLOW_RUN`.
4. `STAGING_DEPLOY_EXECUTION_GATE`.

## Recommended Immediate Sequence

1. Configure GitHub Environment `staging` with approval reviewers.
2. Provide `STAGING_*` secrets listed in `docs/ops/STORE_PAYMENT_STAGING_TARGET_REQUIRED_INPUTS.md`.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
