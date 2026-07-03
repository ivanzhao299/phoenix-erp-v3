# Next Actions

Last updated: 2026-07-03

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
7. 生产同步报告:
   - `docs/ops/CHANJET_READONLY_MIRROR_PRODUCTION_SYNC_REPORT_20260703.md`

同步结果:

1. 原始快照: 46。
2. 原始行数: 1956。
3. 实体镜像行数: 1846。
4. 字段差异候选: 1677。
5. HIGH 风险字段候选: 1518。

下一步:

1. `CHANJET_FIELD_GAP_REVIEW_GATE` — 审查 1677 个字段差异候选，按 endpoint / risk / ERP domain 聚合。
2. `CHANJET_ERP_SCHEMA_ADAPTATION_PLAN` — 只生成 ERP 端字段适配计划，不直接改 schema。
3. `CHANJET_WRITE_BACK_HOLD` — 继续禁止写好业财，直到用户另行批准写回 Gate。

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
