# 主数据编码规范（MDM Coding Standard）

> **版本**：v1.0（MDM-1 阶段）
> **效力**：本规范适用所有新建主数据。历史数据通过 `biz_site_aliases` 表映射，不强制改名。

---

## 0. 总则

1. **统一数据源**：公司 + 业务站点 = `sys_organizations`；项目 = `biz_projects`。
2. **禁止用中文名称作为关联键**。业务表只能存 code，name 仅用于展示。
3. **同一实体不得多处建档**。如发现重复，进入 `biz_site_aliases` 映射；canonical code 唯一。
4. **历史 alias 必须进映射表**：包括外部 Excel 名称、其他系统老编码、客户口语化简称。
5. **新建单据强制带 company_code + project_code + site_code**（个别业务模块例外）。
6. **大小写敏感**：所有 code 用全大写 + 下划线（`COMP-LAO-AGRI` ✓ / `comp_lao_agri` ✗）。
7. **编码长度**：≤ 64 字符（与字段类型 VARCHAR(64) 对齐）。

---

## 1. company_code 公司主体

**规则**：`COMP-{COUNTRY}-{BUSINESS}`

| 例 | 含义 |
|---|---|
| `COMP-LAO-AGRI` | 老挝凤凰农业发展有限公司 |
| `COMP-LAO-FOOD` | 老挝凤凰食品集团有限公司 |
| `COMP-LAO-XINGCHI` | 老挝金三角特区星驰养鸡场 |
| `COMP-CN-HQ` | 国内总部（如新建）|

**规则细节**：
- 前缀必须 `COMP-`
- 国家段：CN / LAO / TH / VN（ISO-3166 简写）
- 业务段：AGRI / FOOD / FEED / TRADING / SCM / HQ 等业务大类
- 不允许直接用旧编码 `LPH` / `CO-FHA`（这些进 biz_site_aliases.alias_type='LEGACY_COMPANY_CODE'）

---

## 2. project_code 项目编码

**规则**：`PRJ_{SITE_OR_BUSINESS}_{SCOPE}`

| 例 | 含义 |
|---|---|
| `PRJ_MENGSAI_LAYER` | 孟赛蛋鸡场经营项目 |
| `PRJ_DONGPENG_LAYER` | 东鹏蛋鸡场经营项目 |
| `PRJ_VTE_FOOD_FACTORY` | 万象食品工厂项目 |
| `PRJ_JINHU_PARK` | 金湖产业园项目 |
| `PRJ_MENGSAI_ORGANIC` | 孟赛有机肥项目 |

**规则细节**：
- 前缀必须 `PRJ_`
- 一个项目原则上对应一个 site（一对一），共享 site 通过 `biz_site_projects` 多对多
- 项目废止后改 status='ARCHIVED'，**不删除**、**不重用**

---

## 3. site_code 业务站点编码

**规则**：`SITE-{LOCATION}-{TYPE_SUFFIX}`

| 例 | 含义 | site_business_type |
|---|---|---|
| `SITE-MENGSAI-LAYER` | 孟赛蛋鸡养殖场 | FARM |
| `SITE-MENGSAI-HATCHERY` | 孟赛孵化场 | FARM |
| `SITE-MENGSAI-ORGANIC` | 孟赛有机肥生产厂 | FACTORY |
| `SITE-DONGPENG-LAYER` | 东鹏蛋鸡养殖场 | FARM |
| `SITE-VTE-FEED` | 万象饲料厂 | FACTORY |
| `SITE-VTE-SLAUGHTER` | 万象屠宰加工厂 | FACTORY |
| `SITE-VTE-BROILER` | 万象肉鸡养殖场 | FARM |

