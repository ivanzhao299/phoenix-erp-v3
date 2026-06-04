# Phoenix ERP V3 · G5.5-B — G6 Recovery Plan

> 阶段：G5.5-B
> 日期：2026-06-04
> 模式：**纯规划**（零代码 / 零重构）
> 输入：G5.5-A 主数据中心审计结论（54.5 / 100）+ G6 半成品盘点
> 输出：G6 恢复路线 + 主数据中心补完路线
>
> **三禁原则**：
> - ❌ 禁止删除 G6
> - ❌ 禁止回滚 G6
> - ❌ 禁止继续扩展 G6
>
> **本阶段目标**：**暂停 G6 → 补齐主数据 → 再恢复 G6**

---

## 1. G6 当前完成度

### 1.1 G6 Inventory（按代码状态分类）

> 证据：`apps/api/src/modules/analytics/`、`migrations/20260604_g6_analytics_views.sql`、`apps/web/src/app/(admin)/analytics/*`

| 模块 | 后端 Service | API 端点 | 前端页面 | 物化视图 | 分类 |
|------|--------------|----------|----------|----------|------|
| **A 集团**       | ✅ `group-analytics.service.ts` (5972B) | ✅ `/api/v2/analytics/group` | ❌ 不存在 | mv_daily_sales | **B 半完成** |
| **B 财务**       | ✅ `finance-analytics.service.ts` (4376B) | ✅ `/api/v2/analytics/finance` | ❌ 不存在 | mv_ar_aging_summary | **B 半完成** |
| **C 销售**       | ✅ `sales-analytics-aggregator.service.ts` (3041B) | ✅ `/api/v2/analytics/sales` | ⚠️ 旧 `analytics/page.tsx` 部分覆盖 | mv_daily_sales | **B 半完成** |
| **D 库存**       | ✅ `inventory-analytics.service.ts` (3802B) | ✅ `/api/v2/analytics/inventory` | ✅ `analytics/inventory/page.tsx` (330 行) | mv_inv_status_summary | **B 半完成**（前端是 G6 前的产物） |
| **E 生产**       | ✅ `production-analytics.service.ts` (3742B) | ✅ `/api/v2/analytics/production` | ✅ `analytics/production/page.tsx` (263 行) | mv_daily_egg | **B 半完成**（同上） |
| **F 股东**       | ✅ `shareholder-analytics.service.ts` (2814B) | ✅ `/api/v2/analytics/shareholders` | ❌ 不存在 | — | **B 半完成** |
| **G 异常**       | ✅ `exception-analytics.service.ts` (1479B) | ✅ `/api/v2/analytics/exceptions` | ❌ 不存在 | — | **B 半完成**（转发 G5 告警） |
| **H 预测**       | ✅ `forecast-analytics.service.ts` (4465B) | ✅ `/api/v2/analytics/forecast` | ❌ 不存在 | — | **B 半完成** |
| 物化视图迁移      | — | — | — | ✅ SQL 已写（4 个 mv + 刷新函数） | **D 未运行**（未在生产 DB 执行） |
| app.module 注册   | — | — | — | — | ⚠️ 已 import + 已注册（**未 commit**） |
| /analytics 主入口 | — | — | ⚠️ `analytics/page.tsx` 220 行（G6 前已有）+ 未更新为 8 卡片导航 | — | **C 占位状态** |

**最终分类**：
- **A 已完成**：**0 个**
- **B 半完成**：**8 个**（全部分析模块的后端服务都写了，但**前端 5 个新页面、入口页改造、迁移执行**全部未做）
- **C 占位**：**5 个前端页面**（group / finance / shareholders / exceptions / forecast 完全缺失）
- **D 未开始**：**0 个**（每个模块都至少有后端 service）

**G6 完成度估算**：约 **40 %**（后端 ~70 % + 前端 ~10 % + 入口 0 %）

### 1.2 G6 当前 commit 状态

| 项 | 状态 |
|---|------|
| 8 个 service 文件 | ✅ 已写入磁盘（**未 commit**） |
| controller + module | ✅ 已写入磁盘（**未 commit**） |
| app.module.ts 注册 | ✅ 已修改（**未 commit**） |
| 物化视图迁移 SQL | ✅ 已写（**未 commit、未在 DB 执行**） |
| Git 工作区 | `?? apps/api/src/modules/analytics/` + `M apps/api/src/app.module.ts` |

**保留策略**：按用户"禁止删除/回滚 G6"要求，**全部保留为未提交工作区文件**，G6 恢复时直接进入"完善+commit"。

