# Store Payment Staging Deploy Approval V2

Date: 2026-06-23

## 1. Why Deployment Cannot Execute Yet

The previous deploy attempt was HOLD because:

1. no staging-only workflow existed.
2. no staging DB connection was available.
3. no staging file storage path was available.
4. no staging SSH/env target was available.
5. `.github/workflows/deploy.yml` deploys on `push main` and uses `environment: production`.

## 2. Staging-Only Channel Added

This Gate adds:

1. `.github/workflows/staging-deploy.yml`
2. `.env.staging.example`
3. `docker-compose.staging.yml`
4. `deploy/staging/README.md`
5. `docs/ops/STORE_PAYMENT_STAGING_TARGET_REQUIRED_INPUTS.md`

The staging workflow:

1. uses `workflow_dispatch`.
2. does not listen to `push main`.
3. uses GitHub Environment `staging`.
4. requires `STAGING_*` secrets.
5. does not use production secrets.
6. keeps migration/menu/fixture inputs false by default.
7. fails if a non-staging environment is detected.

## 3. Still Missing Real Target Parameters

Still missing:

1. `STAGING_HOST`
2. `STAGING_USER`
3. `STAGING_SSH_KEY`
4. `STAGING_DEPLOY_PATH`
5. `STAGING_DATABASE_URL`
6. `STAGING_FILE_STORAGE_PATH`
7. `STAGING_API_ENV`
8. `STAGING_WEB_ENV`
9. staging UAT user list.
10. staging DB backup policy.

## 4. User Approval Items

The user must approve:

1. GitHub Environment `staging` creation and reviewers.
2. staging secrets configuration.
3. staging DB migration Gate.
4. staging menu / role sync Gate.
5. staging file storage setup Gate.
6. staging file metadata / UAT fixture Gate.
7. staging application deployment Gate.
8. business UAT entry.

## 5. GitHub Secrets Checklist

Configure only in `staging`:

1. `STAGING_HOST`
2. `STAGING_USER`
3. `STAGING_SSH_KEY`
4. `STAGING_DEPLOY_PATH`
5. `STAGING_DATABASE_URL`
6. `STAGING_FILE_STORAGE_PATH`
7. `STAGING_API_ENV`
8. `STAGING_WEB_ENV`

## 6. GitHub Environment Checklist

GitHub Environment `staging` must:

1. require approval.
2. store only staging secrets.
3. not reference production secrets.
4. restrict reviewers to approved operators.
5. show manual workflow execution evidence.

## 7. Staging Deploy Sequence

Recommended sequence:

1. Configure GitHub Environment `staging`.
2. Configure `STAGING_*` secrets.
3. Run staging workflow with all optional write inputs false.
4. Confirm staging preflight.
5. Run separate staging DB migration Gate if approved.
6. Run separate menu / role sync Gate if approved.
7. Run separate file fixture Gate if approved.
8. Run staging deploy with `deploy_application=true`.
9. Run staging smoke.
10. Run business UAT.

## 8. Staging Migration Boundary

Migration remains a separate Gate.

Allowed scope after approval:

1. `store_payment_accounts`
2. `store_payment_records`
3. `file_metadata`

Forbidden:

1. production migration.
2. unrelated migration.
3. destructive migration.
4. cleanup / reset.

## 9. Menu / Role Sync Boundary

Menu / role sync remains a separate Gate.

Allowed:

1. `MENU_STORE_PAYMENT_ACCOUNT`
2. `MENU_STORE_PAYMENT`
3. `MENU_STORE_PAYMENT_CONFIRM`
4. `MENU_STORE_PAYMENT_VOID`
5. `MENU_STORE_PAYMENT_EXPORT`
6. corresponding pilot role grants.

Forbidden:

1. non-Store Payment menu changes.
2. all-group rollout.
3. production menu writes.

## 10. File Storage Boundary

Allowed after approval:

1. staging protected file root.
2. non-sensitive UAT proof / QR files.
3. `file_metadata` references for Store Payment UAT.

Forbidden:

1. raw URL exposure.
2. `/uploads` frontend links.
3. `storage_path` exposure.
4. production file writes.

## 11. Business UAT Scope

Approved scope remains:

1. `STORE-VTE-001 / 万象直营店`
2. `COMP-LAO-AGRI`
3. 店员
4. 店长
5. 财务
6. 管理员

## 12. Rollback

Rollback approach:

1. stop staging workflow before production.
2. revert staging branch or deployment to prior commit.
3. use DB backup / migration down only under rollback Gate.
4. disable Store Payment menu/roles in staging.
5. disable protected attachment preview/download in staging.
6. remove UAT fixtures only under approved cleanup Gate.

## 13. Production HOLD

Production remains HOLD.

The staging workflow does not approve:

1. production deploy.
2. production migration.
3. production DB write.
4. push main.
