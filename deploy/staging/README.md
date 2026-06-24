# Phoenix ERP Staging Deploy Skeleton

This directory documents the staging-only Store Payment controlled pilot deployment path.

## Boundaries

1. This is not production.
2. Do not push `main` to trigger `.github/workflows/deploy.yml`.
3. Use `.github/workflows/staging-deploy.yml` with GitHub Environment `staging`.
4. Configure only `STAGING_*` secrets.
5. Do not reuse production secrets.
6. DB migration, menu/role sync, and file fixture creation are disabled by default and require separate Gates.

## Required Files

1. `.github/workflows/staging-deploy.yml`
2. `.env.staging.example`
3. `docker-compose.staging.yml`
4. `docs/ops/STORE_PAYMENT_STAGING_TARGET_REQUIRED_INPUTS.md`
5. `docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_V2.md`

## Required GitHub Environment

Create GitHub Environment:

- `staging`

Enable required reviewers before workflow jobs can access staging secrets.

## Required Secrets

Configure these only under the `staging` environment:

1. `STAGING_HOST`
2. `STAGING_USER`
3. `STAGING_SSH_KEY`
4. `STAGING_DEPLOY_PATH`
5. `STAGING_DATABASE_URL`
6. `STAGING_FILE_STORAGE_PATH`
7. `STAGING_API_ENV`
8. `STAGING_WEB_ENV`

## Execution

Run the workflow manually:

1. Open GitHub Actions.
2. Select `Staging Deploy - Store Payment Controlled Pilot`.
3. Choose `w5-codex-orchestrator` or a `staging/*` branch.
4. Keep migration/menu/fixture inputs false unless their separate Gates are approved.
5. Set `deploy_application=true` only after staging target inputs are complete.

## Production Hold

Production deployment remains HOLD until a separate A7 production release Gate.
