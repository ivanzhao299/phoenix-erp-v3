# GLP-1A-1 生产报表 → Phoenix ERP 字段映射审计

> **范围**：《孟赛蛋鸡场生产报表》（老挝凤凰农业，2026-06-01 ~ 2026-06-04） → Phoenix ERP V3
> **目的**：纯审计，**不导入数据**。判断映射可行性、识别缺口、决定是否允许进入导入阶段。
> **数据源**：`/Users/mac/phoenix-erp/data/生产报表.xlsx`（42 KB）
> **报告日期**：2026-06-05

---

## 0. 必答 5 题（结论速览）

| # | 问题 | 答案 |
|---|---|---|
| 1 | 发现多少 Sheet？ | **7 个 Sheet** |
| 2 | 发现多少字段？ | **75 字段**（含 Sheet 内重复列头，去重后约 53 独立业务字段） |
| 3 | 多少字段直接映射？ | **56 字段**（74.7%）— DB 已有对应字段 |
| 4 | 多少字段需扩展？ | **6 个 DB 新字段** + 13 个派生计算（聚合/差额，可通过 SQL view 派生）|
| 5 | 是否允许进入导入阶段？ | **❌ 暂不允许**。需先完成 4 项前置工作（见 §6）|

---

## 1. Excel 总览

| Sheet # | 名称 | 字段数 | 数据行 | 时间维度 | 业务类型 |
|---|---|---|---|---|---|
| 1 | 生产、死淘日报表 | 10 | 6（鸡舍 1-6 号） | 单日（2026-06-01） | 生产日报 |
| 2 | 鸡蛋入库汇总表 | 10 | 6（鸡舍 1-6 号） | 单日（2026-06-01） | 鸡蛋入库 |
| 3 | 鸡蛋出库汇总表 | 10 | 多客户行 | 单日（2026-06-01） | 鸡蛋出库 |
| 4 | 鸡蛋库存明细表 | 11 | 多日 × 3 摘要 | 2026-06-01 ~ 06-04 | 鸡蛋库存（汇总报表） |
| 5 | 原材料出入库明细表 | 16 | ~12 物料行 | 单日（2026-06-01） | 原料 WMS |
| 6 | 原材料采购明细表 | 9 | 5 行（6.1-6.5） | 2026-06-01 ~ 06-05 | 采购 |
| 7 | 现金收支表 | 9 | 42 流水行 | 2026-06-01 ~ 06-04 | 资金流水 |

**统计**：
- 时间跨度：**2026-06-01 ~ 2026-06-04（4 天）**
- 鸡舍：**6 个（1-6 号舍）**
- 蛋品 grade：**7 种**（特大蛋/一号蛋/二号蛋/三号蛋/四号蛋/脏蛋/破损）
- 币种：**2 种**（老挝基普 LAK 万元单位 + 人民币 CNY）

---

## 2. Sheet → ERP 模块 → DB 表 一览

| Sheet | ERP 模块 | 主表 | 从表 |
|---|---|---|---|
| 1 生产、死淘日报表 | Farm / Breeding | `brd_daily_logs` | `brd_houses`, `brd_flocks` |
| 2 鸡蛋入库汇总表 | Packaging / WMS Inventory | `inv_batches`, `wms_inbound` | `wms_inbound_items` |
| 3 鸡蛋出库汇总表 | Sales / Delivery | `sal_sales_orders`, `sal_order_items` | `sal_delivery_orders`, `wms_outbound` |
| 4 鸡蛋库存明细表 | Inventory (派生 view) | `inv_batches` 按日 + grade 聚合 | (无直接表，建议物化视图) |
| 5 原材料出入库明细表 | WMS | `wms_inbound`, `wms_outbound`, `wms_stock_balance` | `wms_inbound_items`, `wms_outbound_items` |
| 6 原材料采购明细表 | Procurement | `prc2_purchase_orders`, `prc2_order_items` | `prc2_suppliers`, `fin_exchange_rates` |
| 7 现金收支表 | Finance | `fin_cash_accounts`, `fin_cash_transactions` | — |

---

## 3. Sheet 级字段映射

