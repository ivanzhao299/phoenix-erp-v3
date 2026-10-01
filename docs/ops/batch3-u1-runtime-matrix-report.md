# Batch 3 U1 — Runtime Authorization Matrix

**Baseline:** `2ec1ff30b20ac48cc7665a9e7acebff43f3b5885`
**Environment:** disposable PostgreSQL 16.14 (`server_version_num=160014`), API `:33102`; production was not contacted.

## Runtime evidence

- SQL bootstrap and TypeORM migrations completed in the isolated database (169 bridged SQL migrations plus 88 TypeORM migrations).
- API `/api/health` returned `status=OK`, `db.connected=true`, `jwt.loaded=true`, and `jwt_fallback_in_use=false`.
- Unauthenticated organization user-scope request: `401`.
- Scoped store manager reading `sys_user` through Generic CRUD: `403`.
- WMS operator reading inbound pending work: `200`; store manager on the same route: `403`.
- Unknown store-payment attachment: `404 STORE_PAYMENT_ATTACHMENT_NOT_FOUND`.
- A disposable WMS token was rejected with `401 USER_DISABLED` after account disablement and `401 PERMS_CHANGED` after a permission-version bump.
- Organization user-scope lookup for arbitrary IDs returned `200` empty arrays for a role holding the organization view permission. This remains a product-policy/design decision and coverage item; no disclosure of another user's populated scope was reproduced.

## Classification

- `CONFIRMED_VULNERABILITY`: none reproduced in the runtime matrix.
- `POTENTIAL_RISK`: bigint user-ID conversion via `parseInt` in DataScope and organization scope lookup; dormant `PhoenixJwtGuard` lacks DB state checks but has no current controller use.
- `TEST_COVERAGE_GAP`: full populated cross-company transaction fixtures for procurement, AR/AP, WMS IDOR, and store-payment attachment ownership remain absent.

`READY_FOR_U1_MATRIX=YES`
`PRODUCTION_DB_WRITES=0`
`CODE_FIXES=0`
