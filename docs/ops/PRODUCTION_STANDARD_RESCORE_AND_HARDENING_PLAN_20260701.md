# Phoenix ERP Production Standard Rescore And Hardening Plan

Generated at: 2026-07-01 12:58 CST

Scope: local engineering repository, current HEAD `6af407d7 fix(mobile): show device diagnostics when data is unavailable`.

This report supersedes the older five-dimension score snapshot supplied by the user. It is based on gates and audits executed from the local project, not on remote-server guesswork.

## 1. Current Rescore

| Dimension | Previous | Current | Rating | Evidence | Main Remaining Risk |
|---|---:|---:|---|---|---|
| Security / RBAC / DataScope | 78 | **84** | B+ | W5 PASS; sensitive controller guard PASS; frontend menu gate PASS; unsafe attachment ref PASS; procurement/WMS DataScope write gates PASS; Chanjet/dev-login/impersonate fixes exist in current code | DB-side non-admin coarse parent menu grants still exist: `56` findings in `role-permission-matrix-audit-latest.json` |
| Data layer / Migration / Consistency | 68 | **82** | B | entity↔DB drift gate: `0 drift`; nullable unique: PASS; 37 TS migrations have down(); no-data-DML gate PASS with declared exemptions; sys_dict exact duplicate groups: `0` | 22 migration DML exemptions need periodic review; master-data reference audit still reports legacy table/alias hits |
| Frontend / Performance / i18n | 68 | **76** | B- | Web typecheck PASS; production build PASS; i18n key parity/coverage PASS; Web Vitest `65/65` PASS | i18n semantic coverage can still be hidden by fallbacks; UX/style consistency remains issue-driven, not yet automated visual regression |
| Observability / Operations | 62 | **69** | C+ | `/api/health` production OK; CI/CD deploy succeeded; deploy workflow has backup/rollback notes; device diagnostics now fail-visible | runtime smoke is still manual/documented-only; no proven alert-to-human loop; restore drill remains unexecuted |
| Testing / CI/CD | 58 | **74** | B- | API typecheck PASS; Web typecheck PASS; API Jest `52/52` PASS; Web Vitest `65/65` PASS; CI build/security/web/deploy passed on latest push | smoke workflow remains placeholder; broad regression exists but is not run on every main push; local `pnpm test` is blocked by pnpm ignored-build policy unless using direct runners |

Overall production-readiness score: **77 / B-**.

Interpretation: Phoenix ERP is now acceptable for controlled production operation with gates, but not yet "quiet production-grade" because RBAC cleanup, smoke automation, alerting, restore drill, and master-data alias cleanup remain open.

## 2. Verification Evidence From This Run