**规则细节**：
- 前缀必须 `SITE-`
- 地点段：用地名缩写（MENGSAI / DONGPENG / VTE 万象 / LB 拉邦）
- 类型后缀：LAYER（蛋鸡）/ BROILER（肉鸡）/ HATCHERY（孵化）/ ORGANIC / SLAUGHTER / STORE / FACTORY / OFFICE / WAREHOUSE
- **site_business_type 必填**：FARM / STORE / FACTORY / WAREHOUSE / OFFICE
- 一个 site_code 必须挂在 `parent_id` 指向的 COMPANY 节点下

---

## 4. farm_code / store_code 兼容规则

**规则**：**新业务禁用**，仅作历史 alias 保留

| 情况 | 处理 |
|---|---|
| 历史 brd_farms.farm_code | 通过 `biz_site_aliases (alias_type='FARM_CODE')` 映射到 site_code |
| 历史 mst_stores.store_code | 通过 `biz_site_aliases (alias_type='STORE_CODE')` 映射到 site_code |
| 历史 sys_store.store_code（V2 老表） | 通过 `biz_site_aliases (alias_type='OLD_SITE_CODE')` 映射到 site_code |
| 新建养殖场 / 门店 | **不再发新 farm_code / store_code**；直接建 `SITE-*` |

---

## 5. warehouse_code 仓库编码

**规则**：`WH_{COMPANY_SHORT}_{LOCATION}_{SEQ}` 或 site 化为 `SITE-*-WAREHOUSE`

| 当前现状 | 推荐 |
|---|---|
| wms_warehouses 表 0 行 | 新建时直接做 site_code，例如 `SITE-MENGSAI-WAREHOUSE`，site_business_type='WAREHOUSE' |
| 复杂场景（一个 site 内部多仓） | 仍用 `wms_warehouses.warehouse_code`，但 `mapped_site_code` 必须指向 SITE-* |

---

## 6. house_code 鸡舍编码

**规则**：`HOUSE_{SITE_SHORT}_{NN}` 双位数字

| 例 | 含义 | 挂在 |
|---|---|---|
| `HOUSE_MS_01` | 孟赛 1 号鸡舍 | SITE-MENGSAI-LAYER |
| `HOUSE_MS_02` | 孟赛 2 号鸡舍 | SITE-MENGSAI-LAYER |
| `HOUSE_DP_01` | 东鹏 1 号鸡舍 | SITE-DONGPENG-LAYER |

**规则细节**：
- 前缀 `HOUSE_`
- 编号双位（01 ~ 99）
- 必须挂在 site_business_type='FARM' 的站点下
- 历史 `LPH_MS_H1` 等编码通过 `biz_site_aliases` 映射

**当前 GLP-1A-2 阶段已建数据**（参考迁移）：

| 现有 | 推荐 canonical |
|---|---|
| LPH_MS_H1 | HOUSE_MS_01 |
| LPH_MS_H2 | HOUSE_MS_02 |
| LPH_MS_H3 | HOUSE_MS_03 |
| LPH_MS_H4 | HOUSE_MS_04 |
| LPH_MS_H5 | HOUSE_MS_05 |
| LPH_MS_H6 | HOUSE_MS_06 |

历史的 LPH_MS_HN 通过 `biz_site_aliases (alias_type='HOUSE_LEGACY_CODE')` 映射保留。

---

## 7. supplier_code / customer_code / product_code 与 company/project/site 关系

### 7.1 supplier_code 供应商

- 当前 prc2_suppliers 表已存在
- 新建供应商时 `default_currency` + `owner_company_code` 必填
- 共享供应商（shared_scope='GROUP'）允许多公司使用
- 命名规范：`SUP_{SUPPLIER_NAME_SHORT}`（如 `SUP_ZHONGLIANG`）

### 7.2 customer_code 客户

- 当前 sal_customers 表已存在
- 客户 `company_code` 必填（客户归属哪家公司销售）
- 命名规范：`CUS_{CUSTOMER_SHORT}`（如 `CUS_MH_AF` 蒙混阿峰）

### 7.3 product_code 物料

