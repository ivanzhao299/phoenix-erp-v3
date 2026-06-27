# Production Readiness Remediation Batch - 2026-06-25

## Scope

This batch addresses the next P0/P1 production-readiness items from the audit backlog with local source changes first, then validation, push, CI/CD, and production health checks.

## Completed Changes

### P0/P1 Permissions And Frontend Gates

- Added strict `MenuGuard` / `RequireMenu` protection to:
  - `GET/POST/PUT/PATCH /api/permissions/**`
  - `GET/POST/PUT/DELETE /api/permission-sets/**`
- Permission management now requires `MENU_SETTINGS_IT`.
  - Read-only inspection: `V`
  - Create: `C`
  - Update / bind / unbind / status changes: `E`
  - Delete: `D`
- Notification config endpoints now require explicit system permissions:
  - Rule/template/channel config: `MENU_SYS_CONFIG`
  - Notification logs: `MENU_SYS_MONITOR`
  - Self preferences remain authenticated user operations.
- Presence / online user endpoints now require `MENU_SYS_MONITOR:V`.
- Frontend user impersonation now requires an audit reason before switching user context.

### P0/P1 Auth / RBAC / DataScope

- Impersonation is tightened:
  - Chained impersonation is blocked.
  - Target admin impersonation remains blocked.
  - An audit reason is mandatory and included in the audit entity id text.
- Inventory raw SQL read endpoints now run under `DataScopeGuard`.
- WMS raw SQL read lists now apply warehouse scope where the table has `warehouse_code`:
  - inbound dashboard
  - pending inbound
  - inbound task detail
  - inventory batches
  - receiving orders
- Procurement V2 review found list services already using `DataScopeHelper` for company / project scope. No schema changes were required in this batch.

### P0/P1 Chanjet / Finance External Interfaces

- Chanjet callback signature / timestamp / nonce verification was already present and remains fail-closed for POST callbacks.
- Generic Chanjet proxy calls are tightened from `MENU_SYS_CONFIG:V` to `MENU_SYS_CONFIG:E`.
- Manual certificate / ticket / ticket trigger / callback test endpoints are tightened to `MENU_SYS_CONFIG:E`.
- Generic Chanjet proxy calls now write `sys_operation_logs` audit rows on success and failure.
- Audit data is masked and does not store token / certificate / secret values.

### P1 File And Attachment Chain

- Current Store Payment and generic upload path review:
  - Generic `POST /api/upload/contract` writes `file_metadata`.
  - Response returns `fileId` and `rawUrl: null`.
  - Store Payment frontend blocks raw `http(s)` and `/uploads` refs.
  - Store Payment protected endpoints remain the approved preview / download path.
- Remaining risk:
  - Historical API static `/uploads` compatibility still exists internally and must remain on the backlog until all legacy consumers are migrated.

### P1 Production Data Readiness

Current code is ready for the next data-readiness pass. The next operational scan should verify:

- supplier
- project
- cash-account
- product / SKU
- bank-account
- warehouse
- Store Payment pilot accounts
- user role and DataScope mappings

No database write was performed in this batch.

### P1/P2 CI/CD And Ops Security

- Removed default admin/test passwords from scripts:
  - `scripts/seed-uat-users.sh`
  - `scripts/uat-runner.sh`
  - `scripts/smoke-test.sh`
  - `scripts/g5c-rbac-audit.sh`
  - `scripts/verify-docker-stack.sh`
- API docs generator no longer emits an `admin123` login example.
- Deployment workflows now use a separate proxy SSH secret:
  - `DEPLOY_PROXY_USER`
  - `DEPLOY_PROXY_SSH_KEY`
- Deployment workflows no longer default proxy user to `root` or reuse `DEPLOY_SSH_KEY` for proxy hops.

## Validation Commands

- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `git diff --check`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`

## Deployment Notes

- This batch modifies backend, frontend, scripts, docs, and GitHub Actions.
- A push to `origin/main` should trigger CI/CD.
- After CI/CD, verify:
  - API health
  - web container health
  - api container health
  - permission management pages
  - notification config pages
  - Chanjet diagnostics / proxy endpoints with appropriate roles
  - WMS list visibility for restricted warehouse users

## Remaining Backlog

### Next P0

1. Add a startup or CI audit for controller methods without `@RequireMenu` in sensitive modules.
2. Replace `ROLE_ADMIN` MenuGuard pass-through with a stricter `permissionsVersion` / token freshness check after confirming all admin JWT payloads carry the required version fields.
3. Complete legacy `/uploads` migration for non-Store Payment consumers and retire API static file exposure.
4. Add a production data-readiness runner that emits machine-readable gaps for supplier / project / cash-account / product / bank-account / warehouse.

### Next P1

1. Add per-endpoint frontend permission fixtures for high-risk buttons.
2. Add Chanjet proxy rate limiting and allowlisted path groups.
3. Add WMS outbound company/store scope filters after confirming `ord_orders` ownership columns in production.
4. Add rollback drill documentation for separated deploy key / proxy key operations.

## Conclusion

Current batch conclusion: `GO WITH CONDITIONS`.

No migration, DB write, seed, reset, production manual command, or destructive operation was executed in this batch.
