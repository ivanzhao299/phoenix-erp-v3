# Batch 3 Track S — Security and Authorization Audit

**Baseline:** `8b127efad80c799c79e7ee6285768b3b1d0a1377`  
**Branch:** `codex/batch3-security-hardening`  
**Scope:** authentication, JWT account state, RBAC menu permissions, DataScope, company/organization isolation, IDOR surfaces, Generic CRUD, and priority business modules.

## Architecture and endpoint matrix

| Surface | Authentication | Permission gate | Row or write scope | Evidence / status |
|---|---|---|---|---|
| WMS inbound/outbound/inventory | `MenuGuard` JWT | `MENU_WMS_INOUT`, `MENU_WMS_VIEW`, `MENU_INV_BATCH` | `DataScopeGuard` plus warehouse predicates and write assertions | `apps/api/src/modules/wms/{inbound,outbound,inventory}.controller.ts`; `wms.service.ts`; protected and covered by existing specs |
| Finance AR/AP | `MenuGuard` JWT | module menu permissions | service ownership checks and company predicates | `apps/api/src/modules/finance-v2/*service.ts`; existing ownership regression coverage |
| Generic CRUD | controller JWT pipeline | table allowlist and operation-to-menu mapping | company/store/warehouse/breeding row filters and write checks | `apps/api/src/modules/generic-crud/generic-crud.controller.ts:177-205,395+`; existing allowlist/scope tests |
| Organization and user scopes | `MenuGuard` JWT | `MENU_ORG` or `MENU_USER` view | service-level organization reads | `apps/api/src/modules/org/organization.controller.ts:108-125`; disclosure intent needs explicit role matrix |
| JWT account state | Passport JWT | signature, expiry, `status=1`, `perms_version` | applies before controllers | `apps/api/src/auth/jwt.strategy.ts:108-139`; regression added in this track |

`MenuGuard` (`apps/api/src/common/guards/menu.guard.ts:51-111`) authenticates JWTs and enforces `@RequireMenu`; `DataScopeGuard` (`apps/api/src/modules/org/guards/data-scope.guard.ts:22-50`) fails closed when scope resolution throws. `DataScopeService` includes `perms_version` in its cache key and expands company, project, warehouse, farm, and site scope from organization bindings.

## Confirmed vulnerability and minimal fix

**P1 — JWT account-state lookup failed open on database errors.** Before this track, `JwtStrategy.validate()` caught non-authentication errors from the `sys_user` status/permission-version query and returned the token claims (`jwt.strategy.ts:123-126`). A database outage could therefore leave an otherwise valid token authenticated after account disablement or permission changes could no longer be checked. This is a confirmed control-flow defect; no production database was used.

The minimal fix now denies the token with the existing `INVALID_TOKEN` authentication response whenever the account-state lookup is unavailable. Explicit `USER_NOT_FOUND`, `USER_DISABLED`, and `PERMS_CHANGED` denials remain unchanged. Regression coverage is in `apps/api/src/auth/jwt.strategy.spec.ts` and proves both fail-closed lookup errors and active-account success.

## Existing protections verified

- Signature/expiry and account status/version checks are implemented in `JwtStrategy`; existing PostgreSQL identity tests cover `USER_DISABLED` and `PERMS_CHANGED` (`apps/api/src/auth/entity-alignment.pg.spec.ts:96-103`).
- `DataScopeGuard` returns `DATA_SCOPE_UNRESOLVED` on resolver failure (`apps/api/src/modules/org/guards/data-scope.guard.spec.ts:56-68`).
- Finance AR/AP detail and write paths call ownership assertions before acting; list queries retain company predicates.
- WMS detail queries and Generic CRUD inventory paths use DataScope/warehouse predicates; Generic CRUD uses an allowlist and blocks sensitive `sys_user` fields and runtime V2 tables.
- No unauthenticated bypass, cross-company read/write bypass, cross-organization bypass, or IDOR bypass was reproduced in this static pass. Runtime attack tests require disposable fixtures and remain outstanding.

## Potential risks and design improvements (not confirmed vulnerabilities)

1. **Bigint scope lookup:** `DataScopeService` converts the validated decimal user ID with `parseInt()` before querying `sys_user_orgs` (`data-scope.service.ts:148,156-163`). PostgreSQL bigint identities above JavaScript’s safe integer range need an isolated regression before changing this to a string/bigint parameter.
2. **Metadata coverage:** `DataScopeGuard` intentionally does nothing on routes without `@RequireMenu` (`data-scope.guard.ts:29-33`). A complete static route inventory should confirm that no sensitive controller relies only on this ordering contract.
3. **User-scope disclosure:** `GET /api/organizations/user-scopes/:userId` accepts an arbitrary ID for callers with `MENU_ORG:V` or `MENU_USER:V` (`organization.controller.ts:108-125`). Whether this is an administrative read or an information-disclosure defect needs an approved role matrix and a disposable negative test; it is not marked confirmed here.
4. **Dormant guard drift:** `apps/api/src/guards/phoenix-jwt.guard.ts:32-56` validates claims without the database state check, but no current `@UseGuards(PhoenixJwtGuard)` use was found in the searched API source. Any future use must either delegate to `JwtStrategy` or repeat the account-state check.

## Database impact

No schema or data migration. The change is application-only and uses the existing `sys_user.status` and `sys_user.perms_version` columns.

## Validation

- Focused API test: `pnpm --filter phoenix-erp-v3-nest test -- --runInBand src/auth/jwt.strategy.spec.ts` — **3 passed**.
- No production database, production account, deployment, or external write was used.
- Full API/Web typecheck, unit, integration, cross-company/org, IDOR, E2E, build, and lint gates remain required on the final integration head.

## Result

`CONFIRMED_VULNERABILITIES_FIXED=1 (JWT account-state fail-open)`  
`AUTH_REGRESSION=FOCUSED_PASS`  
`DATASCOPE_REGRESSION=EXISTING_TESTS_REVIEWED; FULL_RUNTIME_PENDING`  
`CROSS_COMPANY_TESTS=UNVERIFIED_RUNTIME`  
`IDOR_TESTS=UNVERIFIED_RUNTIME`  
`READY_FOR_BATCH3_INTEGRATION=NO` until the isolated runtime matrix and full gates run on the final integration head.