- 当前 mst_products 表
- 物料**不绑定 company_code**（集团共享物料目录）
- 命名规范：按业务类别加前缀 `FEED_*` / `EGG` / `PKG_*` / `FUEL_*`

---

## 8. 禁止条款

1. ❌ **禁止用中文名作为关联键**：`WHERE customer_name='蒙混阿峰'` ❌；必须 `WHERE customer_code='CUS_MH_AF'`
2. ❌ **禁止同实体多张主表**：一个实体只在 canonical 表存 1 行；alias 进映射表
3. ❌ **禁止占位 code**：不允许写 `LPH` 等模糊占位（GLP-1A-2 阶段曾用，已 fix 为 COMP-LAO-AGRI）
4. ❌ **禁止业务单据冗余 name 字段**作为关联依据：name 仅用于展示报表，不参与查询过滤
5. ❌ **禁止改名 code**：code 一旦发布即不可变；只能废弃（status='ARCHIVED'）
6. ❌ **禁止跨公司直接共享 site**：如确需共享，必须通过 biz_site_projects 标注

---

## 9. 别名映射表使用规则

`biz_site_aliases` 数据规范：

| alias_type | 来源 | 示例 |
|---|---|---|
| FARM_CODE | brd_farms.farm_code | LPH_MENGSAI → SITE-MENGSAI-LAYER |
| STORE_CODE | mst_stores.store_code | MS-STORE-01 → SITE-MENGSAI-STORE |
| OLD_SITE_CODE | sys_store.store_code | CO-FHA → COMP-LAO-AGRI |
| EXCEL_NAME | 业务方 Excel 表头 | "孟赛蛋鸡场" → SITE-MENGSAI-LAYER |
| LEGACY_NAME | 历史口语化简称 | "孟赛场" → SITE-MENGSAI-LAYER |
| HOUSE_LEGACY_CODE | brd_houses.house_code 旧值 | LPH_MS_H1 → HOUSE_MS_01 |
| LEGACY_COMPANY_CODE | 历史公司编码 | LPH → COMP-LAO-AGRI |

**生效原则**：所有业务查询应优先用 canonical code；数据导入时若拿到 alias，先 `JOIN biz_site_aliases` 映射后存 canonical。

---

## 10. 后续治理治理动作

| 阶段 | 动作 |
|---|---|
| MDM-2 | 建 biz_projects / biz_site_aliases 表 |
| MDM-3 | 初始 seed：把现有 sys_store / brd_farms / mst_stores 数据按本规范映射进 alias 表 |
| MDM-4 | 业务 service 改造：所有查询 `JOIN biz_site_aliases` 兼容老 code |
| MDM-5 | 前端 Selector 改造：CompanySelector / ProjectSelector / SiteSelector（含 site_business_type 过滤）|
| MDM-6 | 老表冻结：sys_store / brd_farms / mst_stores 标记 ARCHIVED，禁止写入 |

---

## 11. 业务方需确认的具体 code

按 `docs/mdm-0-master-data-audit.md` §8 待业务确认清单。以下 code 在业务方拍板前**暂用推荐值**，落地 migration 前以业务方意见为准。

| 实体 | 推荐 canonical code |
|---|---|
| 老挝凤凰农业 | `COMP-LAO-AGRI` |
| 老挝凤凰食品 | `COMP-LAO-FOOD` |
| 孟赛蛋鸡养殖场 | `SITE-MENGSAI-LAYER`（site_business_type='FARM'）|
| 东鹏蛋鸡养殖场 | `SITE-DONGPENG-LAYER` |
| 万象饲料厂 | `SITE-VTE-FEED` |
| 孟赛经营项目 | `PRJ_MENGSAI_LAYER` |
| 东鹏经营项目 | `PRJ_DONGPENG_LAYER` |
| 孟赛 6 个鸡舍 | `HOUSE_MS_01` ~ `HOUSE_MS_06` |
