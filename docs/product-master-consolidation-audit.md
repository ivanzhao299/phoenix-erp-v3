# Phoenix ERP V3 — 产品主档统一审计
**Product Master Consolidation Audit**  
**生效日期**: 2026-05-30  
**版本**: Phase H1（审计完成）

---

## Executive Summary

Phoenix ERP V3 当前**没有完整的产品主数据体系**。唯一的产品主表 `mst_products` 极度简陋，不含等级、规格、SKU 定义；`grade_code` 和 `packaging_spec` 以自由文本散落在 6 张交易表中，且跨模块含义不一致；包装流程使用 JSONB 存储分级结果而非规范化表结构；没有正式的 SKU 主表。

当前风险定级：**🔴 CRITICAL** — 产品数据孤岛导致价格、库存、销售、退货、质量追溯四条链路无法闭环，且随业务扩张将快速失控。

---

## 一、扫描范围与方法

### 1.1 扫描文件

| 类型 | 文件/目录 |
|------|---------|
| 基线 Schema | `apps/api/migrations/v3_schema_complete.sql` |
| Sales V2 迁移 | `apps/api/migrations/20260527_sales_v2_phase*.sql`（Phase 0–8） |
| 包装 DDL | `apps/api/migrations/v4~v6_packaging_*.sql` |
| POS DDL | `apps/api/ddl/27_store_pos_tables.sql` |
| 后端模块 | `apps/api/src/modules/`（全部子模块） |
| 前端页面 | `apps/web/src/app/(admin)/`、`(mobile)/`、`(terminal)/` |
| 前端组件 | `apps/web/src/components/layout/Sidebar.tsx` |
| 工作流目录 | `apps/web/src/lib/workflow-data-catalog.ts` |

### 1.2 全局 grep 命中统计

| 关键字 | 后端命中次数 | 命中文件数 | 说明 |
|--------|-----------|---------|------|
| `product_code` | 148 | 28 | 最广泛使用的产品标识 |
| `batch_no` | 277 | 24 | 批次标识，最高频字段 |
| `product_name` | 45 | 14 | 多处内嵌非规范化产品名 |
| `grade_code` | 35 | 11 | 等级标识，跨模块不一致 |
| `packaging_spec` | 24 | 9 | 包装规格，自由文本 |
| `sku_code` | 5 | 3 | SKU 极少使用，未建主表 |
| `grade_name` | 5 | 2 | 等级名称，非主数据驱动 |
| `package_spec` | 0 | — | 无此拼写 |
| `egg_type` / `egg_grade` | 0 | — | 无此字段 |
| `product_id` | 0 | — | 无外键关联 |

---

## 二、产品相关表清单

### 2.1 主数据层（正式 / 准正式）

| 表名 | 角色 | 行数量级 | 主键 | 状态 |
|------|------|---------|------|------|
| `mst_products` | 产品主档（唯一正式主表）| 少量（~50） | `product_code` | ✅ 存在，但字段极简 |

**`mst_products` 当前字段**（基线 Schema 定义）：

