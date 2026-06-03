# Phoenix ERP V3 — Go-Live Checklist（R6）

> 日期：2026-06-03 · 上线范围：孟赛（FARM-MS）PACKAGING_INBOUND 灰度先行，东鹏（FARM-DP）维持 TEMP。

## ✅ 上线前检查清单

| # | 项 | 负责人 | 状态 | 说明 |
|---|----|--------|------|------|
| 1 | **部署** ca07ab3 Build/Migration/Deploy 全绿 | DevOps | ✅ | gh run 26862769735 success（8m2s） |
| 2 | **数据库** 迁移累积执行无红灯（含 R1/R3/R5/P1E 迁移） | DBA | ✅ | deploy.yml ON_ERROR_STOP=1 |
| 3 | **测试数据清理** 执行 `scripts/go-live-data-reset.sql`（一次性手动，**非 CI**） | DBA | ⏳ 待执行 | 本地预演通过；保留主数据 |
| 4 | **主数据** 组织/场站/鸡舍/鸡群/等级/规格/SKU/客户/供应商/门店/司机/角色/DataScope | 运营 | ⏳ 生产核对 | 本地齐备；供应商/门店/司机需生产确认 |
| 5 | **权限** rbac.matrix 与 sys_menu 一致；MENU_TRACEABILITY_* 已授 | 安全 | ✅ | R5 迁移已 seed |
| 6 | **库存来源模式** GROUP/ALL=TEMP；SITE/FARM-MS=PACKAGING_INBOUND；SITE/FARM-DP=TEMP | 运营 | ✅ | inv_source_mode 已配 |
| 7 | **包装** terminal/packaging 全链（开班→集蛋→分级→包装→交接）；shift-open 必选场站 | 车间 | ⏳ HTTP 冒烟 | R3 已接 SITE/SPEC/SKU |
| 8 | **销售** Sales V2 订单/配送/退货；FIFO + legacy 隔离 | 销售 | ⏳ HTTP 冒烟 | R4 审计统一 |
| 9 | **POS** api/v2/store-sales 现金/赊销/混合；旧 api/v3/pos 已注销 | 门店 | ⏳ HTTP 冒烟 | R4.1 清理 |
| 10 | **财务** 销售→AR→收款→现金账户；POS→现金/AR | 财务 | ⏳ HTTP 冒烟 | R4 确认（运营层，无 GL） |
| 11 | **追溯** /api/traceability/* + /traceability 页 | QA | ✅ 已上线 | R5；DB 冒烟通过 |
| 12 | **备份** 上线前全库备份 + reset 前备份 | DBA | ⏳ | pg_dump |
| 13 | **监控** SystemMonitor + 部署红灯告警 | DevOps | ✅ | 现有 |
| 14 | **回滚方案** 见下 | DevOps | ✅ | 模式切回 TEMP + 代码 revert |
| 15 | **上线时间** 待定（孟赛灰度窗口） | PM | ⏳ | — |

## 🔁 回滚方案

1. **库存来源**：孟赛出问题 → `inv_source_mode(SITE,FARM-MS)` 切回 `TEMP_PRODUCTION_INBOUND`（经 /warehouse/source-mode 风险评估），包装入库立即停，回到日产蛋入库，**现场不断货**。
2. **代码**：`git revert` 对应 commit（main 保留历史，非强推）+ 重新部署。
3. **数据**：保留 reset 前 pg_dump，必要时恢复。
4. **追溯/旧 POS**：纯新增/注销，无破坏性，无需回滚。

## 📋 上线日操作顺序

1. 全库 pg_dump 备份。
2. 执行 `scripts/go-live-data-reset.sql`（先 BEGIN 预演核对删除量 → COMMIT）。
3. 生产核对主数据（供应商/门店/司机/场站/SKU）。
4. 执行 HTTP 全链冒烟（见 R6 报告 runbook 五场景）。
5. 确认孟赛 FARM-MS=PACKAGING_INBOUND，开始真实业务。
6. 观察 3–7 天（库存/销售/退货/追溯/异常）。
7. 评估东鹏 FARM-DP 切换。
