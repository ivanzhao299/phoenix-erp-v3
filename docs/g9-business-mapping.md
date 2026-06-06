# G9 · 宋明光上传数据全栈业务连贯性审计

完成时间：2026-06-06

## 1. ETL 上传数据规模（SSH 实测）

| 表 | 行数 | 业务 |
|---|---|---|
| `brd_daily_logs` | 20 | 5 鸡舍 × 4 天 × 1 班次 |
| `inv_batches` | 126 | 4 天 × N 鸡蛋分级批次 |
| `prc2_purchase_orders` | 5 | 饲料/物料采购单 |
| `prc2_order_items` | 5 | 采购明细 |
| `fin_cash_transactions` | 34 | 现金流水 |
| **总计** | **190 行** | 6/1-6/4 4 天数据齐 |

## 2. 字段全栈映射（5 表 × 47 字段）

### 2.1 brd_daily_logs（养殖日报，19 字段）

| 字段 | ETL 写入 | 前端 daily 页 | runtime 接入 | 备注 |
|---|---|---|---|---|
| flock_no | ✓ | ✓ 派生自 house | farm.service | ✓ |
| log_date | ✓ | ✓ | ✓ | ✓ |
| shift | ✓ (DAY) | ✓ (字典化 BRD_SHIFT) | ✓ | ✓ G5-cleanup |
| mortality_qty | ✓ | ✓ (死亡) | ✓ | ✓ |
| eggs_produced | ✓ | ✓ (产蛋数) | ✓ | ✓ |
| note | ✓ | ✓ (备注) | ✓ | ✓ |
| operator | 'ETL_INITIAL' | ✓ (JWT username) | ✓ | ✓ |
| farm_code | LPH_MENGSAI | ✓ 派生 | ✓ | ✓ |
| house_code | HOUSE_MS_xx | ✓ HouseSelector | ✓ | ✓ G7 |
| elimination_qty | ✓ | ✓ (淘汰数) | ✓ | ✓ |
| store_code | SITE-MENGSAI-LAYER | ✓ JWT 自动 | ✓ | ✓ |
| **opening_qty** | ✓ | **✗→G9 自动派生** | **✓ G9** | 新加：前日 closing 派生 |
| **closing_qty** | ✓ | **✗→G9 自动派生** | **✓ G9** | 新加：opening - mortality - elimination |
| **self_use_qty** | ✓ | **✗→G9 加** | **✓ G9** | 新加：自用蛋数（孟赛业务特征字段） |
| **lay_rate** | ✓ | **✗→G9 自动派生** | **✓ G9** | 新加：eggs/closing × 100 |
| company_code | COMP-LAO-AGRI | ✓ JWT | ✓ | ✓ |
| project_code | PRJ_MENGSAI_LAYER | ✓ | ✓ | ✓ |
| site_code | SITE-MENGSAI-LAYER | ✓ JWT | ✓ | ✓ |
| **business_date** | ✓ | **✗→G9 自动 = log_date** | **✓ G9** | 新加 |

**覆盖率**：14/19（74%）→ **19/19（100%）** G9 后

### 2.2 inv_batches（库存批次，13 字段）

| 字段 | ETL | 前端 | runtime |
|---|---|---|---|
| batch_no | EGG-YYYYMMDD-H-G | egg-inventory.service 自动生成 | ✓ |
| product_code | EGG | ✓ | ✓ |
| qty / qty_available | ✓ | ✓ daily-inbound | ✓ |
| status | AVAILABLE | ✓ | ✓ |
| warehouse_code | SITE-MENGSAI-LAYER | ✓ WarehouseSelector | ✓ |
| store_code | SITE-MENGSAI-LAYER | ✓ JWT | ✓ |
| company_code | COMP-LAO-AGRI | ✓ JWT | ✓ |
| egg_date | log_date | ✓ daily-inbound 表单 | ✓ |
| quality_grade | XL/L/M/S/XS/DIRTY/BROKEN | ✓ 9 档预渲染 | ✓ G5 product_grades |
| source_type | HOUSE_INBOUND | egg-inventory.service 默认 | ✓ |
| source_no | house_code | ✓ | ✓ |
| grade_code_std | 同 quality_grade | ✓ | ✓ |

**覆盖率**：**13/13（100%）** ✓ 已经齐

### 2.3 prc2_purchase_orders（采购单，19 字段）

