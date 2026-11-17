# 库存管理优化修改方案（供审查）

> 基线：`origin/main` @ `cb42966ed`（2026-11-16）
> 来源：2026-11-17 库存全链路核查（wms / sales-v2 egg-inventory / store-pos / procurement-v2 / farm / terminal / schema / 29 份治理文档）
> 实测证据：全量 API 测试 2008 通过 / 0 失败（453 skip 为 PG 门控）；`tsc --noEmit` 0 错误
> 性质：**审查稿 —— 未实施任何代码变更**。所有行号以基线 commit 为准。

---

## 0. 结论摘要

库存内核的交易安全（FEFO、四层超卖防护、单据-台账同事务、退货强制隔离）已达行业水准。本方案处理三类剩余问题：

| 类别 | 数量 | 批次 |
|---|---|---|
| P1 代码缺陷（注入 / 不可释放预占 / 过期死锁 / 写端点越权 / 台账列错位） | 5 | 批次 1（立即） |
| DB 完整性兜底与展示一致性 | 4 | 批次 2（一周） |
| 架构收敛（5 写引擎 → 域服务、g15 遗留、O1 验证、issue532 回填） | 4 | 批次 3（2~4 周） |
| 能力补齐（存货计价 / 冻结审批单 / 追溯 QR / itemCode 收口） | 4 | 批次 4（季度级） |

---

## 1. 问题总表（可追溯编号）

### 批次 1 — P1 代码缺陷（全部为本次核查新发现，文档未记录）

| 编号 | 级别 | 问题 | 位置（基线行号） |
|---|---|---|---|
| INV-101 | P1 | `markExpiredBatches` SQL 注入 + 无事务 + UPDATE 无守卫 + 不检查在途预占 → 过期×预占死锁（订单永久卡死 + `EXPIRE_WRITEOFF` 幻影核销） | `egg-inventory.service.ts:1341`（拼接）、`1355-1360`（无守卫 UPDATE）；死锁对端 `confirmOutbound:1197`、`releaseInventory:1094` |
| INV-102 | P1 | `POST /allocate` 人工预占不落 `sal_order_item_batch_allocations` → 永不可释放，每次调用漏占一批库存；无冲正端点 | `egg-inventory.controller.ts:119-143` |
| INV-103 | P1 | 写端点不校验公司 DataScope：`/allocate`（body.companyCode）、`/mark-expired`（query.companyCode）、无 source profile 的 `POST /batches` | 同上 + `egg-inventory.service.ts:454-467`（仅 hasSource 分支查 scope） |
| INV-104 | P2 | `writeLedger` 把 `companyCode` 误写入 `inv_ledger.store_code`（$5 参数位）→ 门店归因、`generic-crud.service.ts:497` 的 store JOIN 失效 | `egg-inventory.service.ts:352-374` |
| INV-105 | P2 | 看板查询（`getPendingInbound` 等 6 处）catch 后静默返回空列表 → DB 故障被误读为"无待办" | `wms.service.ts:320/338/1056/1075/2059/2117` |

### 批次 2 — DB 兜底与一致性

| 编号 | 级别 | 问题 | 位置 |
|---|---|---|---|
| INV-201 | P1 | `inv_batches` 无 DB CHECK（`qty_available>=0 AND <=qty`），完整性全靠 5 个引擎应用层守卫；`inv_ledger.batch_no` 无 FK | `v3_schema_complete.sql:41-79` 基线；TS 迁移未补 |
| INV-202 | P2 | `inv_ledger.change_type` 自由字符串，无字典约束 | 同上 |
| INV-203 | P2 | `getAvailableBatches` 缺 `legacy_source IS NULL`（与分配查询口径不一致）；SKU 批次同时命中 PATH A/B → 展示双计 | `egg-inventory.service.ts:698-720` |
| INV-204 | P2 | advisory lock 命名空间碎片化：egg 引擎 `fifo:{co}:{product}` vs POS `fifo:{co}:{wh}:{product}` vs 快照池 `physical-stock-v1\|...` → 跨路径互斥只靠行锁 | `egg-inventory.service.ts:823`、`store-pos.service.ts:915-921` |

### 批次 3 — 架构收敛（治理文档自认未解决，本次核实仍在 main）

