# Phoenix ERP Batch 4 Productization Audit

日期：2026-10-01  
基线：`origin/main`  649254b9cf71f6ba567419803b4adec5ec1a299c

## A. Current Baseline

```text
MAIN_HEAD=649254b9cf71f6ba567419803b4adec5ec1a299c
PRODUCTION_APPLICATION_COMMIT=2ec1ff30b20ac48cc7665a9e7acebff43f3b5885
BRANCH=codex/batch4-productization
WORKTREE=/home/jinhuit/.codex/worktrees/batch4-productization/phoenix-erp-v3
BATCH3_UAT_STATUS=独立进行中；本审计未读取、修改或合并其 worktree
```

本次扫描只读取最新 main 的源码、测试和 `docs/ops` 证据；未连接生产数据库，也未执行生产写入。生产运行时的 legacy 行数、附件元数据数量需要受控只读查询后才能给出数值。

## B. Current Product Gap Matrix

| ID | Feature | Current behavior | Expected behavior | Priority | Business blocker | Root cause | Dependency | Suggested batch |
|---|---|---|---|---|---|---|---|---|
| B4-01 | 移动审批“已办”计数 | `history` 已从 `approvalApi.getHistory()` 加载，但 tab 元组把计数写成常量 `0`；列表有数据时角标仍不显示（`apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1117-1125,1282`）。 | 已办角标显示当前已加载/后端返回的真实已办数量，并随刷新更新。 | P2 | 重要使用反馈缺失，审批历史仍可打开。 | UI 忽略已办数据长度/总数。 | 需确认 `getHistory` 返回是否有 `total`；无需 schema。 | Batch 4C |
| B4-02 | 门店收款导出 | 有 `MENU_STORE_PAYMENT_EXPORT:X` 权限判断，但按钮固定 `disabled`，文案明确为“导出暂未开放”；当前 API 没有导出闭环（`apps/web/src/app/(admin)/store-payment/page.tsx:717-720`）。 | 授权财务/管理员可按当前筛选和 DataScope 导出审计可追溯的 CSV/XLSX。 | P2 | 收款记录可查询、确认和作废；导出是重要运营能力但有人工绕行。 | 只有菜单和权限契约，缺少 API、序列化和下载审计实现。 | 需确认 MVP 是否纳入导出；涉及 API + UI + export regression。 | Batch 4B（业务决定后） |
| B4-03 | 销售库存 SKU legacy compatibility | 核心服务仍保留 PATH A `sku_code` 与 PATH B `product_code + quality_grade` 双路径；注释明确 H5 后才逐步移除（`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:375-405,451-462,502-514`）。 | 新数据统一以 SKU 为权威；旧数据有明确收口/保留策略，不能出现两套语义无审计并存。 | P2 | 兼容路径避免旧库存不可售；混合数据可能造成 SKU 维度追溯不完整。 | 历史批次和订单尚未证明全部完成 SKU 回填。 | 必须先做受控只读统计：`LEGACY_DATA_COUNT`、订单/批次/退货覆盖率；再决定 backfill 或继续兼容。 | Batch 4A（先审计，后决定） |
| B4-04 | Store Payment attachment ACL | Store Payment service 已按对象 owner、公司/门店 scope 调用受控文件状态和打开接口（`apps/api/src/modules/store-payment/store-payment.service.ts:270-327,540`）；但无 metadata/ACL 时返回 `access_pending`，前端保持预览/下载禁用。 | 已授权门店/财务可预览和下载所属附件；跨门店、跨公司、IDOR 必须拒绝；缺元数据时状态可解释。 | P1（闭环依赖数据配置） | 付款凭证/二维码无法核验时，门店收款正式运营无法完整闭环。 | 文件元数据/ACL 与业务对象绑定尚未证明在最新生产数据上完成；代码路径本身已有 scope gate。 | 需要受控环境验证 authorized / finance-admin / unauthorized / cross-store / cross-company / direct-ID；不能用假附件绕过。 | Batch 4B（先复验，必要时补集成） |

## C. Historical Candidate Revalidation

| Candidate | Status | Evidence / conclusion |
|---|---|---|
| `SKU_LEGACY` | **CONFIRMED** | PATH B 仍被查询和 FIFO 分配使用，且代码保留 H5 TODO。`LEGACY_DATA_COUNT`、真实 API 调用量和生产 UI 使用量本轮未连接生产 DB/日志，记为 `NOT_OBTAINED`；不能据此删除兼容路径。 |
| `STORE_ATTACHMENT_ACL` | **CONFIRMED** | owner scope、受控 status/preview/download endpoint 已存在，但缺文件元数据或授权时稳定返回 `access_pending`；需要真实四角色/跨范围复验，不能宣称已完全闭环。 |
| `WORKFLOW_DONE_COUNT` | **CONFIRMED** | 移动端历史数据已加载，却在 `page.tsx:1282` 将已办计数固定为 `0`；这是可直接复现的前端缺口。 |
| `STORE_EXPORT` | **CONFIRMED** | 页面仍渲染 disabled export button；现有 Store Payment service/controller 未发现 export endpoint。实现前需确认是否纳入当前 MVP。 |
| `NOTIFICATION_CHANNEL` | **NOT_REQUIRED**（当前 V1） | dispatcher 仅实现 `STATION` 与 `PUSH`，其他 channel 明确抛出 V1 unsupported（`notification-dispatcher.service.ts:245-263`）。仓库当前产品声明和 UI 主要围绕站内/PUSH；没有 SMS/EMAIL/WECHAT 的已批准业务需求，不把能力边界误判为缺陷。 |

