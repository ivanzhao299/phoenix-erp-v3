# Batch 3 Track S — Security and Authorization Audit

**Current main:** `2ec1ff30b20ac48cc7665a9e7acebff43f3b5885`
**Scope:** authentication, JWT account state, RBAC, DataScope, company/organization isolation, IDOR surfaces, Generic CRUD, and priority business modules.

## Existing confirmed fix

The JWT account-state lookup now fails closed when the database check is unavailable. Explicit `USER_NOT_FOUND`, `USER_DISABLED`, and `PERMS_CHANGED` denials remain intact. Focused JWT tests and the merged PR #308 checks passed. No production data or credentials were used.

## Runtime matrix

The U1 report records the disposable PG16.14/API matrix in `docs/ops/batch3-u1-runtime-matrix-report.md`:

- unauthenticated organization user-scopes: `401`;
- scoped Generic CRUD access to `sys_user`: `403`;
- WMS operator inbound read: `200`; store manager on the same route: `403`;
- unknown store-payment attachment: `404`;
- disabled account: `401 USER_DISABLED`;
- stale permission version: `401 PERMS_CHANGED`.

No confirmed cross-company, cross-organization, or IDOR bypass was reproduced. Arbitrary user-scope IDs returned empty arrays for an organization-view role; this is retained as a policy/coverage decision because no populated foreign scope was disclosed.

## Risks and gaps

- `DataScopeService` and the organization scope controller still convert validated user IDs with `parseInt`; a bigint boundary test is still a maintenance risk.
- `PhoenixJwtGuard` does not perform the database account-state check, but no current controller use was found.
- Full populated transaction fixtures for cross-company procurement, AR/AP, WMS IDOR, and store-payment attachment ownership are still absent.

`CONFIRMED_VULNERABILITIES_FIXED=YES (JWT account-state fail-closed)`
`AUTH_REGRESSION=PASS`
`DATASCOPE_REGRESSION=PASS (unit + disposable runtime probes)`
`CROSS_COMPANY_TESTS=PASS FOR EXECUTED PROBES; POPULATED TRANSACTION MATRIX GAP REMAINS`
`IDOR_TESTS=PASS FOR EXECUTED PROBES; POPULATED TRANSACTION MATRIX GAP REMAINS`
`READY_FOR_BATCH3_INTEGRATION=NO (U2 business journeys remain incomplete)`