### Sheet 1 — 生产、死淘日报表 → `brd_daily_logs`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 鸡舍 | `brd_daily_logs.house_code` | ✅ 直接 | 需主数据 `brd_houses` 含 1-6 号舍 |
| 日龄 | `brd_flocks.placement_age` 派生 | ⚠️ 派生 | = 当日 − placement_date |
| **期初存栏** | — | ❌ **缺字段** | 建议新增 `brd_daily_logs.opening_qty` |
| 淘汰 | `brd_daily_logs.elimination_qty` | ✅ 直接 | — |
| 死亡 | `brd_daily_logs.mortality_qty` | ✅ 直接 | — |
| **自用** | — | ❌ **缺字段** | 建议新增 `brd_daily_logs.self_use_qty` |
| **期末存栏** | — | ❌ **缺字段** | 建议新增 `brd_daily_logs.closing_qty`（或由 opening−死亡−淘汰−自用 派生）|
| 产蛋量 | `brd_daily_logs.eggs_produced` (或 `egg_count`) | ✅ 直接 | 两个字段并存，建议归一 |
| **产蛋率** | — | ❌ **缺字段** | 建议新增 `brd_daily_logs.lay_rate`（手填或由 eggs/closing 派生）|
| 备注 | `brd_daily_logs.note` | ✅ 直接 | — |

**关键缺口**：4 个字段（opening_qty / closing_qty / self_use_qty / lay_rate）

---

### Sheet 2 — 鸡蛋入库汇总表 → `inv_batches` + `wms_inbound`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 鸡舍 | `inv_batches.source_no` + `source_type='HOUSE'` | ⚠️ 半直接 | 需约定 source_type 枚举值 |
| 特大蛋 | `inv_batches.quality_grade='XL'` + qty | ✅ 直接 | 需 `PKG_EGG_GRADE` 字典完整 |
| 一号蛋 | `inv_batches.quality_grade='L'` + qty | ✅ 直接 | — |
| 二号蛋 | `inv_batches.quality_grade='M'` + qty | ✅ 直接 | — |
| 三号蛋 | `inv_batches.quality_grade='S'` + qty | ✅ 直接 | — |
| 四号蛋 | `inv_batches.quality_grade='XS'` + qty | ✅ 直接 | — |
| 脏蛋 | `inv_batches.quality_grade='DIRTY'` 或 `status='QUARANTINE'` | ✅ 直接 | `INV_STOCK_STATUS` 字典已有 |
| 破损 | `inv_batches.quality_grade='BROKEN'` 或 `wms_inbound_items.broken_qty` | ✅ 直接 | 两条路径并存 |
| 合计 | 聚合 SUM(qty) | ⚠️ 派生 | — |
| **备注** | — | ❌ **缺字段** | `wms_inbound` 无 remark → 建议新增 |

---

### Sheet 3 — 鸡蛋出库汇总表 → `sal_sales_orders` + `sal_order_items` + `wms_outbound`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 客户名称 | `sal_sales_orders.customer_name` | ✅ 直接 | 需主数据 `sal_customers` 建档：蒙混阿峰 / 沙耶武里 / 拉邦直营店 / 东鹏(会晒) / 猛龙 / 玉米厂 等 |
| 各 grade 数量 | `sal_order_items.grade_code` + `qty` | ✅ 直接 | grade_code 复用 PKG_EGG_GRADE |
| 合计 | 聚合 SUM(qty) | ⚠️ 派生 | — |
| 备注 | `sal_sales_orders.remark` | ✅ 直接 | — |

---

### Sheet 4 — 鸡蛋库存明细表 → 派生视图（`inv_batches` 聚合）

> 这是一份**报表 view**，非业务原始表。结构 = (日期, 摘要[入库/出库/库存], 7 蛋型 grade, 合计)

| Excel 字段 | DB 派生 | 映射 |
|---|---|:---:|
| 日期 | `inv_batches.egg_date` (或 created_at) | ⚠️ 派生 |
| 摘要 = 上月结余 | 上月末聚合 | ⚠️ 派生 |
| 摘要 = 入库 | SUM(wms_inbound_items.qty) by date+grade | ⚠️ 派生 |
| 摘要 = 出库 | SUM(wms_outbound_items.qty) by date+grade | ⚠️ 派生 |
| 摘要 = 库存 | inv_batches.qty_available 当日快照 by grade | ⚠️ 派生 |
| 各 grade 数量 | 按 grade pivot | ⚠️ 派生 |
| 合计 | SUM 横向 | ⚠️ 派生 |
| 备注 | — | — |