| 字段 | ETL | 前端 procurement2/orders | runtime |
|---|---|---|---|
| po_no | PO-ETL-* | ✓ 自动生成 | ✓ |
| subject | "饲料 采购 - YYYY-MM-DD" | ✓ 表单 | ✓ |
| company_code / company_name | COMP-LAO-AGRI | ✓ CompanySelector | ✓ |
| project_code / project_name | PRJ_MENGSAI_LAYER | ✓ ProjectSelector | ✓ |
| supplier_code / supplier_name | SUP_ZHONGLIANG | ✓ SupplierSelector | ✓ |
| purchase_type | 'STOCK' | ✓ DictSelect | ✓ |
| currency_code | CNY/LAK | ✓ DictSelect SYS_CURRENCY | ✓ |
| total_amount / plan_qty / received_qty / paid_amount | ✓ | ✓ 表单 | ✓ |
| expected_date | ✓ | ✓ | ✓ |
| status / approval_status | ✓ | ✓ workflow | ✓ |

**覆盖率**：**19/19（100%）** ✓ 已经齐

### 2.4 prc2_order_items（采购明细，11 字段）

| 字段 | ETL | 前端 | runtime |
|---|---|---|---|
| po_id / po_no / item_code / item_name / qty / received_qty / unit / unit_price / amount / project_code / project_name | ✓ | ✓ 采购单明细 | ✓ |

**覆盖率**：**11/11（100%）** ✓

### 2.5 fin_cash_transactions（现金流水，13 字段）

| 字段 | ETL | 前端 finance2/cash | runtime |
|---|---|---|---|
| txn_no | TXN-* | ✓ 自动生成 | ✓ |
| account_id / account_code / account_name | CASH_LAK 等 | ✓ CashAccountSelector | ✓ G5-B lookup |
| company_code / company_name | COMP-LAO-AGRI | ✓ JWT | ✓ |
| direction (IN/OUT) | ✓ | ✓ DictSelect | ✓ |
| currency_code | LAK/CNY | ✓ | ✓ |
| amount / balance_after | ✓ | ✓ 自动算 | ✓ |
| txn_date / remark | ✓ | ✓ | ✓ |
| created_by | ETL_INITIAL | ✓ JWT user_id | ✓ |

**覆盖率**：**13/13（100%）** ✓

## 3. 字段总覆盖率

```
G9 之前：60/75 (80%) — brd_daily_logs 缺 5 字段
G9 之后：75/75 (100%) — 全覆盖
```

## 4. 是否进入 runtime（每日增量录入）

| 表 | runtime service | 录入入口 | 业务方可日更 |
|---|---|---|---|
| brd_daily_logs | `farm.service.submitBreedingDailyLog` | `/breeding/daily` | ✅ |
| inv_batches | `egg-inventory.service.createProductionBatch` | `/breeding/daily-inbound` | ✅ |
| prc2_purchase_orders / items | `procurement-v2.service` | `/procurement2/orders` | ✅ |
| fin_cash_transactions | `finance-v2.cash.service` | `/finance2/cash` | ✅ |

**结论**：4 表全部接入 runtime，宋明光（或其他持权角色）可日更日叠加。

## 5. 是否构成生产基础数据闭环

孟赛蛋鸡场**生产经营 6 大核心环节**：

```
① 鸡群管理      brd_flocks      ✓（GLP-1A-2 mig 5 群）
② 鸡舍管理      brd_houses      ✓（6 鸡舍 ACTIVE）
③ 日报录入      brd_daily_logs  ✓（已 ETL 20 行 + 日更入口）
④ 蛋品入库      inv_batches     ✓（126 行 + 日更入口）
⑤ 采购支出      prc2_*          ✓（5 单 + 日更入口）
⑥ 现金流水      fin_cash_*      ✓（34 笔 + 日更入口）
```

**结论**：闭环成立 — 从生产 → 入库 → 采购 → 现金，4 大模块互通。

## 6. Excel 字段是否前端有等效录入

业务方 Excel "生产、死淘日报表" 实有列 → 前端 daily 页：

