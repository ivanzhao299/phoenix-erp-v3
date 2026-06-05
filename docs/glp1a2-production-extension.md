# GLP-1A-2 生产报表导入 — DDL 扩展 + 字典 + 主数据

> **阶段**：GLP-1A-2（基础设施）
> **前置**：GLP-1A-1 字段映射审计（`docs/glp1a1-production-data-mapping-audit.md`）
> **产物**：2 个 migration SQL + 本报告
> **数据库执行**：**未执行**（按 CLAUDE.md 红线，DDL/seed 文件创建 OK，运行迁移需人工确认）
> **报告日期**：2026-06-05

---

## 1. 交付物清单

| 文件 | 用途 | 行数 | 幂等 |
|---|---|---|:---:|
| `migrations/20260605_glp1a2_production_extension.sql` | brd_daily_logs +4 / wms_outbound +3 / wms_inbound +1 + 3 类字典 seed 13 项 | 113 | ✅ |
| `migrations/20260605_glp1a2_meng_sai_master_data.sql` | brd_farms 1 / brd_houses 6 / brd_flocks 5 / mst_products 10 / prc2_suppliers 3 / sal_customers 11 / fin_cash_accounts 4 | 142 | ✅ |
| `docs/glp1a2-production-extension.md` | 本报告 | — | — |

> 两个 migration 都包裹在 BEGIN/COMMIT 事务里，可单独执行，单独回滚。

---

## 2. DDL 扩展明细

### 2.1 `brd_daily_logs` +4 字段

| 字段 | 类型 | 默认 | 用途 |
|---|---|---|---|
| `opening_qty` | integer | 0 | 期初存栏 |
| `closing_qty` | integer | 0 | 期末存栏 |
| `self_use_qty` | integer | 0 | 当日自用数量 |
| `lay_rate` | numeric(5,4) | NULL | 产蛋率（0.0000~1.0000） |

闭合校验逻辑（业务层）：
```
closing_qty = opening_qty − mortality_qty − elimination_qty − self_use_qty
lay_rate ≈ eggs_produced ÷ closing_qty
```

### 2.2 `wms_outbound` +3 字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `destination_type` | varchar(32) | HOUSE / KITCHEN / OFFICE / OTHER（字典 WMS_OUTBOUND_DESTINATION） |
| `destination_house_code` | varchar(64) | destination_type=HOUSE 时引用 brd_houses.house_code |
| `remark` | text | 出库备注 |

### 2.3 `wms_inbound` +1 字段

| 字段 | 类型 | 用途 |
|---|---|---|
| `remark` | text | 入库备注 |

> 所有 ADD COLUMN 使用 `IF NOT EXISTS`，多次执行不会报错也不会重复添加。

---

## 3. 字典 seed 明细

| dict_type | 新增 dict_code | 数量 |
|---|---|---|
| `PKG_EGG_GRADE` | XL / L / M / S / XS / DIRTY / BROKEN | 7 |
| `WMS_OUTBOUND_DESTINATION` | HOUSE / KITCHEN / OFFICE / OTHER | 4 |
| `BRD_HOUSE_TYPE` | LAYING / BROOD / PULLET | 3 |
| **合计** | | **14** |

> 与 Excel 蛋型映射：`特大蛋=XL / 一号蛋=L / 二号蛋=M / 三号蛋=S / 四号蛋=XS / 脏蛋=DIRTY / 破损=BROKEN`

---

## 4. 主数据建档明细

### 4.1 brd_farms（1 个养殖场）

| farm_code | farm_name | location | capacity |
|---|---|---|---|
| `LPH_MENGSAI` | 孟赛蛋鸡场 | 老挝 · 北部 · 孟赛 | 250000 |

### 4.2 brd_houses（6 个鸡舍）

| house_code | house_name | house_type | capacity | current_birds（来自 6.1 期初） |
|---|---|---|---|---|
| `LPH_MS_H1` | 1 号鸡舍 | LAYING | 45000 | 0（Excel 全空，疑似空栏）|
| `LPH_MS_H2` | 2 号鸡舍 | LAYING | 46000 | 45551 |
| `LPH_MS_H3` | 3 号鸡舍 | LAYING | 40000 | 37336 |
| `LPH_MS_H4` | 4 号鸡舍 | LAYING | 45000 | 43816 |
| `LPH_MS_H5` | 5 号鸡舍 | LAYING | 44000 | 42368 |
| `LPH_MS_H6` | 6 号鸡舍 | LAYING | 43000 | 41500 |

### 4.3 brd_flocks（5 群，2-6 号舍各 1 群）

