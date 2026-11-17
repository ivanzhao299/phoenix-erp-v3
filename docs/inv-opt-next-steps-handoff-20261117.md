# 库存优化后续工作交接清单（运营项 + 财务口径）

> 生成：2026-11-17 · 基线：main @ 12c42bacc（#570 批次 1~4 + #571 fixture 修复均已合并部署）
> 配套文件：签字记录 `docs/inv-opt-ops-handoff-20261117.md` · 执行报告 `docs/inv-opt-execution-report-20261117.md` · 方案 `docs/inventory-optimization-plan-20261117.md`
> 本文回答「后续如何进行」：每项给出**执行步骤、所需输入、判读标准、回滚方式、责任角色**。

---

## 0. 角色简称与责任矩阵

| 角色 | 简称 | 承担项 |
|---|---|---|
| 运维/DBA（有生产库只读+受控写权限） | DBA | A1/A2、B2/B3/B4、C-A~E 执行、E 回填执行 |
| 业务负责人（养殖/仓库管理） | BIZ | C-E 仓库清单、D 现场协调 |
| 财务负责人 | FIN | F1/F2/F3 决策、B3 历史批次裁决参与 |
| 孟赛现场负责人 | SITE | D-O1 Day1~5 执行与回填 |
| 开发（本方案执行方，可继续承接） | DEV | C-D 页面处置代码、A3 staging 编排、B3 核对报告脚本、F 决策后二期开发、本文所有「DEV 可承接」标注项 |

**总原则**：生产数据操作逐项在 `docs/inv-opt-ops-handoff-20261117.md` 附录签字栏签字后执行；任何一步输出异常即停，回来找 DEV 会诊。

---

## 1. 执行路线总览（依赖顺序）

```
第 1 周   A1→A2→A3（只读预检，零风险，随时可做）
第 1~2 周 B2（A2 输出+FIN 确认）→ B3（A1 非零才需要）→ B4（A1 清零后窗口）
并行      C-E 仓库清单向 BIZ 索取（关键路径，最早启动）→ C-A~D → C-E 导入 → C-F
第 2~4 周 D-O1（依赖 C-E 完成后现场档期）→ 东鹏切换评审
随时      E 回填（与 D 并行，按 runbook 前置复核）
决策期    F1→F2→F3（FIN 三个决策，决策完成后 DEV 出二期方案再动工）
```

---

## 2. A 类：staging/生产只读预检（部署后立即可做，无风险）

### A1 库存不变量预检
```bash
# 在生产库只读执行（psql 只读账号即可）
psql -h <生产库> -U <只读账号> -d phoenix_erp -f scripts/check-inv-batches-invariants.sql
```
- **输出三计数**：负数量 / `qty_available > qty` / ledger 孤儿 batch_no（含 LIMIT 200 明细）
- **判读**：三计数全 0 → 直接具备 B4 资格；任一非 0 → 把明细导出，走 B3
- **预期**：大概率有少量历史违例（legacy EGG-STOCK-*/PRD-EGG-* 时代数据），属正常

### A2 store_code 误写甄别（dry-run）
```bash
psql -h <生产库> -U <只读账号> -d phoenix_erp -f scripts/fix-inv-ledger-store-company.sql
# 脚本默认 ROLLBACK（dry-run），只输出：待修行数 + 样例 + 是否有真实门店误伤
```
- **判读**：待修行数即 2026-11-17 前 egg 引擎误写的台账行；确认样例中无 `mst_stores` 真实门店码被误圈
- **产出**：dry-run 截图/输出存档，交 FIN 确认后进 B2

### A3 FIFO 锁并发集成测试（staging）
```bash
# staging 起服务后（docker-compose.staging.yml）：
cd apps/api
PACKAGING_HISTORY_PG=1 \
DB_HOST=127.0.0.1 DB_PORT=<staging端口> DB_USER=... DB_PASSWORD=... DB_NAME=... \
  ./node_modules/.bin/jest src/modules/wms/inventory-fifo-lock.pg.integration.spec.ts --runInBand
```
- **判读**：20 路并发（egg×10 + POS×10）全成功、数量守恒（qty_available=0/qty=10）、ledger −20、第 21 路双侧拒单
- **DEV 可承接**：staging 编排与环境参数由 DEV 准备

---

## 3. B 类：签字后数据修复（一次性）

### B2 store_code 修复 apply
- **前置**：A2 dry-run 输出 + FIN/BIZ 确认"圈定行无误伤"
```bash
psql -h <生产库> -U <受控写账号> -d phoenix_erp \
  -v apply=on -f scripts/fix-inv-ledger-store-company.sql
```
- **回滚**：脚本单事务 + ON_ERROR_STOP，失败自动整体回滚；成功后如需撤销，按脚本头注释的反查清单手工恢复（执行前导出被修行备份）
- **验证**：复跑 A2 dry-run，待修行数 = 0

