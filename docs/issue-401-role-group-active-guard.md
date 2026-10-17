# Issue #401 / PR #411 — ACTIVE role GROUP admission correction

Authorization: 开发负责人2026-10-17直接授权执行令 Phase B. Starting PR HEAD72836778045dc5086819e42ce404374bc5ba61e1. This correction closes the reproduced independent deprecated-role GROUP → isGlobal failure; it does not rewrite authentication, JWT permissions or role assignment architecture.

## Correction

DataScopeService now gathers only matching enabled GROUP rules and re-reads their role_code from sys_role with status exactly ACTIVE. The lookup occurs before any cached role-global context and is shared by resolve and eligibleWarehouseRecipients. Missing/DEPRECATED/INACTIVE/NULL roles do not authorize GROUP; database failures propagate and deny rather than reuse cached authority. A second ACTIVE GROUP role remains valid. ROLE_ADMIN and independent ACTIVE organization GROUP/company/farm/warehouse grants retain their separate authority.

Non-GROUP scope rules and JWT menu claims are outside this narrowly authorized fix. It does not claim every deprecated-role permission is now revoked, nor remove the explicit admin fast path. No Auth/JWT, role assignment, schema migration, deployment workflow, production floor or Chanjet code is changed.

## Actual red/green evidence

A new owned PostgreSQL18 fixture uses the real JwtStrategy.validate account/version check and real DataScopeService/repositories. It requires a loopback issue411_role_fixture database and caller-created owner marker before its explicit synthetic schema and rows; no dotenv, application database or migrations. The original ACTIVE positive control and unchanged-claims DEPRECATED negative invariant are preserved; the former audit's early-return-only repository stubs are replaced with real repositories so the now-correct non-global path is actually exercised.

Before correction: 1 PASS / 9 FAIL. After correction: 10 PASS, including unchanged token claims/perms_version and warm cache, DEPRECATED/INACTIVE/NULL, deletion, ACTIVE restoration, mixed roles, separate organization GROUP, explicit company/farm/warehouse scopes, role-query outage and admin preservation. These call validate directly and do not claim full login or signature HTTP coverage.

The original 118-test permission/CRUD matrix plus the new 10 tests passes128/128. One older positive unit fixture assumed a GROUP rule needed no role database read; it now supplies an ACTIVE role and asserts exactly the live role query while retaining the global/no-organization-projection expectations. The HTTP/PG fixture likewise explicitly seeds the ACTIVE independent role. No negative assertion was relaxed.

API typecheck passed; changed-file lint has0 errors (warnings retained). Final post-main full regression, exact HEAD review and official13-check results are recorded in the coordinator's execution receipts after integration; no old PASS is inherited for changed code.

## Cost and governance

Ordinary organization paths with no matching role GROUP gain no role query. Matching role GROUP now adds one bounded parameterized role-code lookup: its scope-only total becomes2 DB reads rather than1, and candidate pages with matching GROUP gain one read (otherwise remain5). This deliberately rechecks status before global-cache reuse. Existing local microbench numbers for the former1-read role GROUP path are superseded for that branch; production load/SLO remains unmeasured.

The fixture's timestamptz columns remain legitimate static timestamp signals and require the delegated approved-label process; no rule weakening or ALLOW injection. The new HEAD invalidates prior approval applications and the old411-issue401-only.patch. Main merges remain serial, with current HEAD checks and authorized governance receipts, never a fabricated GitHub APPROVE. Production release/floor/Chanjet actions remain separately bounded by the execution order.