placement_date **反推自 Excel 2026-06-01 当日日龄列**（精度日级）：

| flock_no | house | strain | placement_date | placement_age (6.1) | initial_qty | current_qty |
|---|---|---|---|---|---|---|
| `LPH_MS_F02` | H2 | 海兰褐 | 2025-10-06 | 239 | 45600 | 45551 |
| `LPH_MS_F03` | H3 | 海兰褐 | 2025-07-06 | 331 | 37500 | 37336 |
| `LPH_MS_F04` | H4 | 海兰褐 | 2025-07-06 | 331 | 44000 | 43816 |
| `LPH_MS_F05` | H5 | 海兰褐 | 2025-12-24 | 160 | 42500 | 42368 |
| `LPH_MS_F06` | H6 | 海兰褐 | 2025-12-24 | 160 | 41700 | 41500 |

> ⚠️ initial_qty 是估算（current_qty + 累计死亡淘汰），业务方应根据实际入舍记录修订。

### 4.4 mst_products（10 个 SKU）

| 类别 | product_code | 中文 | 单位 |
|---|---|---|---|
| FEED | FEED_CORN | 玉米 | 公斤 |
| FEED | FEED_SOY_MEAL | 豆粕 | 公斤 |
| FEED | FEED_PREMIX | 预混料 | 公斤 |
| FEED | FEED_PREMIX_YOUNG | 青年预混料 | 公斤 |
| FEED | FEED_SOY_OIL | 豆油 | 公斤 |
| FEED | FEED_LIMESTONE | 石粉 | 公斤 |
| FEED | FEED_RICE_BRAN | 米糠 | 公斤 |
| PACKAGING | PKG_EGG_TRAY | 蛋托 | 个 |
| FUEL | FUEL_DIESEL | 柴油 | 升 |
| FINISHED_GOODS | EGG | 鸡蛋 | 枚（has_grade=true，靠 grade_code 区分 7 等级） |

### 4.5 prc2_suppliers（3 个）

| supplier_code | supplier_name | country | currency |
|---|---|---|---|
| `SUP_ZHONGLIANG` | 中粮鞠德清 | CN | CNY |
| `SUP_XU` | 胥总 | LA | LAK |
| `SUP_VTE_TRAY` | 万象蛋托厂 | LA | LAK |

### 4.6 sal_customers（11 个）

| customer_no | customer_name | type |
|---|---|---|
| `CUS_MH_AF` | 蒙混阿峰 | WHOLESALE |
| `CUS_MH_PP` | 蒙混胖胖 | WHOLESALE |
| `CUS_SY` | 沙耶武里 | WHOLESALE |
| `CUS_LB_STORE` | 拉邦直营店 | STORE |
| `CUS_MS_STORE` | 孟赛直营店 | STORE |
| `CUS_VTE_STORE` | 万象直营店 | STORE |
| `CUS_BLK_STORE` | 波利坎赛合营店 | STORE |
| `CUS_DP_HX` | 东鹏（会晒） | WHOLESALE |
| `CUS_VTE_LB` | 万象刘彬 | WHOLESALE |
| `CUS_FSL` | 风沙里文代 | WHOLESALE |
| `CUS_RETAIL` | 零售 | RETAIL |

### 4.7 fin_cash_accounts（4 个，opening_balance=0 待录）

| account_code | account_name | currency | account_type |
|---|---|---|---|
| `CASH_LAK` | 老挝币现金 | LAK | CASH |
| `WECHAT_LAK` | 老挝币微信 | LAK | EWALLET |
| `CASH_CNY` | 人民币现金 | CNY | CASH |
| `WECHAT_CNY` | 人民币微信 | CNY | EWALLET |

---

## 5. 命名规则统一说明

| 前缀 | 含义 | 示例 |
|---|---|---|
| `LPH_` | Lao Phoenix Holdings（老挝凤凰农业）公司命名空间 | farm_code / house_code / flock_no |
| `FEED_` | 饲料类物料 | FEED_CORN / FEED_SOY_MEAL |
| `PKG_` | 包装类物料 | PKG_EGG_TRAY |
| `FUEL_` | 燃料类物料 | FUEL_DIESEL |
| `SUP_` | 供应商 | SUP_ZHONGLIANG |
| `CUS_` | 客户 | CUS_MH_AF |
| `CASH_/WECHAT_` | 资金账户 | CASH_LAK / WECHAT_CNY |

> company_code 占位为 `LPH`，若真实组织树中实际代码不同（例如 `PHX-LAO-001`），执行 seed 前需：
> ```bash
> sed -i.bak "s/'LPH'/'PHX_LAO_001'/g" migrations/20260605_glp1a2_meng_sai_master_data.sql
> ```