| 编号 | 问题 | 文档出处 |
|---|---|---|
| INV-301 | 「唯一库存入口」未达成：现存 5 个写引擎手写各自的守卫 SQL / 台账列 / 状态语义 | `production-inventory-integration-audit.md`（2026-06-02 CRITICAL）、`master-data-governance-phase3-20261110.md` §3 |
| INV-302 | g15 Steps A-F 未执行：`wms_warehouses` 生产 0 行、`inv_source_mode` SITE 键错位（`FARM-MS` vs `SITE-MENGSAI-LAYER`）、egg-ledger 死页 | `g15-architecture-audit.md` §2「核心架构 bug」 |
| INV-303 | O1 运营验证全空白、TEMP→PACKAGING 切换 BLOCKED | `operation-validation-phase-o1.md` §10、`stabilization-freeze-s0.md` |
| INV-304 | issue532 生产回填 `--apply` 无执行回执 / 审计签字 / 门店隔离冒烟记录 | `egg-grade-defect-fix-runbook.md` |

### 批次 4 — 能力补齐

| 编号 | 问题 | 文档出处 |
|---|---|---|
| INV-401 | **无存货计价层**：全库无 `unit_cost` / 移动平均 / COGS，库存纯数量台账，出不了存货科目与销售成本 | 核查发现（无对应文档） |
| INV-402 | 冻结/解冻为直接 `UPDATE status='FROZEN'`，无审批留痕单据 | `g4d-inventory-governance.md` §9 |
| INV-403 | 追溯缺 QR / 标签批次号 ≠ 库存批次号 | `packaging-terminal-coupling-audit-r15.md` P2-1/P2-3 |
| INV-404 | WMS 自由 itemCode 通道未收口（`resolveInventoryItem` 全局码猜类型） | `g202-s1-sku-variety-org-scope.md` §五-2 |

---

## 2. 批次 1：P1 代码修复（预计 1.5~2 人日）

### INV-101 `markExpiredBatches` 重写（一并修注入、死锁、无事务）

**改法**（`egg-inventory.service.ts:1338-1381` 整体替换）：

```ts
async markExpiredBatches(companyCode: string | undefined, mgr?: EntityManager): Promise<{
  expired: number; written: number; skippedInUse: { batchNo: string; openAllocations: number }[];
}> {
  // ① scope 校验（同时修 INV-103）：companyCode 必须命中 CLS dataScope.allowedCompanyCodes
  const scoped = this.assertCompanyInScope(companyCode);   // 复用 companyScope() 的 fail-closed 语义
  const run = async (em: EntityManager) => {
    // ② 候选查询：参数化（修注入）+ 排除在途预占（修死锁）+ SKIP LOCKED（调度并发安全）
    const candidates = await em.query(
      `SELECT b.batch_no, b.qty
         FROM inv_batches b
        WHERE b.expire_date < CURRENT_DATE
          AND b.status = 'AVAILABLE' AND b.qty > 0
          AND ($1::text IS NULL OR b.company_code = $1)
          AND NOT EXISTS (
                SELECT 1 FROM sal_order_item_batch_allocations a
                 WHERE a.batch_no = b.batch_no
                   AND a.reserved_qty > a.outbound_qty + a.released_qty)
        ORDER BY b.batch_no
        FOR UPDATE OF b SKIP LOCKED`,
      [scoped],
    );
    const skippedInUse = [];
    let written = 0;
    for (const b of candidates) {
      // ③ 守卫化 UPDATE（幂等容错：并发改状态则跳过而非抛错）
      const changed = await em.query(
        `WITH c AS (UPDATE inv_batches SET status='EXPIRED', qty_available=0, updated_at=NOW()
                     WHERE batch_no=$1 AND status='AVAILABLE' RETURNING batch_no)
         SELECT batch_no FROM c`, [b.batch_no]);
      if (changed.length !== 1) continue;
      // ④ EXPIRE_WRITEOFF 同事务（修部分失败背离）
      await this.writeLedger({ batchNo: b.batch_no, changeType: 'EXPIRE_WRITEOFF',
        qtyChange: -b.qty, operator: 'system:scheduler', storeCode: null, refNo: b.batch_no,
        note: '过期自动核销（跳过在途预占批次）', companyCode: scoped }, em);
      written++;
    }
    return { expired: candidates.length, written, skippedInUse };
  };
  return mgr ? run(mgr) : this.ds.transaction(run);
}
```