| Check | Result | Notes |
|---|---|---|
| `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS | All W5 static gates passed |
| `node scripts/check-i18n-keys.js` | PASS | zh/en/lo each 11077 keys; 7072 `t()` references matched |
| `node scripts/check-nullable-in-unique.js` | PASS | 0 violations; 1 allowlisted case |
| `bash scripts/check-ts-migration-down.sh` | PASS | 37 TS migrations have `down()` |
| `bash scripts/check-ts-migration-no-data-dml.sh` | PASS WITH EXEMPTIONS | 22 declared file-level DML exemptions |
| `bash scripts/check-entity-drift-baseline.sh` | PASS | entity ↔ DB schema drift is `0` |
| `node scripts/ci/check-sensitive-menu-guards.mjs` | PASS | 106 sensitive controller files inspected; 0 findings |
| `node scripts/ci/check-unsafe-attachment-refs.mjs` | PASS | 433 frontend files inspected; 0 unsafe attachment refs |
| `node scripts/ci/check-frontend-menu-gates.mjs` | PASS | Frontend shared menu gates aligned |
| `node scripts/ci/check-procurement-datascope-writes.mjs` | PASS | 8 service files inspected; 0 findings |
| `node scripts/ci/check-wms-datascope-writes.mjs` | PASS | WMS DataScope write gate passed |
| `node scripts/ci/check-menu-permission-atomicity.mjs` | PASS | 864 files inspected; 0 known coarse menu regression |
| `node scripts/ops/audit-role-permission-matrix.mjs --dry-run` | HIGH | 56 non-admin coarse parent menu grants remain in DB evidence |
| `node scripts/check-master-data-references.mjs` | INFO / WARN | Legacy `brd_farms`, `sys_store`, `prc2_projects`, `shr_projects` references remain |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS | API typecheck |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS | Web typecheck |
| `cd apps/api && ./node_modules/.bin/jest --runInBand` | PASS | 5 suites / 52 tests |
| `cd apps/web && ./node_modules/.bin/vitest run` | PASS | 5 files / 65 tests |
| `bash scripts/smoke-test.sh` | NOT RUN TO COMPLETION | Requires `ADMIN_PASS`; local API was not started. This is a runtime-smoke automation gap, not a typecheck failure |

## 3. Fixed During This Rescore

### G5-A legacy RBAC audit script

Issue: `scripts/g5a-rbac-audit.mjs` hardcoded `/Users/mac/phoenix-erp` and required the removed `apps/api/src/common/guards/rbac.matrix.ts`, causing false ENOENT failures in worktrees.

Fix: the script now resolves the project root from `process.cwd()` / `PHOENIX_ERP_ROOT` and exits cleanly with a legacy report when the old static matrix is absent. Current RBAC truth should come from DB-first role/menu audits plus `MenuGuard`/frontend gates.

Files:

- `scripts/g5a-rbac-audit.mjs`
- `docs/g5-a-rbac-audit.md`

## 4. P0 Hardening Plan

### P0-1: DB-first role permission matrix cleanup

Problem: static gates pass, but live DB audit still finds 56 non-admin grants on known coarse parent menu codes.

Actions:

1. Generate exact role/menu/action-bit cleanup SQL from `docs/ops/runs/role-permission-matrix-audit-latest.json`.
2. For each role, map coarse parent grants to approved atomic menu families only.
3. Back up `sys_role_menu_permission`.
4. Apply cleanup in a dedicated DB Gate.
5. Force affected users to re-login or bump `perms_version`.
6. Smoke left navigation, center cards, approval, procurement, finance, master data, and settings high-risk entries.

Acceptance:

- `node scripts/ops/audit-role-permission-matrix.mjs --dry-run` returns `PASS` / finding count `0`.
- No valid role loses required business access.
- Users without child menu permission no longer see child menus.

Owner: A2 + A1 + A5.

### P0-2: Runtime smoke automation with credential-safe secret handling

Problem: `scripts/smoke-test.sh` is useful but currently manual because it requires `ADMIN_PASS`. CI smoke workflow is placeholder.

Actions:

1. Create a non-production smoke account or use GitHub secret-backed `ADMIN_PASS`.
2. Add an authenticated smoke workflow for protected endpoints.
3. Keep default admin password forbidden.
4. Include `/api/health`, login, lookup, workflow, procurement, finance, attachment protected endpoint, and device summary smoke.

Acceptance:

- `ci-smoke.yml` executes real smoke on controlled environments.
- Missing secret causes SKIP with explicit reason, not a false PASS.

Owner: A1 + A6.

### P0-3: Alert-to-human operational loop

Problem: health/logs exist, but failures do not reliably reach an owner.

Actions:

1. Configure `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_TYPE`.
2. Add scheduled smoke/health workflow.
3. Send alert on deploy failure, regression failure, health failure, backup failure, and repeated 500 spike.
4. Record alert recipient and escalation owner.

Acceptance:

- A forced non-production failure reaches the configured human channel.
- Alert report records delivery evidence.

Owner: A6 + A1.

### P0-4: Restore drill evidence

Problem: backup exists, but restore has not been exercised.

Actions:

1. Use isolated restore target only.
2. Restore latest DB backup.
3. Verify schema, migration history, core table counts, and login-smoke fixture.
4. Record restore duration and recovery commands.

Acceptance:

- Restore drill report with `GO` or `GO WITH CONDITIONS`.
- No production data mutation during drill.

Owner: A6 + A1 + A7.

## 5. P1 Hardening Plan

### P1-1: Master-data legacy reference cleanup

Evidence: `check-master-data-references.mjs` reports legacy/high-risk references:

- `brd_farms`: 30 hits
- `sys_store`: 3 hits
- `prc2_projects`: 10 hits
- `shr_projects`: 6 hits

Actions:

1. Classify each hit as compatibility read, diagnostic read, workflow registry, or runtime write path.
2. Migrate runtime writes and selectors to canonical tables first.
3. Keep explicit compatibility reads only where documented.
4. Add CI red-line for new high-risk alias hits.

Owner: A5 + A3 + A2.

### P1-2: Migration DML exemption review

Problem: no-data-DML gate passes, but 22 migration files carry `@allow-data-dml`.

Actions:

1. Review every exemption for idempotency, rollback, business-data scope, and environment safety.
2. Split historical governance exemptions from active business data changes.
3. Add expiry/owner to future exemptions.

Owner: A1 + A2.

### P1-3: i18n semantic coverage

Problem: key parity now passes, but fallback strings can still hide untranslated business values or Chinese backend enum values.

Actions:

1. Audit backend-to-frontend enum/value contracts.
2. Replace Chinese-as-value with stable codes plus locale labels.
3. Add targeted UI tests for high-frequency pages: approval, procurement, finance, mobile, Store Payment.

Owner: A4 + A1.

### P1-4: Visual and UX regression baseline

Problem: no automated screenshot baseline for pages that users frequently report.

Actions:

1. Add Playwright smoke for dashboard, system health, alerts, UAT, procurement order/payment, shareholder funds, mobile device, approval center.
2. Check empty-state value, card overflow, mobile modal position, button visibility, and no raw URL exposure.
3. Store screenshots as CI artifacts.

Owner: A4 + A1.

## 6. P2 Hardening Plan

### P2-1: Expand unit and integration tests

Current: API `52` tests and Web `65` tests pass. This is no longer "0 tests", but coverage is still thin for a system of this size.

Targets:

- API: Auth/RBAC/DataScope/approval/procurement/finance/upload/device/Chanjet.
- Web: permission tree/menu resolver, procurement OCR/manual review, attachments, approval action modal, mobile pages.

### P2-2: Observability dashboard cleanup

Actions:

- Convert system dashboard/health/alerts pages from placeholder-looking cards into actionable operator views.
- Display why a card is empty and where data comes from.
- Link warnings to remediation pages or runbooks.

### P2-3: Production evidence standard

Actions:

- Every deploy or DB gate must capture commit, image ID, migration status, backup path, smoke result, rollback owner, and alert owner.

## 7. Updated Production Standard Definition

Phoenix ERP can be called production-grade when:

1. DB role permission coarse parent findings are `0`.
2. Runtime smoke runs automatically with secret-backed credentials.
3. Restore drill is proven in an isolated environment.
4. Alert-to-human delivery is proven.
5. Entity drift, nullable unique, migration down/no-DML, W5, i18n, API/Web typecheck, API/Web tests all pass.
6. Master-data legacy references are either removed or explicitly allowlisted as compatibility reads.
7. High-frequency UI pages have route/screenshot smoke.

## 8. Recommended Next Execution Order

1. `P0-1 DB-first role permission matrix cleanup`.
2. `P0-2 Runtime smoke automation`.
3. `P0-3 Alert-to-human loop`.
4. `P0-4 Restore drill`.
5. `P1-1 Master-data legacy reference cleanup`.
6. `P1-3 i18n semantic coverage + visual smoke`.

Do not start broad feature expansion until P0-1 and P0-2 are closed.