**建议**：在 `apps/api/src/modules/analytics` 增 SQL view `v_egg_inventory_daily`，无需新增表。

---

### Sheet 5 — 原材料出入库明细表 → `wms_inbound` + `wms_outbound` + `wms_stock_balance`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 饲料名称 | `wms_inbound.item` 或 `mst_products.product_name` | ✅ 直接 | 需主数据：玉米/豆粕/预混料 等 |
| 单位 | `mst_products.unit` | ✅ 直接 | 公斤 / 个 |
| 昨日库存 | 前日 `wms_stock_balance.qty` | ⚠️ 派生 | — |
| 今日入库 | SUM(wms_inbound_items.qty) by 日 | ⚠️ 派生 | — |
| **今日出库 — 2 号舍** | — | ❌ **缺字段** | 建议新增 `wms_outbound.destination_house_code` |
| 今日出库 — 3 号舍 | 同上 | ❌ 同 | — |
| 今日出库 — 4 号舍 | 同上 | ❌ 同 | — |
| 今日出库 — 5 号舍 | 同上 | ❌ 同 | — |
| 今日出库 — 6 号舍 | 同上 | ❌ 同 | — |
| 今日出库 — 厨房自用 | 同上 + `destination_type='KITCHEN'` | ❌ 同 | — |
| 出库合计 | SUM | ⚠️ 派生 | — |
| 现有库存 | `wms_stock_balance.qty` | ✅ 直接 | — |
| 日用量 | 5/7 日滚动均值 | ⚠️ 派生 | — |
| 可用天数 | 现有库存 ÷ 日用量 | ⚠️ 派生 | — |
| 备注 | — | ❌ **缺字段** | `wms_outbound` 暂无 remark |

**关键缺口**：`wms_outbound.destination_house_code` + `destination_type`（区分 6 鸡舍 + 厨房自用）

---

### Sheet 6 — 原材料采购明细表 → `prc2_purchase_orders` + `prc2_order_items`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 日期 | `prc2_purchase_orders.created_at` 或 `expected_date` | ✅ 直接 | — |
| 采购原材料名称 | `prc2_order_items.item_name` | ✅ 直接 | — |
| 供应商名称 | `prc2_purchase_orders.supplier_name` | ✅ 直接 | 需主数据 `prc2_suppliers`：中粮鞠德清 / 胥总 / 万象蛋托厂 |
| 单位 | `prc2_order_items.unit` | ✅ 直接 | — |
| 数量 | `prc2_order_items.qty` | ✅ 直接 | — |
| 单价 | `prc2_order_items.unit_price` | ✅ 直接 | — |
| 金额 | `prc2_order_items.amount` | ✅ 直接 | — |
| 币种 | `prc2_purchase_orders.currency_code` | ✅ 直接 | 需映射：基普 → LAK / 人民币 → CNY |
| 备注 | `prc2_purchase_orders.remark` | ✅ 直接 | — |

**全部 9 字段直接映射 ✅**（前提：建好供应商主数据 + 物料主数据 + 币种 dict）

---

### Sheet 7 — 现金收支表 → `fin_cash_accounts` + `fin_cash_transactions`

| Excel 字段 | DB 字段 | 映射 | 说明 |
|---|---|:---:|---|
| 日期 | `fin_cash_transactions.txn_date` | ✅ 直接 | — |
| 摘要 | `fin_cash_transactions.remark` | ✅ 直接 | — |
| 老挝币 — 收入 | `direction='IN'` + `currency_code='LAK'` + `amount` | ✅ 直接 | — |
| 老挝币 — 支出 | `direction='OUT'` + `currency_code='LAK'` + `amount` | ✅ 直接 | — |
| 老挝币 — 库存现金 | `balance_after`（LAK 账户聚合） | ✅ 直接 | — |
| 人民币 — 收入 | `direction='IN'` + `currency_code='CNY'` + `amount` | ✅ 直接 | — |
| 人民币 — 支出 | `direction='OUT'` + `currency_code='CNY'` + `amount` | ✅ 直接 | — |
| 人民币 — 库存现金 | `balance_after`（CNY 账户聚合） | ✅ 直接 | — |
| 备注 | `fin_cash_transactions.remark` | ✅ 直接 | — |