### B3 存量违例清零（仅当 A1 非零）
- **流程**：A1 明细导出 → 逐批人工裁决（表格：batch_no / 违例类型 / 建议处置 [归档|修正|保留并登记] / 裁决人）→ DBA 按裁决执行
- 历史脏批次（EGG-STOCK-* / PRD-EGG-* legacy）默认按 RUNBOOK §3.4「历史脏数据」登记归档，**不删除**
- **DEV 可承接**：裁决表格生成脚本（从 A1 输出自动产 CSV）

### B4 约束 VALIDATE 窗口
- **前置**：A1 三计数 = 0（B3 完成后复跑确认）
```sql
-- 运维窗口执行，仅 SHARE UPDATE EXCLUSIVE 锁（不阻塞读写），秒级
ALTER TABLE inv_batches VALIDATE CONSTRAINT ck_inv_batches_qty;
-- fk_inv_ledger_batch 仅当 B3 把 ledger 孤儿行处置完才 VALIDATE；
-- 历史孤儿若登记保留，则该 FK 长期保持 NOT VALID（已能挡新增，可接受）
ALTER TABLE inv_ledger VALIDATE CONSTRAINT fk_inv_ledger_batch;
```
- **验证**：`SELECT convalidated FROM pg_constraint WHERE conname IN ('ck_inv_batches_qty','fk_inv_ledger_batch');`

---

## 4. C 类：g15 Steps A-F（仓库主数据治理，关键路径最早启动）

### C-E 输入清单（向 BIZ 索取，模板）
| 字段 | 说明 | 示例 |
|---|---|---|
| warehouse_code | 唯一编码（沿用现有 inv_batches 里已出现的码优先） | WH-EGG-01 |
| 名称（中/英/老挝） | 三语 | 蛋品一仓 / Egg WH 1 / ສາງໄຂ່ 1 |
| type | EGG_FARM / EGG_SALES / PURCHASE_RECV / MEDICINE / FEED / MATERIAL | EGG_SALES |
| company_code | 归属公司 | COMP-A |
| owner_store_id | 门店仓必填（门店自管），农场/公司仓留空 | — |
| site_code / mapped_site_code | 场站映射（孟赛=SITE-MENGSAI-LAYER） | SITE-MENGSAI-LAYER |

**建议最少 4 仓**：蛋品仓（EGG_SALES）、蛋品农场仓（EGG_FARM）、药品仓（MEDICINE）、采购收货仓（PURCHASE_RECV）——GLP-P0-02 一直悬置的根因就是这份清单没人拍板。

### C-A~D 低风险步骤（DBA + DEV，半天）
- A：核对生产 `inv_source_mode` 当前键值 vs 孟赛实际 site_code（`SELECT * FROM inv_source_mode;` vs `SELECT DISTINCT mapped_site_code FROM brd_farms;`）——g15 审计时的错位（FARM-MS vs SITE-MENGSAI-LAYER）可能已被后续变更修复，**以当前值实查为准**，不盲改
- B~D：egg-ledger 死页处置（**DEV 可承接**：下线入口或改 `legacy_source IS NULL` 口径，小 PR）；`wms_warehouses` 空表与 egg-ledger 断链修复
### C-E 导入执行
1. 按清单 INSERT `wms_warehouses`（走 `/api/crud/wms_warehouses` 或受控 SQL）
2. **存量映射核对**：`SELECT warehouse_code, count(*) FROM inv_batches WHERE legacy_source IS NULL GROUP BY 1 ORDER BY 2 DESC` 对照清单——不在清单中的码逐个裁决映射
3. 核对报告（DEV 可承接生成）→ BIZ 签字 → 批量 UPDATE（scripts/ 运维脚本，不进迁移链）
### C-F 分域核对（DEV）
- `farmWarehouseCondition` / `inventoryClassCondition` 消费的 type/owner_store_id 语义与导入数据一致；补一条 PG 集成测试钉死分域

---

## 5. D 类：O1 运营验证（孟赛现场，Day1~5）

- **runbook**：`docs/operation-validation-phase-o1.md`（§7~9 三张空白表必须现场回填）
- **前置**：C-E 完成（仓库主数据就位，否则现场数据口径不正）
- **日程建议**：Day1 TEMP 基线日（无失真确认）→ Day2~3 PACKAGING_INBOUND 灰度 → Day4 退货/追溯/POS 一致性专项 → Day5 复盘回填
- **新增观察点**（本次优化引入）：
  - 站内通知：`MENU_SALES2_INVENTORY:V` 用户会收到「过期批次跳过核销（在途预占）」通知——现场确认收到且批次进入人工复核清单
  - 库存页数字下降属预期（INV-203 口径：已排除 legacy 批次与 PATH B 双计）——提前向 BIZ 预告，避免误报"丢库存"
  - 金额汇总 API `GET /api/v2/sales/inventory/valuation` 可读（unit_cost 全 0 属预期，F2 决策前）
