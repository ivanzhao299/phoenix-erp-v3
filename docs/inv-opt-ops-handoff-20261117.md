# 库存优化 — 运营交接清单（代码无法自动完成项）

> 配套：docs/inventory-optimization-plan-20261117.md
> 状态：随批次 1~3 代码合并后执行；各项按依赖顺序排列
> 原则：生产数据操作逐项签字后执行（方案 §8 红线）

---

## A. 合并部署后立即（staging/生产只读预检，无风险）

| # | 操作 | 命令/位置 | 判据 |
|---|---|---|---|
| A1 | 库存不变量预检（三计数） | `scripts/check-inv-batches-invariants.sql`（批次 2 交付，只读） | 负数量 / 超可用 / ledger 孤儿 三计数清点；**非零行登记到本文件附录再走 B 类处置** |
| A2 | store_code 误写甄别 dry-run | `scripts/fix-inv-ledger-store-company.sql` 默认 dry-run | 输出待修行数与样例；**确认无真实门店误伤后才可 B2 apply** |
| A3 | PG 并发集成测试 | staging：`PACKAGING_HISTORY_PG=1` 跑 `inventory-fifo-lock.pg.integration.spec.ts`（批次 2 交付，egg×10 + POS×10 并发守恒断言） | 20 路全成功、数量守恒、第 21 路双侧拒单 |

## B. 签字后执行（生产数据修复，一次性）

| # | 操作 | 前置签字 | 回滚 |
|---|---|---|---|
| B1 | `INV_LEDGER_CHANGE_TYPE` 字典迁移 + `ck_inv_batches_qty`/`fk_inv_ledger_batch` NOT VALID 约束 | 无需单独签字——随部署链自动执行（deploy.yml MIG_MODE=prod） | 迁移 down() 已含 |
| B2 | store_code 误修 apply | A2 dry-run 输出 + 业务确认 | 脚本单事务，失败自动回滚 |
| B3 | 存量违例清零（若 A1 非零） | 逐批人工裁决（历史 EGG-STOCK-*/PRD-EGG-* 等 legacy 批次按 RUNBOOK §3.4 判定为历史脏数据的登记归档） | 归档不删除 |
| B4 | 约束 VALIDATE | A1 三计数=0 后运维窗口 | `VALIDATE CONSTRAINT` 仅 SHARE UPDATE EXCLUSIVE 锁，秒级；失败即 NOT VALID 保持 |

## C. INV-302 g15 Steps A-F（依赖业务输入）

| 步骤 | 内容 | 谁做 | 阻塞点 |
|---|---|---|---|
| A-D | `inv_source_mode` SITE 键修正（`FARM-MS` → `SITE-MENGSAI-LAYER`）；egg-ledger 死页下线/改口径 | DBA + 前端小改 | 需确认孟赛当前实际 site_code 值（g15 审计后可能已变） |
| E | 真实仓库主数据导入（≥4 仓：蛋品/药品/成品/采购）+ `inv_batches.warehouse_code` 存量映射 | 业务方给仓库清单 → DBA 导入 → 映射核对报告 → 签字后批量 UPDATE（scripts/） | **仓库清单需业务方提供（g15/GLP-P0-02 一直悬置的根因）** |
| F | 仓库语义分域在 farmWarehouseCondition/inventoryClassCondition 落地核对 | 开发（代码侧随批次 3 已具备条件） | E 完成 |

## D. INV-303 O1 运营验证（孟赛现场，Day1-5）

按 `docs/operation-validation-phase-o1.md` runbook 执行并**回填 §7-9 三张空白表**：
1. TEMP 模式基线日（无失真确认）
2. PACKAGING_INBOUND 灰度日（批次 3 代码已含统一锁与守卫，风险低于原计划）
3. 通过判据维持原文：连续运行无库存失真、无双重计数、FIFO/POS/退货/追溯一致
4. **东鹏切换继续 BLOCKED 直至 O1 通过**（不因本次优化放松）
5. 新增观测点：本批次的 skippedInUse 人工复核通知（MENU_SALES2_INVENTORY:V 用户会收到站内信）需纳入 Day 表观察项

## E. INV-304 issue532 生产回填

1. 前置：按 `docs/egg-grade-defect-fix-runbook.md` 步骤 2 核对隔离批次人工复核清单（QUARANTINE/DAMAGED/FROZEN/等级空/过期批次不得直接放开）
2. 执行 `scripts/backfill-inventory-class.mjs --apply`（受控事务）
3. 产出回执报告 `docs/issue532-backfill-receipt-<date>.md`：前后计数对比（8 档 ACTIVE / DIRTY+BROKEN 分类覆盖 / 隔离批次零放开）、门店与 POS 隔离冒烟结果
4. 发布暂停条件（runbook §6）任何一条触发即停

## F. 批次 4 前置决策（蛋品计价，用户已裁决「蛋品先行」）

| 决策 | 待定项 | 建议 |
|---|---|---|
| F1 | 生产入库成本来源 | brd_daily_logs 日报成本 vs 包装工时分摊 —— 需财务确认口径 |
| F2 | 历史批次 unit_cost 回填 | 迁移 DEFAULT 0（挂账）vs 一次性估价回填 —— 影响首月 COGS 准确性 |
| F3 | COGS 凭证对接点 | finance-v2 总账自动生成草稿 vs 月末汇总一张 —— 影响财务工作量 |
| F4 | 兽药库存是否二期 | 建议二期（brd_medication* 独立台账，量小） |

## 附录：执行记录（逐项签字栏）

| 项 | 执行人 | 日期 | 结果 | 签字 |
|---|---|---|---|---|
| A1 | | | | |
| A2 | | | | |
| A3 | | | | |
| B2 | | | | |
| B3 | | | | |
| B4 | | | | |
| C-A~D | | | | |
| C-E | | | | |
| D-O1 | | | | |
| E-回填 | | | | |