要点：
- 在途预占批次**跳过并返回清单**，由调度器发站内通知给 `MENU_SALES2_INVENTORY:V` 用户进入人工复核 —— 与 issue532 runbook「隔离批次人工复核，不得自动放开」的裁决精神一致。**不做**自动强退 allocation（风险大于收益）。
- `FOR UPDATE OF b SKIP LOCKED`：多实例调度器并发安全。
- 顺带修复 `egg-inventory-scheduler.service.ts:79` 调用点传参。

**测试**（`egg-inventory.service.spec.ts` 新增 4 例）：注入字符串按字面量处理；在途 allocation 批次被跳过且计入 skippedInUse；UPDATE 与 ledger 部分失败整体回滚；重复执行幂等（第二次 changed!==1 → continue）。

### INV-102 下线 `POST /allocate`

**前置事实**（已核查）：`apps/web` 无 `egg-inventory/allocate`、`mark-expired` 的任何 fetch 调用；唯一调用方是该 controller 自身暴露的 HTTP 端点。

**改法**：删除 `egg-inventory.controller.ts:119-143` 端点。`allocateByFIFO` 方法保留（`reserveInventory` 内部调用不受影响）。
**门禁**：合入前重跑一次精确 scope-audit（`egg-inventory/allocate` 于 `apps/web/src` 与 `apps/api/src/modules/bff` 计数必须为 0，防 ugrep 假 PASS 按 AGENTS.md 用窄正则计数）。
**备选**（若审查认为需保留手动分配能力）：新端点必须接收 `salesOrderItemId` 并复用 `reserveInventory` 的幂等 allocation 落行逻辑 —— 不推荐，现状无业务场景。

### INV-103 写端点补公司 DataScope

- `allocateByFIFO`（`egg-inventory.service.ts:829`）：入口处校验 `companyCode ∈ dataScope.allowedCompanyCodes`（`isGlobal` 放行）——即使 INV-102 下线端点，内部调用链也应防御。
- `createProductionBatch` legacy 无 source 路径：对齐 `hasSource` 分支（454-467 行）的 scope 检查。
- `/mark-expired` 由 INV-101 ① 覆盖。

**测试**：越权公司码 → 403（3 例）。

### INV-104 `writeLedger` store_code 参数错位

**改法**：`writeLedger` params 增加 `storeCode?: string | null`；$5 位改传 `params.storeCode ?? null`（`egg-inventory.service.ts:360` 与参数数组第 5 元素）。egg 引擎现有调用点本就无门店上下文（农口销售），传 `null` 即可；`generic-crud.service.ts:497` 的 `LEFT JOIN mst_stores` 对 NULL 自然短路。

**存量脏数据**：`inv_ledger.store_code` 中被误写为公司码的行，用运维脚本甄别修复（识别：`store_code IN (SELECT company_code FROM sys_organizations WHERE type='COMPANY')` 且 `change_type IN ('INBOUND','RESERVED','FIFO_OUT','RELEASED','SALE_RETURN','DAMAGE_WRITEOFF','EXPIRE_WRITEOFF')` → 置 NULL）。**走 `scripts/` 运维脚本 + dry-run 报告，不走迁移链**（g197-H：迁移 up() 禁业务 DML）。

### INV-105 看板静默降级（顺带，P2）

`wms.service.ts` 6 处 `catch { return 空列表 }` 改为 `catch (e) { this.logger.error(...); return 空结构 }` + 计数指标（复用 health 端点 prom 客户端）。行为不变，只加可观测性。

