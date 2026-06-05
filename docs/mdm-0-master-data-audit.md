# MDM-0 主数据治理审计报告

> **优先级**：P0
> **范围**：全库 schema + entity + DTO + 前端表单 + 实际数据
> **目的**：确认主数据混乱根因；为 MDM-1 统一模型重构提供事实依据
> **状态**：仅审计，**未触动 schema / 未跑 migration**
> **日期**：2026-06-05

---

## 0. TL;DR 根因

主数据混乱不是某一个字段没填，而是**4 套并行的"组织/站点/公司"实体源** + **重复建档** + **关键单据缺关联字段**三连击：

| 现象 | 根因 |
|---|---|
| 采购新建不能选公司/项目 | 前端 `<CompanySelector><ProjectSelector>` **已就位**，但 `prc2_projects` 表 **0 行**，下拉为空 → 用户感觉"不能选" |
| "绑定门店：SITE-MENGSAI-LAYER" | `sys_user.store_code` 字段名是 store，存的却是 SITE 代码；前端按字段名展示"门店" |
| 生产 LPH_MENGSAI 与 SITE-MENGSAI-LAYER 不一致 | brd_farms 与 sys_organizations 各自命名，无 alias 表映射 |
| 6 月生产数据看不见 | `brd_daily_logs` 表**根本没有 company_code/project_code/site_code 字段**，DataScope 想过滤也没字段 |
| LPH 占位假数据 | GLP-1A-2 时 company_code 'LPH' 是我自己假设的，实际真值是 `COMP-LAO-AGRI`，已 fix 但暴露了"无统一编码规范"问题 |

---

## 1. 主数据并行源 — 4 套并行实体

### 1.1 公司/组织树

| 表 | 行数 | 用途 | 与谁重复？ |
|---|---|---|---|
| **sys_organizations** | 16 | V3 统一组织树（GROUP / BU / COMPANY / SITE / DEPARTMENT）| ✅ **应作为唯一公司 + 组织 + 站点源** |
| sys_store | 16 | V2 遗留"门店树"（HQ / COMPANY / FARM / STORE）| ❌ 与 sys_organizations 完全重复同实体（"CO-FHA 凤凰农业" vs "COMP-LAO-AGRI 老挝凤凰农业"） |
| brd_farms | 5 | 养殖场主档 | ❌ 与 sys_organizations 的 SITE 类型重复（"LPH_MENGSAI 孟赛蛋鸡场" vs "SITE-MENGSAI-LAYER 孟赛蛋鸡养殖场"）|
| mst_stores | 8 | 销售门店主档 | ❌ 与 sys_organizations 的 SITE 类型重复 |
| shr_projects | 3 | 股东项目 | ⚠️ 与 prc2_projects 部分重叠（不同业务视角，但项目编码体系不一致）|
| prc2_projects | **0** | 采购项目 | ⚠️ **空表！** 这就是采购页项目下拉为空的直接原因 |

### 1.2 站点 / 养殖场 / 门店 / 仓库

| 表 | 行数 | site_type 概念 | 数据问题 |
|---|---|---|---|
| sys_organizations org_type=SITE | 7 | ✅ 已有 SITE 类型 + 7 个站点（孟赛蛋鸡养殖场/孵化场/有机肥/东鹏/万象肉鸡/饲料/屠宰） | ✅ 最完整源 |
| brd_farms | 5 | FARM | ❌ **5 行有 3 行都叫"孟赛"**：FARM001 / LPH_MENGSAI / FARM-MS 同一实体 3 条记录 |
| mst_stores | 8 | STORE | ❌ 无 company_code 字段（销售门店不能挂公司）|
| sys_store | 16 | HQ/COMPANY/FARM/STORE | ❌ 老版混合表，与 sys_organizations 100% 概念重叠 |
| wms_warehouses | **0** | WAREHOUSE | ⚠️ 空表 |

### 1.3 业务对象（house / zone / location）

| 表 | 数据 | 与 site 的关系 | 问题 |
|---|---|---|---|
| brd_houses | 6 | farm_code → brd_farms | ❌ 没挂到 sys_organizations.SITE |
| wms_zones | n/a | warehouse_code → wms_warehouses | ⚠️ wms_warehouses 空 |
| wms_locations | n/a | warehouse_code + zone_code | ⚠️ 同上 |

---

## 2. 字段语义重复 / 命名混乱

### 2.1 同义字段在不同表用不同名

| 概念 | 出现的字段名 |
|---|---|
| 公司主体 | `company_code` (40 表) / `org_code` (sys_organizations) / `owner_company_code` (主数据) |
| 项目 | `project_code` / `project_id` / `project_name` |
| 站点 | `site_code` / `farm_code` / `store_code` / `org_code` (SITE 类型) — **4 套并行命名** |

