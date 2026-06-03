# 运营验证阶段 O1 — 孟赛 PACKAGING_INBOUND 运营验证

> **任务**：Operation Validation Phase O1
> **日期**：2026-06-03 起
> **场站**：FARM-MS（孟赛）· 模式：PACKAGING_INBOUND · 连续 3–7 天
>
> ## ⚠️ 诚实声明（必读）
> O1 是**真实运营验证**——需要孟赛连续多天真实业务（真人做集蛋→分级→包装→销售→POS→退货）+ 真实用户反馈。
> 这是**时间 + 人 + 生产系统**的运营过程，**无法由开发侧执行或模拟**。
> 本文档是**可执行的运营验证 Runbook + 每日一致性核对 SQL + 问题/反馈模板**；
> 所有「结果」字段当前为 **⏳ 待生产回填**——由运营每日照此执行后填入真实数据。
> **本报告不编造任何 Day1–5 结果、用户反馈或运营问题。**

---

## 0. 验证范围

- 场站：仅 FARM-MS（孟赛）；东鹏 FARM-DP 维持 TEMP，不在本次。
- 验证对象：真实业务一致性（库存=包装、FIFO、POS、退货、追溯），**不验证代码/数据库结构**（已在 R0–R6 完成）。
- 每日产出：一致性核对 SQL 结果 + 问题板 + 性能/反馈记录。

---

## 1. Day 1 — 集蛋→分级→包装→交接→库存生成

**操作**（车间，真实 HTTP）：开班选 FARM-MS → 集蛋接收 → 分级 → 包装 → 成品交接（warehouse/confirm）。

**一致性核对 SQL（当日生产库执行）**：
```sql
-- ① 当日孟赛包装产出 vs 库存生成（应一致）
WITH pk AS (
  SELECT code, total_eggs FROM pkg_packing_records
   WHERE production_date = CURRENT_DATE
     AND shift_id IN (SELECT id FROM pkg_work_shifts WHERE site_id='FARM-MS' AND production_date=CURRENT_DATE)
)
SELECT
  (SELECT COALESCE(SUM(total_eggs),0) FROM pk)                              AS 包装总枚,
  (SELECT COALESCE(SUM(qty),0) FROM inv_batches
     WHERE source_type='PACKAGING' AND packaging_batch_ref IN (SELECT code FROM pk)) AS 库存生成,
  (SELECT COALESCE(SUM(qty_change),0) FROM inv_ledger
     WHERE change_type='PACKAGING_INBOUND' AND ref_no IN (SELECT code FROM pk))      AS 入库流水;
-- 验收：包装总枚（可售部分）= 库存生成 = 入库流水；不可售等级隔离不计入可售。
```
**结果**：⏳ 待回填（包装枚数 ___ / 库存 ___ / 是否一致 ___）

---

## 2. Day 2 — 销售订单→预留→出库→库存减少（FIFO）

**操作**：Sales V2 创建订单 → 提交（FIFO 预留）→ 配送装车（出库）。

```sql
-- ② FIFO：预留/出库流水 + 批次按 expire_date 先扣
SELECT change_type, COUNT(*), SUM(qty_change) FROM inv_ledger
 WHERE created_at::date = CURRENT_DATE AND change_type IN ('RESERVED','FIFO_OUT') GROUP BY change_type;
-- ③ 可用量递减正确（同 SKU 按到期日升序先扣）
SELECT batch_no, sku_code, expire_date, qty, qty_available FROM inv_batches
 WHERE source_type='PACKAGING' AND company_code='MENGSE' ORDER BY sku_code, expire_date;
```
**结果**：⏳ 待回填（预留 ___ / 出库 ___ / FIFO 顺序正确 ___）

---

## 3. Day 3 — POS→销售→库存减少→收款

**操作**：门店 POS（api/v2/store-sales）现金/赊销/混合结账。

```sql
-- ④ POS 销售 = 库存扣减 = 财务入账
SELECT s.sale_no, s.total_amount, s.payment_method,
       (SELECT COALESCE(SUM(i.qty),0) FROM sal_store_sale_items i WHERE i.sale_id=s.id) AS 售出数,
       (SELECT COUNT(*) FROM inv_ledger l WHERE l.ref_no=s.sale_no AND l.change_type='FIFO_OUT') AS 扣减流水,
       (SELECT COUNT(*) FROM fin_cash_transactions c WHERE c.source_no=s.sale_no) AS 现金流水,
       s.ar_invoice_id AS AR
  FROM sal_store_sales s WHERE s.completed_at::date = CURRENT_DATE;
-- 验收：现金单→fin_cash_transactions；赊销单→ar_invoice_id 非空；混合→两者皆有。
```
**结果**：⏳ 待回填（POS单 ___ / 库存一致 ___ / 收款一致 ___）

---

