# G15 · 业务架构审计 — 三页关系 + 仓库分类 + 模式切换

完成时间：2026-06-07

## 1. 三页数据流真相

### 1.1 当前架构（SSH 实测）

| 页面 | 路径 | 后端 | 写入表 | 业务侧 |
|---|---|---|---|---|
| **日生产日报** | `/breeding/daily` | POST `/api/v3/farm/daily-logs` | `brd_daily_logs` | **养殖统计**：班次产蛋数 + 死淘 + 饲料 + 环境（+ G14 可选 9 档 JSONB） |
| **集蛋记录/蛋品台账** | `/breeding/egg-ledger` | `/api/farm/egg/*` | `inv_batches`（warehouse_code='FARM_EGG'）+ `inv_ledger` | **农场端蛋品库存**：按等级入库/出库/报损 + 流水（实测 inv_batches 中 FARM_EGG 仓库 0 行）|
| **日产蛋入库** | `/breeding/daily-inbound` | POST `/v2/inventory/production-inbound` | `inv_batches` 销售批次 EGG-* | **销售端库存**：直接进 Sales V2 FIFO |
| **包装作业台**（未启用）| `/terminal/packaging` | terminal/packaging.service | `inv_batches`（包装入库批次） | **生产终端**：扫码 + 分级 + 包装 + 自动入库 |

### 1.2 业务真实数据流

```
鸡舍产蛋
   ↓
① /breeding/daily            必录 — brd_daily_logs.eggs_produced 总数
                              可选 9 档 JSONB（G14 加）
   ↓
② /breeding/egg-ledger       可选 — inv_batches(warehouse='FARM_EGG')
                              农场端蛋品台账（按等级入库出库报损）
   ↓
③ 销售前必经一个：
   /breeding/daily-inbound    TEMP_PRODUCTION_INBOUND 模式 → 手工分级入销售库存
   /terminal/packaging        PACKAGING_INBOUND 模式 → 扫码分级自动入库（未启用）
   ↓
inv_batches (销售批次 EGG-*)
   ↓
Sales V2 FIFO → /sales2/orders 销售出库
```

### 1.3 模式切换机制（已存在 ✓）

`inv_source_mode` 表实测：

| scope_level | scope_code | mode |
|---|---|---|
| GROUP | ALL | `TEMP_PRODUCTION_INBOUND`（默认）|
| SITE | FARM-MS | `PACKAGING_INBOUND`（孟赛灰度）|
| SITE | FARM-DP | `TEMP_PRODUCTION_INBOUND`（东鹏） |

**问题**：孟赛 site_code 在生产数据里是 `SITE-MENGSAI-LAYER`，但 inv_source_mode 配置用 `FARM-MS`。**两者不匹配** → 宋明光仍走 TEMP_PRODUCTION_INBOUND 路径 → 不知道孟赛已切包装模式。

## 2. 仓库分类混乱（核心架构 bug）

### 2.1 现状（SSH 实测）

**`wms_warehouses` 表 0 行**（生产 DB 仓库主数据空）。

`inv_batches.warehouse_code` 实际值：

| warehouse_code | count | 含义 |
|---|---|---|
| `MEDICINE` | 91 | 药品仓（farm-medicine.service 用 'MEDICINE' 常量隔离） |
| `SITE-MENGSAI-LAYER` | 126 | 孟赛鸡蛋（用 site_code 当 warehouse_code）|

**问题**：
- `wms_warehouses` 有 `type` 字段但表空，未注册任何仓库
- `inv_batches.warehouse_code` 没引用 wms_warehouses（无 FK）
- 业务上"鸡蛋仓 / 原料仓 / 药品仓 / 成品仓 / 采购仓"混用同一 warehouse_code 字段
- 农场端 egg-ledger 用 `FARM_EGG`，但 inv_batches 里 0 行 — **egg-ledger 页面实际是死页**

### 2.2 业务上应有的仓库分类

