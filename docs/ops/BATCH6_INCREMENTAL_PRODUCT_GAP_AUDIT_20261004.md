# BATCH 6 INCREMENTAL PRODUCT GAP AUDIT

日期：2026-10-04  
范围：`origin/main` 增量审计；不重复 Batch 4/5 external gates，不进行 repository takeover、全量架构/安全审计、CI redesign、migration architecture audit 或 lint cleanup。

## Batch 5 closure

Batch 5 的工程交付已完成，B5-01 已在 PR #314 合并并完成 Web-only 正式部署、CI 与生产 smoke。Batch 5 保持 closure pending，直到外部证据、业务决定和 UAT revalidation 完成：

```text
BATCH5_ENGINEERING_COMPLETE=YES
BATCH5_STATUS=CLOSURE_PENDING_EXTERNAL_INPUT
BATCH5_COMPLETE=NO
BATCH5_COMPLETE_BLOCKERS=external evidence; business decision; UAT revalidation
SALES_PRICING_REVALIDATION=PENDING
```

销售价格 UAT Closure Track 的复验范围为 `/sales2/pricing` → 价格异常 Tab：threshold、refresh、异常行、低于底价提示、empty state、error behavior、业务含义、定位信息和岗位权限。自动测试 PASS 不替代人工业务验收。

SKU legacy 与 Store export 不在本批次实现：

```text
SKU_LEGACY=WAITING_READ_ONLY_DB_EVIDENCE
SAFE_TO_RETIRE=NO
STORE_EXPORT=WAITING_BUSINESS_DECISION
BACKEND_EXPORT_API_EXISTS=NO
EXPORT_INFRA_EXISTS=NO
```

移动审批和门店收款附件复验也保留在独立 UAT Closure Track：

```text
MOBILE_WORKFLOW_REVALIDATION=PENDING
STORE_ATTACHMENT_REVALIDATION=PENDING
```

## Baseline

```text
LATEST_MAIN=83df98f8d43098c93055020b47e9a57f690cf15b
PRODUCTION_API_COMMIT=83df98f8d43098c93055020b47e9a57f690cf15b
PRODUCTION_WEB_COMMIT=83df98f8d43098c93055020b47e9a57f690cf15b
BRANCH=codex/batch6-product-gap
WORKTREE=/home/jinhuit/.codex/worktrees/batch6-product-gap/phoenix-erp-v3
```

`origin/main` 在审计期间因销售退货 P0 hotfix 从 `2eb39f73435be07733b012331e0c5707201feea8` 前进到 `adb1fc1960e087c616c0958f910fbadc589f1021`。PR #315 已通过 CI 并合并；生产 API 部署流水线 `37168676711` 成功，目标 SHA 与 API 镜像均为 `adb1fc1960e087c616c0958f910fbadc589f1021`，生产 `/api/health` 返回 `status=OK`、`db.connected=true`，未授权退货统计请求返回 `401`。该 hotfix 已抢占并完成，Batch 6 审计基线已同步到合并后的 main。

## Confirmed Gaps

### B6-01 — 采购收货无法按业务 PO 选择（P1）

`/procurement2/receipts` 的新建表单要求用户手填采购订单内部 ID 和 PO 号，两个字段都是普通文本输入；保存前如果没有内部 ID 会直接拒绝，明细只能在手工输入 ID 后再加载。证据：`apps/web/src/app/(admin)/procurement2/receipts/page.tsx:257-283,536-548`。采购发货单页面也重复同一模式（`shipments/page.tsx:463-487`）。

复现：采购 → 到货收货 → 新建 → 只知道业务可见 PO 号时无法完成收货；即使猜到内部 ID，也可以把一个 PO ID 与另一个 PO 号组合提交。`apps/api/src/modules/procurement-v2/services/receipts.service.ts:162-175,191-195` 只按 `poId` 校验采购单存在/状态，随后直接保存请求中的 `poNo`，没有服务端一致性校验。