## D. Dependencies

| Area | Finding |
|---|---|
| FILE_OVERLAP | Batch 4A 主要触及 sales-v2 inventory service/tests；Batch 4B 触及 store-payment API/UI/tests；Batch 4C 首批只触及 mobile workflow UI/tests。直接文件重叠低。 |
| MODULE_OVERLAP | 共享权限/DataScope 语义不能由多个 track 同时改；由主线 owner 统一复核。 |
| DB_DEPENDENCY | B4-01 无 schema；B4-02 无 schema 仅在复用现有查询导出时；B4-03 先只读统计，任何 backfill 必须单独数据迁移/脚本与回滚；B4-04 依赖 file metadata/ACL 现状，不假设新增表。 |
| UAT_DEPENDENCY | B4-02 会影响 store/payment UAT，必须标记 `UAT_AFFECTED=YES` 并让 Batch 3 UAT Closure 在新部署版本复验。B4-01 影响 mobile workflow journey；B4-03 影响 sales/WMS journey。 |

## E. Priority

```text
P0=无
P1=B4-04（附件 ACL/元数据闭环，需真实受控复验）
P2=B4-01、B4-02、B4-03
P3=无（本轮不拉入纯体验或历史 TODO）
```

## F. Proposed Execution

### BATCH4_A — SKU compatibility evidence and controlled convergence

- **GOAL**：量化 legacy 批次/订单/退货依赖，确认能否逐步收口 PATH B。
- **SCOPE**：只读 SQL/审计报告、sales-v2 回归；不得直接删除兼容路径。
- **ROOT_CAUSE**：历史记录仍可能只有 `product_code/quality_grade`，SKU 回填覆盖率未知。
- **FILES**：`egg-inventory.service.ts`、相关 sales-v2 specs、`docs/ops` 审计；若需数据修复另立脚本/迁移。
- **DATA_IMPACT**：首阶段只读；后续 backfill 必须可回滚并区分 schema/data/runtime 三层。
- **SECURITY_IMPACT**：保持公司/仓库/DataScope 与 `legacy_source IS NULL` 过滤。
- **TEST_PLAN**：new SKU、legacy SKU、mixed state、重复/重试、库存流水追溯。
- **RELEASE_PLAN**：独立 checkpoint；只有覆盖率和业务规则确认后才考虑移除 PATH B。

### BATCH4_B — Store Payment operational closure

- **GOAL**：完成附件 ACL 真实复验，并在业务批准导出后实现受控导出。
- **SCOPE**：protected attachment access regression；可选 export API/UI/audit。
- **ROOT_CAUSE**：附件链路依赖 file metadata/ACL；导出只有权限菜单，没有实现。
- **FILES**：`store-payment.service/controller`、`store-payment/page.tsx`、对应 specs/E2E。
- **DATA_IMPACT**：默认无 schema；若 file metadata 绑定缺失，先走数据配置/受控运维，不在功能提交中伪造数据。
- **SECURITY_IMPACT**：authorized、finance/admin、unauthorized、cross-store、cross-company、direct URL/IDOR 必测。
- **TEST_PLAN**：附件 status/preview/download；导出筛选、DataScope、权限、审计和大结果集限制。
- **RELEASE_PLAN**：导出需业务确认后才进入实现；附件验证通过才可宣称闭环。

### BATCH4_C — Workflow / notification / mobile UX gaps

- **GOAL**：修复移动审批已办角标；保持通知 V1 能力边界清晰。
- **SCOPE**：mobile workflow count + focused regression；不实现未批准的 SMS/EMAIL/WECHAT。
- **ROOT_CAUSE**：历史列表接入后计数仍为占位常量。
- **FILES**：`apps/web/src/app/(mobile)/mobile/workflow/page.tsx`、相关 mobile workflow tests。
- **DATA_IMPACT**：无 schema/数据迁移。
- **SECURITY_IMPACT**：沿用现有 workflow permission/API，不改变 DataScope。
- **TEST_PLAN**：已办非空、已办为空、刷新、待办与已办切换、无权限不渲染。
- **RELEASE_PLAN**：首个实现 checkpoint；Web typecheck + focused unit/component + build。

## G. Parallelization

```text
CAN_RUN_IN_PARALLEL=BATCH4_A audit 与 BATCH4_C implementation 可并行；BATCH4_B 的附件复验可只读并行。
MUST_RUN_SERIAL=任何共享 DataScope/权限、file metadata、导出 API 契约变更必须由主线串行；SKU runtime removal 必须在数据统计和 UAT 决策后进行。
```

## H. Proposed First Implementation Batch

```text
GOAL=修复移动审批“已办”tab 的占位计数
SCOPE=使用已加载 history 的真实数量（先确认 API response contract），补 focused regression
FILES_EXPECTED=apps/web/src/app/(mobile)/mobile/workflow/page.tsx + mobile workflow test
MIGRATION_EXPECTED=NO
TEST_PLAN=已办非空/空列表、刷新后更新、待办角标不回归；Web typecheck、affected unit/component、Web build
RELEASE_GATE=NEW_LINT_REGRESSION=0；typecheck/build/focused tests PASS；不改变权限和 API
```

```text
BATCH4_AUDIT_COMPLETE=YES
READY_FOR_BATCH4_IMPLEMENTATION=YES
```
