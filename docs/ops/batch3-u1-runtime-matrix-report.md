# Batch 3 U1 Runtime Authorization Matrix

- Baseline: `8b127efad80c799c79e7ee6285768b3b1d0a1377` (worktree HEAD `2ec1ff30b20ac48cc7665a9e7acebff43f3b5885`)
- Production database: not accessed.
- Disposable PG16 runtime: **BLOCKED**. Compose requires an unset `JWT_SECRET`; existing real identity suite is gated and requires PG18 (`PACKAGING_HISTORY_PG=1`, port 55432, server version 180006).
- Static/unit evidence: 6 suites, 39 tests passed (JWT status/version, DataScope guard/service, Generic CRUD, AP, AR).

## Classification

- `CONFIRMED_VULNERABILITY`: none reproduced.
- `POTENTIAL_RISK`: JWT account/perms DB lookup continues on non-auth DB errors (`apps/api/src/auth/jwt.strategy.ts:123-126`); DataScope converts bigint-capable user IDs with `parseInt` (`apps/api/src/modules/org/services/data-scope.service.ts:148`); standalone PhoenixJwtGuard does not perform DB status/version checks but has no current controller use.
- `TEST_COVERAGE_GAP`: no disposable PG16 runtime matrix for organization user-scopes, Generic CRUD cross-company CRUD, WMS/AR/AP IDOR, or store-payment attachment ownership.

## Gate

`READY_FOR_U1_MATRIX=BLOCKED_ENV`; no code fix or integration performed.

## Environment follow-up

A disposable `postgres:16.14-alpine` container was started on host port `55436` with a temporary trust-auth database and no production connectivity. Probe returned:

`phoenix_erp_u1|160014|off`

The container was stopped after the probe. This confirms PG16 startup is available. Full API/runtime probes remain unavailable because the repository's bootstrap path requires a populated schema and the existing identity integration suite is PG18-specific; no credentials or production endpoints were used.

## Full disposable PG16/API probe (U1)

- Disposable PostgreSQL `16.14` (`server_version_num=160014`), database `phoenix_erp_u1`, host port `55437`.
- API test process on port `33102`; `/api/health` returned `status=OK`, `db.connected=true`, `jwt.loaded=true`, `jwt_fallback_in_use=false`.
- SQL bootstrap and TypeORM migrations completed after API build: 169 bridged SQL migrations plus 88 TypeORM migrations.
- Disposable E2E identities were seeded with a process-only password; no secret is recorded here.

HTTP probes:

- Unauthenticated `/api/organizations/user-scopes/41`: `401`.
- `ROLE_STORE_MGR` `/api/crud/sys_user?limit=1`: `403`.
- `ROLE_WMS_OP` `/api/inbound/pending`: `200` (authorized read).
- `ROLE_STORE_MGR` `/api/inbound/pending`: `403` (permission denial).
- Unknown store payment attachment: `404 STORE_PAYMENT_ATTACHMENT_NOT_FOUND`.
- Existing WMS token after disposable `status=0`: `401 USER_DISABLED`.
- Same token after disposable `perms_version` increment: `401 PERMS_CHANGED`.
- `organization user-scopes/:userId` with `MENU_MD_ORG:V` returned `200` and empty arrays for arbitrary IDs. Classified as a coverage/design decision pending an explicit disclosure policy, not a confirmed vulnerability.

`READY_FOR_U1_MATRIX=YES` for the executed disposable probes; no confirmed vulnerability, no code fix.