| 仓库类型 | type 枚举 | 用途 | 当前实现 |
|---|---|---|---|
| 农场鸡蛋仓 | `EGG_FARM` | 集蛋后暂存，按场分 | ❌ 缺（farm-egg.service 用 FARM_EGG 常量但 inv_batches 无数据）|
| 销售鸡蛋仓 | `EGG_SALES` | 成品批次（EGG-YYYYMMDD-*）| ⚠️ 当前用 site_code 当 warehouse_code |
| 药品仓 | `MEDICINE` | 兽药/疫苗 | ✓ 用 'MEDICINE' 常量但无 wms_warehouses 注册行 |
| 饲料仓 | `FEED` | 玉米/豆粕/预混料 | ❌ 缺（mst_products 有 FEED_* 但 inv_batches 无饲料行）|
| 原料/包材仓 | `RAW_MATERIAL` | 蛋托/包材/柴油 | ❌ 缺 |
| 采购到货仓 | `PURCHASE_RECV` | 采购在途 | ❌ 缺 |
| 成品包装仓 | `FINISHED` | 包装作业台 output | ❌ 缺（PACKAGING_INBOUND 模式下产生） |

### 2.3 宋明光看到的"出入库公司产品"是什么

`/warehouse/inbound` 默认拉 `inv_batches` 全部 — 没有 type 过滤 → 看到 MEDICINE + SITE-MENGSAI-LAYER 混合数据，类型不分。WMS 入库表单允许选任何 warehouse_code，业务工人没法区分。

## 3. 宋明光选鸡舍问题

`daily/page.tsx:507` 用 `<HouseSelector />`，应能选。可能你看到无法选的情况：
- HouseSelector 内部加载 brd_houses（G7 修过 pageSize bug 应正常）
- 但如果 RBAC fallback 失效（生产端 G7-G14 部署不到位）→ 加载 403 → 下拉空

**已验证**：之前 SSH 实测 `/api/crud/brd_houses` admin 调返 6 行 ✓。

可能你看到的"不能选鸡舍"是 G14 改卡片式后 HouseSelector 位置没变但视觉被表单挤掉了？请确认实际现象（下拉打不开 / 下拉空 / 下拉位置变了 / 别的）。

## 4. 宋明光全栈页面下拉源审计

| 页面 | Selector | 数据源 | 状态 |
|---|---|---|---|
| `/breeding/daily` | HouseSelector | `/api/crud/brd_houses` | ✓ G7 已修 |
| `/breeding/daily` | useDictOptions('BRD_SHIFT') | `/api/crud/sys_dict` | ✓ G5 字典 + G14 中文 fallback |
| `/breeding/daily` 9 档 | useProductGrades | `/api/lookup/product-grades` | ✓ G5-B |
| `/breeding/daily-inbound` | useProductGrades | 同上 | ✓ |
| `/breeding/egg-ledger` | apiFetch `/api/farm/feed/houses` | brd_houses 自取 | ⚠️ 老路径，未走 lookup |
| `/breeding/egg-ledger` | apiFetch `/api/farm/sales/customers` | sal_customers | ⚠️ 老路径 |
| `/breeding/med-stock` | farm-medicine.service.getCatalog | brd_medications | ✓ |
| `/warehouse/inbound` | WarehouseSelector | `/api/lookup/warehouses` | ⚠️ wms_warehouses 0 行 → 下拉空 |
| `/finance2/cash-accounts` | （内置）| fin_cash_accounts | ✓ |

## 5. 整改方案（按依赖顺序，6 步）

### Step A · wms_warehouses 全量 seed + type 枚举（**最关键**）

新 mig：
1. 给每个 SITE 建一套子仓：
   - `LPH_MS_EGG_FARM`     (EGG_FARM)  农场鸡蛋仓
   - `LPH_MS_MEDICINE`     (MEDICINE)  药品仓
   - `LPH_MS_FEED`         (FEED)      饲料仓
   - `LPH_MS_RAW`          (RAW_MATERIAL) 原料/包材仓
   - `LPH_MS_PURCHASE`     (PURCHASE_RECV) 采购到货
   - `LPH_MS_EGG_SALES`    (EGG_SALES) 销售鸡蛋成品仓