---

## 2. G6 依赖审计（每模块依赖矩阵）

> 证据：`grep -oE "FROM [a-z_]+|JOIN [a-z_]+"` 每个 service 文件

| G6 模块 | 直接依赖业务表 | 隐式依赖主数据 | 隐式依赖字典 |
|---------|----------------|----------------|--------------|
| **A 集团** | sales_orders / sales_order_items / fin_cash_accounts / inv_batches / fin_ar_invoices / fin_ap_invoices / shr_contributions / fin_expense_requests | 公司 / 项目 / 客户 / 供应商 / 股东 / 资金账户 / 产品（含 sku/cost） | SYS_CURRENCY / FIN_EXPENSE_TYPE |
| **B 财务** | fin_ar_receipts / prc_payments / fin_ar_invoices / fin_ap_invoices / fin_expense_requests / sales_orders / inv_batches | 公司 / 客户 / 供应商 / 资金账户 / 产品 | SYS_CURRENCY / FIN_EXPENSE_TYPE / FIN_RECEIPT_METHOD |
| **C 销售** | sales_orders / sales_order_items | 客户 / 渠道 / 项目 / 公司 / 产品 | SAL_CHANNEL / SAL_ORDER_TYPE |
| **D 库存** | inv_batches / inv_ledger | 仓库 / 库区 / 货位 / SKU / 产品 | INV_STOCK_STATUS / INV_INBOUND_TYPE / INV_OUTBOUND_TYPE |
| **E 生产** | brd_daily_logs / brd_flocks | **场站 / 鸡舍 / 鸡群** | BRD_FLOCK_STATUS / PKG_EGG_GRADE |
| **F 股东** | shr_contributions | 股东 / 公司 / 项目 / 资金账户 | FIN_CONTRIBUTION_TYPE |
| **G 异常** | （调 G5 alerts）| —（间接经 G5 调全部）| — |
| **H 预测** | sales_orders / brd_daily_logs / fin_ar_receipts / prc_payments / inv_batches / generate_series | 全部业务表的源主数据 | — |

**汇总**：G6 八模块依赖的核心主数据对象（去重）：
1. **公司**（17 处业务引用） ← G5.5-A 评分 50
2. **客户**（7 处） ← G5.5-A 评分 95 ⭐
3. **供应商**（6 处） ← 95 ⭐
4. **项目**（5 处） ← 95 ⭐
5. **股东**（3 处） ← 70（user-orgs 类）
6. **仓库**（8 处） ← 50
7. **资金账户**（6 处） ← 55
8. **产品**（10 处 SKU 引用） ← **5** 🔴 **占位**
9. **SKU**（10 处） ← 48
10. **场站**（0 处 Selector 但生产分析直接 grep brd_daily_logs） ← 未独立菜单
11. **鸡舍**（3 处） ← 通过 HouseSelector
12. **鸡群**（0 处 Selector） ← G6-E 直接读 brd_flocks
13. **银行账户** ← **0** ❌ **不存在**

---

## 3. 主数据中心缺口（基于 G5.5-A 评分 + G6 依赖）

### 3.1 P0 缺口（**直接阻塞 G6 模块**）

| # | 主数据 | G5.5-A 分 | 缺口性质 | 阻塞的 G6 模块 |
|---|--------|----------|----------|---------------|
| **1** | **产品档案** `master-data/products/page.tsx` | **5** 🔴 占位 | 完全无 CRUD（30 行 "功能开发中"） | A 集团 / B 财务 / C 销售 / D 库存 / H 预测（5 个模块依赖） |
| **2** | **门店档案** `master-data/stores/page.tsx` | **5** 🔴 占位 | 同上 | 当前 G6 不直接依赖（StoreSelector 仅 1 处引用），但 CEO 驾驶舱迟早需要 |
| **3** | **银行账户中心** | **0** ❌ | 路径不存在 | C 销售（境外结算） / 间接：B 财务对账 |
| **4** | **资金账户 Runtime 对接** `master-data/cash-accounts/page.tsx` (158 行自建) | **55** 🟡 | Runtime 后端已配置（`MD_CASH_ACCOUNT_CREATE`）但前端未走 Panel — 配了走不通 | F 股东 / A 集团 / B 财务（依赖资金账户 6 处） |

### 3.2 P1 缺口（**间接阻塞 G6 治理一致性**）

