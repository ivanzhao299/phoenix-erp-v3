# Store Payment Staging Target Required Inputs

Date: 2026-06-23

The Store Payment staging controlled pilot cannot execute until these staging-only inputs are provided.

## Required Infrastructure Inputs

1. staging server host.
2. staging SSH user.
3. staging SSH key configuration method.
4. staging deploy path.
5. staging DB type.
6. staging DB host/address.
7. staging DB port.
8. staging DB user.
9. staging DB name.
10. staging DB backup method.
11. staging file storage path.
12. staging domain / URL.
13. API base URL.
14. Web base URL.
15. GitHub Environment `staging` approval enabled.

## Required GitHub Environment Secrets

Configure under GitHub Environment `staging` only:

1. `STAGING_HOST`
2. `STAGING_USER`
3. `STAGING_SSH_KEY`
4. `STAGING_DEPLOY_PATH`
5. `STAGING_DATABASE_URL`
6. `STAGING_FILE_STORAGE_PATH`
7. `STAGING_API_ENV`
8. `STAGING_WEB_ENV`

Do not use production secrets.

## Required Store Payment Data Inputs

1. Confirm whether staging already has `STORE-VTE-001`.
2. Confirm whether staging already has 万象直营店.
3. Confirm whether staging already has `COMP-LAO-AGRI`.
4. Confirm whether staging has Store Payment menu codes.
5. Confirm whether staging has Store Payment role grants.
6. Confirm whether staging has UAT users.
7. Confirm whether UAT users have correct store scope.
8. Confirm whether staging may execute Store Payment migrations.
9. Confirm whether staging may sync menu / role data.
10. Confirm whether staging may write UAT file metadata fixtures.

## Required UAT Inputs

1. staging UAT user list.
2. clerk user.
3. store manager user.
4. finance user.
5. administrator user.
6. approved UAT schedule.
7. non-sensitive proof / QR files allowed for staging.
8. issue feedback channel.
9. UAT acceptance owner.
10. rollback owner.

## Current Missing Inputs

As of this Gate:

1. staging server host: missing.
2. staging SSH user: missing.
3. staging SSH key: missing.
4. staging deploy path: missing.
5. staging DB connection: missing.
6. staging file storage path: missing.
7. staging GitHub Environment approval: not verified.
8. staging UAT users: missing.
9. staging Store Payment data readiness: not verified.

## Next Step

Provide the missing staging target values, then rerun a dedicated `STAGING_DEPLOY_EXECUTION_GATE`.