分类：`CONFIRMED_PRODUCT_GAP`。这是 P1 核心收货流程阻塞，并包含可造成采购单据错链的数据完整性风险。预期行为是提供按 PO 号/供应商等业务字段搜索的授权采购单选择器，自动带出并锁定 PO 号/明细，同时服务端从已加载采购单派生或校验 PO 号。

### B6-02 — 门店收货页面绕过库存确认链（P1）

`/store/receiving` 当前只是 generic CRUD：字段只有 `order_no/wave_no/store_code/operator/status`，保存/删除直接调用 `crudApi.create/update/delete('store_receiving')`，状态可手工改成 `ACCEPTED`，没有 SKU、数量、明细或确认动作。证据：`apps/web/src/app/(admin)/store/receiving/page.tsx:37-63`。

真实 WMS 收货接口位于 `apps/api/src/modules/wms/inventory.controller.ts:44-60`，但其确认服务 `apps/api/src/modules/wms/wms.service.ts:1473-1485` 只更新 `wms_inbound.status='COMPLETED'`，不处理 `store_receiving`。复现：进入门店收货页面，新建无明细单据并手工改状态为 `ACCEPTED`；不会调用 `/api/inventory/receiving/orders/:order_no/confirm`，也不会形成门店库存入账。

分类：`CONFIRMED_PRODUCT_GAP`。这是 P1 门店收货/库存核心闭环断开；不能由 generic CRUD 状态值代替真实确认。

### P0 hotfix 已解决：销售退货 DataScope 与 SQL 注入

审计同时确认 `return-orders.service.ts` 的列表、详情、统计和分析缺少公司 DataScope，统计/分析还直接插入 `companyCode`。这属于 P0/P1 安全缺口，已按 hotfix 优先级在 PR #315 修复并部署：查询全部改为参数化并 fail-closed 应用公司范围，状态变更和创建路径也复用范围校验；新增 `return-orders.scope.spec.ts` 覆盖列表、详情、统计、分析和注入载荷。该项不作为 Batch 6 新的待实现问题重复计算。

## Priority

```text
P0=0（B6-00 已在 hotfix PR #315 修复、合并、部署）
P1=B6-01,B6-02
P2=0
P3=0
```

## Existing External Gates

```text
SKU_LEGACY=WAITING_READ_ONLY_DB_EVIDENCE
STORE_EXPORT=WAITING_BUSINESS_DECISION
MOBILE_WORKFLOW_REVALIDATION=PENDING
STORE_ATTACHMENT_REVALIDATION=PENDING
SALES_PRICING_REVALIDATION=PENDING
```

本轮未把上述项目重新列为 Batch 6 缺口，也未进行 SKU 兼容移除、回填、Store Export 实现或 UAT 状态臆测。

## Proposed Tracks

### Track A — Procurement receiving selector and PO integrity

```text
ISSUES=B6-01
MODULE=apps/web procurement2 receipts + apps/api procurement-v2 receipts service
EXPECTED_FILES=receipts/page.tsx; receipts.service.ts; focused web/API tests
DB_IMPACT=NO schema change; no data migration
SECURITY_IMPACT=Preserve procurement DataScope and approved PO visibility; server derives or verifies poNo
UAT_IMPACT=YES — procurement receiving happy path, wrong-PO rejection, refresh/error/empty states
DEPENDENCIES=Existing approved purchase-order list/detail API and current DataScope contract
CONFLICT_RISK=LOW; no shared WMS/DataScope/common DTO edits expected
```

### Track B — Store receiving inventory confirmation

```text
ISSUES=B6-02
MODULE=apps/web store/receiving + apps/api WMS/store receiving integration
EXPECTED_FILES=store/receiving/page.tsx; inventory controller/service; focused store/WMS tests
DB_IMPACT=UNKNOWN until current store_receiving and wms_inbound linkage is verified; no migration in first checkpoint
SECURITY_IMPACT=Must preserve store/company/warehouse scope and prevent generic CRUD status bypass
UAT_IMPACT=YES — store receiving detail, confirm, duplicate confirm, shortage/exception, inventory ledger evidence
DEPENDENCIES=Existing WMS receiving order/items/confirm contract and store warehouse binding
CONFLICT_RISK=MEDIUM; touches WMS confirmation semantics and may overlap store UAT closure
```