### 2.2 重复建档（**同一实体多张表存）

| 实体 | 表 1 | 表 2 | 表 3 | 表 4 |
|---|---|---|---|---|
| 老挝凤凰农业 | sys_organizations.COMP-LAO-AGRI | sys_store.CO-FHA | shr_projects (?) | (40 业务表用 company_code='COMP-LAO-AGRI' 或 'LPH'） |
| 孟赛蛋鸡养殖场 | sys_organizations.SITE-MENGSAI-LAYER | brd_farms.FARM001 + brd_farms.LPH_MENGSAI + brd_farms.FARM-MS | sys_store.FARM-MS | sys_user.store_code=SITE-MENGSAI-LAYER（字段名误导）|

### 2.3 只有名称没有 code 的字段（关联依据错位）

| 表 | 字段 | 问题 |
|---|---|---|
| brd_daily_logs | farm_name | ❌ 用名称做关联依据，与 farm_code 并存且可能不一致 |
| prc2_purchase_orders | company_name / project_name / supplier_name | ⚠️ 冗余反范式（虽然有 code，但 name 与 code 可能漂移） |
| sal_sales_orders | company_name / customer_name | 同上 |

---

## 3. 业务表关键字段缺失

### 3.1 缺 company_code

| 表 | 业务影响 |
|---|---|
| mst_stores | 销售门店挂不到公司 → 跨公司门店无法分账 |
| mst_products | 物料无公司归属（如果同物料在两公司报价不同则不行）|
| product_skus | 同上 |
| wms_warehouses | 仓库无公司归属 |
| brd_houses | 鸡舍无公司归属（靠 farm 间接） |
| brd_daily_logs | **生产日报无 company_code** → 跨公司汇报报表无法分公司汇总 |

### 3.2 缺 project_code

| 表 | 业务影响 |
|---|---|
| brd_daily_logs | 生产数据无项目归属 |
| brd_houses / brd_flocks | 同上 |
| wms_inbound / wms_outbound | 出入库无项目归属 → 投资项目成本归集不全 |
| pkg_tasks | 包装任务无项目 |

### 3.3 缺 site_code（统一站点字段）

**所有**业务表都没有 `site_code`。当前用 farm_code / store_code / warehouse_code 三选一映射，缺统一字段。

---

## 4. 业务表混用 store_code / farm_code

| 表 | 用 farm_code | 用 store_code | 问题 |
|---|---|---|---|
| brd_daily_logs | ✅ | ✅ | **同一表 2 套站点字段**，不知道用谁过滤 |
| brd_flocks / brd_houses | ✅ | ❌ | OK |
| sys_user | ❌ | ✅（存 SITE 代码）| 字段名误导 |
| pkg_tasks / pkg_shifts | ❌ | ✅ | OK（包装站点是 STORE 类）|

---

## 5. 接口数据范围过滤现状

| 接口 / 模块 | DataScope 维度 | 问题 |
|---|---|---|
| `/api/master-data/runtime/customer` | company_code | ✅ |
| `/api/master-data/runtime/supplier` | company_code | ✅（shared_scope='GROUP' 但仍按 owner_company_code 隔离）|
| `/api/v2/breeding/*` | farm_code | ❌ 按 farm 过滤而非 company/project，跨场仅靠业务约定 |
| `/api/v2/sales/*` | company_code | ✅ |
| `/api/v2/procurement/*` | company_code + project_code | ⚠️ 项目为空导致下拉无值 |
| `/api/wms/*` | warehouse_code（但 wms_warehouses 空）| ❌ 退化为不过滤 |
| `brd_daily_logs` 查询 | farm_code OR store_code | ❌ 双字段并存歧义 |

**通用问题**：`DataScopeService.allowedFarmCodes` 字段存在但 `sys_user_farm_scopes` 表直到 2026-06-05 才补建 → 历史上**全员 allowedFarmCodes=[]** → 实际靠 storeCode='ALL' 后门或者前端硬编码过滤。

---

## 6. 前端选择器数据源

| Selector | 数据源 API | 数据源表 | 问题 |
|---|---|---|---|
| `<CompanySelector>` | `/api/org/organizations?type=COMPANY` | sys_organizations | ✅ |
| `<ProjectSelector>` | `/api/master-data/runtime/project/active` | **prc2_projects** | ❌ **空表 → 下拉无值** |
| `<WarehouseSelector>` | `/api/crud/wms_warehouses` | wms_warehouses | ❌ 空表 |
| `<StoreSelector>` | `/api/crud/mst_stores` | mst_stores | ⚠️ 仅 8 行 + 无 company_code |
| 养殖场选择 | 无统一组件 | brd_farms（5 行 3 重复）| ❌ |

---

## 7. 用户绑定与角色范围

| 字段 / 表 | 含义 | 问题 |
|---|---|---|
| sys_user.store_code | 字段名 store，实际存 SITE 代码（如 SITE-MENGSAI-LAYER） | ❌ 字段名误导，但改名破坏 50+ 用户 |
| sys_user_orgs | 主组织绑定 | ✅ V3 设计正确（is_primary + data_scope_level）|
| sys_user_farm_scopes | 额外场站授权（G4-E）| ❌ 表 2026-06-05 才补建，历史为空 |
| sys_user_warehouse_scopes | 额外仓库授权 | ⚠️ 表存在但用户多无此绑定 |
| sys_user_project_scopes | 额外项目授权 | ⚠️ 表存在但 prc2_projects 空 → 形同虚设 |
| 角色 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR | site 范围限定通过 farm_code | ✅（本次 GLP-1A-RBAC-Realign 建好） |

---

## 8. "需要业务确认"清单

| # | 项 | 当前状态 | 候选方案 |
|---|---|---|---|
| 1 | 老挝凤凰农业的统一公司 code | sys_organizations: `COMP-LAO-AGRI` / sys_store: `CO-FHA` | 推荐 `COMP-LAO-AGRI`（V3 体系）|
| 2 | 孟赛蛋鸡养殖场的统一 site code | sys_organizations: `SITE-MENGSAI-LAYER` / brd_farms: `LPH_MENGSAI` & `FARM001` & `FARM-MS` | 推荐 `SITE-MENGSAI-LAYER` 为 canonical；`LPH_MENGSAI` 等做 alias |
| 3 | 是否废弃 sys_store 表 | 与 sys_organizations 100% 重叠 | 推荐弃用 + 数据迁入 sys_organizations |
| 4 | 是否废弃 brd_farms 表（合并入 sys_organizations.SITE_TYPE=FARM）| 当前 5 行有 3 行重复 | 推荐合并 + brd_farms 退化为 view |
| 5 | 是否合并 sys_organizations + mst_stores | 销售门店是 SITE 类型 | 推荐合并 |
| 6 | 项目主表用 prc2_projects 还是 shr_projects | prc2 空 / shr 3 行 | 推荐新建 `biz_projects` 作为统一项目源，prc2/shr 迁入 |
| 7 | 是否新建 `mdm_*` 系列表 vs 扩展 sys_organizations | sys_organizations 已 covers company+site，缺 project | 推荐**扩展 sys_organizations 加 SITE_TYPE 枚举 + 新建 biz_projects + biz_site_aliases**（最小侵入）|
| 8 | 1 号鸡舍空栏问题 | brd_houses.1 号舍 current_birds=0 | 等业务确认 |

---

## 9. 关键事实摘要

| 维度 | 数字 |
|---|---|
| 表总数（与公司有关）| 40 |
| 表总数（与项目有关）| 28 |
| 表总数（与 site/farm/store/warehouse 有关）| 57 |
| 同实体重复建档典型例 | "孟赛"在 4 张表 = sys_organizations + sys_store + brd_farms ×3 + mst_stores |
| 关键缺字段 | brd_daily_logs 缺 company/project/site 共 3 字段 |
| 空主表 | prc2_projects + wms_warehouses + sys_user_farm_scopes(刚建) |

---

## 10. 推荐设计原则（待 MDM-1 详细落地）

1. **复用 sys_organizations**：不新建 `mdm_companies`，公司 + 业务站点都用 sys_organizations 的 COMPANY / SITE 类型。
2. **新建 biz_projects**：项目独立成表（不混入 org tree），含 company_code 反向引用。
3. **新建 biz_site_aliases**：历史 farm_code/store_code/CO-FHA 等 → 统一 site_code（org_code）的映射表。
4. **brd_farms / mst_stores 保留兼容**：但加 `mapped_site_code` 字段反向引用 sys_organizations.SITE。后续业务只查 site_code。
5. **业务表补字段**：`brd_daily_logs` 等所有业务表补 `company_code` + `project_code` + `site_code` 三个统一字段（site_code 与 farm_code 并存一段时间）。
6. **编码规范**：见 `docs/mdm-coding-standard.md`。

---

## 11. 本审计**未做**的事

- 未触动任何 schema
- 未执行任何 migration
- 未删除重复数据
- 未改任何 entity / DTO / 前端

所有判断基于只读扫描（SELECT / grep）。

---

**下一步**（等业务方拍板 §8 清单后实施）：
1. MDM-1 设计文档（biz_projects DDL + biz_site_aliases DDL + alias 映射初始数据 seed）
2. MDM-2 业务表补 3 字段（company/project/site）+ alias 反查回填
3. MDM-3 采购 / 销售 / 生产 / 库存 / 财务模块查询切换到统一字段
4. MDM-4 sys_store 表标记弃用 + brd_farms / mst_stores 退化为 view 或冻结