| # | 主数据 | G5.5-A 分 | 缺口性质 | 阻塞性 |
|---|--------|----------|----------|--------|
| 5 | SKU 档案 (273 行自建) | 48 | 业务引用 10 处但治理标准不统一 | **A/C/D 中** |
| 6 | 仓库档案 (138 行自建) | 50 | 同上 | **D 中** |
| 7 | 等级 + 包装规格 (216 + 214 行自建) | 35 / 35 | 双双缺生命周期 / Workflow | **E 中**（生产分析需要等级分布） |
| 8 | 司机 + 车辆 (151 + 141 行自建) | 40 / 40 | 双双缺 Panel | **C 低**（销售配送指标） |

### 3.3 P2 缺口（**完善但不阻塞 G6**）

| # | 主数据 | G5.5-A 分 | 性质 |
|---|--------|----------|------|
| 9 | 组织架构（1050 行）+ 公司档案（143 行） | 58 / 50 | 缺 5 态生命周期；当前只有 ACTIVE/INACTIVE |
| 10 | 数据字典中心 整合 dictionaries(172) ↔ settings/dict(493) | 45 | 已有功能但入口零散 |

---

## 4. Runtime 缺口（master-data-runtime.service 实际纳管）

> 证据：`master-data-runtime.service.ts` 第 29-50 行的 `TYPES` 配置

**已纳管**（4 类）：
- ✅ `customer` (sal_customers, CUS-, MD_CUSTOMER_CREATE)
- ✅ `supplier` (prc2_suppliers, SUP-, MD_SUPPLIER_CREATE)
- ✅ `project` (shr_projects, PRJ-, MD_PROJECT_CREATE)
- ⚠️ `cash-account` (fin_cash_accounts, 业务格式编码, MD_CASH_ACCOUNT_CREATE) — **后端配了但前端未对接**

**待纳管**（按 G6 阻塞性优先级）：
| 优先 | 类型 | 表 | 前缀 | bizType |
|------|------|------|------|---------|
| P0 | `product` | （新建 `product_master` 表？或映射 `product_skus`） | `PRD` | `MD_PRODUCT_CREATE` |
| P0 | `store` | `mst_stores` | `STR` | `MD_STORE_CREATE` |
| P0 | `bank-account` | （新建 `fin_bank_accounts` 表） | `BANK` | `MD_BANK_ACCOUNT_CREATE` |
| P1 | `sku` | `product_skus` | `SKU` | `MD_SKU_CREATE` |
| P1 | `warehouse` | `wms_warehouses` | `WH` | `MD_WAREHOUSE_CREATE` |
| P1 | `grade` | `product_grades` | `GRD` | `MD_GRADE_CREATE` |
| P1 | `spec` | `packaging_specs` | `SPEC` | `MD_SPEC_CREATE` |
| P1 | `driver` | `sal_drivers` | `DRV` | `MD_DRIVER_CREATE` |
| P1 | `vehicle` | `sal_vehicles` | `VEH` | `MD_VEHICLE_CREATE` |

---

## 5. 主数据中心整改方案（G5.5-C 实施草案）

### 5.1 阶段 1 — P0 解锁（解除 G6 阻塞 · 预计 1 周）

| 步骤 | 工作 | 完成后效果 |
|------|------|-----------|
| 1.1 | 实现"产品档案"：建 `product_master` 表 + Runtime 注册 `PRD` 前缀 + `MD_PRODUCT_CREATE` workflow + 替换占位页为 Panel | G6-A/B/C/D/H 解除产品依赖阻塞 |
| 1.2 | 实现"门店档案"：复用 `mst_stores` + Runtime `STR` + Panel | StoreSelector 上下游闭环 |
| 1.3 | 新建"银行账户中心"：建 `fin_bank_accounts` 表 + Runtime `BANK` + Panel；与 `fin_cash_accounts` 双向关联 | C 销售境外结算 / B 财务对账解锁 |
| 1.4 | 资金账户切 Panel：现 158 行自建 → 改用 `MasterDataRuntimePanel` (cash-account 已注册 Runtime 仅前端整改) | F 股东 / B 财务依赖治理标准统一 |

**阶段 1 预期评分提升**：从 **54.5 → 61.4**

### 5.2 阶段 2 — P1 治理统一（一致性 · 预计 1.5 周）

| 步骤 | 工作 |
|------|------|
| 2.1 | SKU/仓库/等级/规格/司机/车辆 6 个菜单切 Panel + Runtime 注册（详见 §4） |
| 2.2 | 每个 P1 菜单接入 5 态生命周期 + Workflow（MD_*_CREATE bizType） |
| 2.3 | 编码统一自动生成（在 `code-generator.service` 注册 7 个新前缀：PRD/STR/BANK/SKU/WH/GRD/SPEC/DRV/VEH） |