2. inv_batches 历史数据 batch 迁移到正确仓：
   - 'MEDICINE' → `LPH_MS_MEDICINE`
   - 'SITE-MENGSAI-LAYER' → `LPH_MS_EGG_SALES`（鸡蛋）

### Step B · 仓库 type 在前端落地

- WarehouseSelector 支持 `type` 过滤（如 `<WarehouseSelector type="MEDICINE" />`）
- `/warehouse/inbound` 表单按 type 分类显示当前操作的仓库类型
- `/warehouse/inbound?type=FEED` 等 deep link 用于 daily-work 卡片

### Step C · 三页关系明确化

| 状态 | 决定 |
|---|---|
| daily | 保留作"养殖侧统计"主入口 |
| egg-ledger | **建议废弃**（实测 inv_batches 0 行说明业务方没用），路由 redirect 到 daily |
| daily-inbound | 保留 + 模式守卫：PACKAGING_INBOUND 模式下页面只读 + 「前往包装中心」按钮 |
| terminal/packaging | 未启用，业务方启用时切换 site 的 inv_source_mode |

### Step D · 修 inv_source_mode 配置错位

```sql
UPDATE inv_source_mode
   SET scope_code='SITE-MENGSAI-LAYER'
 WHERE scope_code='FARM-MS' AND scope_level='SITE';
```

让宋明光 site_code 对得上 mode 表。

### Step E · 数据自动透传机制（业务方核心要求）

```
daily 提交（含 eggs_by_grade）
   ↓
brd_daily_logs.eggs_by_grade JSONB
   ↓
【模式 = TEMP_PRODUCTION_INBOUND】
   daily 提交后弹窗："已保存。是否同步入销售库存？"
   是 → 自动调 daily-inbound 的 endpoint 一键入库
【模式 = PACKAGING_INBOUND】
   daily 提交后弹窗："已保存。请去包装作业台完成分级入库"
   daily-inbound 页面禁用
```

### Step F · 宋明光全栈 selector 验收

逐页打开核查：
- HouseSelector 6 个鸡舍可选
- WarehouseSelector 按 type 显示对应仓
- 蛋档下拉 9 档 product_grades
- 字典下拉 BRD_SHIFT 中文
- 客户/供应商下拉

## 6. 工作量预估

| Step | 工时 | 复杂度 |
|---|---|---|
| A wms_warehouses seed + type | 1h | 中 |
| B WarehouseSelector type 过滤 | 30min | 低 |
| C 三页关系明确化 + egg-ledger 废弃 | 45min | 中 |
| D 修 inv_source_mode 配置 | 5min（SSH）| 极低 |
| E 数据自动透传 + 模式弹窗 | 1h | 中 |
| F 全栈 selector 验收 | 30min | 低 |
| **总计** | **约 4 小时** | |

## 7. 推荐执行顺序

```
D (5 min)    立即修 inv_source_mode 配置错位
   ↓
A (1h)       仓库 seed + type 枚举 — 业务架构基础
   ↓
B (30m)      WarehouseSelector 加 type 过滤
   ↓
C (45m)      三页关系明确化 + egg-ledger 废弃
   ↓
E (1h)       数据自动透传链路 + 模式可视化
   ↓
F (30m)      全栈 selector 验收 + 截图给用户
```

## 8. 待你确认（关键决策点）

1. **egg-ledger 页面**：废弃（合并到 daily）/ 保留作农场端独立台账（业务方实际用否）
2. **仓库 type 枚举**：用我列的 6 类（EGG_FARM/EGG_SALES/MEDICINE/FEED/RAW_MATERIAL/PURCHASE_RECV/FINISHED）还是你有别的分类？
3. **每个 SITE 一套子仓**（LPH_MS_*）：是否合理？还是按"集团级共享仓 + SITE 库位"？
4. **daily 提交后自动入销售库存**（TEMP 模式弹窗）：业务方可接受这种"一键二合一"流程吗？
5. **目前实际包装作业台是否启用**：用户提到"未启用"，我修宋明光所在 SITE 的 inv_source_mode 为 TEMP_PRODUCTION_INBOUND 保证可用？

---

**Tag**：`v3-g15-architecture-audit`
**状态**：📋 审计完成，待用户决策方向后实施