### 批次 1 验收

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit        # 0 errors
./node_modules/.bin/jest src/modules/sales-v2/services/egg-inventory.service.spec.ts
./node_modules/.bin/jest src/modules/wms --silent
cd ../web && ./node_modules/.bin/tsc --noEmit          # 0 errors
# scope-audit：egg-inventory/allocate 全仓计数 = 0
```

---

## 3. 批次 2：DB 兜底与一致性（预计 3~5 人日）

### INV-201 CHECK 约束（含实施顺序敏感点）

**预检**（新增 `scripts/check-inv-batches-invariants.sql`，只读）：
```sql
SELECT COUNT(*) AS neg_qty          FROM inv_batches WHERE qty < 0 OR qty_available < 0;
SELECT COUNT(*) AS over_available   FROM inv_batches WHERE qty_available > qty;
SELECT COUNT(*) AS ledger_orphans   FROM inv_ledger l WHERE l.batch_no IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM inv_batches b WHERE b.batch_no = l.batch_no);
```
违例非零 → 先出数据修复脚本（`scripts/`，含 dry-run），人工审核后执行。

**迁移**（`apps/api/src/database/migrations/`，TS，含 `down()`）：
```sql
-- up()
ALTER TABLE inv_batches
  ADD CONSTRAINT ck_inv_batches_qty
  CHECK (qty >= 0 AND qty_available >= 0 AND qty_available <= qty) NOT VALID;
-- down()
ALTER TABLE inv_batches DROP CONSTRAINT IF EXISTS ck_inv_batches_qty;
```
`NOT VALID` 先挡新增违例；存量清零后在运维窗口单独 `VALIDATE`（仅 SHARE UPDATE EXCLUSIVE 锁，秒级）。

**FK 顺序敏感（重要）**：`inv_ledger.batch_no` 加 FK **之前**必须先改 `processReturnInventory`（`egg-inventory.service.ts:1315-1326`）——`DAMAGE_WRITEOFF` 现写 `DMG-{returnNo}-{product}` 伪批次号但从不建 `inv_batches` 行，直接加 FK 会在首次破损退货时报错。改法：DMG 核销挂对应 `RET-*` 真实批次（note 中保留破损明细），然后：
```sql
ALTER TABLE inv_ledger
  ADD CONSTRAINT fk_inv_ledger_batch FOREIGN KEY (batch_no)
  REFERENCES inv_batches(batch_no) ON DELETE RESTRICT NOT VALID;