## Parallelization

```text
CAN_RUN_IN_PARALLEL=Track A static/API contract work and Track B read-only linkage mapping only
MUST_RUN_SERIAL=Any shared WMS confirmation, DataScope, store warehouse binding, or common DTO change; Track B implementation waits for Track A checkpoint and explicit linkage evidence
```

## Release Queue

```text
RELEASE_ORDER=1) hotfix B6-00 (DONE) → 2) Track A procurement receiving → 3) Track B store receiving
```

## First Implementation

```text
FIRST_TRACK=Track A
GOAL=让收货人员按业务 PO 号选择授权采购订单，自动带出明细并阻止 PO ID/PO 号错链
SCOPE=receipts UI selector/loading/error/empty states; server-side poId/poNo consistency; focused regression only; no schema/migration
TEST_PLAN=authorized PO selection; no-result/error; manual mismatch rejection; DataScope unauthorized PO rejection; existing receipt create/update regression; web/API typecheck
RELEASE_GATE=CI PASS; API/Web typecheck PASS; focused tests PASS; no new lint errors; procurement UAT handoff created; no production migration
```

```text
BATCH6_AUDIT_COMPLETE=YES
READY_FOR_BATCH6_IMPLEMENTATION=YES
```

Track A 不需要重大业务决定、生产真实凭据或破坏性 migration，且与正在进行的 P0/P1 hotfix 不冲突；因此按 Auto Proceed 规则进入独立实现 worktree。Track B 保持排队，直到 Track A checkpoint 完成并补齐门店收货表与 WMS 订单的只读关联证据。

## Status board

```text
LATEST_MAIN=83df98f8d43098c93055020b47e9a57f690cf15b
PRODUCTION_API_COMMIT=83df98f8d43098c93055020b47e9a57f690cf15b
PRODUCTION_WEB_COMMIT=83df98f8d43098c93055020b47e9a57f690cf15b
BATCH3_UAT_STATUS=CLOSURE_PENDING_EXTERNAL_INPUT
BATCH4_STATUS=CLOSURE_PENDING_EXTERNAL_INPUT
BATCH5_STATUS=CLOSURE_PENDING_EXTERNAL_INPUT
SKU_LEGACY=WAITING_READ_ONLY_DB_EVIDENCE
STORE_EXPORT=WAITING_BUSINESS_DECISION
MOBILE_WORKFLOW_REVALIDATION=PENDING
STORE_ATTACHMENT_REVALIDATION=PENDING
SALES_PRICING_REVALIDATION=PENDING
BATCH6_AUDIT=COMPLETE
BATCH6_CURRENT_TRACK=TRACK_A_RELEASED_TRACK_B_QUEUED
OPEN_P0=0
OPEN_P1=1
OPEN_P2=0
NEXT_ACTION=PROCUREMENT_UAT_HANDOFF_THEN_IMPLEMENT_TRACK_B_STORE_RECEIVING
```

## Track A release checkpoint

Track A 已完成实现、回归、合并和正式 full 部署：

```text
PR=316
MERGE_SHA=83df98f8d43098c93055020b47e9a57f690cf15b
CI=PASS
DEPLOY_RUN=37169870435
DEPLOY=PASS
PRODUCTION_SMOKE=PASS
PRODUCTION_MIGRATION=SKIPPED_NO_SCHEMA_CHANGE
```

收货页面现在从 `/api/v2/procurement/receipts/eligible-orders` 选择授权的 APPROVED/PARTIALLY_RECEIVED 采购订单，自动带出并锁定业务 PO 号；服务端拒绝 `poId` 与 `poNo` 不一致的提交，并从已加载采购单保存规范 PO 号。采购 UAT 已进入待验收状态，范围包括授权订单选择、搜索、空结果/错误反馈、正常收货和错链拒绝。

Track B（门店收货库存确认）仍是唯一开放的 Batch 6 P1，等待当前 Track A UAT checkpoint 后继续只读关联核验与实现。