```sql
CREATE TABLE IF NOT EXISTS mst_products (
  id              SERIAL PRIMARY KEY,
  product_code    VARCHAR(64) UNIQUE NOT NULL,
  product_name_zh VARCHAR(128),
  product_name_lo VARCHAR(128),
  category        VARCHAR(64),
  unit            VARCHAR(16) DEFAULT '个',
  price           DECIMAL(18,4) DEFAULT 0,
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**前端实际使用的字段**（`/settings/products` 页面 + `master.controller.ts`）：

```
category_code     VARCHAR      -- 产品分类（EGG/PACK/FEED/VET/MEAT/MISC等）
unit_zh           VARCHAR      -- 计量单位（中文）
shelf_life_days   INTEGER      -- 保质期天数
price_retail      DECIMAL      -- 零售参考价
image_url         TEXT         -- 图片地址
specs             TEXT         -- 规格说明（自由文本，如 "30枚/托，55g/枚"）
```

> ⚠️ **发现 A**：前端 `/settings/products` 和 `master.controller.ts` 使用了 `category_code`、`unit_zh`、`shelf_life_days`、`price_retail`、`image_url`、`specs` 等字段，但这些字段**不在基线 Schema 的 CREATE TABLE 中**，说明它们通过某个未被纳入主迁移文件的 DDL 添加，或通过 Generic CRUD 的 DDL-on-write 模式动态创建。字段元数据存在不完整风险。

---

### 2.2 库存层

| 表名 | 产品相关字段 | 说明 |
|------|------------|------|
| `inv_batches` | `product_code`、`quality_grade`（AA/A/B/DIRTY/CRACKED）、`packaging_spec`（LOOSE/30_PCS_TRAY/360_PCS_CASE）、`egg_date`、`expire_date` | 批次是库存最小单位，包含等级和规格 |
| `inv_ledger` | `batch_no`、`quality_grade`、`company_code` | 库存变动流水，通过 batch_no 关联批次 |

---

### 2.3 销售交易层

| 表名 | 产品相关字段 | 是否有等级/规格 | 说明 |
|------|------------|--------------|------|
| `sal_price_items` | `product_code`、`grade_code`（0/1/2/3/4/5/DIRTY/BROKEN）、`packaging_spec`、`floor_price`、`ceiling_price` | ✅ 有 | 价格以（产品+等级+规格+数量）定价 |
| `sal_order_items` | `product_code`、`product_name`、`grade_code`、`packaging_spec`、`allocated_batch_no` | ✅ 有 | 销售订单明细，grade_code 连接价格和批次 |
| `sal_store_sale_items` | `product_code`、`product_name`、`grade_code`、`packaging_spec`、`batch_no` | ✅ 有 | 新版 POS 收银明细 |
| `sal_return_items` | `product_code`、`product_name`、`grade_code`、`packaging_spec` | ✅ 有 | 退货明细，含质检结果 |
| `sal_delivery_order_items` | `sales_order_id`、`sales_order_no`、`planned_qty`、`loaded_qty`、`received_qty` | ❌ 无 | 配送明细**无 product_code/grade_code**，仅汇总数量 |

---

### 2.4 旧版 POS 层（历史封存）

| 表名 | 产品相关字段 | 状态 |
|------|------------|------|
| `pos_sales` | `store_code`、`total_amount`（无产品字段） | LEGACY，仍有代码读取 |
| `pos_sale_items` | `product_code`、`product_name_zh`、`product_name_lo`、`batch_no` | LEGACY，**无 grade_code、无 packaging_spec** |

> ⚠️ **发现 B**：旧版 POS (`pos_sale_items`) 和新版 POS (`sal_store_sale_items`) 同时存在，旧版缺少 grade_code 和 packaging_spec，无法支持等级定价。两套系统目前在代码中均有读取。

---

### 2.5 包装生产层

| 表名 | 产品相关字段 | 说明 |
|------|------------|------|
| `pkg_source_batches` | `batch_code`、`house_code`、`flock_code`、`lay_date`、`total_qty`、`dirty_qty`、`cracked_qty` | 来源批次（采蛋入库），无 product_code |
| `pkg_qc_inspections` | `source_batch_id`、`broken_qty`、`dirty_qty` | QC 首检记录，无 product_code |
| `pkg_grading_records` | `outputs_json`（JSONB）、`total_output` | **等级产出存为 JSONB**，未规范化 |
| `pkg_packing_records` | `batches_json`（JSONB）、`grading_codes_json`（JSONB） | 包装记录，批次信息在 JSONB 中 |
| `pkg_handover_records` | `boxes_json`（JSONB）、`pallet_code` | 成品入库交接，无直接产品字段 |
| `pkg_exceptions` | `batch_no`、`quantity`、`issue_type` | 异常品处理，通过 batch_no 关联 |

> ⚠️ **发现 C**：`pkg_grading_records.outputs_json` 和 `pkg_packing_records.batches_json` 使用 JSONB 存储等级和批次数据，无法做 SQL JOIN，无法参与价格 Runtime 的 grade_code 匹配。

---

### 2.6 质量追溯层

| 表名 | 产品相关字段 | 说明 |
|------|------------|------|
| `qa_non_conformance`（via quality.service.ts） | `batch_no`、`store_code`、`issue_type` | 不合格品记录，通过 batch_no 追溯 |
| 正向追溯（`/quality/forward`） | 以 `batch_no` 为起点，关联 inv_batches → pos_sale_items | 追溯到销售，无 SKU 维度 |
| 反向追溯（`/quality/backward`） | 以 `sale_no` 或 `batch_no` 为起点 | 追溯到生产批次，无 SKU 维度 |

---

## 三、产品相关字段清单

### 3.1 product_code 字段分布

| 文件 | 用途 | Runtime 级别 |
|------|------|------------|
| `store/pos.service.ts` | 旧版 POS 销售明细写入 | C 类（历史） |
| `store-pos/services/store-pos.service.ts` | 新版 POS 收银，读 inv_batches | ✅ 正式 Runtime |
| `store-pos/services/sales-engine.service.ts` | 价格校验，Price Runtime | ✅ 正式 Runtime |
| `sales-v2/services/egg-inventory.service.ts` | FIFO 批次分配，按 product_code + quality_grade 过滤 | ✅ 正式 Runtime |
| `sales-v2/services/sales-analytics.service.ts` | 11 维分析报表 | ✅ 正式 Runtime |
| `sales-v2/services/price-items.service.ts` | 价格表 CRUD | ✅ 正式 Runtime |
| `sales-v2/services/price-runtime.service.ts` | 动态价格解析 | ✅ 正式 Runtime |
| `sales-v2/services/sales-orders.service.ts` | 销售订单创建/状态机 | ✅ 正式 Runtime |
| `sales-v2/services/return-orders.service.ts` | 退货 Runtime | ✅ 正式 Runtime |
| `wms/wms.service.ts` | 入库/出库批次写入 | ✅ 正式 Runtime |
| `terminal/packaging.service.ts` | 分级出批次写入 | ✅ 正式 Runtime |
| `quality/quality.service.ts` | 质量追溯查询 | ✅ 正式 Runtime |
| `farm/farm-medicine.service.ts` | 兽药领用记录（product=药品） | B 类（需接入） |
| `farm/farm-egg.service.ts` | 鸡蛋账本批次操作 | B 类（需接入） |
| `farm/farm-sales.service.ts` | 农场直销（读 ord_customers） | B 类（需接入） |
| `procurement/procurement.service.ts` | 采购单明细（product=原材料） | B 类（需接入） |
| `generic-crud/generic-crud.service.ts` | Generic CRUD 直接读写多表 | C 类（历史）|
| `bff/bff.controller.ts` | BFF 数据聚合 | C 类（历史） |
| `workflow/workflow.service.ts` | Workflow 数据源（MST_PRODUCTS）| ✅ 正式 Runtime |
| `master/master.controller.ts` | mst_products CRUD | ✅ 正式 Runtime |

### 3.2 grade_code / quality_grade 字段分布

| 表/模块 | 字段名 | 取值范围 | 含义 |
|---------|-------|---------|------|
| `sal_price_items` | `grade_code` | `0/1/2/3/4/5/DIRTY/BROKEN` | 价格分级（数字编码，来源不明） |
| `sal_order_items` | `grade_code` | 同 sal_price_items | 销售订单中的等级（匹配价格用） |
| `sal_store_sale_items` | `grade_code` | 同 sal_price_items | POS 收银等级 |
| `sal_return_items` | `grade_code` | 同 sal_price_items | 退货等级 |
| `inv_batches` | `quality_grade` | `AA/A/B/DIRTY/CRACKED/DAMAGED` | 库存等级（字母编码，来源 Phase 7）|
| `inv_ledger` | `quality_grade` | 同 inv_batches | 库存变动时的等级快照 |
| `terminal/labels.service.ts` | `grade_code` | 自定义（如 "1级"、"特级"）| 标签打印显示 |
| `farm/farm-sales.service.ts` | `grade_name` | 自由文本 | 农场直销等级名 |

> 🔴 **CRITICAL 发现 D**：等级编码在系统中**至少有三套不兼容的值集**：
> - 价格/销售层：`0/1/2/3/4/5/DIRTY/BROKEN`（数字编码）
> - 库存批次层：`AA/A/B/DIRTY/CRACKED/DAMAGED`（字母编码）
> - 标签/农场层：自由文本
>
> 价格 Runtime 的 `grade_code=1` 与库存的 `quality_grade=A` 是否等价？目前**无主数据映射**，FIFO 分配依赖 `egg-inventory.service.ts` 中的手工映射逻辑。

### 3.3 packaging_spec 字段分布

| 表/模块 | 字段名 | 取值范围 | 说明 |
|---------|-------|---------|------|
| `sal_price_items` | `packaging_spec` | `LOOSE/30_PCS_TRAY/360_PCS_CASE` | 价格按规格区分 |
| `sal_order_items` | `packaging_spec` | 同上 | 订单明细规格 |
| `sal_store_sale_items` | `packaging_spec` | VARCHAR(128)，无约束 | POS 规格，上限更宽松 |
| `sal_return_items` | `packaging_spec` | VARCHAR(128)，无约束 | 退货规格 |
| `inv_batches` | `packaging_spec` | VARCHAR(64)，无约束 | 库存批次规格 |
| `pkg_grading_records` | `outputs_json` 内嵌 | JSONB，无约束 | 分级输出规格（非规范化）|

> ⚠️ **发现 E**：`packaging_spec` 是 VARCHAR 自由文本，**没有主数据表约束**。同一规格在不同记录中可能写为 `"30_PCS_TRAY"`、`"30枚/托"`、`"tray-30"` 等不同形式，导致价格匹配失效。

---

## 四、产品主档模型现状评估

### 4.1 当前 mst_products 是否完整？

| 能力 | 是否具备 | 说明 |
|------|---------|------|
| 产品档案（编码+名称+分类）| ✅ 基本具备 | 有 product_code、product_name_zh/lo、category |
| 双语支持 | ✅ 具备 | product_name_zh + product_name_lo |
| 产品等级定义 | ❌ 缺失 | 无 grade 子表，grade_code 无主数据 |
| 包装规格定义 | ❌ 缺失 | 无 packaging_spec 主表，只有自由文本 |
| SKU 定义（产品+等级+规格）| ❌ 缺失 | 无 sku 主表 |
| 批次档案 | ⚠️ 部分 | inv_batches 承担了部分批次主数据功能 |
| 价格关联 | ⚠️ 弱关联 | sal_price_items 有 product_code，但无 FK 约束 |
| 库存关联 | ⚠️ 弱关联 | inv_batches 有 product_code，但无 FK 约束 |
| 前端管理入口 | ✅ 存在 | `/settings/products` + `/master/products`（两个入口） |
| Runtime 使用 | ⚠️ 部分 | 多数 Runtime 直接使用 product_code 字符串，不做 FK 验证 |

**结论**：`mst_products` 是**名义上的产品主表，实际上是产品名称字典**，不具备等级、规格、SKU 主数据能力。

### 4.2 两个产品管理前端入口

| 路由 | 菜单 | 表 | 说明 |
|------|------|---|------|
| `/master/products` | 产品品级（主数据组） | `mst_products` | 旧版入口 |
| `/settings/products` | 商品主数据（系统设置组） | `mst_products` | 新版入口，字段更多 |

> ⚠️ **发现 F**：两个前端入口操作同一张表，字段集合略有不同，存在维护混乱风险。

---

## 五、业务语义统一定义

基于当前代码扫描，明确以下定义：

### 5.1 产品（Product）

**定义**：具有固定 product_code 的商品类型，不含等级和规格变体。

**当前 Phoenix ERP 产品分类**（来源：`/settings/products` 前端）：

| category_code | 含义 | 举例 |
|--------------|------|------|
| `EGG` | 鸡蛋（主营产品）| 鲜鸡蛋 `PRD-EGG-RAW` |
| `SPECIAL` | 特种蛋 | 无抗蛋、有机蛋 |
| `BABY` | 幼雏 / 鸡苗 | |
| `BULK` | 散装/大宗 | |
| `PACK` | 包装成品 | 礼盒装鸡蛋 |
| `FEED` | 饲料 | |
| `VET` | 兽药 | |
| `MEAT` | 淘汰鸡/肉品 | |
| `MISC` | 杂项 | 有机肥、辅料 |

**当前问题**：`mst_products` 没有 `grade_code` 字段，即**产品没有定义哪些等级是合法的**。

### 5.2 等级（Grade）

**定义**：同一产品按质量标准划分的级别，影响定价和库存分类。

**当前等级值集（不统一，需合并）**：

| 值集来源 | 值 | 使用场景 |
|---------|---|---------|
| 价格/销售层 (`grade_code`) | `0`、`1`、`2`、`3`、`4`、`5`、`DIRTY`、`BROKEN` | sal_price_items、sal_order_items、sal_store_sale_items、sal_return_items |
| 库存批次层 (`quality_grade`) | `AA`、`A`、`B`、`DIRTY`、`CRACKED`、`DAMAGED` | inv_batches、inv_ledger |
| 标签层 (`grade_code`) | 自由文本（如"1级"、"特级"）| terminal/labels.service.ts |

**建议统一值集**（参考行业标准 + 现有代码）：

| 统一 grade_code | 含义 | 原销售值 | 原库存值 |
|---------------|------|---------|---------|
| `AA` | 特级（出口/礼品）| `0` | `AA` |
| `A` | 一级（标准鲜蛋）| `1` | `A` |
| `B` | 二级（批发/工厂）| `2` | `B` |
| `C` | 三级（加工用）| `3` | — |
| `DIRTY` | 脏蛋 | `DIRTY` | `DIRTY` |
| `CRACKED` | 裂缝蛋 | — | `CRACKED` |
| `BROKEN` | 破蛋 | `BROKEN` | — |
| `DAMAGED` | 损坏 | — | `DAMAGED` |

### 5.3 规格（PackagingSpec）

**定义**：同一等级产品的包装方式，影响单价计算单位和物流。

**当前规格值（来自注释和代码）**：

| 规格代码 | 含义 | 单位换算 |
|---------|------|---------|
| `LOOSE` | 散装（按枚计） | 1枚/单位 |
| `30_PCS_TRAY` | 30枚/托 | 30枚/单位 |
| `360_PCS_CASE` | 360枚/箱（12托）| 360枚/单位 |

**当前问题**：规格仅在代码注释中定义，没有主数据表，没有数量映射关系（`qty_per_unit`），导致库存无法自动换算。

### 5.4 SKU（Stock Keeping Unit）

**定义**：产品 + 等级 + 包装规格 的唯一组合，是销售、库存、价格的最小管理单位。

**SKU 示例**：

| sku_code | product_code | grade_code | packaging_spec | 说明 |
|---------|-------------|-----------|---------------|------|
| `EGG-AA-TRAY30` | `PRD-EGG-RAW` | `AA` | `30_PCS_TRAY` | 特级鸡蛋 30枚/托 |
| `EGG-A-LOOSE` | `PRD-EGG-RAW` | `A` | `LOOSE` | 一级散装蛋 |
| `EGG-B-CASE360` | `PRD-EGG-RAW` | `B` | `360_PCS_CASE` | 二级大箱装 |

**当前状态**：`sku_code` 字段仅在 `packaging.service.ts`（3次）、`generic-crud.service.ts`（2次）、`bff.controller.ts`（1次）中零星使用，**没有 SKU 主表**，SKU 概念以隐式 `product_code + grade_code + packaging_spec` 组合存在于各交易表中。

### 5.5 批次（Batch）

**定义**：同一 SKU 在同一时间段的生产/入库批次，是库存管理和质量追溯的最小颗粒度。

**当前批次结构**（`inv_batches`）：

```
batch_no         -- 批次号（唯一标识）
product_code     -- 产品代码
quality_grade    -- 质量等级（inv_batches 层的字母编码）
packaging_spec   -- 包装规格
egg_date         -- 生产日期（鸡蛋特有）
expire_date      -- 到期日
warehouse_code   -- 仓库
company_code     -- 公司/门店
qty / qty_available -- 数量
source_type      -- 来源类型（PRODUCTION/RETURN/ADJUSTMENT）
source_no        -- 来源单号
```

**当前问题**：
1. 批次没有关联 SKU 主表（只有 product_code 字符串，无 sku_code）
2. `quality_grade` 与销售层 `grade_code` 不同名也不同值集
3. `batch_no` 在 wms、pos、farm 中均有使用，但各模块生成规则不同，可能冲突

---

## 六、各 Runtime 对接方案现状分析

### 6.1 Sales V2 Price Runtime

| 维度 | 现状 | 问题 |
|------|------|------|
| 定价维度 | product_code + grade_code + packaging_spec | ✅ 三维定价存在 |
| 等级约束 | 无主表约束，直接存 VARCHAR | ⚠️ 同一等级可能多种写法 |
| 规格约束 | 无主表约束，直接存 VARCHAR | ⚠️ 同上 |
| 数量阶梯 | min_qty / max_qty | ✅ 存在 |
| SKU 关联 | 无 sku_code 字段，以组合键替代 | ❌ 缺失 |

### 6.2 Sales V2 Order Runtime

| 维度 | 现状 | 问题 |
|------|------|------|
| 产品标识 | product_code | ✅ |
| 等级 | grade_code（来自价格表）| ⚠️ 与库存 quality_grade 不同值集 |
| 规格 | packaging_spec | ⚠️ 无主数据约束 |
| 批次分配 | allocated_batch_no（多批次逗号分隔）| ⚠️ 逗号拼接不是关系型设计 |
| 产品名 | product_name 内嵌在明细行 | ⚠️ 去规范化，修改产品名不回溯 |

### 6.3 Store POS Runtime（新版）

| 维度 | 现状 | 问题 |
|------|------|------|
| 产品来源 | 直接读 inv_batches（按 product_code + quality_grade 匹配）| ⚠️ 商品目录来自库存，不来自产品主表 |
| 等级显示 | grade_code 从价格册匹配 | ⚠️ 价格册的 grade_code 与批次的 quality_grade 需手工映射 |
| 批次绑定 | sal_store_sale_items.batch_no | ✅ 有批次追溯 |
| 规格 | packaging_spec | ⚠️ 无主数据约束 |

### 6.4 旧版 POS（pos_sales / pos_sale_items）

| 维度 | 现状 | 问题 |
|------|------|------|
| 产品字段 | product_code + product_name_zh/lo + batch_no | ⚠️ 无 grade_code，无 packaging_spec |
| 等级 | 无 | ❌ 缺失，无法支持等级定价 |
| 代码状态 | store/pos.service.ts 仍在使用 | 🔴 双轨并行风险 |

### 6.5 Inventory Runtime（inv_batches）

| 维度 | 现状 | 问题 |
|------|------|------|
| 等级字段名 | `quality_grade`（字母编码）| ⚠️ 与销售层 grade_code（数字编码）不同 |
| 规格字段 | `packaging_spec` | ✅ 有，但无主数据约束 |
| SKU 关联 | 无 sku_code | ❌ 缺失 |
| 批次→产品 | product_code VARCHAR，无 FK | ⚠️ 不强制产品存在 |
| FIFO 分配 | egg-inventory.service.ts 按 product_code + quality_grade 过滤 | ✅ 功能正常，但依赖字段名匹配逻辑 |

### 6.6 Packaging Runtime（pkg_* 表）

| 维度 | 现状 | 问题 |
|------|------|------|
| 分级结果存储 | `pkg_grading_records.outputs_json` JSONB | ❌ 非规范化，无法 JOIN |
| 批次生成 | 写入 inv_batches 时含 quality_grade + packaging_spec | ✅ 数据流通 |
| 产品关联 | pkg_source_batches 无 product_code | ⚠️ 来源批次无产品标识 |
| SKU 关联 | 无 | ❌ 缺失 |

### 6.7 Quality Runtime

| 维度 | 现状 | 问题 |
|------|------|------|
| 追溯路径 | batch_no → inv_batches → pos_sale_items（旧版）| ⚠️ 追溯到旧版 POS，新版 POS 未接入 |
| 产品关联 | JOIN mst_products ON product_code | ✅ 有关联 |
| SKU 追溯 | 无 sku_code 维度 | ❌ 只追到产品级别，无等级/规格精度 |
| 不合格品管理 | qa_non_conformance 按 batch_no | ✅ 有 |

### 6.8 Sales Return Runtime

| 维度 | 现状 | 问题 |
|------|------|------|
| 产品字段 | product_code + grade_code + packaging_spec | ✅ 三维具备 |
| 退货追溯 | sales_order_item_id（可选外键）| ⚠️ 不强制关联原订单明细 |
| 质检结果 | inspection_result + accepted_qty + damaged_qty | ✅ 有 |
| 回库批次 | egg-inventory.service.ts 生成 RET-/DMG- 批次 | ✅ 有 |
| grade_code 语义 | 等级在退货时是否与原销售等级一致？ | ⚠️ 无强制约束 |

---

## 七、当前风险清单

### 7.1 CRITICAL（阻断级）

| ID | 风险描述 | 影响范围 | 根因 |
|----|---------|---------|------|
| C1 | **grade_code 两套不兼容值集**：价格/销售层使用数字编码（0/1/2/3），库存批次层使用字母编码（AA/A/B） | 价格 Runtime ↔ 库存 Runtime 无法直接对接 | 历史遗留，两套系统独立设计 |
| C2 | **SKU 主表不存在**：价格、库存、销售均以 product_code+grade_code+packaging_spec 组合作为 SKU，组合未规范化 | 价格变更、规格增加均需改多处 | 未设计 SKU 主表 |
| C3 | **packaging_spec 无主数据约束**：任何字符串都可写入，导致同一规格有多种写法 | 价格匹配失效、库存分类混乱 | 无枚举约束 |
| C4 | **sal_delivery_order_items 无 product_code / grade_code**：配送明细仅保存汇总数量，无法支持多 SKU 订单的分批配送精确对账 | 配送 Runtime 与 AR 对账 | 设计缺失 |

### 7.2 HIGH（高优先级）

| ID | 风险描述 | 影响范围 |
|----|---------|---------|
| H1 | **pkg_grading_records.outputs_json 非规范化**：分级结果存 JSONB，无法 JOIN 价格表做分级成本分析 | 包装成本、等级产出报表 |
| H2 | **双版 POS 系统并行**：pos_sale_items（无等级）和 sal_store_sale_items（有等级）同时有代码写入 | 质量追溯断链、数据一致性 |
| H3 | **质量追溯关联旧版 POS**：`quality.service.ts` 的反向追溯读取 pos_sale_items，新版 POS 的销售无法被正向追溯覆盖 | 质量追溯完整性 |
| H4 | **allocated_batch_no 逗号拼接**：`sal_order_items.allocated_batch_no` 存多个批次号为逗号字符串，无法做关系查询 | FIFO 准确性、对账 |
| H5 | **product_name 内嵌在交易记录**：`sal_order_items`、`sal_store_sale_items`、`sal_return_items` 均冗余存储 product_name，产品改名不回溯 | 历史报表产品名一致性 |
| H6 | **mst_products 有两个前端管理入口**：`/master/products` 和 `/settings/products` 同时存在，字段不一致 | 主数据维护混乱 |

### 7.3 MEDIUM（中优先级）

| ID | 风险描述 |
|----|---------|
| M1 | `pkg_source_batches` 无 product_code，包装来源批次无法关联产品主档 |
| M2 | `mst_products` 基线 Schema 字段（5个）与前端实际使用字段（11个）不匹配，存在 DDL 管理风险 |
| M3 | `batch_no` 生成规则分散在 wms、packaging、farm、egg-inventory 多个服务，可能出现格式冲突 |
| M4 | Farm 模块（`farm-sales.service.ts`）的农场直销使用旧版销售表，grade_name 为自由文本 |
| M5 | Procurement 模块产品维度（饲料/兽药/原材料）与 Sales 模块产品维度（蛋品/成品）混用同一张 mst_products |

### 7.4 LOW（低优先级）

| ID | 风险描述 |
|----|---------|
| L1 | `prc_price_items`（采购价格）字段 `product_code + customer_type` 无等级/规格维度，已标记 LEGACY |
| L2 | Workflow 数据目录（workflow-data-catalog.ts）中 MST_PRODUCTS 仅有 product_code + product_name 两个字段，不支持等级筛选 |
| L3 | 移动端 `/mobile/egg`、`/mobile/egglog` 无实际内容，产品维度缺失 |

---

## 八、字段分类（A/B/C/D/E 分类）

### A 类：已符合产品主档逻辑，可保留

| 字段/表 | 说明 |
|---------|------|
| `mst_products.product_code` | 产品唯一标识，全库引用标准 |
| `mst_products.product_name_zh/lo` | 双语产品名，已规范 |
| `sal_price_items.product_code + grade_code + packaging_spec` | 三维定价组合，结构合理 |
| `inv_batches.batch_no + product_code + quality_grade + packaging_spec + egg_date + expire_date` | 批次主数据结构完整 |
| `sal_order_items.product_code + grade_code + packaging_spec + allocated_batch_no` | 销售明细三维 + 批次绑定 |
| `sal_return_items.product_code + grade_code + packaging_spec + inspection_result` | 退货明细有质检 |
| `sal_store_sale_items.product_code + grade_code + packaging_spec + batch_no` | 新版 POS 明细完整 |

### B 类：字段有价值，但需接入产品主档

| 字段/表 | 需做的改进 |
|---------|---------|
| `inv_batches.quality_grade` | 统一到与 grade_code 同值集的主数据 |
| `sal_order_items.allocated_batch_no` | 重构为 sal_order_item_batches 关联表 |
| `pkg_grading_records.outputs_json` | 规范化为 pkg_grading_outputs 明细表 |
| `pkg_packing_records.batches_json` | 规范化为 pkg_packing_batches 明细表 |
| `mst_products.specs`（自由文本）| 接入 packaging_specs 主表 |
| `farm/farm-sales.service.ts` 的 `grade_name` | 接入统一 grade_code 主数据 |

### C 类：历史字符串字段，未来应只读保留

| 字段/表 | 说明 |
|---------|------|
| `sal_order_items.product_name` | 去规范化，历史记录保留 |
| `sal_store_sale_items.product_name` | 同上 |
| `sal_return_items.product_name` | 同上 |
| `pos_sale_items.product_name_zh/lo` | 旧版 POS，只读 |
| `mst_products.price`（基线字段）| 被 price_retail 替代，只读 |

### D 类：重复字段，应逐步废弃

| 字段/表 | 重复情况 |
|---------|---------|
| `mst_products.unit`（基线）vs `unit_zh`（扩展）| 两个计量单位字段 |
| `pos_sale_items.product_name_zh` vs `mst_products.product_name_zh` | POS 冗余存储产品名 |
| `sal_price_items.grade_code`（数字）vs `inv_batches.quality_grade`（字母）| 等级两套编码 |

### E 类：无业务价值，应删除或冻结

| 字段/表 | 说明 |
|---------|------|
| `pkg_source_batches` 无 product_code | 包装来源批次与产品主档完全脱钩 |
| `pos_sale_items.grade_code` 缺失 | 旧版 POS 历史记录无等级信息，已无法补录 |
| `mst_products.product_name_lo`（旧 category 字段）| 与 category_code 重复 |

---

## 九、推荐产品主数据模型

### 9.1 建议建立的核心主数据表

#### product_grades（产品等级主数据）

```sql
CREATE TABLE IF NOT EXISTS product_grades (
  id           BIGSERIAL    PRIMARY KEY,
  grade_code   VARCHAR(16)  NOT NULL UNIQUE,  -- AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED
  grade_name_zh VARCHAR(64) NOT NULL,          -- 特级蛋 / 一级蛋 / 二级蛋...
  grade_name_lo VARCHAR(64),
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_saleable  BOOLEAN      NOT NULL DEFAULT TRUE,   -- 可销售等级
  is_storable  BOOLEAN      NOT NULL DEFAULT TRUE,   -- 可入库等级
  status       VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### packaging_specs（包装规格主数据）

```sql
CREATE TABLE IF NOT EXISTS packaging_specs (
  id               BIGSERIAL    PRIMARY KEY,
  spec_code        VARCHAR(64)  NOT NULL UNIQUE,  -- LOOSE / 30_PCS_TRAY / 360_PCS_CASE
  spec_name_zh     VARCHAR(128) NOT NULL,          -- 散装 / 30枚/托 / 360枚/箱
  spec_name_lo     VARCHAR(128),
  qty_per_unit     NUMERIC(10,2) NOT NULL DEFAULT 1,  -- 每单位包含基础单位数量（枚）
  base_unit        VARCHAR(16)  NOT NULL DEFAULT '枚',
  display_unit     VARCHAR(16)  NOT NULL DEFAULT '枚',  -- 对外显示单位
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  status           VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

#### product_skus（SKU 主数据）

```sql
CREATE TABLE IF NOT EXISTS product_skus (
  id               BIGSERIAL    PRIMARY KEY,
  sku_code         VARCHAR(64)  NOT NULL UNIQUE,   -- EGG-AA-TRAY30
  product_code     VARCHAR(64)  NOT NULL REFERENCES mst_products(product_code),
  grade_code       VARCHAR(16)  NOT NULL REFERENCES product_grades(grade_code),
  spec_code        VARCHAR(64)  NOT NULL REFERENCES packaging_specs(spec_code),
  sku_name_zh      VARCHAR(256) NOT NULL,           -- 一级鸡蛋 30枚/托
  sku_name_lo      VARCHAR(256),
  barcode          VARCHAR(64),
  status           VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_skus_combo
  ON product_skus (product_code, grade_code, spec_code);
```

### 9.2 mst_products 建议完整化

```sql
-- 补充缺失字段（幂等）
ALTER TABLE mst_products
  ADD COLUMN IF NOT EXISTS category_code       VARCHAR(64),   -- EGG/PACK/FEED/VET/MEAT/MISC
  ADD COLUMN IF NOT EXISTS unit_zh             VARCHAR(16)  DEFAULT '枚',
  ADD COLUMN IF NOT EXISTS unit_lo             VARCHAR(16),
  ADD COLUMN IF NOT EXISTS shelf_life_days     INTEGER,
  ADD COLUMN IF NOT EXISTS price_retail        NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS specs               TEXT,          -- 自由文本（过渡期保留）
  ADD COLUMN IF NOT EXISTS has_grade           BOOLEAN NOT NULL DEFAULT TRUE,  -- 是否按等级管理
  ADD COLUMN IF NOT EXISTS has_spec            BOOLEAN NOT NULL DEFAULT TRUE;  -- 是否按规格管理
```

### 9.3 各 Runtime 推荐产品维度

| Runtime | 当前维度 | 推荐维度 | 说明 |
|---------|---------|---------|------|
| 价格表 | product_code + grade_code + packaging_spec | sku_code 或 (product_code + grade_code + spec_code) | 统一 FK 约束 |
| 销售订单明细 | product_code + grade_code + packaging_spec | sku_code（推荐）或保持三元组 | 加 sku_code 字段 |
| POS 收银 | product_code + grade_code + packaging_spec + batch_no | 同上 | |
| 库存批次 | product_code + quality_grade + packaging_spec | product_code + grade_code + spec_code（统一等级编码）| 等级字段名统一为 grade_code |
| 退货明细 | product_code + grade_code + packaging_spec | sku_code + 原 order_item_id | 加强追溯 |
| 包装分级 | outputs_json（JSONB）| pkg_grading_outputs 明细表，含 grade_code + spec_code + qty | |
| 质量追溯 | batch_no | batch_no + sku_code | |

---

## 十、分阶段实施路线

### Phase H1：产品主档审计完成（当前阶段）

**状态**：✅ 完成  
**输出**：本文档

---

### Phase H2：产品主数据基础建设

**目标**：建立 product_grades、packaging_specs、product_skus 三张主数据表；统一 grade_code 值集。

**具体工作**：
1. 创建 `product_grades` 主数据表 + 初始化数据
2. 创建 `packaging_specs` 主数据表 + 初始化数据
3. 创建 `product_skus` 表
4. `mst_products` 补充 category_code、has_grade、has_spec 字段
5. 统一前端入口：合并 `/master/products` 和 `/settings/products` 为一个入口
6. Workflow 数据目录补充 PRODUCT_GRADES、PACKAGING_SPECS、PRODUCT_SKUS 条目

**不涉及**：不修改现有交易表；不做数据迁移

---

### Phase H3：价格表接入 SKU

**目标**：`sal_price_items` 增加 `sku_code` 字段（可选），价格 Runtime 支持 sku_code 匹配。

**具体工作**：
1. `sal_price_items` 加 `sku_code VARCHAR(64)` 可选字段
2. price-runtime.service.ts 支持按 sku_code 优先匹配，回退到 product_code+grade_code+packaging_spec 组合
3. 价格管理前端支持 SKU 下拉选择
4. 等级编码统一：`grade_code` 从数字编码迁移到字母编码（AA/A/B/C/DIRTY/CRACKED/BROKEN）

---

### Phase H4：库存批次接入 SKU

**目标**：`inv_batches` 统一 grade_code 字段名和值集；加 sku_code。

**具体工作**：
1. `inv_batches.quality_grade` → 统一到 product_grades.grade_code 值集
2. `inv_batches` 加 `sku_code` 字段（可选）
3. egg-inventory.service.ts FIFO 分配支持 sku_code 级别精准分配
4. `allocated_batch_no`（逗号拼接）→ 新增 `sal_order_item_batches` 关联表

---

### Phase H5：销售订单 / POS / 退货统一 SKU

**目标**：所有销售交易表统一使用 sku_code 作为可选标准化维度。

**具体工作**：
1. `sal_order_items`、`sal_store_sale_items`、`sal_return_items` 加 `sku_code` 字段
2. 创建 sal_order_item_batches 明细表（替代逗号拼接 allocated_batch_no）
3. 旧版 POS（pos_sale_items）标记只读封存，停止新写入
4. store/pos.service.ts 写入路径切换到新版 store-pos/services/store-pos.service.ts

---

### Phase H6：包装分级规范化 + 质量追溯接入 SKU

**目标**：包装 JSONB 数据规范化；质量追溯覆盖新版 POS 和 SKU 维度。

**具体工作**：
1. `pkg_grading_records.outputs_json` → 新增 `pkg_grading_outputs` 明细表
2. `pkg_packing_records.batches_json` → 新增 `pkg_packing_batches` 明细表
3. `pkg_source_batches` 加 `product_code` 字段
4. quality.service.ts 追溯路径扩展到 sal_store_sale_items（新版 POS）
5. `qa_non_conformance` 加 `sku_code` 字段
6. 质量追溯报告增加 SKU 维度分析

---

### Phase H7：旧字段清理（可选，6个月后）

**目标**：删除冗余字段，完成产品主数据 Runtime 建设。

**具体工作**：
1. 删除 `inv_batches.quality_grade`（已迁移到 grade_code）
2. 清理 product_name 去规范化字段（保留只读）
3. 关闭 `/master/products` 旧入口重定向到新入口
4. `prc_price_items` 标记 DROP 计划（满足封存条件后）

---

## 十一、下一阶段建议

### 立即可执行（Phase H2 — 无破坏性）

1. **建立产品等级主数据表** `product_grades`，初始化 8 个等级值（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED），统一两套编码。
2. **建立包装规格主数据表** `packaging_specs`，初始化 3 个规格值（LOOSE/30_PCS_TRAY/360_PCS_CASE），加入 qty_per_unit 数量换算。
3. **建立 SKU 主数据表** `product_skus`，录入现有 product_code × grade_code × spec_code 的有效组合。
4. **合并产品管理前端入口**：把 `/master/products` 重定向到 `/settings/products`，消除双入口混乱。
5. **修正 mst_products Schema**：将前端已使用的扩展字段写入正式迁移文件。

### 后续可并行推进

- H3（价格接入 SKU）：可在 H2 完成后立即开始，不影响现有交易数据
- H4（库存批次统一）：需要一次性迁移 quality_grade 值集，做好幂等脚本
- H5（销售交易统一）：影响面最广，建议在 H3+H4 完成后进行

---

## 附录 A：产品相关表完整索引

| 表名 | 模块 | 是否 Runtime | 是否有 product_code | 是否有 grade | 是否有 packaging_spec | 是否有 batch_no | 状态 |
|------|------|------------|-------------------|------------|---------------------|----------------|------|
| `mst_products` | master | ✅ | ✅ 主键 | ❌ | ❌ | ❌ | 正式主表（字段不完整）|
| `inv_batches` | wms/inventory | ✅ | ✅ | ✅ quality_grade | ✅ | ✅ 主键 | 正式 Runtime |
| `inv_ledger` | wms/inventory | ✅ | ❌（通过 batch_no 关联）| ✅ quality_grade | ❌ | ✅ | 正式 Runtime |
| `sal_price_items` | sales-v2 | ✅ | ✅ | ✅ grade_code | ✅ packaging_spec | ❌ | 正式 Runtime |
| `sal_order_items` | sales-v2 | ✅ | ✅ | ✅ grade_code | ✅ | ✅ allocated | 正式 Runtime |
| `sal_store_sale_items` | store-pos | ✅ | ✅ | ✅ grade_code | ✅ | ✅ | 正式 Runtime |
| `sal_return_items` | sales-v2 | ✅ | ✅ | ✅ grade_code | ✅ | ❌ | 正式 Runtime |
| `sal_delivery_order_items` | sales-v2 | ✅ | ❌ | ❌ | ❌ | ❌ | 设计缺口 ⚠️ |
| `pos_sale_items` | store (legacy) | ❌ | ✅ | ❌ | ❌ | ✅ | 历史封存 |
| `pkg_source_batches` | packaging | ✅ | ❌ | ❌ | ❌ | ✅ batch_code | 字段不完整 ⚠️ |
| `pkg_grading_records` | packaging | ✅ | ❌（在 JSON 中）| ✅（在 JSON 中）| ✅（在 JSON 中）| ❌ | JSONB 非规范化 ⚠️ |
| `pkg_packing_records` | packaging | ✅ | ❌（在 JSON 中）| ❌ | ❌ | ❌（在 JSON 中）| JSONB 非规范化 ⚠️ |
| `pkg_handover_records` | packaging | ✅ | ❌（在 JSON 中）| ❌ | ❌ | ❌（在 JSON 中）| JSONB 非规范化 ⚠️ |
| `pkg_exceptions` | packaging | ✅ | ❌ | ❌ | ❌ | ✅ | 有 batch_no 但无产品字段 |
| `qa_non_conformance` | quality | ✅ | ❌（通过 batch_no）| ❌ | ❌ | ✅ | 追溯入口 |
| `prc_price_items` | procurement | ❌ | ✅ | ❌ | ❌ | ❌ | LEGACY，Sales 冻结 |

---

## 附录 B：grade_code 值集统一映射表

| 统一 grade_code | 统一含义 | 当前销售值 | 当前库存值 | 建议迁移方向 |
|---------------|---------|---------|---------|------------|
| `AA` | 特级蛋（出口/礼品）| `0`（数字）| `AA` | 统一为 `AA` |
| `A` | 一级蛋（标准鲜蛋）| `1` | `A` | 统一为 `A` |
| `B` | 二级蛋（批发/厂用）| `2` | `B` | 统一为 `B` |
| `C` | 三级蛋（加工原料）| `3` | —（无）| 新增为 `C` |
| `D` | 四级蛋（低端加工）| `4`、`5` | —（无）| 合并为 `D` |
| `DIRTY` | 脏蛋 | `DIRTY` | `DIRTY` | 保持 `DIRTY` |
| `CRACKED` | 裂缝蛋（可用）| —（无）| `CRACKED` | 保持 `CRACKED` |
| `BROKEN` | 破蛋（不可售）| `BROKEN` | —（无）| 保持 `BROKEN` |
| `DAMAGED` | 损坏蛋（退货/异常）| —（无）| `DAMAGED` | 保持 `DAMAGED` |

---

## 附录 C：packaging_specs 标准值建议

| spec_code | spec_name_zh | qty_per_unit | display_unit | 说明 |
|----------|-------------|-------------|-------------|------|
| `LOOSE` | 散装 | 1 | 枚 | 按枚计，无包装 |
| `30_PCS_TRAY` | 30枚/托 | 30 | 托 | 标准零售托盘 |
| `60_PCS_TRAY` | 60枚/托 | 60 | 托 | 大托盘 |
| `12_TRAY_CASE` | 12托/箱（360枚）| 360 | 箱 | 标准整箱 |
| `360_PCS_CASE` | 360枚/箱 | 360 | 箱 | 与 12_TRAY_CASE 等价 |
| `GIFT_BOX_10` | 礼盒装10枚 | 10 | 盒 | 礼品包装 |
| `GIFT_BOX_20` | 礼盒装20枚 | 20 | 盒 | 礼品包装 |

---

*本文档为 Phoenix ERP V3 产品主档统一审计报告，Phase H1 产出。*  
*如发现遗漏或有更新，请在 PR 中更新本文档。*  
*Last updated: 2026-05-30 Phase H1*
