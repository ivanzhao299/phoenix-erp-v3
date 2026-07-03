# 好业财中间层完整交付报告

日期：2026-07-03  
阶段：CHANJET_FULL_INTEGRATION_MIDDLE_LAYER_COMPLETE  
结论：GO WITH CONDITIONS

## 1. 本轮目标

把好业财对接从“只读同步/字段探针基础能力”补齐为可运营的中间层：

- 账套缓存
- API 字段目录
- ERP ↔ 好业财主数据映射候选
- 映射审核
- 映射对账结果
- 凭证草稿
- 同步/探针/对账作业审计
- 财务端统一管理页面

## 2. 新增/修改文件

后端：

- `apps/api/src/modules/chanjet/chanjet-voucher-draft.entity.ts`
- `apps/api/src/modules/chanjet/chanjet-reconciliation-result.entity.ts`
- `apps/api/src/database/migrations/1782741000000-CreateChanjetVoucherDraftAndReconciliation.ts`
- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/api/src/modules/chanjet/chanjet.module.ts`

前端：

- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `apps/web/src/app/(admin)/finance2/page.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`

文档：

- `docs/ops/CHANJET_FULL_INTEGRATION_MIDDLE_LAYER_COMPLETE_REPORT_20260703.md`

## 3. 中间层表

新增 TypeORM migration：

`apps/api/src/database/migrations/1782741000000-CreateChanjetVoucherDraftAndReconciliation.ts`

新增表：

1. `chanjet_voucher_drafts`
   - 保存 ERP 侧凭证建议草稿。
   - 支持 `DRAFT / REVIEWED / PUSH_READY / REJECTED`。
   - `PUSH_READY` 仅表示“可申请推送 Gate”，不自动推送好业财。
   - `push_allowed` 默认 false。

2. `chanjet_reconciliation_results`
   - 保存中间层对账差异。
   - 支持 `MASTER_MAPPING / AR_LEDGER / AP_LEDGER / VOUCHER_DRAFT / FIELD_CATALOG`。
   - 当前实现主数据映射对账。
   - append-only 优先，不删除历史差异。

## 4. 后端 API

新增或补齐：

- `GET /api/chanjet/integration/overview`
- `GET /api/chanjet/integration/voucher-drafts`
- `POST /api/chanjet/integration/voucher-drafts`
- `POST /api/chanjet/integration/voucher-drafts/:id/status`
- `GET /api/chanjet/integration/reconciliation-results`
- `POST /api/chanjet/integration/reconciliation/run`

保留既有：

- `GET /api/chanjet/integration/probe-endpoints`
- `GET /api/chanjet/integration/account-books`
- `POST /api/chanjet/integration/account-books/refresh`
- `POST /api/chanjet/integration/probe`
- `GET /api/chanjet/integration/field-catalog`
- `GET /api/chanjet/integration/sync-jobs`
- `GET /api/chanjet/integration/master-mappings`
- `POST /api/chanjet/integration/master-mappings/:id/review`

权限：

- 只读：`MENU_FIN2_AR_LEDGER:V`
- 写中间层：`MENU_FIN2_AR_LEDGER:E`

## 5. 前端页面

新增页面：

`/finance2/chanjet-integration`

页面能力：

- 账套缓存总览
- 字段目录查看
- 主数据映射审核
- 映射对账运行
- 对账差异查看
- 凭证草稿创建与状态审核
- 作业审计查看

入口：

- 财务管理中心卡片：好业财中间层
- 左侧财务菜单：好业财中间层

## 6. 安全边界

本轮没有：

- 没有执行 migration。
- 没有调用好业财写接口。
- 没有推送凭证。
- 没有写 ERP 业务主数据表。
- 没有写 ERP 财务业务事实表。
- 没有部署。
- 没有 push。

中间层原则：

- ERP 业务事实仍以 ERP 单据/主数据为权威源。
- 好业财是财务核算系统，不反向覆盖 ERP 业务主数据。
- 好业财只读探针产生的候选必须人工审核。
- 凭证草稿必须独立 Gate 后才可进入真实推送开发。

## 7. 验证结果

- API typecheck：PASS
- Web typecheck：PASS
- Migration down() gate：PASS
- Migration no-data-DML gate：PASS
- Nullable unique gate：PASS
- `git diff --check`：PASS
- W5 closeout gate：PASS with explicit `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true`

说明：W5 裸跑会按设计拦截 API/Web/migration/Chanjet 关键边界。本轮属于已授权的好业财中间层开发，使用显式 allow 复核后其它门禁全部通过。

## 8. 当前限制

1. 真实好业财字段采样仍依赖有效 `CHANJET_APP_KEY / APP_SECRET / CERT / TOKEN`。
2. 凭证推送未实现，这是刻意保留的独立高风险 Gate。
3. 映射对账当前覆盖主数据映射层，AP/AR/GL 深度对账需进入下一阶段。
4. 好业财完整字段语义仍需通过真实 probe 和人工财务确认逐步固化。

## 9. 下一步建议

1. 执行受控 probe，补齐账套、部门、往来单位、科目、项目、资金账户字段 catalog。
2. 由财务负责人审核 `chanjet_master_mapping` 中 PENDING 候选。
3. 将采购付款、费用报销、应收/应付、资金流水分别生成凭证草稿规则。
4. 单独启动 `CHANJET_VOUCHER_PUSH_GATE`，实现真实好业财凭证写入前的 A2/A1/A5 Gate。
5. 单独启动财务对账增强：ERP 单据 ↔ ERP 总账 ↔ 好业财科目余额。
