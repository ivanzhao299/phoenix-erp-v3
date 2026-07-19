# Next Actions

## 2026-07-14 — Chanjet Continuous Readonly Alignment

Current stage: `CHANJET_CONTINUOUS_READONLY_ALIGNMENT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added P0-P6 production-readiness aggregation and an administrator dashboard.
2. Added resilient full readonly sync with at most three attempts; unresolved failures remain HOLD and generate alerts.
3. Added a four-hour scheduler with a PostgreSQL advisory lock and cron heartbeat monitoring.
4. Added deterministic system confirmation only for book/company + code + normalized name + ACTIVE exact matches.
5. Preserved manual review for code-only, name-only, fuzzy, ambiguous, inactive, cross-company, and conflict candidates.
6. Kept the middle-layer console under `MENU_SETTINGS_CHANJET`; ordinary business users remain unaware of integration plumbing.
7. Kept Chanjet write, delete, modify, voucher push, and silent ERP business-table overwrite disabled.

Next actions:

## 2026-07-19 - Chanjet P0-P5 runtime contract

1. `CHANJET_CURRENT_STATE_AUTHENTICATED_AUDIT`
   - After an approved deployment, capture live `/api/chanjet/integration/current-state` evidence.
2. `CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`
   - Promote only `AUTHORITY_READY` values; keep ERP details as visible auxiliary evidence.
3. `CHANJET_OPEN_RECONCILIATION_AND_FIELD_GAP_BURN_DOWN`
   - Resolve deterministic field and master-data gaps without fuzzy approval or silent overwrite.
4. `CHANJET_VOUCHER_WRITEBACK_SEPARATE_GATE`
   - Keep external writes disabled; a future Gate must separately approve credentials, idempotency, rollback and pilot scope.

Hard boundary: old `docs/ops/runs/*latest*` files are historical snapshots and cannot override the runtime current-state endpoint.

1. Deploy and run authenticated production readiness smoke.
2. Execute one resilient readonly synchronization and verify cron heartbeat / alert behavior.
3. System-confirm only deterministic exact mappings; review all remaining candidates individually.
4. Continue semantic extraction and card authority promotion until each finance metric reaches its explicit Gate.
5. Keep all Chanjet writeback on HOLD until a separately approved write Gate.

## 2026-07-13 — Chanjet P0 Production Readonly Gate Verified

Current stage: `CHANJET_P0_PRODUCTION_READONLY_GATE_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Confirmed the production account-book response uses nested `tenant.id/name`.
2. Fixed account-book cache persistence and duplicate removal.
3. Fixed `partyRoleTypeId` role classification for customer, supplier, and dual-role counterparties.
4. Replaced invalid historical ERP target names with real `sal_customers` / `prc2_suppliers` masters.
5. Added a GET-only production Gate audit script.
6. Passed 12 Chanjet unit tests and API typecheck.
7. Pushed and completed full CI/CD deploy run `29226428523`.
8. Completed authenticated production readonly run `29226762516`.
9. Verified 3/3 account books, 16/16 scopes, and 46/46 fresh book-scoped targets.
10. Generated 404 counterparty candidates: 51 matched, 353 pending, 0 conflicts, 0 unknown roles.

Next actions:

1. Enter `CHANJET_COUNTERPARTY_MAPPING_CANDIDATE_REVIEW`.
2. Review the 353 pending role-specific customer/supplier candidates against `sal_customers` and `prc2_suppliers`.
3. Preserve 0-conflict and 0-unknown-role fail-closed invariants.
4. Keep individual mapping approval explicit; do not bulk auto-approve.
5. Keep Chanjet writeback and voucher push on HOLD.

## 2026-07-08 — Chanjet Readonly Adapter Patch and Sample Review

Current stage: `CHANJET_READONLY_ADAPTER_PATCH_AUTHENTICATED_RERUN_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Patched the readonly voucher line adapter to read subject code/name from nested 好业财 `glAccount`.
2. Added readonly voucher header status inference from existing evidence fields.
3. Added `scripts/ops/chanjet-readonly-adapter-sample-review.mjs`.
4. Generated sample review artifacts:
   - `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.json`
   - `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.md`
5. Confirmed pre-patch sample semantic coverage baseline is `73.3%`.
6. Deployed the adapter patch through CI/CD.
7. Re-ran authenticated production smoke `chanjet-readonly-adapter-production`, run `28935902663`.
8. Confirmed post-patch adapter field coverage is `96.6%`.
9. Confirmed post-patch semantic coverage is `93.3%`.
10. Confirmed `CHANJET_VOUCHER_HEADER` and `CHANJET_VOUCHER_LINE` are READY.

Next actions:

1. Run `CHANJET_COUNTERPARTY_MAPPING_APPROVAL_GATE`.
2. Approve / hold customer, supplier, and current-account mapping semantics.
3. Promote voucher header / line readonly evidence to admin reconciliation views.
4. Keep ordinary finance card authority and all Chanjet write-back on HOLD until counterparty semantics are explicit.

## 2026-07-08 — Bug Intake Pipeline Closeout and Chanjet Handoff

Current stage: `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Drained the current Bug Intake Agent queue.
2. Confirmed 103 BUGTASK items are either `completed` or `COMPLETED_MERGED`.
3. Confirmed no open or running BUGTASK items remain at handoff time.
4. Confirmed the resident Bug Intake runner remains active.
5. Added queue-lane filtering and safe redispatch gates to the Bug Intake admin panel.
6. Confirmed latest CI/CD and production health are passing.

Next actions:

1. Resume Chanjet / 好业财 integration as the active implementation track.
2. Run `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`.
3. Lock voucher status, subject code/name, and counterparty mapping semantics.
4. Promote only authority-ready Chanjet fields to business-facing finance cards.
5. Keep all Chanjet writes and voucher push on HOLD until a separate approved Gate.


Last updated: 2026-07-07

## 2026-07-07 — Chanjet Readonly Adapter Authenticated Audit CI Gate

Current stage: `CHANJET_READONLY_ADAPTER_AUTHENTICATED_CI_GATE_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added GitHub Actions smoke target `chanjet-readonly-adapter-production`.
2. The target reuses the production deploy SSH/proxy path.
3. The target mints a short-lived runtime admin JWT inside the production API container.
4. The target runs `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` against `https://erp.eggslao.com/api`.
5. The target pulls `chanjet-readonly-field-adapter-audit-latest.json/md` as CI artifacts.
6. No long-lived token is stored in GitHub, docs, scripts, or runtime memory.
7. Executed workflow run `28834627546`; authenticated audit completed with real production sample evidence.

Authenticated audit result:

- decision: `GO_WITH_CONDITIONS`
- voucher header rows: `60`
- voucher line rows: `160`
- counterparty rows: `120`
- field coverage: `86.2%`
- partial adapters: `3/3`

Next actions:

1. `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`
   - Lock `voucher_status`.
   - Lock `subject_code` / `subject_name`.
   - Approve or hold customer / supplier mapping semantics.
2. Start `CHANJET_BUSINESS_FUSION_UI_PASS` only after the partial adapter conditions are cleared or explicitly displayed as non-authoritative evidence.
4. Keep `CHANJET_WRITE_BACK_HOLD`.

## 2026-07-07 — Chanjet Readonly Adapter Production Audit Gate

Current stage: `CHANJET_READONLY_ADAPTER_PRODUCTION_AUDIT_GATE_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added `fieldCoverage` to the readonly adapter API summary.
2. Updated the admin-only readonly adapter tab to show field coverage.
3. Hardened `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` with token or service-account login support.
4. Re-ran the production audit against `https://erp.eggslao.com/api`.
5. Verified fail-closed behavior: without a runtime token or service-account credentials, the audit writes a HOLD report instead of fabricating adapter evidence.

Current blocker:

- Production adapter sample audit returned `HTTP 401` because no approved runtime token or service-account login was available in the local runner environment.

Next actions:

1. `CHANJET_READONLY_ADAPTER_AUTHENTICATED_AUDIT`
   - Provide a dedicated readonly audit service account or short-lived admin token to the runner.
   - Re-run `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` against production.
   - Verify voucher header / voucher line / counterparty sample rows and field coverage.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Only after authenticated audit evidence is available, wire adapter rows into reconciliation views.
   - Ordinary users still see only business-level source badges, differences, and mapping state.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet writes and voucher push until a separate approved Gate.

## 2026-07-07 — Chanjet Readonly Field Adapter Implementation

Current stage: `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/readonly-field-adapters`.
2. Implemented adapter contracts for:
   - `CHANJET_VOUCHER_HEADER`
   - `CHANJET_VOUCHER_LINE`
   - `CHANJET_COUNTERPARTY`
3. Added admin UI tab `/finance2/chanjet-integration#readonlyAdapters`.
4. Added executable audit tool `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`.
5. Kept Chanjet write/delete/modify/voucher push disabled.

Next actions:

1. `CHANJET_READONLY_ADAPTER_UI_UAT_AND_RECONCILIATION_WIRING`
   - Verify production samples for voucher header / line / counterparty adapters.
   - Wire adapter rows into reconciliation views without exposing the middle layer to ordinary users.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Show only business-level source badges, differences, and mapping states on ordinary finance pages.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet writes and voucher push until a separate approved Gate.

## 2026-07-06 — Chanjet / ERP Fusion Admin Boundary

Current stage: `CHANJET_ADMIN_BOUNDARY_LOCKED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Locked Chanjet middle-layer governance UI behind `MENU_SETTINGS_CHANJET`.
2. Updated `/finance2/chanjet-sync` and `/finance2/chanjet-integration` entry permissions so ordinary finance users do not see the middle layer.
3. Updated backend Chanjet proxy / integration-control permission constant to `MENU_SETTINGS_CHANJET`.
4. Added architecture plan:
   - `docs/ops/CHANJET_ERP_FUSION_ADMIN_BOUNDARY_PLAN_20260706.md`

Next actions:

1. `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`
   - Implement voucher line, voucher header, and counterparty readonly adapters.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Keep ordinary business pages focused on business metrics, source badges, and reconciliation states; do not expose raw middle-layer details.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a separate approved Gate.

## 2026-07-06 — Chanjet Field Gap Review Gate

Current stage: `CHANJET_FIELD_GAP_REVIEW_GATE_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/field-gap-review-gate`.
2. Added executable review tool `scripts/ops/chanjet-field-gap-review-gate.mjs`.
3. Converted Chanjet open high-risk fields into 7 implementation buckets.
4. Generated review artifacts:
   - `docs/ops/runs/chanjet-field-gap-review-gate-latest.json`
   - `docs/ops/runs/chanjet-field-gap-review-gate-latest.md`
5. Locked the next implementation gate as `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`.

Next actions:

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
   - Implement readonly voucher line adapter.
   - Keep voucher push forbidden.
2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
   - Implement readonly voucher header adapter.
   - Lock voucher date/status semantics.
3. `FIELD-GAP-CHANJET_COUNTERPARTY`
   - Complete customer/supplier/current-account mapping review.
4. Keep `CHANJET_WRITE_BACK_HOLD`.

## 2026-07-06 — Chanjet P0 Remote Readonly Coverage and Alignment

Current stage: `CHANJET_P0_REMOTE_READONLY_COVERAGE_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added remote readonly audit tool `scripts/ops/chanjet-remote-readonly-coverage-audit.mjs`.
2. Verified production middle-layer mirror coverage:
   - Endpoint coverage: `100%`.
   - Finance card dependency coverage: `100%`.
   - Field classification coverage: `10.9%`.
   - HIGH / CRITICAL open fields: `1348`.
3. Fixed finance AR runtime alignment so AR comparison reads `chanjet_entity_snapshots` / `AR_STATISTICS` first, with legacy `chanjet_ar_snapshot` fallback.
4. Confirmed local DB 0% coverage is a local mirror-state issue, not proof that production Chanjet mirror is empty.

Next actions:

1. `CHANJET-FIELD-GAP-REVIEW-GATE`
   - Convert HIGH / CRITICAL pending fields into ERP mapping, transform, ignore, or manual-review decisions.
2. `CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE`
   - Make future audits explicitly separate local development DB evidence from production mirror evidence.
3. `CHANJET-FINANCE-CARD-AUTHORITY-VERIFY`
   - Re-verify which finance cards may safely use Chanjet as the primary display authority.
4. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-05 — Chanjet Receipt / Payment Date Status Lock Continue

Current stage: `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Extended receipt/payment locks with system-side confirmation status.
2. Added safe query filter metadata for business date, posted date, approval status, void status, direction, and amount.
3. Explicitly kept `TODAY_RECEIPT` and `TODAY_PAYMENT` blocked from finance card primary authority.
4. Added `scripts/ops/chanjet-receipt-payment-lock-audit.mjs`.

Next actions:

1. `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT`
   - Expose subject balance and statement rows as readonly Chanjet reports with clear evidence, missing fields, and blocker reasons.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Prepare ERP voucher draft generation only; do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-05 — Chanjet Cash Balance Field Lock

Current stage: `CHANJET_P3_CASH_BALANCE_FIELD_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/cash-balance-field-lock`.
2. Added `scripts/ops/chanjet-cash-balance-field-lock-audit.mjs`.
3. Locked `CASH_BALANCE` read model so Chanjet `amountSum=0` is not treated as real cash / bank balance.
4. Kept cash / bank balance card ERP-primary until raw balance fields, currency, account status, and balance date are locked.

Next actions:

1. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUE`
   - Continue locking receipt/payment business date, posted date, approval status, void status, direction, and amount semantics.
2. `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT`
   - Expose subject balance as a readonly Chanjet report with clear field coverage and blocker reasons.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card Semantic Review

Current stage: `CHANJET_P3_FINANCE_CARD_SYSTEM_CONFIRMATION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly review API `GET /api/chanjet/integration/finance-card-semantic-review`.
2. Added review audit tool `scripts/ops/chanjet-finance-card-semantic-review-audit.mjs`.
3. Generated finance card semantic review artifacts:
   - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.json`
   - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.md`
4. Generated report `docs/ops/CHANJET_P3_FINANCE_CARD_SEMANTIC_REVIEW_REPORT_20260704.md`.
5. Review result: 8/8 cards covered; system confirmation completed with 2 Chanjet authority cards, 3 Chanjet readonly report cards, 3 ERP-primary blocked cards, 0 manual finance confirmation required.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT`
   - System-side confirmation is now the authority: AR/AP can use Chanjet primary values; subject balance, balance sheet, and income statement stay Chanjet readonly; cash balance and today receipt/payment stay ERP-primary until field proof is complete.
   - Audit `/finance2` card source switching so only `SYSTEM_CONFIRMED_AUTHORITY` cards can become primary values.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Prepare ERP voucher draft generation only; still do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card System Confirmation

Current stage: `CHANJET_P3_FINANCE_CARD_SYSTEM_CONFIRMATION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly system confirmation API `GET /api/chanjet/integration/finance-card-system-confirmation`.
2. Added audit tool `scripts/ops/chanjet-finance-card-system-confirmation-audit.mjs`.
3. Generated artifacts:
   - `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.json`
   - `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.md`
4. System confirmation result:
   - Chanjet authority cards: `AR_OPEN`, `AP_OPEN`.
   - Chanjet readonly report cards: `SUBJECT_BALANCE`, `BALANCE_SHEET`, `INCOME_STATEMENT`.
   - ERP-primary blocked cards: `CASH_BALANCE`, `TODAY_RECEIPT`, `TODAY_PAYMENT`.
   - Manual finance confirmation required: `0`.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT`
   - Ensure finance cards only use Chanjet primary values for system-confirmed authority cards.
   - Keep cash balance and today receipt/payment ERP-primary until actual field proof is complete.
2. `CHANJET_P3_READONLY_STATEMENT_UI`
   - Expose subject balance, balance sheet, and income statement as Chanjet readonly reports, not as fabricated ERP values.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card Diff Visual QA

Current stage: `CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added reusable QA tool `scripts/ops/chanjet-finance-card-authority-qa.mjs`.
2. Verified 8/8 finance card authority checks.
3. Verified all 8 cards are covered by the backend authority service and `/finance2/reports` UI panel.
4. Verified the UI exposes source, Chanjet readonly value, ERP auxiliary value, visible difference, and blocker reason.
5. Verified primary card switch is guarded by `AUTHORITY_READY`; receipt/payment also requires `readyForCardAuthority`.

Artifacts:

- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.json`
- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.md`
- `docs/ops/CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA_REPORT_20260704.md`

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION`
   - Lock cash/bank balance fields.
   - Lock subject balance current/initial/debit/credit/end-balance semantics.
   - Lock balance sheet and income statement row semantics.
   - Keep today receipt/payment blocked until finance confirms date/status/direction.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Build ERP voucher draft generation only; do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-03 好业财只读中间层 Phase 1

当前状态: `CHANJET_READONLY_MIRROR_PHASE1_READY`，结论 `GO_WITH_CONDITIONS`。

已完成:

1. 建立好业财只读镜像中间层表: `chanjet_read_snapshots`、`chanjet_entity_snapshots`、`chanjet_erp_field_mapping`。
2. 接入只读镜像同步 API、镜像快照查询 API、ERP 字段差异候选分析 API。
3. 前端 `/finance2/chanjet-integration` 新增“只读镜像”和“字段差异”视图。
4. 明确保持好业财只读: 不写入、不删除、不修改、不推送凭证。

下一步:

1. `CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE` — 在有效好业财 token 环境执行只读镜像同步，生成真实快照。
2. `CHANJET_FIELD_GAP_REVIEW_GATE` — 复核字段差异候选，确认 ERP 哪些字段需要补齐或映射。
3. `CHANJET_ENTITY_MAPPING_PHASE2` — 对客户、供应商、科目、项目、部门、账户、应收应付、凭证查询做分页/增量同步增强。
4. `CHANJET_WRITE_BACK_HOLD` — 未经单独批准，继续禁止向好业财写入、删除、修改或推送凭证。

## 2026-07-03 好业财只读镜像真实同步 Gate

当前状态: `CHANJET_READONLY_MIRROR_EXECUTE_WITH_RUNTIME_TOKEN_DONE`，结论 `GO_WITH_CONDITIONS`。

已完成:

1. 新增 `scripts/ops/chanjet-readonly-mirror-sync.mjs`，用于受控执行好业财只读镜像 Gate。
2. 本地 ERP DB 已创建只读镜像中间层表。
3. dry-run 报告已生成:
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`
4. 审计报告已生成:
   - `docs/ops/CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE_REPORT_20260703.md`
5. 已在生产服务器端使用短时 ERP admin Bearer token 调用受保护只读镜像同步 API。
6. 本次同步写入 ERP 中间层，不写好业财、不删除好业财数据、不修改好业财数据、不推送凭证。
## 2026-07-04 — Chanjet Finance Alignment Audit P2

本轮完成了可复跑的好业财财务对齐审计工具:

- `scripts/ops/chanjet-finance-alignment-audit.mjs`
- `docs/ops/CHANJET_FINANCE_ALIGNMENT_AUDIT_P2_REPORT_20260704.md`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.json`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.md`

最新本地只读审计结论:

1. Decision: `GO_WITH_CONDITIONS`.
2. Endpoint coverage: `0%`.
3. Finance card coverage: `0%`.
4. Field coverage: `0%`.
5. Core readonly mirror tables exist, but local mirror rows are absent.
6. `chanjet_sync_jobs` is optional local audit evidence and is currently unavailable in this database.
7. ERP finance cards must not claim Chanjet-aligned numbers unless readonly mirror evidence exists.

Next recommended Gate:

1. `CHANJET-P0-READONLY-SYNC-GAPS`.
   - Run or repair readonly sync for all default Chanjet finance scopes.
   - Keep Chanjet write / delete / modify / voucher push forbidden.
   - Rerun `scripts/ops/chanjet-finance-alignment-audit.mjs` after sync.
2. `CHANJET-P1-SYNC-JOB-AUDIT-EVIDENCE`.
   - Restore or replace sync job evidence for local/production observability.
3. `CHANJET-P1-FINANCE-CARD-SOURCE-BADGES`.
   - Keep finance cards source-labelled and mismatch-visible until coverage reaches business-accepted threshold.

---

7. 生产同步报告:
   - `docs/ops/CHANJET_READONLY_MIRROR_PRODUCTION_SYNC_REPORT_20260703.md`

同步结果:

1. 原始快照: 46。
2. 原始行数: 1956。
3. 实体镜像行数: 1846。
4. 字段差异候选: 1677。
5. HIGH 风险字段候选: 1518。

下一步:

1. `CHANJET_FIELD_GAP_REVIEW_GATE` — 已完成第一轮复核，报告见 `docs/ops/CHANJET_FIELD_GAP_REVIEW_REPORT_20260703.md`。
2. `CHANJET_FIELD_GAP_P0_REPAIR` — 先修字段分析器和实体归一化质量:
   - 剥离好业财 API envelope 字段，不作为 ERP 业务字段候选。
   - 修复应收/应付统计实体保真 key。
   - 拆分客户/供应商映射目标，避免 `mst_customers/mst_suppliers` 组合伪表名。
   - 为凭证、科目余额、三大报表建立只读镜像模型方案。
   - 状态: 已完成代码修复和本地验证，报告见 `docs/ops/CHANJET_FIELD_GAP_P0_REPAIR_REPORT_20260703.md`。
3. `CHANJET_FIELD_GAP_P0_REPAIR_DEPLOY_GATE` — 部署 P0 修复后重跑只读同步，验证 envelope 降噪、统计实体保真、客户/供应商拆分是否生效。
4. `CHANJET_ERP_SCHEMA_ADAPTATION_PLAN` — P0 修复重跑后再生成 ERP 端字段适配计划，不直接改 schema。
5. `CHANJET_WRITE_BACK_HOLD` — 继续禁止写好业财，直到用户另行批准写回 Gate。

## ⚠️ 2026-06-27 重大状态变更 — 已执行全量生产部署

用户授权下,已对 `main` 做一次 **full 生产部署**(run 28277134665, sha 6eba2829, **全绿**)。
这与本文件下方早期"不部署"基线相矛盾;以本节为准。

- 已落盘:TS 尾迁移 1782045-1782052(原子菜单 seed + 1782052 矩阵修复:删 56 条非 ADMIN 粗授予 + D3 资金子菜单),Phase C 验证通过。
- 部署链 bug 已修(workflow_dispatch detect-changes HEAD~1)。

**部署后待办(优先级序):**
1. `POST_DEPLOY_5USER_RELOGIN_SMOKE` — 王乐金/刘汉涛/财务/采购/admin 重登核 菜单·卡片·按钮·接口四向一致(清单 `docs/ops/POST_DEPLOY_5USER_SMOKE_CHECKLIST_20260627.md`)。perms_version 已 bump,在线用户须重登。
2. `W4_FRONTEND_D1_D2` — 侧菜单 requiredPerm:'V' + procurement 按钮 gating(冻结期撤回的,现可复位)。
3. `W5_ATTACHMENT_CONVERGENCE` / `W6_PROCUREMENT_APPROVER_FLOW` / `W7_CHANJET_SIGNED_SMOKE` / `W8_STORE_PAYMENT_PROD_LINE`(各自 Gate)。
4. 旧基线 Store Payment 线(下方)继续按原 Gate 推进。

---

## (历史) 早期 Next Actions — 部署前基线,保留备查

1. `USE_AGENT_INBOX_FOR_SHORT_COMMANDS`.
2. `USER_WRITES_SHORT_INTENT_TO_AGENT_INBOX`.
3. `AGENT_EXPANDS_CONTEXT_FROM_RUNTIME_MEMORY`.
4. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
   - Fresh read-only evidence confirms production-side Store Payment account and record tables are empty; next write must be a narrow disabled/pending account-placeholder Gate only.
5. `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - Candidate SQL and rollback SQL are prepared for exactly three disabled/inactive placeholder accounts under `STORE-VTE-001 / COMP-LAO-AGRI`.
   - Latest short-probe precheck confirmed `accounts=0`, `records=0`, `menus=5`, `STORE-VTE-001/COMP-LAO-AGRI ACTIVE`, and `grants=11`.
   - Completed with conditions: exactly three disabled/inactive placeholder accounts were inserted. Post-check confirmed `accounts_total=3`, `candidate_accounts=3`, `records_total=0`, and Store Payment `file_metadata=0`.
   - Do not activate accounts, attach QR files, or create payment records without separate Gates.
6. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
   - Master-data repair plan is now docs-complete: keep `STORE-VTE-001 / COMP-LAO-AGRI` canonical, keep `ST-VTE-001` as Store Payment legacy alias only, and do not perform broad auto-rewrites.
7. `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`.
   - Local Store Payment runtime already uses target `E` for write actions; remaining cleanup is a narrow future DB Gate to remove temporary Store Payment-only `C/A` grants after runtime verification.
   - Completed: removed six temporary Store Payment-only `C/A` grants. Post-check confirmed `legacy_ca_rows=0` and export remains `X`.
8. `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS`.
   - Manual scope cleanup is ready for business review: users 296, 299, and 1460 remain excluded; no automatic global/store scope grant is allowed.
   - Decision matrix is prepared under `APPROVE_MANUAL_SCOPE_USER_DECISIONS`.
9. `HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW`.
   - Manual review matrix is prepared under `APPROVE_UNRESOLVED_UPLOADS_MANUAL_REVIEW_DECISIONS`; 59 files remain fail-closed and must not be auto-claimed.
10. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN`.
11. `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION`.
12. `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN`.
13. `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`.
   - Completed as read-only runtime-static verification; follow-up compatibility fix changes upload response `url` to protected `fileId` while keeping `rawUrl: null` and `LEGACY_PENDING`. Remaining authenticated write probe requires separate approval after deploy.
14. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN`.
15. `APPROVE_STORE_PAYMENT_REMOTE_UAT_FIXTURE_SETUP`.
   - Remote Store Payment runtime shell is verified.
   - Latest refresh shows `store_payment_accounts=3`, all disabled/inactive, `store_payment_records=0`, and Store Payment `file_metadata=0`.
   - Business UAT remains HOLD until authenticated smoke, QR metadata fixture, or finance-confirmed account activation is separately approved.
16. `APPROVE_AUTH_COOKIE_CREDENTIAL_SMOKE`.
   - P1-006 fixed local `/store-payment` route guarding and confirmed production JWT fallback is off; cookie flags still require a credentialed login smoke after deployment.
17. `APPROVE_ROLLBACK_RESTORE_VALIDATION_FIX_GATE`.
   - P1-007 captured current runtime image IDs, but rollback readiness remains HOLD until `/opt/phoenix-erp` git ownership/safe-directory inspection, backup location, compose path, and previous known-good image evidence are proven under an A6 gate.
18. `REPAIR_PRODUCTION_SSH_EVIDENCE_CHANNEL_OR_APPROVE_ALTERNATE_EVIDENCE`.
   - Latest `PRD-P0-003` remote refresh retry after commit `8833269c` still failed with SSH banner exchange timeout / no-output hangs. Deploy-chain governance remains HOLD until remote checkout, Nginx diff, backup artifacts, compose path, and rollback evidence can be refreshed reliably.

## Recommended Immediate Sequence

1. Use Agent Inbox for short commands instead of long prompt copy/paste.
2. Review `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - This is the next narrow production DB write candidate: three disabled/inactive Store Payment account placeholders only, with rollback SQL. Do not execute without explicit approval.
3. Keep `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` as GO WITH CONDITIONS.
   - Local compatibility fix is complete: generic upload UI now accepts protected `fileId` and blocks raw `/uploads` or `http(s)` links.
   - Production runtime-static evidence now shows the running API returns the hardened upload shape. Do not run the upload write probe unless separately approved.
4. Refresh `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN` remote evidence only after SSH command-level stability improves or an alternate trusted evidence channel is approved; latest retry still failed.
5. Refresh `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN` with SSH concurrency 1 before any execution manifest.
6. Keep `PRD-P0-002 A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` in GO WITH CONDITIONS and rerun full A1 closeout after deploy-chain and runtime verification gates.
7. Keep master data remediation separate from initial import repair.
   - P1-004 is closed as GO WITH CONDITIONS unless a future formal alias mapping Schema Gate is requested.
8. Prepare `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` to remove Store Payment-only `C/A` compatibility after runtime action-bit alignment.
9. Keep MANUAL_REVIEW_REQUIRED users out of automatic repair.
10. Keep the 59 unresolved historical files out of scope until manual review or broader owner evidence exists.
11. Keep `/uploads` and raw URL exposure forbidden for Store Payment and legacy upload responses.
12. Do not enter Store Payment remote business UAT until a narrow UAT fixture/data setup Gate is approved and re-smoked.
13. Do not claim rollback/restore readiness until P1-007 owner-correct git status, backup evidence, compose evidence, and rollback/restore dry-run plan are complete.

## 2026-07-04 — Chanjet P0 Readonly Sync Evidence Ready

Current stage: `CHANJET_P0_READONLY_SYNC_EVIDENCE_READY`

Decision: `GO_WITH_CONDITIONS`

Evidence:

- Production readonly sync workflow run: `28702850632`
- Report: `docs/ops/CHANJET_P0_READONLY_SYNC_GAPS_EXECUTION_REPORT_20260704.md`
- Latest JSON: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
- Latest Markdown: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`

Results:

- P0 readonly endpoint coverage: `16/16`
- Field mapping coverage: `1684/1684`
- Matched mappings: `183`
- Pending semantic mapping review: `1501`

Next actions:

1. `CHANJET_P1_FINANCE_CARD_ALIGNMENT`
   - Align ERP financial dashboard/card figures to Chanjet readonly mirror口径.
   - Do not mix ERP business detail totals into financial-authority figures without a visible difference state.
2. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`
   - Review pending company/customer/supplier/project/cash-account/subject mappings.
3. `CHANJET_P3_RECONCILIATION_CENTER`
   - Build visible OK/WARN/MISMATCH/HOLD/NEED_MAPPING statuses for ERP vs Chanjet figures.

Do not start:

- Chanjet writes.
- Voucher push.
- Production DB manual writes.
- Silent overwrite of ERP figures with unmatched Chanjet mappings.

## 2026-07-04 — Chanjet P1 Finance Card Alignment Implemented

Current stage: `CHANJET_P1_FINANCE_CARD_ALIGNMENT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Finance report backend now distinguishes `covered` from `authorityEligible`.
- Finance metrics support `OK` / `WARN` / `MISMATCH` / `ERP_FALLBACK` / `NEEDS_MAPPING`.
- `/finance2/reports` now displays a Chanjet alignment panel for eight finance metrics.
- Today receipt/payment remain ERP current-day cash-flow authority until Chanjet payment business-date semantics are locked.
- Chanjet payment mirrors are comparison evidence only for now, not silent card overrides.

Evidence:

- Report: `docs/ops/CHANJET_P1_FINANCE_CARD_ALIGNMENT_IMPLEMENTATION_REPORT_20260704.md`
- API: `apps/api/src/modules/finance-v2/services/financial-reports.service.ts`
- Web: `apps/web/src/app/(admin)/finance2/reports/page.tsx`

Next actions:

1. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`
   - Build mapping review for company/account-book, customer/supplier/counterparty, project, cash account, subject, and expense type.
   - Generate confidence levels and manual-review rows.
2. `CHANJET_P3_RECONCILIATION_CENTER`
   - Surface OK/WARN/MISMATCH/HOLD/NEED_MAPPING differences between ERP operational detail and Chanjet financial authority.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until readonly coverage, mapping, and reconciliation are production-stable.

## 2026-07-04 — Chanjet P2 Master Data Alignment Audited

Current stage: `CHANJET_P2_MASTER_DATA_ALIGNMENT_AUDITED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime API: `GET /api/chanjet/integration/master-data-alignment`
- Ops runner: `scripts/ops/chanjet-master-data-alignment-audit.mjs`
- Report: `docs/ops/CHANJET_P2_MASTER_DATA_ALIGNMENT_AUDIT_REPORT_20260704.md`
- Latest outputs:
  - `docs/ops/runs/chanjet-master-data-alignment-latest.json`
  - `docs/ops/runs/chanjet-master-data-alignment-latest.md`

Results:

- Master-data mirror coverage: `100%`
- Scoped Chanjet mirror rows: `5959`
- Field mapping candidates: `1677`
- Pending semantic mappings: `1494`
- P0 domains needing review:
  1. `COUNTERPARTY`
  2. `SUBJECT`
  3. `CASH_ACCOUNT`

Next actions:

1. `CHANJET_P3_RECONCILIATION_CENTER`
   - Build visible ERP vs Chanjet rows with `OK / WARN / MISMATCH / HOLD / NEED_MAPPING`.
   - Start with AP/AR, cash account balance, subject balance, receipt/payment, and key financial statement figures.
2. `CHANJET_P2_MAPPING_REVIEW_QUEUE_UI`
   - Optional UI follow-up for reviewing P0 mapping domains.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P2/P3 are stable and separately approved.

## 2026-07-04 — Chanjet P3 Reconciliation Center Audited

Current stage: `CHANJET_P3_RECONCILIATION_CENTER_AUDITED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime API: `GET /api/chanjet/integration/finance-reconciliation`
- Ops runner: `scripts/ops/chanjet-reconciliation-center-audit.mjs`
- Report: `docs/ops/CHANJET_P3_RECONCILIATION_CENTER_AUDIT_REPORT_20260704.md`
- Latest outputs:
  - `docs/ops/runs/chanjet-reconciliation-center-latest.json`
  - `docs/ops/runs/chanjet-reconciliation-center-latest.md`

Results:

- P0 reconciliation items open: `8`
- `NEED_MAPPING`: `6`
- `NEED_MANUAL_REVIEW`: `2`
- No Chanjet write, no voucher push, no ERP business-table overwrite.

Next actions:

1. `CHANJET_P3_RECONCILIATION_CENTER_UI`
   - Surface visible rows for AR/AP, cash balance, today receipt/payment, subject balance, balance sheet, and income statement.
   - Show `OK / WARN / MISMATCH / HOLD / NEED_MAPPING / NEED_MANUAL_REVIEW` directly on the finance pages.
2. `CHANJET_P3_FIELD_SEMANTIC_LOCK`
   - Prioritize cash-account balance fields, GL balance opening/debit/credit/closing fields, and statement row amount fields.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 reconciliation statuses are reviewed and stable.

## 2026-07-04 — Chanjet P3 Reconciliation Center UI Implemented

Current stage: `CHANJET_P3_RECONCILIATION_CENTER_UI_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- UI entry: `/finance2/chanjet-integration`
- Tab: `对账差异`
- Runtime API consumed: `GET /api/chanjet/integration/finance-reconciliation`
- Report: `docs/ops/CHANJET_P3_RECONCILIATION_CENTER_UI_IMPLEMENTATION_REPORT_20260704.md`

Visible fields:

- Chanjet value.
- ERP auxiliary value.
- Difference.
- Status: `OK / WARN / MISMATCH / HOLD / NEED_MAPPING / NEED_MANUAL_REVIEW`.
- Evidence row counts and latest mirror pull time.
- Recommended action and reason.

Next actions:

1. `CHANJET_P3_FIELD_SEMANTIC_LOCK`
   - Lock cash-account balance, GL balance, balance sheet, income statement, and receipt/payment date/status semantics.
2. `CHANJET_P3_MAPPING_REVIEW_QUEUE`
   - Convert high-confidence field mappings into reviewed mapping decisions.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 has no P0 `NEED_MAPPING` / `NEED_MANUAL_REVIEW`.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
- DB writes before backup.
- further migration execution without a dedicated Gate.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.
- broad historical metadata backfill without explicit approval.
- actual historical metadata claim writes before a dry-run manifest is reviewed and explicitly approved.
- runtime deploy/restart of the legacy upload metadata change without a separate approved deploy or runtime verification Gate.
- rerunning live menu / role / user-scope repair except as idempotent verification or separately approved rollback/reconcile Gate.
- high-throughput write execution; high-throughput mode is read-only diagnosis/reporting only.
- deploy-chain mutation before `APPROVE_DEPLOY_CHAIN_HARDENING_PLAN`.
- executing MANUAL_REVIEW_REQUIRED user-scope rows from the dry-run package.
- executing action-bit legacy cleanup before a dedicated cleanup plan is approved.

## 2026-07-04 — Chanjet P3 Field Semantic Lock Implemented

Current stage: `CHANJET_P3_FIELD_SEMANTIC_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime semantic locks are attached to `GET /api/chanjet/integration/finance-reconciliation` items.
- New readonly API: `GET /api/chanjet/integration/finance-semantic-locks`.
- UI `/finance2/chanjet-integration` now shows semantic lock status, authority eligibility, pending fields, and next action.
- Report: `docs/ops/CHANJET_P3_FIELD_SEMANTIC_LOCK_IMPLEMENTATION_REPORT_20260704.md`

Next actions:

1. `CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS`
   - Extract cash-account real balance fields from raw snapshots.
   - Extract GL balance opening/debit/credit/closing fields.
   - Extract balance sheet and income statement line amount fields.
2. Lock receipt/payment business date and approval status filters before using Chanjet values for today receipt/payment cards.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 P0 semantic pending items are closed or explicitly accepted.

## 2026-07-04 — Chanjet P3 Field Semantic Extractors Implemented

Current stage: `CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-semantic-extractors`.
- UI entry: `/finance2/chanjet-integration`, tab `语义提取器`.
- The extractor scans ERP middle-layer `chanjet_entity_snapshots.raw_data` samples and proposes field candidates for each finance reconciliation metric.
- It does not call Chanjet write APIs, does not push vouchers, and does not overwrite ERP business tables.

Next actions:

1. `CHANJET_P3_FINANCE_READ_MODEL`
   - Build a readonly finance read model from READY extractors only.
   - Keep `CASH_BALANCE`, statements, and today receipt/payment blocked until required fields are confirmed.
2. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`
   - Lock business date and approval/void status filters before using Chanjet receipt/payment values for daily cards.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until the read model is stable and reviewed.

## 2026-07-04 — Chanjet P3 Finance Read Model Implemented

Current stage: `CHANJET_P3_FINANCE_READ_MODEL_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-read-model`.
- UI entry: `/finance2/chanjet-integration`, tab `财务 Read Model`.
- Metrics are classified as `AUTHORITY_READY`, `READONLY_READY`, `BLOCKED_MAPPING`, `WAITING_SAMPLE`, `NEED_MANUAL_REVIEW`, or `HOLD`.
- Only `AUTHORITY_READY` metrics may feed primary finance cards.

Next actions:

1. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`
   - Lock receipt/payment business date, posting date, approved status, void status, and direction semantics.
2. `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`
   - Wire only `AUTHORITY_READY` values into finance cards and keep ERP auxiliary values visible.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked.

## 2026-07-04 — Chanjet P3 Finance Card Semantic Lock Expansion Implemented

Current stage: `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-card-semantic-expansion`.
- New audit runner: `scripts/ops/chanjet-finance-card-semantic-expansion-audit.mjs`.
- Latest artifacts:
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.json`
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.md`
- Verified all 8 finance cards have readonly endpoint evidence.
- Preserved the hard guardrail that coverage is not authority.

Key decision:

- `AUTHORITY_READY` remains the only primary-card switch.
- `FIN_ACCOUNT`, `GL_BALANCE`, and statement endpoint `amountSum=0` values are not treated as real business zeroes until field semantics are locked.
- Today receipt/payment remain blocked until date/status/direction semantics are finance-confirmed.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW`
   - Use the new runtime API after deploy to inspect live per-card blockers.
   - Promote only `AUTHORITY_READY` cards.
2. `CHANJET_P3_RECEIPT_PAYMENT_FINANCE_CONFIRMATION`
   - Confirm business date, posting date, approved status, void status, direction, and amount rules.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until voucher draft/review/idempotency/rollback Gates are separately approved.

## 2026-07-04 — Chanjet P3 Receipt/Payment Date Status Lock Implemented

Current stage: `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/receipt-payment-locks`.
- UI entry: `/finance2/chanjet-integration`, tab `收付款日期状态锁`.
- Locks required dimensions for today receipt/payment metrics: business date, posting date, approved status, void status, direction, and amount.
- Keeps finance card authority switching blocked until finance confirms these dimensions and the next wiring gate is implemented.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`
   - Wire only finance-reviewed, authority-ready values into finance cards.
   - Keep ERP auxiliary values and differences visible.
2. Finance confirms receipt/payment business date, posting date, approval/void status, and direction semantics.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until card authority wiring and review are complete.

## 2026-07-04 — Chanjet P3 Finance Card Authority Wiring Implemented

Current stage: `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING_IMPLEMENTED`

## 2026-07-13 — Chanjet P0 Baseline / Counterparty / Book Mapping Gate

Current stage: `CHANJET_P0_BASELINE_COUNTERPARTY_BOOK_MAPPING_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. Deploy and execute the new read-only `baseline-readiness` and `account-book-mapping-gate` endpoints.
2. Preview customer/supplier counterparty candidates, then generate only `PENDING` exact-match candidates.
3. Resolve `CONFLICT`, `UNKNOWN`, and unmatched rows before approving mappings.
4. Rerun the finance Read Model authority Gate after approved mapping coverage is sufficient.
5. Keep Chanjet writeback, voucher push, and silent ERP business-table overwrite blocked.

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-card-authority`.
- `/api/v2/finance/reports/overview` now uses Chanjet as a primary card value only when the matching read model metric is `AUTHORITY_READY`.
- `/finance2/reports` now shows card authority wiring, read model status, Chanjet value, ERP auxiliary value, and visible difference.
- Today receipt/payment remain blocked from Chanjet primary authority until finance confirms business date / posting date / approval status / void status / direction semantics.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA`
   - Smoke the finance report UI and verify each card clearly shows source, status, Chanjet value, ERP auxiliary value, and difference.
2. `CHANJET_P3_RECEIPT_PAYMENT_FINANCE_CONFIRMATION`
   - Finance confirms the date/status/direction rules for receipt/payment before today cards can switch authority.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked.

## 2026-07-04 — Chanjet P3 Finance Card Source Switch Audit

Current gate: `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT_IMPLEMENTED`.

System-enforced source switch rule:

1. `AR_OPEN` and `AP_OPEN` are the only cards allowed to use Chanjet primary values.
2. `CASH_BALANCE`, `TODAY_RECEIPT`, and `TODAY_PAYMENT` must remain ERP-primary until field/date/status/direction semantics are locked.
3. `SUBJECT_BALANCE`, `BALANCE_SHEET`, and `INCOME_STATEMENT` are Chanjet readonly report sources, not ERP operational primary cards.
4. Finance reports must show source, pulled time, ERP auxiliary value, diff, and blocker reason where applicable.

Next action:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA`
2. Verify `/finance2/reports` source badges and diff display.
3. Verify no page silently treats blocked Chanjet values as primary values.

## 2026-07-05 — Bug Intake AI Repair Pipeline V2

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. `BUG_REPORT_ADMIN_TIMELINE_UI`
   - Show user report, triage, Agent plan, queue state, worker result, local runner lifecycle, push and CI/CD result in one timeline.
2. `CI_CD_DEPLOY_CALLBACK_TO_BUG_REPORT`
   - Let remote CI/CD write deployment result back into the originating bug report when available.
3. `BUG_INTAKE_RETRY_POLICY_FOR_SAFE_UI_FIXES`
   - Add a controlled retry policy for safe A4/A1 UI-only repairs.

## 2026-07-06 — Bug Intake Pipeline V3 Resilience

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. `CI_CD_DIRECT_BUG_CORRELATION_CALLBACK`
   - When a deployment can identify one or more source bug numbers, CI/CD should write `BugIntakeCICD` results directly to those reports.
2. `AUTHENTICATED_PLAYWRIGHT_POST_DEPLOY_SMOKE`
   - Upgrade HTTP route smoke to authenticated browser smoke for high-impact UI fixes.

## 2026-07-06 — Chanjet P3 Subject Balance Readonly Report

Current stage: `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Backend API: `GET /api/chanjet/integration/subject-balance-readonly-report`.
- UI entry: `/finance2/chanjet-integration`, tab `科目/报表只读`.
- Readonly report coverage: `SUBJECT_BALANCE`, `BALANCE_SHEET`, `INCOME_STATEMENT`.
- Audit artifact: `docs/ops/runs/chanjet-subject-balance-readonly-report-latest.*`.

Next actions:

1. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Generate ERP voucher drafts from approved readonly evidence only.
   - Keep Chanjet writeback and voucher push blocked.
2. Keep finance-card primary source switches gated by explicit authority rules.
3. Continue data mapping cleanup for subject, project, cash account, counterparty, and report-line fields.

## 2026-07-14 — Chanjet Full Readonly Functional Closeout

Current stage: `CHANJET_FULL_READONLY_FUNCTIONAL_CLOSEOUT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Complete readonly cycle: mirror sync → exact mapping → idempotent reconciliation → production readiness.
- Four-hour scheduler now runs the complete cycle under the existing advisory lock and retry policy.
- Reconciliation no longer duplicates an unchanged open issue and automatically closes issues that disappeared.
- Admin console can run and inspect the complete cycle; ordinary users remain unaware of the integration middle layer.

Next actions:

1. `CHANJET_FULL_READONLY_ALIGNMENT_PRODUCTION_VERIFY`
2. `CHANJET_NON_DETERMINISTIC_MAPPING_REVIEW` (353 pending candidates; no fuzzy auto-approval)
3. `KEEP_CHANJET_WRITEBACK_BLOCKED`

## 2026-07-14 — Chanjet Counterparty Autonomous Resolution

Current stage: `CHANJET_COUNTERPARTY_AUTONOMOUS_RESOLUTION_DEPLOYED`

Decision: counterparty mapping `GO`; wider readonly lifecycle `GO_WITH_CONDITIONS`.

Completed:

- 411 / 411 live customer/supplier candidates now have approved deterministic outcomes.
- 51 candidates map to unique ACTIVE ERP masters.
- 360 candidates remain isolated `SOURCE_ONLY` readonly identities.
- Live pending, conflict, unknown-role, and human-review counts are all zero.
- 72 historical CUSTOMER records with current SUPPLIER role evidence were rejected with an audit trail, not deleted.

Next actions:

1. `CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`
2. Promote only authority-ready readonly finance metrics with visible ERP differences.
3. `KEEP_CHANJET_WRITEBACK_BLOCKED`