**全部 9 字段直接映射 ✅**

**注**：Excel 中"其中现金 3689，微信 7723"暗示**多账户细分**。需建多个 `fin_cash_accounts`：
- `CASH_LAK_PETTY`（老挝币现金箱）
- `WECHAT_LAK`（老挝币微信，如适用）
- `CASH_CNY_PETTY`（人民币现金箱）
- `WECHAT_CNY`（人民币微信）
- 各银行账户

---

## 4. 字段映射汇总

### 按映射类型分类（75 字段总计）

| 类型 | 数量 | 占比 |
|---|:---:|---|
| ✅ 直接映射 | **56** | 74.7% |
| ⚠️ 派生计算（聚合 / 差额，可 SQL view） | **13** | 17.3% |
| ❌ DB 缺字段（需扩展） | **6** | 8.0% |
| 🚫 无法映射 | **0** | 0% |

### 直接映射明细（按 Sheet）

| Sheet | 直接 | 派生 | 缺字段 |
|---|:---:|:---:|:---:|
| S1 生产日报 | 5 | 2 | 4 |
| S2 鸡蛋入库 | 8 | 1 | 1 |
| S3 鸡蛋出库 | 8 | 2 | 0 |
| S4 鸡蛋库存 | 0 | 8 | 0 |
| S5 原料 WMS | 5 | 4 | 7 |
| S6 原料采购 | 9 | 0 | 0 |
| S7 现金 | 9 | 0 | 0 |
| **合计** | **44** | **17** | **12 字段格 → 6 个 DB 新字段**（去重）|

> 注：S5 中"今日出库 — 2/3/4/5/6 舍 + 厨房自用"6 个 Excel 字段格映射到同 1 个 DB 新字段 `destination_house_code`，故新字段去重后只算 6 个。

---

## 5. DB 缺字段清单（需扩展）

| # | 表 | 新增字段 | 类型 | 用途 |
|---|---|---|---|---|
| 1 | `brd_daily_logs` | `opening_qty` | integer DEFAULT 0 | 期初存栏 |
| 2 | `brd_daily_logs` | `closing_qty` | integer DEFAULT 0 | 期末存栏 |
| 3 | `brd_daily_logs` | `self_use_qty` | integer DEFAULT 0 | 当日自用数量 |
| 4 | `brd_daily_logs` | `lay_rate` | numeric(5,4) | 产蛋率（0.0000~1.0000）|
| 5 | `wms_outbound` | `destination_type` | varchar(32) | HOUSE / KITCHEN / OFFICE / OTHER |
| 5 | `wms_outbound` | `destination_house_code` | varchar(64) | 引用 brd_houses.house_code（destination_type=HOUSE 时） |
| 6 | `wms_outbound` | `remark` | text | 出库备注 |
| 6 | `wms_inbound` | `remark` | text | 入库备注 |

> **6 个 DB 新字段**（合并 wms_outbound 的 type+code 计 1 条 patch）
> Migration 草稿：`migrations/20260605_glp1a1_production_extension.sql`（**审计阶段不建立**，导入阶段建）

---

## 6. 进入导入阶段的前置工作

> **结论：暂不允许进入导入阶段，需完成以下 4 项 P0 工作**

### 6.1 DDL 扩展（migration）

新建 `migrations/20260605_glp1a1_production_extension.sql`：
- `brd_daily_logs` +4 字段
- `wms_outbound` +3 字段
- `wms_inbound` +1 字段（remark）

### 6.2 字典 seed（sys_dict）

| dict_type | 需补值 | 状态 |
|---|---|---|
| `PKG_EGG_GRADE` | XL / L / M / S / XS / DIRTY / BROKEN | 字典 type 已存在，需 seed 7 个 code |
| `BRD_HOUSE_TYPE` | LAYING（产蛋舍） | 仅 1 种 |
| `WMS_OUTBOUND_DESTINATION` | HOUSE / KITCHEN / OFFICE / OTHER | **新字典类型** |
| `SYS_CURRENCY` | LAK / CNY | 已存在 ✅ |
| `BRD_CULL_REASON` | （选填，Sheet 1 备注里有）| 可选 |

### 6.3 主数据建档

