# G83 — 全局抽屉裸字段治理报告

> 阶段：G83　主题：抽屉/表单裸字段 → 主数据选择器 + 字典 + 名称自动带出
> 触发：价格管理抽屉「公司名未映射 + 裸编码手填 + MENU_PERMISSION_DENIED」
> 验证：Web tsc 0 · API tsc 0 · scope-audit 0 裸字段　日期：2026-06-11

---

## 1. 审计（先找问题）

逐模块扫描所有新增/编辑抽屉表单，按"裸 `<input>` 写主数据编码 / 硬编码 `<select>` 枚举 / 名称手填"分类，发现 3 类问题 + 1 个权限 bug：

| 类别 | 表现 | 根因 |
|---|---|---|
| A 自定义手写表单裸 input | 公司/渠道/客户/仓库/库区/供应商编码手填 | 未复用 MasterDataSelectors |
| B CrudForm 配置 type:"text" | 本应是 sku/warehouse/user/批次/字典却配成纯文本 | 配置欠债 |
| C 主数据档案页全是裸 input | 14 个档案页 company_code/manager 等不能下拉 | **引擎 MasterDataRuntimePanel 只渲染 select/text/number/date，不支持选择器 type** |
| D 价格页 403 | 销售角色打开报 MENU_PERMISSION_DENIED | 角色漏授 MENU_SALES2_PRICE |

**根因定级**：C 是系统性根因——一处引擎不支持选择器，拖累所有共用它的档案页。治本 = 升级引擎一次，惠及全部档案页。

---

## 2. 改造（主数据映射）

### 引擎升级（治本）
- **MasterDataRuntimePanel**：MdField.type 扩展支持 `company/customer/supplier/project/warehouse/zone/location/sku/user/farm` 10 种选择器 + `readonly`；新增 `onPickKeys`（选中自动带出名称）、`filterBy`（公司/仓库/库区级联）。onChange/onPick 均改函数式 setState，避免选择器内连续调用导致名称带出被覆盖。
- **CrudForm**：FieldType 新增 `batch`（批次选择器）。

### 页面接线（B+A+C）
| 模块 | 页面 | 字段 → 选择器 |
|---|---|---|
| 销售 | sales2/pricing | 公司(company,带出名称)/渠道(channel)/客户(customer) |
| 销售 | sales2/customers | 公司/渠道，公司名带出 |
| 采购 | procurement2/suppliers | 归属公司(company)/项目(project)，名称只读带出 |
| 财务 | finance2/cash-accounts | 公司(company)，公司名只读 |
| 仓储 | warehouse/locations | 仓库(warehouse)+库区(zone,级联) |
| 仓储 | warehouse/zones | 所属仓库(warehouse) |
| 质检 | quality/product | SKU(sku)+检验员(user)+批次(batch) |
| 质检 | quality/backward | SKU+仓库+库位(级联)+批次 |
| 质检 | quality/nonconformance | 处理人(user)+批次(batch) |
| 养殖 | breeding/flock | 引种来源 → 供应商(supplier) |
| 主数据 | cash-accounts 档案 | 公司+公司名只读+币种字典 |
| 主数据 | customers 档案 | 公司+区域字典(SAL_REGION) |
| 主数据 | suppliers 档案 | 国家字典(SYS_COUNTRY)+币种字典(SYS_CURRENCY) |
| 主数据 | warehouses 档案 | 公司+仓库经理(user) |
| 主数据 | projects 档案 | 公司+场区(farm) |

### 新建组件
- **BatchSelector**（前端）+ 后端 `GET /api/lookup/batches`（读 inv_batches，qty_available>0，LIMIT 500）。

---

## 3. 字典映射（新增）

migration：`apps/api/migrations/20260611_g83_drawer_field_dict_seed.sql`（幂等 NOT EXISTS）

| dict_type | 用途 | 项 |
|---|---|---|
| SAL_REGION | 客户区域 | 老挝(万象/沙耶武里/波利坎赛/会晒/琅勃拉邦/其他)+中国+泰国+其他 |
| WMS_ZONE_TYPE | 库区类型 | 常温/冷藏/冷冻/暂存/退货/隔离待检 |

复用既有字典：SYS_CURRENCY（币种）、SYS_COUNTRY（国家）、SAL_CUSTOMER_TYPE。

---

## 4. 权限修复（D）

migration：`apps/api/migrations/20260611_g83_sales2_price_menu_grant.sql`（幂等）
- 数据驱动：凡持有 `MENU_SALES2_ORDER` 但缺 `MENU_SALES2_PRICE` 的角色，补授 `V,C,E`（不含 D/A/X，保守）。
- admin（`*`）不受影响；受影响角色经 perms_version 机制在下次请求/重登生效。

---

## 5. 字段统计 / 验证

- 治理页面：15 个前端页 + 2 个共享引擎组件
- 新建：BatchSelector（前端）+ /lookup/batches（后端）+ 2 张迁移
- 裸字段消除：company/customer/supplier/channel/warehouse/zone/location/sku/user/farm/batch/currency/country/region/zone_type 共 15 类
- **Web tsc 0 errors · API tsc 0 errors · scope-audit 15 页 0 裸 input**

---

## 6. 仍未覆盖（如需可另起）

- 各档案页的 *_type 业务枚举（supplier_type/warehouse type/project_type）仍为硬编码 select，未字典化（非本轮 P0）。
- 历史自由文本值（如旧 source/region 文本）不会自动回填为 code，下拉中显示空属预期治理迁移效果，需要时另做数据回填。