**阶段 2 预期评分提升**：从 **61.4 → 82.9**

### 5.3 阶段 3 — P2 完善（接近目标 · 预计 0.5 周）

| 步骤 | 工作 |
|------|------|
| 3.1 | 组织架构 + 公司档案 补 5 态生命周期 |
| 3.2 | 数据字典中心整合（确认 dictionaries 与 settings/dict 的"只读入口 + 完整管理"关系，加跳转） |
| 3.3 | 用户组织权限 补 DataScope 4 维度联动配置 |

**阶段 3 预期评分提升**：从 **82.9 → 87.4** ✅ **达标（≥85）**

---

## 6. 评分推算明细

> 基于 G5.5-A 每菜单 7 维度评分模型

| # | 菜单 | 当前 | 阶段 1 后 | 阶段 2 后 | 阶段 3 后 |
|---|------|------|----------|----------|----------|
| 1  | 组织架构      | 58 | 58 | 58 | **75** |
| 2  | 公司档案      | 50 | 50 | 50 | **70** |
| 3  | 项目档案 ⭐    | 95 | 95 | 95 | 95 |
| 4  | 客户档案 ⭐    | 95 | 95 | 95 | 95 |
| 5  | 供应商档案 ⭐  | 95 | 95 | 95 | 95 |
| 6  | **产品档案** 🔴 | 5  | **90** | 90 | 90 |
| 7  | 等级档案       | 35 | 35 | **85** | 85 |
| 8  | 包装规格       | 35 | 35 | **85** | 85 |
| 9  | SKU 档案       | 48 | 48 | **90** | 90 |
| 10 | 仓库档案       | 50 | 50 | **90** | 90 |
| 11 | **门店档案** 🔴 | 5  | **90** | 90 | 90 |
| 12 | 司机档案       | 40 | 40 | **85** | 85 |
| 13 | 车辆档案       | 40 | 40 | **85** | 85 |
| 14 | **资金账户**   | 55 | **90** | 90 | 90 |
| 15 | **银行账户** ❌ | 0  | **85** | 85 | 85 |
| 16 | 数据字典       | 45 | 45 | 45 | **65** |
| 17 | 主数据待审批   | 70 | 70 | 70 | 70 |
| 18 | 数据质量中心 ⭐ | 85 | 85 | 85 | 85 |
| 19 | 用户组织权限   | 70 | 70 | 70 | **85** |
| **平均** | — | **54.5** | **61.4** | **82.9** | **87.4** ✅ |

---

## 7. G6 恢复条件

**最低恢复条件**（阶段 1 完成后）：
- ✅ 产品档案有 CRUD + 状态字段（不一定要 Panel，但要有数据） → G6-A/B/C/D 可读
- ✅ 银行账户中心存在 → G6-B/C 境外指标可读
- ✅ 资金账户切 Panel → 治理标准统一

**充分恢复条件**（阶段 2 完成后，**推荐**）：
- ✅ 全部 P1 主数据切 Panel → 治理一致性
- ✅ 主数据评分 ≥ 82.9

**理想恢复条件**（阶段 3 完成后）：
- ✅ 主数据评分 ≥ 85 → 为后续 G7 CEO 驾驶舱奠定可信基础

---

## 8. G6 恢复优先级

> 按"依赖最少 → 依赖最多"恢复，确保每阶段交付即可用

### Phase 1：**低依赖模块**（阶段 1 完成 → 可恢复）

| 顺序 | G6 模块 | 依赖现状 | 完善内容 |
|------|---------|---------|---------|
| 1 | **G 异常分析** | 仅依赖 G5（已就绪） | 前端新建 `/analytics/exceptions/page.tsx` 渲染 G5 告警分桶 |
| 2 | **F 股东分析** | 依赖股东主数据（已就绪）+ 资金账户（阶段 1 后就绪） | 前端新建 `/analytics/shareholders/page.tsx` |
| 3 | **C 销售分析（聚合层）** | 客户/项目/渠道（全就绪）+ 产品（阶段 1 后就绪） | 复用 `sales-analytics-aggregator.service` + 新前端入口 |

### Phase 2：**中等依赖模块**（阶段 2 完成后恢复 · 推荐）