```
存量孤儿行（历史 DMG-*）由预检脚本列出，登记进本方案执行报告；`VALIDATE` 与否取决于清零情况。

**CI 适配**：`node scripts/check-constraint-drift.js` 需过（R4 校验 entity nullable 与迁移末态一致 —— 本迁移不动 entity 列，无冲突）；`.github/constraint-drift-allowlist.txt` 仅在确需登记时使用且原因非空。

### INV-202 `change_type` 字典化

按 G4-x SOP：新增 dict_type `INV_LEDGER_CHANGE_TYPE`（INBOUND/OUTBOUND/FIFO_OUT/RESERVED/RELEASED/SALE_RETURN/PURCHASE_RETURN/STOCKTAKE_ADJ/TRANSFER/EXPIRE_WRITEOFF/DAMAGE_WRITEOFF/LOSS/ADJUST …以全库 `grep "change_type\|changeType"` 实际枚举为准收敛）→ `pnpm migration:create src/database/migrations/InvLedgerChangeTypeDictSeed`（幂等 ON CONFLICT，含 `down()`）→ 五个写入引擎改经共享常量取值。**不**加 DB CHECK（历史值兼容优先），先字典 + 代码收敛。

### INV-203 `getAvailableBatches` 展示口径

- 补 `legacy_source IS NULL`（与 `allocateByFIFO` 698-720 对齐）。
- PATH A/B 双计：SKU 批次（`sku_code IS NOT NULL`）在 PATH B 查询中排除；前端 product tab 语义变为"未 SKU 化存量"。
- **UAT 点**：展示数字会下降（移除不可分配的 legacy 批次），需向业务方预告，避免误报"丢库存"。

### INV-204 advisory lock 命名空间统一

三引擎 lock key 统一为 `inv:fifo:{company}:{warehouse}:{itemKey}`（itemKey = skuCode 或 `p:{product}:g:{grade}`），抽 `inventory-lock.util.ts` 共享。行为变更 → 并发回归：复用 `store-receiving-chain.pg.integration.spec.ts` 模式补一条双引擎争抢同批次的 PG 集成测试（staging 跑，`PACKAGING_HISTORY_PG=1` 门控）。

### 批次 2 验收

上述命令外追加：`node scripts/check-nullable-in-unique.js`、`node scripts/check-constraint-drift.js`、迁移 CI 门禁三项（allowlist / down() / 无业务 DML）全绿；预检脚本三计数 = 0。

---

## 4. 批次 3：架构收敛（预计 10~15 人日，含现场验证）

### INV-301 `InventoryMovementDomainService` 抽取（三步走，不动表结构）

现状：5 个写引擎（wms / egg-inventory / production-inbound+packaging-integration / store-pos / farm-兽药）各自手写守卫 UPDATE、ledger INSERT、状态语义。目标：写逻辑单点化，**不是**重写引擎。

| 步骤 | 内容 | 风险 |
|---|---|---|
| 3a | 抽 `LedgerWriter.write(em, movement)`：统一列序（根除 INV-104 类错位）、change_type 常量、company/warehouse/store 三码齐备校验 | 低（纯抽取，逐引擎替换 + 全量回归） |
| 3b | 抽 `guardedBatchUpdate(em, {batchNo, deltaQty, deltaAvailable, expectStatus, respectExpiry, excludeLegacy})`：返回 `changed===1` 或抛 `ConflictException` —— 现三处重复的 CTE 模式归一 | 中（SQL 等价性需 spec 钉死：每引擎现有 guarded SQL 原文作为 contract fixture） |
| 3c | 抽 `assertStatusTransition(from, to)`：状态机白名单（含 EXPIRED 只能由过期任务进入等），5 引擎统一调用 | 中 |

每步独立 PR、独立全量回归（`pnpm verify` + WMS/egg/POS/terminal 套件）。**明确不做**：合并 5 引擎为一个服务 —— 各业务域身份解析规则（master-data-governance-phase3 §3）差异是真实业务差异，强行统一会引入回归面。

### INV-302 g15 Steps A-F 执行

按 `g15-architecture-audit.md` §8 顺序：
- A~D（低风险，半天）：修正 `inv_source_mode` SITE 键（`FARM-MS` → `SITE-MENGSAI-LAYER`）；下线 egg-ledger 死页或接 `legacy_source IS NULL` 口径。
- E（1 天）：真实仓库主数据导入（蛋品仓/药品仓/成品仓/采购仓至少 4 条，走 `wms_warehouses` CRUD + WarehouseSelector 既有链路），`inv_batches.warehouse_code` 存量值映射核对（出核对报告，人工确认后批量 UPDATE 走 scripts/）。
- F：仓库语义分域（鸡蛋/药品/成品）在 `farmWarehouseCondition` / `inventoryClassCondition` 的落地核对。

### INV-303 O1 验证补课

按 `operation-validation-phase-o1.md` runbook 在孟赛执行 Day1-5（TEMP 模式下无失真基线 → PACKAGING 灰度 → 回填 §7-9 三张空白表）。 Dongpeng 切换继续 BLOCKED 直至 O1 通过 + 无未关闭 P0（维持原判据，不放松）。

### INV-304 issue532 回填执行 + 回执

生产执行 `scripts/backfill-inventory-class.mjs --apply`（前置：按 runbook 步骤 2 核对隔离批次人工复核清单），产出 `docs/issue532-backfill-receipt-<date>.md`：执行日志、前后计数对比（8 档 ACTIVE、DIRTY/BROKEN 分类覆盖、隔离批次零放开）、门店/POS 隔离冒烟结果。

---

## 5. 批次 4：能力补齐（季度级，各自单独立项）

### INV-401 存货计价层（优先级最高，建议先做设计评审）

1. **Schema**：`inv_batches` 加 `unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0`、`cost_snapshot JSONB`；迁移含 `down()`；DEFAULT 0 保证存量兼容。
2. **入库计价**：生产入库按日报成本（brd_daily_logs 已有成本数据）/ 采购入库按收货单价（prc_receipts 单价可得）写入批次 `unit_cost`；同时段同品目重算移动平均。
3. **出库结转**：`FIFO_OUT` / POS 扣减时同步写 `inv_ledger.cost_change`（新列）并在 fin 侧生成 COGS 凭证草稿（对接 finance-v2 总账，走既有审批流）。
4. **月结**：存货科目余额表（仓库 × 品目 × 等级）与 `fin_ar/ap` 关账 SOP（g199）并列。
5. **边界**：兽药（brd_medication*）与蛋品是否同批上线，按业务方成本核算需求裁剪。

### INV-402 `wms_freeze_action` 审批单据

冻结/解冻从裸 `UPDATE status` 改为单据流：申请（原因/附件 AttachmentUploader）→ 审批（approval-engine 既有流）→ 过账（status 迁移 + ledger `FROZEN/THAWED`）。补齐 g4d §9 遗留。

### INV-403 追溯 QR

标签批次号与库存批次号统一（P2-1 前置）；`pkg_label_print_logs` 加 QR payload（批次 + 生产日期 + 鸡舍 + 等级）；traceability 页从 inv_ledger 反查全链路。

### INV-404 WMS itemCode 收口

依赖 G202 阶段 4（SKU 激活 + 品种回填完成）后执行：`wms.service.resolveInventoryItem` 接 `SkuPolicy.assertUsable`，关闭"全局码猜类型"通道。**在 G202 生产切换完成前不动**（避免与 mid-flight 的 SKU 切换互相踩）。

---

## 6. 里程碑与依赖

```
批次1 (D+2)  ──┐
批次2 (D+7)  ──┼── 批次3 (D+25) ─── 批次4 (季度)
                │      ├─ 301 域服务（3a→3b→3c 串行）
                │      ├─ 302 g15 A-F（E 依赖仓库主数据业务确认）
                │      ├─ 303 O1（依赖孟赛现场档期）
                │      └─ 304 回填（依赖 runbook 复核清单签字）