## 4. Day 4 — 退货→库存回库→恢复

**操作**：Sales V2 退货 → 质检 → 完成回库。

```sql
-- ⑤ 退货回库 = RETURN 批次 + SALE_RETURN 流水；破损 DAMAGE_WRITEOFF 不回库
SELECT change_type, COUNT(*), SUM(qty_change) FROM inv_ledger
 WHERE created_at::date = CURRENT_DATE AND change_type IN ('SALE_RETURN','DAMAGE_WRITEOFF') GROUP BY change_type;
SELECT batch_no, source_type, status, qty FROM inv_batches WHERE source_type='RETURN' AND created_at::date=CURRENT_DATE;
```
**结果**：⏳ 待回填（回库数 ___ / 报损数 ___ / 库存恢复正确 ___）

---

## 5. Day 5 — 全链追溯一致性

**操作**：取当日任一 EGG 批次/PKG/标签/销售单，调追溯 API。

```bash
TOKEN=<bearer>; B=https://erp.eggslao.com; H="Authorization: Bearer $TOKEN"
curl -s -H "$H" $B/api/traceability/batch/<EGG-批次>      | jq '{prod:.production.site, house:.production.houses, sales:.sales}'
curl -s -H "$H" $B/api/traceability/label/<标签号>        | jq '.trace.inventory.batchNo'
curl -s -H "$H" $B/api/traceability/sales-order/<订单号>  | jq '.traces[0].production'
curl -s -H "$H" $B/api/traceability/customer/<客户码>     | jq '.orders'
```
**验收**：标签→包装→库存→销售→客户→鸡舍/鸡群 全链返回完整、数量勾稽一致。
**结果**：⏳ 待回填（追溯完整 ___ / 数量勾稽 ___）

---

## 6. Operation Issue Board（运营问题板）

| 日期 | 场站 | 模块 | 问题 | 影响等级(P0/P1/P2) | 责任人 | 状态 |
|------|------|------|------|------|--------|------|
| ⏳ | FARM-MS | | | | | |
| | | | | | | |

> 记录所有真实运营问题；P0 立即处理 + 必要时模式切回 TEMP（回滚方案①）。

## 7. 性能观察

| 项 | 记录 | 目标 |
|----|------|------|
| 最慢页面 | ⏳ | — |
| 最慢接口 | ⏳ | 追溯单批次 < 500ms |
| 最慢 SQL | ⏳ | 用 `pg_stat_statements` 取 top |
```sql
-- 开启后取最慢 SQL（生产）
SELECT round(mean_exec_time::numeric,1) ms, calls, left(query,80) FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

## 8. 用户反馈

| 用户 | 角色 | UI | 权限 | 流程 | 数据 | 性能 |
|------|------|----|----|----|----|----|
| 谢继领 | ⏳ | | | | | |
| 宋雷 | ⏳ | | | | | |
| 刘杰 | ⏳ | | | | | |
| 王玮华 | ⏳ | | | | | |
| 刘汉涛 | ⏳ | | | | | |

## 9. 问题清单（汇总）

⏳ 待运营 3–7 天后汇总（按 P0/P1/P2 分级）。

## 10. 是否允许东鹏切换 PACKAGING_INBOUND

🔒 **BLOCKED — 待孟赛 O1 验证结果**。判据：孟赛连续运行无库存失真、无双重计数、FIFO/POS/退货/追溯一致、无未关闭 P0 → 方可将 `SITE/FARM-DP` 切 `PACKAGING_INBOUND`。

---

## 必须回答（当前诚实状态）

> 孟赛尚未开始真实运营，以下均为**待运营数据**，不预设结论、不编造。

1. **孟赛是否稳定运行？** ⏳ 待运营（runbook 就绪，Day1–5 待真实执行回填）。
2. **库存是否一致？** ⏳ 待 Day1 核对 SQL ①结果。
3. **销售是否一致？** ⏳ 待 Day2 核对 SQL ②③。
4. **POS 是否一致？** ⏳ 待 Day3 核对 SQL ④。
5. **追溯是否一致？** ⏳ 待 Day5 追溯 API 结果。
6. **是否允许 FARM-DP 切换 PACKAGING_INBOUND？** 🔒 BLOCKED（待孟赛结果）。
7. **是否达到正式 Go-Live 条件？** ⏳ 代码/架构已 Ready（R6）；**正式 Go-Live 待孟赛 O1 通过 + 无未关闭 P0**。

---

## 执行指引

1. 运营每日按 Day1–5 操作并执行对应核对 SQL，把结果填入「结果」与问题板。
2. 把每日核对 SQL 输出贴回，我据实判断一致性、定位异常、更新本报告结论。
3. 满 3–7 天且各项一致 + 无未关闭 P0 → 我据实更新「东鹏切换」与「Go-Live」结论。