- **通过判据**（维持原文不放松）：连续运行无库存失真、无双重计数、FIFO/POS/退货/追溯一致、无未关闭 P0 → 才可评东鹏切换
- **产出**：runbook 三表回填 + 一页结论（GO / NO-GO + 理由）

---

## 6. E 类：issue532 生产回填

- **runbook**：`docs/egg-grade-defect-fix-runbook.md`
- **前置复核（runbook 步骤 2，必须人工）**：导出 QUARANTINE/DAMAGED/FROZEN/等级空/已过期批次清单 → 逐批确认**不得**因回填放开销售
- **执行**：`node scripts/backfill-inventory-class.mjs`（先 dry-run 看输出，再 `--apply` 受控事务）
- **回执**：产出 `docs/issue532-backfill-receipt-<日期>.md`——前后计数对比（8 档 ACTIVE / DIRTY+BROKEN 分类覆盖 / 隔离批次零放开）+ 门店与 POS 隔离冒烟结果
- **暂停条件**（runbook §6 任何一条触发即停）：ACTIVE 等级 ≠ 8 档；DIRTY/BROKEN 缺分类；历史隔离库存被放开
- **与 D 的关系**：可并行，但建议在 O1 Day1 之后执行（回填后的库存口径在现场观察期内保持稳定）

---

## 7. F 类：财务口径决策（蛋品计价二期前置）

> 三个决策全部由 FIN 拍板后，DEV 出二期设计评审稿再动工。每个决策给出 DEV 预备的事实输入。

### F1 生产入库成本来源（决策 1/3）
- **现状事实**：`brd_daily_logs` 全列盘点**无成本列**（仅数量/环境）；批次 4 已留 `unitCost` 参数接口与 F1 注释占位（生产入库当前 0 挂账）
- **选项 A：日报成本列** —— brd_daily_logs 加 `daily_cost`（饲料+人工+分摊），现场每日填报 → 精度高、新增填报负担
- **选项 B：期间平均估价** —— 按月饲料采购额 ÷ 产蛋量摊销 → 零填报、精度粗
- **FIN 需回答**：蛋品成本核算到"日"还是"月"精度？现场能否承担每日成本填报？
### F2 历史批次 unit_cost 回填（决策 2/3）
- **选项 A：维持 DEFAULT 0 挂账** —— 历史批次金额永为 0，首月 COGS 只反映新批次（当前默认状态）
- **选项 B：一次性估价回填** —— 按最近采购价/设定价回填历史批次 → 首月报表完整但含估价
- **FIN 需回答**：存货科目上首月是否要求全额反映？
### F3 COGS 凭证对接（决策 3/3）
- **选项 A：出库自动生成凭证草稿** —— 每次 FIFO_OUT 后 fin 总账多一笔草稿（走既有审批流）→ 及时但凭证量大
- **选项 B：月末汇总一张** —— 月结时按公司×SKU 汇总一笔 → 凭证少、滞后
- **FIN 需回答**：财务人对账频率要求？现有 finance-v2 审批流能否承载日百级凭证？
### 二期工程范围（决策后 DEV 评估，预估 2~3 周）
1. F1 选型实现（A：加列+填报 UI+取数；B：摊销计算任务）
2. F2 选型执行（B：回填脚本 + 报告）
3. F3 选型实现（A/B 之一，对接 finance-v2）
4. Web 金额列（BatchesTab 单价/金额列 + valuation 页）与月结存货报表

---

## 8. 交给谁、从哪里开始

| 顺序 | 动作 | 责任 | 阻塞下游 |
|---|---|---|---|
| 1（本周） | A1+A2 跑掉（只读，半天） | DBA | B2/B3/B4 |
| 2（本周） | C-E 仓库清单发给 BIZ 填 | 项目经理 | C 全部、D |
| 3（A1 后） | B 类按签字推进 | DBA+FIN | B4 → 无下游（独立） |
| 4（清单回后） | C-A~F 执行 | DBA+DEV | D-O1 |
| 5（C 完成后） | D-O1 排现场档期 | SITE+BIZ | 东鹏切换 |
| 6（并行） | E 回填（复核清单先做） | DBA+BIZ | — |
| 7（并行） | F1~F3 三问发 FIN | 项目经理 | 计价二期 |

**DEV 侧随时可接**（说一声即开工，无需等上述决策）：C-D egg-ledger 页面处置 PR、A3 staging 编排、B3/C-E 核对报告生成脚本、F 决策完成后的计价二期全部开发。
