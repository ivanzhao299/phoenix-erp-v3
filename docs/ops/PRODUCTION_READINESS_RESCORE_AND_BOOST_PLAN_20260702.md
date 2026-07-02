# Phoenix ERP Production Readiness Rescore And Boost Plan

Generated at: 2026-07-02 13:40 CST

Scope: local engineering repository and latest generated ops evidence. This report reads the previous production-readiness audit backlog, the recent cleanup reports, the current gate outputs, and the latest observer findings. It is intended to answer: what is already improved, what score is realistic now, and what work lifts Phoenix ERP toward stable 95+ production operation.

## 1. Evidence Read

Primary prior audit and cleanup files:

- `docs/ops/PRODUCTION_STANDARD_RESCORE_AND_HARDENING_PLAN_20260701.md`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260702_PG_ALERTS_RBAC.md`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RBAC_ATOMICITY.md`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_ALERT_DELIVERY_CHAIN.md`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_RUNTIME_SMOKE.md`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_DR_RESTORE_DRILL.md`
- `docs/ops/runs/runtime-smoke-check-latest.md`
- `docs/ops/runs/role-permission-matrix-audit-latest.md`
- `docs/ops/runs/observer-findings-latest.md`
- `docs/ops/runs/sys-dict-dedupe-latest.json`

Fresh verification commands executed:

| Command | Result |
| --- | --- |
| `node scripts/ops/audit-role-permission-matrix.mjs --dry-run` | PASS, findings 0 |
| `node scripts/ci/check-menu-permission-atomicity.mjs` | PASS |
| `node scripts/ci/check-sensitive-menu-guards.mjs` | PASS |
| `node scripts/ci/check-pg-parameter-cast-consistency.mjs` | PASS |
| `node scripts/check-i18n-keys.js` | PASS, zh/en/lo each 11102 keys; 7096 references matched |
| `bash scripts/check-ts-migration-down.sh` | PASS, 37 TS migrations have `down()` |
| `bash scripts/check-ts-migration-no-data-dml.sh` | PASS with declared exemptions |
| `node scripts/check-nullable-in-unique.js` | PASS, 0 violations |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |
| `bash scripts/check-entity-drift-baseline.sh` | PASS, entity to DB drift 0 |
| `node scripts/check-master-data-references.mjs` | WARN/info: legacy references remain |
| `node scripts/ops/runtime-smoke-check.mjs --output-dir docs/ops/runs` | GO, 27 pass / 0 warn / 0 fail |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `node scripts/ops/agent-observer.mjs --output-dir docs/ops/runs --dry-run` | 32 findings, highest HIGH |

## 2. Current Score

| Dimension | Older Score | Current Score | Rating | Why It Improved | Remaining Score Drag |
| --- | ---: | ---: | --- | --- | --- |
| Security / RBAC / DataScope | 78 / 84 | **90** | A- | RBAC matrix audit now 0 findings; coarse parent permission gate PASS; sensitive controller MenuGuard PASS; frontend menu gate and unsafe attachment gates PASS; Store Payment protected attachment path is fail-closed. | Need authenticated, role-specific production smoke across real users and high-risk buttons; Observer still contains historical routing findings that need regression fixtures. |
| Data layer / Migration / Consistency | 68 / 82 | **86** | B+ | entity to DB drift is 0; nullable-unique gate PASS; all TS migrations have down(); sys_dict exact duplicates are 0; PG parameter-cast gate added. | Master-data reference audit still finds legacy/high-risk alias usage: `brd_farms` 30, `sys_store` 3, `prc2_projects` 10, `shr_projects` 6; sys_dict active label duplicate groups remain for manual semantic decision. |
| Frontend / Performance / i18n | 68 / 76 | **80** | B | Web tsc PASS; i18n key parity PASS; runtime smoke covers dashboard, health, alerts, UAT, mobile device, procurement payment, and protected upload probes. | UX/style fixes remain issue-driven; no Playwright visual regression baseline; authenticated business-flow smoke is not yet broad enough; user-reported page polish issues still appear. |
| Observability / Operations | 62 / 69 | **82** | B | Runtime smoke is now repeatable and latest production check is GO 27/27; system alerts now cover API/PG/Cron/IoT sources and station notifications; local DR restore drill passed. | External alert-to-human channel is not proven; production-backup restore drill in isolated environment is not done; Observer reports 32 platform findings, mostly historical routing/baseline/schema quality. |
| Testing / CI/CD | 58 / 74 | **81** | B | API/Web typecheck PASS; W5 gate PASS; runtime smoke gate exists; PG parameter consistency now in W5; prior API Jest and Web Vitest suites pass. | Full authenticated regression, visual smoke, and business-flow tests are not yet consistently enforced on every main/deploy path. |

Overall current production-readiness score: **84 / B+**.

Interpretation: Phoenix ERP has moved out of the earlier unstable-cleanup zone and is now suitable for controlled production operation with gates. It is not yet a quiet 95+ production system because the remaining risks are mostly operational proof, authenticated regression breadth, visual UX consistency, and legacy data-reference cleanup.

## 3. What Has Been Cleared

The following earlier blockers are now materially improved or closed:

1. Role permission matrix coarse grants: previously 56 non-admin findings, now 0.
2. Sensitive backend menu guard gaps: current static gate PASS.
3. Frontend menu gate alignment: current gate PASS.
4. Approval/UAT PG parameter type class: current PG parameter cast consistency gate PASS and W5 includes it.
5. Entity to DB drift: current drift baseline PASS with 0 drift.
6. Exact sys_dict duplicates: current duplicate groups 0; unique index exists.
7. Runtime route smoke for common incident pages: latest production smoke GO, 27/27.
8. Alert source coverage: API 500, PG errors, Cron failures, IoT threshold events, and IoT sync failures now write into `sys_alerts`.
9. Local DR restore drill: completed in isolated scratch database.

## 4. Remaining High-Leverage Gaps

### P0-A: Authenticated Role And Business-Flow Smoke

Why it matters: current runtime smoke is strong for static and unauthenticated/protected behavior, but production confidence still depends on real role-specific paths.

Scope:

- Login as representative roles: super admin, finance, procurement, warehouse, production, shareholder, store payment pilot roles.
- Verify left menu visibility, center-card visibility, high-risk button visibility, approval action modal, procurement material/order/payment, finance/shareholder flows, mobile reimbursement upload, Store Payment protected attachment UI.
- Fail if a user sees a forbidden child menu or cannot see an allowed child menu.

Expected score lift:

- Security +3
- Frontend +4
- Testing +5

Recommended owner: A1 + A2 + A4.

### P0-B: Alert-To-Human External Delivery Proof

Why it matters: in-app station notification exists, but production operations still need proof that an alert reaches a real duty channel.

Scope:

- Configure or verify `ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_TYPE` in a controlled environment.
- Trigger non-production test alerts for API 500, PG error, Cron failure, IoT sync failure, and deployment failure.
- Record delivery evidence, recipient, escalation owner, retry behavior, and suppression/noise rules.

Expected score lift:

- Observability +5
- Testing/CI +1

Recommended owner: A6 + A1.

### P0-C: Production-Backup Restore Drill In Isolated Environment

Why it matters: the local restore drill passed, but 95+ operations require proof that a real approved production backup can be restored away from production.

Scope:

- Use isolated verification host/database.
- Restore approved backup artifact.
- Verify schema, migration history, core table counts, login-smoke fixture, and rollback documentation.
- Record RTO/RPO evidence.

Expected score lift:

- Observability +5
- Data +2

Recommended owner: A6 + A1 + A7.

### P1-D: Master-Data Legacy Reference Cleanup

Current evidence from `check-master-data-references.mjs`:

- `brd_farms`: 30 hits.
- `sys_store`: 3 hits.
- `prc2_projects`: 10 hits.
- `shr_projects`: 6 hits.

Scope:

- Classify each hit as compatibility read, diagnostic read, workflow registry, or runtime write path.
- Migrate runtime selectors and writes to canonical tables.
- Document compatibility reads explicitly.
- Convert this audit from informational to red-line for new legacy references.

Expected score lift:

- Data +5
- Security/DataScope +1

Recommended owner: A5 + A3 + A2.

### P1-E: Visual Regression And Product-Grade Page Cleanup

Why it matters: users continue to find page-value, layout, and empty-state issues faster than the system catches them.

Scope:

- Playwright screenshot smoke for dashboard aggregation cards, system monitor, alert center, UAT readiness, inventory turnover, device monitor, procurement payment/material/OCR, approval center, shareholder funds.
- Check no broken empty-state, no overflow cards, no giant unexplained blank panels, no mobile modal at page bottom, no raw URL exposure.
- Store screenshots as CI artifacts.

Expected score lift:

- Frontend +6
- Testing +3

Recommended owner: A4 + A1.

### P1-F: Dictionary Semantic And i18n Contract Cleanup

Why it matters: exact dictionary duplicates are fixed, but active label duplicates and Chinese-as-business-value patterns still reduce maintainability.

Current evidence:

- sys_dict exact duplicate groups: 0.
- Active label duplicate groups: 2 in `BRD_HOUSE_TYPE`, likely semantic aliasing that needs business decision.
- i18n key parity passes, but stable code/value contracts still need deeper audit.

Expected score lift:

- Data +2
- Frontend/i18n +2

Recommended owner: A5 + A4 + A1.

### P1-G: Observer Finding Closure

Why it matters: Observer still reports 32 findings, highest HIGH. Many findings are historical run artifacts from before router fixes, but the platform should either mark them superseded or add regression fixtures so they do not keep reappearing.

Scope:

- Add router regression fixtures for A5 readiness, A2/A3 protected attachment, and A1/A2/A5 parallel groups.
- Add report schema normalization for old/new agent outputs.
- Add baseline status reconciliation so historical failures are tagged superseded when fixed.

Expected score lift:

- Observability/platform +3
- Testing/CI +2

Recommended owner: Codex-Orchestrator + A1.

## 5. Recommended Execution Order

1. **Batch 1: Authenticated smoke and visual smoke foundation.**
   Highest combined gain because it catches user-facing regressions and permission leaks together.

2. **Batch 2: External alert proof and production-backup restore drill.**
   This turns operations from "has logs" into "can wake the right owner and recover."

3. **Batch 3: Master-data legacy references and dictionary semantic cleanup.**
   This pays down long-term data correctness debt that currently remains warn-only.

4. **Batch 4: Observer finding closure and router regression fixtures.**
   This keeps the Agent platform from repeatedly rediscovering old problems.

5. **Batch 5: Broaden unit/integration coverage and enforce selected suites in CI.**
   This lifts Testing/CI toward 90+ and prevents reintroducing cleaned debt.

## 6. Target Score Path

| Milestone | Expected Score |
| --- | ---: |
| Current after latest cleanup | 84 |
| After Batch 1 | 88-89 |
| After Batch 2 | 91-92 |
| After Batch 3 | 93 |
| After Batch 4 | 94 |
| After Batch 5 and one full production-like regression pass | 95+ |

## 7. Current Conclusion

Current conclusion: **GO WITH CONDITIONS**.

Phoenix ERP is substantially healthier than the earlier scorecard. The biggest remaining path to 95+ is not another isolated hotfix; it is disciplined proof:

- authenticated role/business smoke,
- external alert delivery,
- isolated restore from approved production backup,
- master-data legacy reference cleanup,
- visual regression for user-facing pages,
- and Observer findings closure.

No business code, DB write, migration, deployment, restart, or push was executed by this scoring report.