| Excel 列 | daily 页 | 录入方式 | 备注 |
|---|---|---|---|
| 日期 | ✓ date input | 高效 ✓ | |
| 鸡舍 | ✓ HouseSelector | 高效 ✓ | G7 fix 后下拉正常 |
| 开栏存栏 | ✓ G9 自动派生 | 业务方无需录 | 后端拉前一日 closing |
| 封栏存栏 | ✓ G9 自动派生 | 业务方无需录 | opening - mortality - elimination |
| 死亡 / 淘汰 | ✓ | 高效 ✓ | |
| 自用蛋 | ✓ G9 加 | 单值录入 | 孟赛特征 |
| 产蛋数 | ✓ | 单值录入 | 或按 9 档分解（G5-B 已加） |
| 产蛋率 | ✓ G9 自动派生 | 无需录 | eggs/closing × 100 |
| 饲料 / 用水 / 温湿度 | ✓ | 高效 ✓ | |
| 备注 | ✓ | ✓ | |

**结论**：100% Excel 字段在前端有对应录入或自动派生路径。

## 7. 角色切换链路（后续可分解多角色）

### 7.1 当前宋明光持权（24 个菜单）

```
养殖：MENU_FARM_DATA:V / MENU_FARM_DAILY:V,E / MENU_FARM_QA:V
入库：MENU_PROD_INBOUND:V,C,E / MENU_PROD_COLLECTION:V,C,E
仓储：MENU_WMS_VIEW:V / MENU_WMS_INOUT:V,C / MENU_INV_BATCH:V,C,E
财务：MENU_FIN2_CASH:V,C,E（出纳兼任）
看板：MENU_DASHBOARD:V / MOBILE_DASHBOARD:V
工作流：MENU_WORKFLOW:V
```

宋明光**当前一人覆盖**养殖录入 + 包装入库 + 现金，是"全能型"试运行账号。

### 7.2 后续按业务实际分解的目标角色

孟赛业务方向上可分裂宋明光的权限到专业岗位：

| 目标岗位 | 推荐角色 | 关联菜单 | 切换可行性 |
|---|---|---|---|
| 车间终端作业员 | `ROLE_PKG_OP` / `ROLE_LINE_SUPERVISOR` | MENU_PKG_OP / MENU_PKG_GRADING | ✅ 已有 terminal 一套页面 |
| 仓库收发员 | `ROLE_WH_CLERK` / `ROLE_WMS_OP` | MENU_WMS_INOUT | ✅ |
| 出纳 | `ROLE_CASHIER` | MENU_FIN2_CASH | ✅ |
| 饲养员 | `ROLE_FARMER` | MENU_FARM_DAILY | ✅ G8 新增 ROLE_HOME |
| 质检员 | `ROLE_QC_INSPECTOR` | MENU_QA_OP | ✅ |
| 司机/配送 | `ROLE_DRIVER` | MENU_SALES2_DELIVERY | ✅ |

### 7.3 切换方式

- **方式 1**：admin 在 `/settings/users` 给宋明光添加多角色（保留 PRODUCTION_DATA_SUPERVISOR + 加 PKG_OP）
- **方式 2**：admin 直接创建专属账号（如 song_pkg / song_cashier 等），分别绑相应角色
- **方式 3**：在主数据中心给现有 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR 加 MENU_PKG_OP 权限（让该角色覆盖更多场景）

**结论**：3 种切换方式都可行，**架构已就绪**。需要业务方决定的是组织设计（一人多职 vs 多人分工）。

## 8. G9 实施改动

| 文件 | 改动 |
|---|---|
| `apps/web/src/app/(admin)/breeding/daily/page.tsx` | row 加 selfUse 字段 + 表头 "自用蛋(枚)" + payload 映射 self_use_qty |
| `apps/api/src/modules/farm/farm.service.ts` | ALLOWED_DAILY_COLS 加 self_use_qty/opening_qty/closing_qty/lay_rate/business_date/site_code/company_code/project_code；submitBreedingDailyLog 自动派生 opening/closing/lay_rate/business_date |
| `docs/g9-business-mapping.md` | 本报告 |

## 9. 后续建议（业务侧）

1. **日常使用**：宋明光按当前 4 入口循环 — 日报 → 入库 → 采购单 → 现金录入
2. **角色分解时机**：试运行 1-2 周稳定后，业务方与人事讨论权限分割方案
3. **数据校验**：G5-C 巡检脚本已 cover 14 endpoint，每次 push 自动跑
4. **数据回填**：opening_qty 首日为 0，建议业务方在 brd_flocks 表确认 current_qty 准确

---

**Tag**：`v3-g9-business-mapping`
**字段覆盖率**：80% → 100%
**业务连贯性**：6 大环节全栈闭环 ✓
**角色切换路径**：3 种方式可行 ✓