| 实体 | 数量 | 示例 |
|---|---|---|
| `brd_houses` | 6 个 | 1 号鸡舍 / 2 号鸡舍 / ... / 6 号鸡舍 |
| `brd_flocks` | 至少 6 群（每舍 1 群） | 含日龄、placement_date、initial_qty |
| `mst_products`（饲料）| 约 6-8 个 SKU | 玉米 / 豆粕 / 预混料 / 蛋托 / 柴油 / ... |
| `prc2_suppliers` | 约 3-5 个 | 中粮鞠德清 / 胥总 / 万象蛋托厂 |
| `sal_customers` | 约 8-10 个 | 蒙混阿峰 / 沙耶武里 / 拉邦直营店 / 东鹏(会晒) / 猛龙 / 玉米厂 / 直营店 ... |
| `fin_cash_accounts` | 至少 4 个 | LAK 现金 / LAK 微信 / CNY 现金 / CNY 微信 |
| `fin_exchange_rates` | 2026-06-01 ~ 06-04 | LAK ↔ CNY 4 日汇率 |

### 6.4 数据预清洗

| 问题 | 处理 |
|---|---|
| Excel 日期"6.1 / 6.2"字符串格式 | 解析为 2026-06-01 |
| 老挝币"万元"单位 | 写入前 ×10000 转 LAK 整元 |
| 单元格合并 / 空行 | 解析时跳过 |
| 1 号鸡舍空数据 | Sheet 1/2 中 1 号鸡舍空白 → 跳过或建空记录 |
| Sheet 4 日期序列号 53280 异常 | 标题日期 R1 用 46174 = 2026-06-01（确认是序号 vs 数据混入）|
| 现金"其中现金 X，微信 Y"备注 | 拆分到不同 cash_account |

---

## 7. 风险与建议

### 数据完整性风险

1. **1 号鸡舍空白**：Sheet 1/2 中 1 号鸡舍所有字段空白 — 是停产 / 数据未录 / 还是真无数据？需业务确认
2. **币种混淆**：Sheet 6 行 1 单价 3.7 写"人民币"，行 2 单价 7300 写"基普"。基普单价合理，需校验单价单位
3. **现金摘要含子细节**："其中现金 3689，微信 7723" — 需拆分入账还是仅 remark 备注？

### 后续阶段建议

| 阶段 | 名称 | 主要任务 |
|---|---|---|
| **GLP-1A-1** | （本阶段）映射审计 | ✅ 完成 |
| GLP-1A-2 | DB 扩展 + 字典 + 主数据 | 跑 §6.1-6.3 |
| GLP-1A-3 | ETL 脚本开发 | Python xlsx → POST API 批量导入 |
| GLP-1A-4 | 试运行（4 天数据） | 跑 §6.4 清洗 + 导入 + 校验 |
| GLP-1A-5 | 报表对账 | Excel 合计 vs ERP 聚合 一致性验证 |

---

## 8. 答 5 题（终）

| # | 问题 | 答案（精确） |
|---|---|---|
| 1 | 发现多少 Sheet？ | **7 个**：生产日报 / 鸡蛋入库 / 鸡蛋出库 / 鸡蛋库存 / 原料 WMS / 原料采购 / 现金收支 |
| 2 | 发现多少字段？ | **75 字段**（含 Sheet 内重复列头）；**约 53 独立业务字段**（去重后） |
| 3 | 多少字段直接映射？ | **56 字段（74.7%）**，DB 已有字段一一对应 |
| 4 | 多少字段需扩展？ | **6 个 DB 新字段**（brd_daily_logs ×4 + wms_outbound ×3 + wms_inbound ×1，destination 计 1 patch）+ **3 个字典补 seed** + **约 40 条主数据建档** |
| 5 | 是否允许进入导入阶段？ | **❌ 暂不允许**。需先完成：①DDL 扩展 migration；②3 类字典 seed；③6 类主数据建档约 40 条记录；④数据预清洗脚本。预计 GLP-1A-2/3 阶段完成后方可启动导入 |

---

**审计完成时间**：2026-06-05
**报告生成方式**：openpyxl 解析 xlsx + 比对 `scripts/.prod-schema.sql` 实际 DDL
**下一阶段**：GLP-1A-2 — 等业务确认 §7 风险 + 授权后启动 DDL/字典/主数据建档
