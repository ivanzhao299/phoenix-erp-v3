# 库存优化执行交付报告（inv-opt）

> 执行窗口：2026-11-17（单日完成）
> 方案：docs/inventory-optimization-plan-20261117.md（用户审查通过，四项裁决见 §1）
> 分支：`codex/inv-opt`（基线 origin/main @ cb42966ed）
> 执行模式：主协调代理 + 4 个独立批次执行代理，每批次协调者独立验收（重跑验证 + 代码抽检，不采信代理自报）

---

## 1. 用户裁决落实

| 裁决点 | 落实 |
|---|---|
| INV-102 直接删除 `POST /allocate` | ✅ 端点删除（d9b04b474）+ web 手动分配标签页清理（c55a8b5b3，-174 行） |
| INV-101 在途预占「跳过 + 人工复核」 | ✅ markExpiredBatches 跳过并返回 skippedInUse 清单 + 站内通知 MENU_SALES2_INVENTORY:V |
| INV-203 补 `legacy_source IS NULL` | ✅ getAvailableBatches 口径对齐分配路径 + PATH B 排除 SKU 批次消双计 + 前端三语口径说明 |
| INV-401 蛋品先行 | ✅ 批次成本法落地（见 §5），兽药不纳入本期 |

## 2. 执行总览（26 commits）

| 批次 | commits | 核心成果 |
|---|---|---|
| 1（P1 代码修复） | 7（含 1.5 web 清理） | 过期批重写（注入消除/死锁解除/守卫化/事务化）、allocate 端点+标签页删除、写路径公司 scope、store_code 错位修复、看板降级日志 |
| 2（DB 兜底+一致性） | 4 | CHECK+FK（NOT VALID，DMG 伪批次先行修复）、42 值 change_type 字典迁移、展示口径、FIFO 锁命名空间统一 + PG 并发集成测试（门控） |
| 3（域服务三步走） | 10 | 3a：24 处 ledger INSERT 收口为 1 处共享 writer（$5 恒为 store_code，列错位结构性根除）；3b：guardedBatchUpdate util（4 处标准形态迁入，wms 4 处特殊形态登记保持）；3c：fail-closed 状态机白名单（全部迁移来源注释溯源） |
| 4（蛋品计价层） | 5 | unit_cost/cost_change 列、入库计价（采购实取 prc2_order_items.unit_price / 生产 0 挂账待 F1）、出库结转（FIFO_OUT/EXPIRE_WRITEOFF）、valuation 金额汇总 API |
| 文档 | 2 | 方案入库、运营交接清单 |

## 3. 验证记录（协调者亲跑，非代理自报）

| 验证 | 基线（main） | 终态 |
|---|---|---|
| API tsc --noEmit | 0 errors | **0 errors** |
| API 全量 jest | 2008/0/453 | **2049/0/455**（+41 只增不减） |
| Web tsc / vitest | 0 / 831 | 0 / 831 |
| web-lint changed + ratchet | — | 双 PASS（债务零增长） |
| check-constraint-drift / nullable-in-unique / 迁移 down() / no-data-dml | — | 全绿（108 TS 迁移含 down()，新增 3 个迁移纯 DDL/字典白名单） |
| pnpm verify:changed（test:lint + lint:api + lint:web:changed + lint:web:ratchet + typecheck + test:unit + build） | — | **EXIT=0 全绿**（API+Web build 成功）。注：`pnpm lint:web` 全量 818 errors 为基线既有债务（ratchet 证实无文件/规则增长，main 基线同样不过全量 lint——故按项目债务期定义跑 verify:changed） |

## 4. 协调者决策与偏离记录（审查重点）

1. **批次成本法替代移动平均**（INV-401）：unit_cost 挂批次、出库按所属批次结转——与批次级 FEFO 台账天然契合，审计链清晰；移动平均可后续在批次成本数据上做月度聚合。fin 凭证对接/月结报表按交接 F3 留待财务口径。
2. **F1 事实**：brd_daily_logs 无成本列（代理全库核实），生产入库暂 0 挂账，代码注释已标注待财务裁决；采购路径实取 prc2_order_items.unit_price（wms_inbound_items 基线即有 unit_cost 列，已采用）。
3. **wms 4 处守卫形态不迁移**（3b）：GREATEST 钳位吸收语义、SET 内业务归一——与 fail-closed 模型不同，强行归一改变生产行为；已逐处登记。
4. **新发现缺口**（3c 暴露）：farm 用药撤销路径可将 EXPIRED 批次强制翻回 AVAILABLE（理论缺口，farm 域现有库存量级低）；建议 farm 专项处理，状态机已就位可低成本拦截。
5. **DMG 边界补充**（批次 2 代理）：accepted=0 纯破损退货先补建 DAMAGED 态隔离批次行——FK 硬约束下的必要补充。
6. **allocate 端点前置事实修正**：方案原文「web 无调用」有误（相对路径调用漏检），执行中发现并已清理；scope-audit 教训已写入 commit message（相对路径需单独审计）。

## 5. 交付物清单

- 代码：26 commits @ codex/inv-opt（见 git log）
- 迁移（3 个，随部署链自动执行）：InvBatchesIntegrityConstraints / InvLedgerChangeTypeDictSeed / InvEggCostingColumns
- 运维脚本（2 个，staging 先跑）：check-inv-batches-invariants.sql（只读预检）、fix-inv-ledger-store-company.sql（dry-run 默认）
- 共享模块（5 个）：inventory-ledger.writer / inventory-guarded-update.util / inventory-status-machine / inventory-lock.util / inv-ledger-change-types
- 新 API：GET /api/v2/sales/inventory/valuation（MENU_SALES2_INVENTORY:V）
- 运营交接：docs/inv-opt-ops-handoff-20261117.md（A 预检 → B 签字修复 → C g15 → D O1 → E issue532 回填 → F 批次 4 二期决策，含签字栏）

## 6. 未完成项（诚实声明）

- **CI 遗留红（与本次无关，#568/#569 同样红）**：rehearsal（Phase1 fixture，触发路径与本 PR 无交集）、Synthetic Migration-Aligned PG16/18（MAINTENANCE_HOLD=ROOT_READER_SCHEDULER_FILE_UNVERIFIED）、Legacy Maintenance（runner docker ETIMEDOUT flake）
- **既有 DI 缺口（本地严格 owned fixture 真跑暴露）**：farm-egg / package-quantity / daily-log-visibility 三个 pg.spec 的 test module 未跟上 ProductionInboundService 2026-11-11 新增的 SkuAvailabilityService 依赖（main 基线同样挂，已对照验证）——建议独立小 PR 补 providers
- **执行中发现并修复的回归（本次引入、当场修复）**：guardedBatchUpdate 双重取负（a90cd1d5a，CI 真 PG 抓获，本地 PG18 复现链修复验证）；4 个自建 fixture 缺 unit_cost/cost_change 列（b83c7d175）

- B 类生产数据修复、VALIDATE 窗口：待 A 类预检 + 签字（交接清单）
- INV-302 g15 Steps A-F / INV-303 O1 / INV-304 回填：需现场与业务输入（交接清单 C/D/E）
- INV-402 冻结审批单 / INV-403 追溯 QR / INV-404 itemCode 收口：按方案批次 4 后续（404 等 G202 生产切换）
- fin COGS 凭证对接与月结：待 F1/F3 财务口径
- PG 门控集成测试（FIFO 锁并发）：本地无 PG，部署后 staging 执行（交接 A3）