```
- 批次 1 与 2 可并行启动不同人执行；批次 2 的 FK 必须晚于 `processReturnInventory` DMG 改造合入。
- 批次 4 INV-401 可与批次 3 并行做设计评审。

## 7. 统一验收门禁（每批次 PR 必过）

1. `pnpm typecheck:api && pnpm typecheck:web`（0 errors）
2. 相关 jest 套件 + `pnpm test:api` 全量（基线 2008 通过不得回退）
3. `pnpm lint:web:changed && pnpm lint:web:ratchet`（债务不增长）
4. 迁移三项 CI 门禁：冻结目录未触碰 / `down()` 存在 / up() 无业务 DML（豁免必须 `@allow-data-dml: <reason>` 且原因真实）
5. `node scripts/check-constraint-drift.js`、`check-nullable-in-unique.js`、`check-entity-drift-baseline.sh` 全绿
6. 涉及 UI 的项（INV-203/302A-D）：浏览器截图前后对比附 PR
7. scope-audit 用窄正则计数（防 ugrep 静默假 PASS），命令与计数写入 PR 描述

## 8. 红线（本方案自始遵守）

- 顶级 `migrations/` 与 `apps/api/migrations/` 冻结目录不触碰；新迁移仅 `apps/api/src/database/migrations/` TS
- 生产迁移仅由受控部署链执行；本地/CI 不连生产库
- 数据修复走 `scripts/` 运维脚本 + dry-run 报告，不混入迁移链
- 不用 allowlist 掩盖真实 bug（g201）；不降低 rule severity 绕 ratchet
- 不可逆操作（批量 UPDATE 存量、`--apply` 回填、VALIDATE）逐项人工签字后执行
- commit/tag 规范：`feat: inv-opt <批次-编号>`；阶段收尾打 `v3-inv-opt-<批次>-YYYYMMDD`

---

## 附：与行业标准的最终对照（本方案落地后）

| 维度 | 现状 | 落地后 |
|---|---|---|
| 超卖/并发防护 | 应用层四层（达标） | + DB CHECK 兜底（INV-201） |
| 预占生命周期 | 两阶段（达标）但 2 个泄漏点 | 修复（INV-101/102） |
| 过期治理 | 有死锁缺陷 | 跳过在途 + 人工复核（INV-101） |
| 台账完整性 | 列错位 + 无 FK + 自由 change_type | 修复 + FK + 字典（INV-104/201/202） |
| 写入口架构 | 5 引擎手写守卫 | 域服务单点化（INV-301） |
| 存货计价 | **缺失** | 移动平均 + COGS（INV-401） |
| 仓库主数据 | 生产空置 | 导入 + 语义分域（INV-302） |
| 安全（注入/越权） | 1 注入 + 3 越权端点 | 清零（INV-101/103） |