---

## 6. 执行步骤（运维侧）

```bash
# 1) 先跑 DDL + 字典（无依赖）
psql $DATABASE_URL -f migrations/20260605_glp1a2_production_extension.sql

# 2) 再跑主数据（依赖 LAYING 字典 / 上一步的 column 存在性）
psql $DATABASE_URL -f migrations/20260605_glp1a2_meng_sai_master_data.sql

# 3) 验证（每文件末尾有验证 SQL 段）
```

预期 row 计数：

| 表 | 期望计数 |
|---|---|
| brd_farms (LPH_MENGSAI) | 1 |
| brd_houses (farm_code=LPH_MENGSAI) | 6 |
| brd_flocks (farm_code=LPH_MENGSAI) | 5 |
| mst_products (FEED_* / PKG_EGG_TRAY / FUEL_DIESEL / EGG) | 10 |
| prc2_suppliers (SUP_*) | 3 |
| sal_customers (CUS_*) | 11 |
| fin_cash_accounts (4 codes) | 4 |
| sys_dict (PKG_EGG_GRADE / WMS_OUTBOUND_DESTINATION / BRD_HOUSE_TYPE) | 7 / 4 / 3 |

---

## 7. 残留 / 后续阶段

| 项 | 说明 | 阶段 |
|---|---|---|
| 实际跑 migration | 需业务/运维人工执行 | 立即 |
| company_code 替换 | 若 'LPH' 不是真实代码 | 执行前 sed |
| Excel 5/6 号舍 placement_age 真伪 | 业务确认 1 号鸡舍是否空栏 | 立即 |
| Excel 1 号鸡舍空白 | 业务确认（停产/备用/数据未录）| 立即 |
| brd_flocks initial_qty 校正 | 业务方提供真实入舍数据 | 立即 |
| fin_exchange_rates 4 日 LAK↔CNY | 业务方提供官方汇率 | GLP-1A-3 前 |
| Excel 数据导入 ETL 脚本 | Python + master-data API | GLP-1A-3 |
| 试运行 + 对账 | 4 天数据导入校验 | GLP-1A-4/5 |

---

## 8. 风险闭环

| 来源 | 风险 | 本阶段处置 |
|---|---|---|
| GLP-1A-1 §7.1 | 1 号鸡舍空白 | brd_houses 仍建档（占位），current_birds=0；ETL 阶段跳过该舍 |
| GLP-1A-1 §7.2 | Sheet 6 单价单位混淆 | 不预录任何 PO 数据；导入时按 currency_code+unit_price 联合校验 |
| GLP-1A-1 §7.3 | 现金"其中现金 X 微信 Y" | 4 个 cash_accounts 已建（CASH_LAK / WECHAT_LAK / CASH_CNY / WECHAT_CNY）；ETL 时按账户分拆入账 |
| 新发现 | LPH company_code 占位 | 报告 §5 提示 sed 替换 |

---

## 9. 必答（GLP-1A-2 阶段）

| # | 问题 | 答案 |
|---|---|---|
| 1 | DDL 新增了多少字段？ | **8 个**（brd_daily_logs ×4 + wms_outbound ×3 + wms_inbound ×1） |
| 2 | 字典新增了多少 code？ | **14 个**（PKG_EGG_GRADE 7 + WMS_OUTBOUND_DESTINATION 4 + BRD_HOUSE_TYPE 3） |
| 3 | 主数据建档多少行？ | **40 行**（1+6+5+10+3+11+4） |
| 4 | 是否真的跑了 DDL？ | **❌ 未执行**。两个 .sql 文件已生成，待业务 / 运维人工执行 `psql -f`，每文件均带 BEGIN/COMMIT + NOT EXISTS 守卫，多次执行不会破坏数据 |
| 5 | 是否允许进入 GLP-1A-3（ETL 脚本开发）？ | **⚠️ 部分允许**。需先：①运维执行 2 个 migration 并通过尾部验证 SQL；②业务确认 company_code = 'LPH' 是否正确；③业务确认 1 号鸡舍状态；④业务提供 fin_exchange_rates 4 日 LAK↔CNY 汇率。完成后可开 GLP-1A-3 |

---

**审计与设计**：Claude Opus 4.7（1M context）
**复核来源**：`scripts/.prod-schema.sql` 实际生产 DDL（`brd_daily_logs / brd_farms / brd_houses / brd_flocks / mst_products / prc2_suppliers / sal_customers / fin_cash_accounts / sys_dict / wms_inbound / wms_outbound`）
**完成时间**：2026-06-05