| 顺序 | G6 模块 | 依赖 | 完善内容 |
|------|---------|------|---------|
| 4 | **D 库存分析** | 仓库 + SKU + 库存 5 态（阶段 2 后就绪） | 前端 `analytics/inventory/page.tsx` 已有，对接新 service |
| 5 | **E 生产分析** | 场站/鸡舍/鸡群（场站需待 G5.5-C 中明确）+ 等级（阶段 2） | 前端 `analytics/production/page.tsx` 已有，对接新 service |
| 6 | **B 财务分析** | 客户/供应商/资金账户/账期（阶段 1/2 后就绪） | 前端新建 `/analytics/finance/page.tsx` |

### Phase 3：**高依赖模块**（阶段 3 完成后恢复）

| 顺序 | G6 模块 | 依赖 | 完善内容 |
|------|---------|------|---------|
| 7 | **A 集团分析** | 全部主数据（阶段 3 后就绪） | 前端新建 `/analytics/group/page.tsx` |
| 8 | **H 预测分析** | 全部主数据（同上） | 前端新建 `/analytics/forecast/page.tsx` |
| — | /analytics 入口页升级 | 全部依赖 | 改造为 8 卡片导航首页 |
| — | 物化视图迁移执行 | DB 写入 | 在生产 DB 运行 `20260604_g6_analytics_views.sql` |

---

## 9. 必须回答（用户 7 题）

| # | 问题 | 答 |
|---|------|---|
| 1 | G6 哪些模块已完成 | **0 个**完全完成；8 个后端 service + 8 个 API 端点 + 2 个前端页面已写入但**全部未 commit** |
| 2 | G6 哪些模块是半成品 | **8 个**（全部 A-H 模块都是半成品状态：后端 service 已写但前端 5 个页面缺失） |
| 3 | 主数据中心缺哪些对象 | P0：**产品档案 / 门店档案 / 银行账户中心 / 资金账户 Panel**；P1：SKU / 仓库 / 等级 / 规格 / 司机 / 车辆 Panel |
| 4 | 哪些对象必须先补 | **P0 4 项必须先补**（详见 §3.1 + §5.1）— 否则 G6-A/B/C/D/H 数据基础不完整 |
| 5 | 主数据补完后评分预计多少 | 阶段 1 后 **61.4** / 阶段 2 后 **82.9** / 阶段 3 后 **87.4** ✅ |
| 6 | 什么时候恢复 G6 | **最低**：阶段 1 完成（约 1 周）即可恢复低依赖模块（G/F/C 销售聚合）；**推荐**：阶段 2 完成（约 2.5 周）后全面恢复 |
| 7 | G6 恢复优先级 | Phase 1（异常/股东/销售）→ Phase 2（库存/生产/财务）→ Phase 3（集团/预测/入口）— 详见 §8 |

---

## 10. G7 CEO Dashboard 准备度

虽不在 G5.5-B 范围，但作为下游依赖说明：

| G7 CEO Dashboard 模块预期 | 依赖前置 |
|---------------------------|---------|
| 财务总览（营收/毛利/现金/应收/应付） | G6-A 集团分析 + G6-B 财务分析 |
| 数据可信度徽章 | G5 数据质量评分（已就绪 ✅） |
| 业务异常预警 | G6-G 异常分析（最先恢复，依赖最少） |
| 现金流 / 库存 / 销售预测 | G6-H 预测分析（最后恢复） |
| 多公司 / 多项目 / 多场站维度切换 | G4-D WarehouseScope + G4-E FarmScope（已就绪 ✅） |

**G7 上线时间窗**：阶段 3 完成后约 1-2 周可建立 CEO Dashboard 雏形。

---

## 11. 验收（用户 4 项标准）

| 标准 | 结果 |
|------|------|
| 形成 G6 恢复路线 | ✅ §8（Phase 1/2/3 三阶段恢复顺序，含每个模块的依赖前置和完善内容） |
| 形成主数据中心补完路线 | ✅ §5（阶段 1/2/3 三阶段，含每步对应的预期评分提升） |
| 避免继续在不完整主数据基础上建设分析中心 | ✅ G6 八模块全部冻结；CEO 驾驶舱建议放到阶段 3 后 |
| 确保后续 CEO 驾驶舱建立在完整主数据之上 | ✅ §10 明确依赖链：主数据 87.4 分 → G6 全模块恢复 → G7 CEO Dashboard |

---

## 12. 改动清单

```
新增文件（仅 docs）：
  docs/g55b-g6-recovery-plan.md   ← 本文档

零业务代码改动。
G6 半成品文件（apps/api/src/modules/analytics/* 等）保持原状未 commit。
```

提交：`docs: g55b g6 recovery plan`，tag：`v3-g55b-g6-recovery-plan`。
