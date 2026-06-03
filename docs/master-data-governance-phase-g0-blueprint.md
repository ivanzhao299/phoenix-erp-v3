# 主数据治理蓝图 Phase G0

> **日期**：2026-06-03 · **性质**：纯审计与蓝图设计，不改代码
> **审计方法**：Workflow 4 路并行扫描（主数据表/数据字典/编码规则/表单字段）

---

## 0. 核心结论

> **Phoenix ERP V3 已建立业务链路，但主数据治理存在三类根本问题：①大量 A 类主数据字段仍为裸 input（约 48 个）；②10+ 个枚举在前后端多处重复定义且值域不一致；③主数据编码规则混乱（格式并存、时间戳替代序号、版本号暴露）。** 本蓝图提出系统性治理路线。

---

## 1. 当前问题判断

| 问题类型 | 严重程度 | 典型案例 |
|---------|---------|---------|
| A 类主数据裸填（应选择却变成文本框）| 🔴 高 | 付款单：公司、收款方、付款账户、股东 ID 均为裸 input |
| 枚举多处重复定义（前端/后端/DB 不一致）| 🔴 高 | 供应商类型：前端 FEED/EQUIPMENT vs 后端 LOCAL/OVERSEAS——语义完全分裂 |
| 编码规则混乱（时间戳替代序号，并发重号风险）| 🟠 中 | PKG-/GRD-/WH- 用时间戳尾6位，同毫秒并发即重号 |
| 主数据只有只读查询页，无创建/审批能力 | 🟠 中 | 客户、供应商、现金账户均无前端新增/审批入口 |
| 数据字典 CRUD 页缺失 | 🟡 低 | sys_dict 有两个只读页，无法通过前端新增字典项 |

---

## 2. 主数据对象清单（25 类）

| 对象名 | 当前表 | 前端维护页面 | CRUD 能力 | 被业务引用 | 治理级别 |
|--------|--------|------------|---------|-----------|---------|
| 客户 | sal_customers | master-data/customers | 仅只读 | 销售订单/发货单/AR | 集团 |
| 供应商 | prc2_suppliers | master-data/suppliers | 仅只读 | 采购订单/AP | 集团 |
| 股东 | shr_shareholders | shareholders（子页面） | CRUD | 股东增资/付款单 | 集团 |
| 项目公司 | shr_projects | master-data/projects | 仅只读 | 采购申请/付款单 | 集团 |
| 公司/组织 | org_units | master-data/companies | 仅只读 | 几乎所有业务单据 | 集团 |
| 现金账户 | fin_cash_accounts | master-data/cash-accounts | 仅只读 | 报销/股东增资/POS | 集团 |
| 销售渠道 | sal_channels | sales2/channels | 仅只读 | 销售订单 | 公司 |
| 门店/POS | sys_store | master-data/stores（占位）| 开发中 | 门店销售 | 公司 |
| 商品SKU | product_skus | master-data/product-skus | **完整CRUD** | 库存批次/销售 | 公司 |
| 商品等级 | product_grades | master-data/product-grades | **完整CRUD** | SKU | 公司 |
| 包装规格 | packaging_specs | master-data/packaging-specs | **完整CRUD** | SKU | 公司 |
| 产品主数据 | mst_products | master-data/products（占位）| 开发中 | SKU | 公司 |
| 仓库 | wms_warehouses | master-data/warehouses | 仅只读 | 库区/库存 | 公司 |
| 库区 | wms_zones | 无独立页面 | **无前端维护** | 货位 | 部门 |
| 货位 | wms_locations | 无独立页面 | **无前端维护** | 库存 | 部门 |
| 农场 | brd_farms | master/farms | **完整CRUD** | 鸡舍/鸡群 | 公司 |
| 鸡舍 | brd_houses | breeding/henhouse | **完整CRUD** | 鸡群 | 部门 |
| 鸡群 | brd_flocks | breeding/flock | C/RU（无删除） | 养殖日报 | 部门 |
| 司机 | log_drivers（DB表名不一致）| master-data/drivers | 仅只读 | 发货单 | 部门 |
| 车辆 | **DB表不存在** | master-data/vehicles | 仅只读 | 发货单 | 部门 |
| 用户 | sys_user | settings/users | **完整CRUD** | 角色/权限 | 集团 |
| 角色 | sys_role | settings/roles | **完整CRUD** | 菜单权限 | 集团 |
| 数据字典 | sys_dict | master-data/dictionaries | **仅只读** | 包装/养殖枚举 | 集团 |
| 入库来源模式 | inv_source_mode | 无独立页面 | **无前端维护** | 养殖入库 | 公司 |
| 数据权限集 | DataScope | settings/data-scopes | **完整CRUD** | 所有业务模块 | 集团 |

**关键缺口**：
- 5 类主数据只有只读查询，无新增/审批（客户、供应商、现金账户、项目公司、销售渠道）
- 2 类主数据无前端维护入口（库区/货位）
- 1 类 DB 表实际不存在（车辆）
- 数据字典无 CRUD 页

---

## 3. 数据字典现状与建议

### 3.1 已在 sys_dict 的类型（集中在包装/养殖）

| 模块 | dict_type 数量 | 代表类型 |
|------|-------------|---------|
| 包装（PKG_）| 9 个 | PKG_EGG_GRADE、PKG_SHIFT、PKG_ANOMALY_REASON 等 |
| 养殖（BRD_）| 6 个 | BRD_HOUSE_TYPE、BRD_BREED_TYPE、BRD_VACCINE_TYPE 等 |
| 销售（SAL_）| 3 个（占位未用）| SAL_RETURN_REASON、SAL_VOID_REASON、SAL_DISCOUNT_TYPE |

### 3.2 前端硬编码枚举（问题清单）

| 枚举名 | 出现位置 | 重复次数 | 最严重问题 |
|--------|---------|---------|----------|
| 货币 (CURRENCY_OPTS) | payments/suppliers/requests/orders | 4 处 | 值域不一致（部分有 VND，部分无）|
| 客户类型 | customers + 后端 dto | 3 处 | 3 处重复，中文标签缺失 |
| 费用类型 | expenses + reports | 2 处 | 两页不同步风险 |
| 资金性质 | payments + shareholder-funds | 2 处 | 字段名不同（OPTS vs LABELS）|
| 供应商类型 | 前端 FEED/EQUIPMENT | 与后端 LOCAL/OVERSEAS 完全语义分裂 | **最严重** |
| 采购类型 | requests + orders | 2 处 | 重复定义 |
| 付款方类型 | payments（前端）+ dto（后端）| 同值，未 API 化 | — |
| 国家代码 | suppliers + orders | 2 处 | 值域不完全一致 |

### 3.3 建议迁入 sys_dict 的枚举（按优先级）

| 优先级 | 建议键 | 中文含义 | 迁移理由 |
|--------|--------|---------|---------|
| **P1** | SYS_CURRENCY | 货币代码 | 4 处不一致，最高频跨模块 |
| **P1** | SAL_CUSTOMER_TYPE | 客户类型 | 3 处重复，有中文翻译需求 |
| **P1** | FIN_EXPENSE_TYPE | 费用类型 | 业务人员会增减，两页不同步风险 |
| **P1** | PRC_PAYMENT_METHOD | 付款方式 | 跨模块引用，可能新增支付方式 |
| **P1** | FIN_FUND_NATURE | 资金性质 | 多模块引用，需统一 |
| **P2** | SAL_CUSTOMER_RISK | 客户信用风险等级 | 有翻译需求 |
| **P2** | PRC_PAYER_TYPE | 付款方类型 | 有中文翻译需求 |
| **P2** | PRC_PURCHASE_TYPE | 采购类型 | requests/orders 均使用 |
| **P2** | SYS_COUNTRY | 国家代码 | 跨页不一致 |
| **P3** | PRC_QUALITY_STATUS | 收货质检结果 | 值域极稳定（3个值），优先级低 |

> **特别问题**：供应商类型前端为品类维度（FEED/EQUIPMENT），后端为地域维度（LOCAL/OVERSEAS）——需先通过业务澄清是两个独立字段还是合并，再决定迁移方案。

---

## 4. 编码规则审计与统一建议

### 4.1 主数据编码（静态）

| 对象 | 当前样例 | 核心问题 | 建议规则 |
|------|---------|---------|---------|
| 客户 | CUS-MS-D-001 / CUS-MS-KA-003 | 含地区+渠道业务语义；手工与自动两套格式并存 | `CUS-{YYMM}-{seq4}`，地区/渠道存字段 |
| 股东 | SHR-ZHAO-YONGWEI | 含真实姓名拼音（最长 18 字符），姓名变动无法对应 | `SHR-{seq3}` 如 SHR-001 |
| 项目公司 | SHR-MENGSAI-LAYER | 前缀 SHR 与股东混淆，含地点+业务类型 | `PRJ-{seq3}` 如 PRJ-001 |
| 农场 | FARM-01 / FARM-MS / FARM-DP | 两种格式（序号型 vs 地点缩写型）并存 | `FRM-{seq2}` 如 FRM-01 |
| 鸡舍 | A001 / H-01 | 同系统两种格式，不带父实体前缀 | `{FARM_CODE}-H{seq2}` 如 MS-H01 |
| 鸡群 | FLK-A001-2026 | 含年份，同鸡舍同年只能有一批次 | `FLK-{house_code}-{YYMM}` |
| 商品SKU | SKU-AA-1 / SKU-A-30 | 含等级+规格业务属性，spec=1 代表散装含义不明 | `SKU-{seq4}` 如 SKU-0001，等级/规格存字段 |

### 4.2 单据编码（自动生成）

| 对象 | 当前样例 | 严重问题 | 建议 |
|------|---------|---------|------|
| 销售订单 | SO-20260601-00001 | 演示数据 SO-DEMO-001 与生产格式不一致；seq 用 COUNT(*)，并发重号风险 | `SO-{YYYYMMDD}-{seq5}`，用 advisory lock |
| 发货单 | DV-{YYYYMMDD}-{seq4} | seq 4 位与销售订单 5 位不一致 | 改为 `DV-{YYYYMMDD}-{seq5}` |
| 退货单 | RET-{YYYYMMDD}-{seq5} | RET 三字母，其他均两字母 | `SR-{YYYYMMDD}-{seq5}` |
| **应收发票** | AR-{YYYYMMDD}-(sales-v2) / AR-{YYYYMM}-(finance-v2) | **严重冲突：两路按不同粒度生成 AR 号，写同一张表** | 统一入口，或前缀分开：销售 AR 用 `SAR-`，手工 AR 用 `MAR-` |
| **包装记录** | PKG-{YYYYMMDD}-{时间戳后6位} | **时间戳非幂等，同毫秒并发重号** | `PKG-{YYYYMMDD}-{seq4}`，改用 DB 序列 |
| 采购订单 | PO2-{YYYYMMDD}-{seq5} | 含版本号"2"，用户可见编码含迭代痕迹 | `PO-{YYYYMMDD}-{seq5}` |
| 采购收货 | RCV2-{YYYYMMDD}-{seq} | 含版本号"2" | `GR-{YYYYMMDD}-{seq5}`（Goods Receipt）|
| 付款单 | PAY2-{YYYYMMDD}-{seq} | 含版本号"2" | `PAY-{YYYYMMDD}-{seq5}` |
| 库存批次 | EGG-{YYYYMMDD}-{seq5} | 含业务类型 EGG，扩产品线无法复用 | `INV-{YYYYMMDD}-{seq5}` |

**编码原则（规范化后统一执行）**：
- 编码终身不变，名称可变
- 编码不含可变业务语义（人名、地名、等级、规格）
- 自动生成序号用 DB advisory lock 或序列表，禁用时间戳替代
- 主数据用短纯序号（SHR-001），单据含日期前缀（SO-YYYYMMDD-00001）
- 前缀统一两字母，退货单 SR/采购收货 GR/发货单 DV

---

## 5. 主数据生命周期设计

### 5.1 需要审批的主数据

| 主数据 | 原因 | 审批状态机 | 审批角色 |
|--------|------|-----------|---------|
| 供应商 | 涉及付款，防虚假供应商 | 草稿→审核中→已激活→已冻结→已归档 | 采购主管→财务总监 |
| 客户 | 涉及信用额度和赊账政策 | 草稿→审核中→已激活→信用冻结→已归档 | 销售主管→财务总监 |
| 现金账户 | 涉及真实银行账户，变更需双人授权 | 草稿→待确认→已激活→已停用 | 财务总监→CEO |
| 股东 | 涉及资本结构，需法律文件 | 草稿→审核中→已激活→已退出 | CEO |
| 项目公司 | 涉及资本分配，需董事会授权 | 草稿→审核中→运营中→已关闭 | CEO/董事会 |

### 5.2 可直接维护（无需审批）

农场/鸡舍/鸡群（养殖管理员）、仓库/库区/货位（仓储管理员）、商品 SKU/等级/规格（产品管理员）、销售渠道（销售主管）、用户/角色（系统管理员）、数据字典（系统管理员，有保护规则）

### 5.3 统一状态机（供应商/客户通用）

```
DRAFT → PENDING_APPROVAL → ACTIVE → FROZEN → ARCHIVED
          ↓ 拒绝
       REJECTED → 修改后重提交 → PENDING_APPROVAL
```
**禁止物理删除已被业务单据引用的主数据。**

---

## 6. 角色权限设计

### 6.1 建议新增角色（不含现有角色）

| 角色代码 | 名称 | 职责 |
|---------|------|------|
| MASTER_DATA_ADMIN | 主数据管理员 | 集团级主数据新增/修改/提交审批 |
| FINANCE_DIRECTOR | 财务总监 | 供应商/客户/账户终审 |
| PROCUREMENT_MANAGER | 采购主管 | 供应商初审 |
| SALES_MANAGER | 销售主管 | 客户初审、渠道维护 |
| BREEDING_ADMIN | 养殖管理员 | 农场/鸡舍/鸡群 |
| WAREHOUSE_ADMIN | 仓储管理员 | 仓库/库区/货位 |
| PRODUCT_ADMIN | 产品管理员 | SKU/等级/规格/产品主数据 |

### 6.2 权限矩阵（核心摘要）

| 主数据 | 只能引用角色 | 可维护角色 | 可审批角色 |
|--------|------------|----------|----------|
| 客户 | 普通业务人员 | MASTER_DATA_ADMIN, SALES_MANAGER | FINANCE_DIRECTOR |
| 供应商 | 普通业务人员 | MASTER_DATA_ADMIN, PROCUREMENT_MANAGER | FINANCE_DIRECTOR |
| 股东/项目 | 普通业务人员 | — | CEO |
| 现金账户 | 普通业务人员 | MASTER_DATA_ADMIN | FINANCE_DIRECTOR, CEO |
| SKU/等级/规格 | 普通业务人员 | PRODUCT_ADMIN | — |
| 农场/鸡舍/鸡群 | 普通业务人员 | BREEDING_ADMIN | — |
| 仓库/库区/货位 | 普通业务人员 | WAREHOUSE_ADMIN | — |
| 用户/角色/字典 | 所有人（只读）| SYSTEM_ADMIN | — |

**原则**：普通业务人员只能选择 `ACTIVE` 状态的主数据；新增主数据必须走权限或审批流。

---

## 7. 维护责任分工

| 负责人角色 | 主数据对象 | 维护场景 | 频率 |
|-----------|-----------|---------|------|
| 主数据管理员 | 客户、供应商、渠道 | 新合作商申请、信息变更、归档 | 每周 |
| 财务总监 | 现金账户、供应商(终审)、客户信用 | 开户审批、供应商资质 | 按需 |
| 销售主管 | 客户(初审)、渠道调整 | 客户准入 | 按需 |
| 采购主管 | 供应商(初审) | 供应商资质初审 | 按需 |
| 养殖管理员 | 农场/鸡舍/鸡群 | 新批次建立、日常入栏 | 每日/按需 |
| 仓储管理员 | 仓库/库区/货位 | 仓库扩建、货位调整 | 月度 |
| 产品管理员 | SKU/等级/规格/产品 | 新品上市、规格调整 | 月度 |
| CEO | 股东/项目公司(终审) | 引入新股东、设立项目 | 季度 |
| 系统管理员 | 用户/角色/菜单/字典 | 员工入离职、权限调整 | 每周 |

---

## 8. 表单字段数据源映射规则

### 8.1 付款单完整字段映射

| 字段 | 类型 | 当前实现 | 正确数据来源 | 改造方案 | G1 优先级 |
|------|------|---------|------------|---------|----------|
| 付款日期 | B | date input | 手填 | 保持 | — |
| 货币 | B | 静态 select（4 处不一致）| sys_dict(SYS_CURRENCY) | 接 dict API | P1 |
| **公司代码** | **A** | 裸 input | org_units(COMPANY 类型) | `CompanySelector`，联动公司名称 | **P0** |
| **公司名称** | **C** | 裸 input | 由公司代码联动带出 | readOnly 联动字段 | **P0** |
| 项目 | A ✅ | 已接 shr_projects API | shr_projects | 已完成 | — |
| 项目名称 | C ✅ | readOnly 联动 | 由项目带出 | 已完成 | — |
| 付款方类型 | B | 静态枚举 | 保持/迁 sys_dict | P2 | P2 |
| **付款人** | **A** | 裸 input | 按类型：股东→shr_shareholders；员工→sys_user | 条件渲染 Selector | **P0** |
| **付款账户** | **A** | 裸 input | fin_cash_accounts | `CashAccountSelector`，按公司过滤 | **P0** |
| **收款方（供应商）** | **A** | 裸 input | prc2_suppliers | `SupplierSelector`，searchable | **P0** |
| 收款账户 | A | 裸 input | 供应商银行账户（待建）| P1 | P1 |
| 付款方式 | B | 静态枚举 | sys_dict(PRC_PAYMENT_METHOD) | 迁 dict | P1 |
| 资金性质 | B | 静态枚举 | sys_dict(FIN_FUND_NATURE) | 迁 dict | P1 |
| **股东 ID** | **A** | 裸 input | shr_shareholders | `ShareholderSelector`，仅 SHAREHOLDER 类型显示 | **P0** |
| **股东姓名** | **C** | 裸 input | 由股东选择带出 | readOnly 联动 | **P0** |
| 汇率 | B | number input | 汇率表（待建）或手填 | 保持，货币联动默认值（P2）| P2 |
| **凭证 URL** | **D** | 裸 input 文本框 | 文件上传系统 | `AttachmentUploader`（design-system 已有）| **P0** |
| 备注 | E | textarea | 手填 | 保持 | — |
| 分摊-应付单号 | C ✅ | readOnly 弹窗选入 | 由弹窗选择 | 已完成 | — |
| **分摊-采购订单号** | **A** | 裸 input | prc2_purchase_orders | PO 搜索 Selector | P1 |
| **分摊-项目** | **A** | 裸 input | shr_projects | 复用 ProjectSelector | P1 |

**付款单 P0 改造项：6 个**（公司、付款人、付款账户、收款方、股东、凭证URL）

### 8.2 其他关键表单汇总（裸字段清单）

| 表单 | A 类裸字段 | 数量 |
|------|-----------|------|
| AR 新建发票 | 公司代码、客户名称 | 2 |
| AP 新建发票 | 公司代码、供应商名称 | 2 |
| 费用申请 | 公司代码、公司名称 | 2 |
| 采购订单 | 公司代码/名称、项目编码/名称、供应商代码/名称、仓库代码 | 7 |
| 采购申请 | 公司代码/名称、项目编码/名称 | 4 |
| 配送单新建 | 司机姓名、车牌号、公司代码、路线名称 | 4 |
| POS 门店设置 | 门店编码、公司编码 | 2 |
| 股东出资记录 | 股东（子页面已实现选择，较好）| — |

---

## 9. 统一表单组件设计规范

**需要建立**（放入 `apps/web/src/components/shared-selectors/`）：

| 组件 | 数据来源 | DataScope | 说明 |
|------|---------|----------|------|
| `CompanySelector` | `/api/org/organizations?orgType=COMPANY` | ✅ 用户有权范围 | 单公司用户自动预填锁定 |
| `SupplierSelector` | `/api/v2/procurement/suppliers` | ✅ company_code | searchable，code→name |
| `CustomerSelector` | `/api/v2/sales/customers` | ✅ company_code | searchable |
| `ShareholderSelector` | `shareholderApi.listShareholders()` | — | 仅 SHAREHOLDER 付款方类型显示 |
| `CashAccountSelector` | `/api/v2/finance/cash/accounts` | ✅ company_code | 带出账户名/币种/余额 |
| `ProjectSelector` | `shareholderApi.listProjects()` | ✅ company_code | 付款单已实现，抽成通用组件 |
| `WarehouseSelector` | `/api/crud/wms_warehouses` | ✅ company_code | — |
| `UserSelector` | 已在 design-system 存在 | — | 直接复用 |
| `DriverSelector` | `/api/v2/sales/delivery/drivers` | ✅ company_code | — |
| `VehicleSelector` | `/api/v2/sales/delivery/vehicles` | ✅ company_code | — |
| `DictSelect` | `/api/crud/sys_dict?dict_type=XXX` | — | 通用字典下拉 |
| `AttachmentUploader` | 已在 design-system 存在 | — | 直接复用，凭证 URL 改造 |

**所有 Scoped 组件必须**：只展示 `status=ACTIVE` 的主数据；支持 DataScope 过滤；返回标准对象（code + name），不只返回字符串；支持搜索和分页。

---

## 10. 数据质量中心设计

**建议 Master Data Quality Dashboard 检查项**：

| 检查项 | 触发时机 | 业务影响 |
|--------|---------|---------|
| 重复供应商（名称相似）| 每日 | 付款分散/应付对账困难 |
| 重复客户（联系电话重复）| 每日 | 应收账款归集错误 |
| 缺银行账户供应商 | 实时 | 无法发起付款 |
| 缺信用额度客户 | 实时 | 信用管控失效 |
| 被引用但已冻结主数据 | 实时 | 业务单据异常 |
| 长期未使用主数据 | 月度 | 数据冗余，建议归档 |
| 股东无绑定用户账号 | 实时 | 无法登录查看驾驶舱 |
| 未审核/草稿主数据 | 实时 | 未激活主数据不可被引用 |

---

## 11. 初始化顺序（正式上线前）

```
1. 公司/组织（org_units）
2. 角色（sys_role）→ 用户（sys_user）→ 角色绑定 → DataScope
3. 数据字典（sys_dict）— 货币、费用类型、付款方式等
4. 主数据编码规则确认（按本蓝图规范）
5. 场站/鸡舍/鸡群（brd_farms/houses/flocks）
6. 客户/经销商/门店（sal_customers/channels/stores）
7. 供应商（prc2_suppliers）
8. 产品/SKU/包装规格（product_grades/specs/skus）
9. 仓库/库区/货位（wms_warehouses/zones/locations）
10. 银行账户/现金账户（fin_cash_accounts）
11. 股东档案/范围（shr_shareholders/projects/scopes）
12. 期初库存（inv_batches — PACKAGING_INBOUND）
13. 期初应收应付（fin_ar_invoices/ap_invoices）
14. 开始业务录入
```

**禁止**：在步骤 1–11 完成前直接导入业务单据。

---

## 12. G1–G7 实施路线

| 阶段 | 目标 | 关键交付 | 先决条件 |
|------|------|---------|---------|
| **G1** 主数据中心建设 | 补齐主数据 CRUD 页面（客户/供应商/账户/字典） | 客户 CRUD + 供应商 CRUD + 现金账户 CRUD + sys_dict CRUD | G0 蓝图确认 |
| **G2** 数据字典中心 | 迁入 P1 级 5 个枚举，建立统一 DictSelect 组件 | 货币/客户类型/费用类型/付款方式/资金性质 进 sys_dict + DictSelect 组件 | G1 字典 CRUD |
| **G3** 主数据生命周期与审批 | 供应商/客户/账户新增走审批流 | DRAFT→PENDING→ACTIVE 状态机 + 审批 Workflow 接入 | G1 + 审批引擎 |
| **G4** 付款单主数据驱动 | 付款单 6 个 P0 裸字段改造 | CompanySelector/SupplierSelector/CashAccountSelector/ShareholderSelector/AttachmentUploader | G1+G2 |
| **G5** 采购/销售/财务表单改造 | 其他表单 A 类裸字段改造（约 23 个）| 各模块 Selector 组件集成 | G1+G2+G4 |
| **G6** 编码规则修复 | 修复高危编码问题（PKG时间戳/AR冲突/PO2前缀）| 迁移 + 兼容旧码展示 | G1-G5 稳定 |
| **G7** 数据质量中心 | 上线 Master Data Quality Dashboard | 重复检测/缺漏警告/被冻结引用告警 | G1-G6 |

---

## 必须回答

1. **当前系统有哪些主数据对象**：25 类（详见第 2 章），治理级别分集团/公司/部门三层。

2. **哪些字段仍然裸填**：约 48 个 A 类主数据裸字段，最严重为付款单（9 个）和采购模块（11 个）。

3. **哪些数据应该进入数据字典**：P1 级 5 个（货币/客户类型/费用类型/付款方式/资金性质），P2 级 4 个。

4. **哪些主数据需要审批**：供应商、客户（含信用冻结）、现金账户、股东、项目公司——5 类涉及付款或资本的主数据必须走审批。

5. **哪些角色负责维护**：MASTER_DATA_ADMIN（日常）、FINANCE_DIRECTOR（终审）、PROCUREMENT_MANAGER/SALES_MANAGER（初审）、各专业 ADMIN（养殖/仓储/产品）、SYSTEM_ADMIN（系统级）。

6. **哪些角色只能引用**：普通业务人员（销售代表/采购员/仓管员/包装工人等）只能选择 `ACTIVE` 状态主数据，不得直接创建供应商/客户/账户。

7. **付款单字段如何映射**：见第 8.1 章完整映射表。P0 改造项：公司→CompanySelector、付款人→按类型条件渲染、付款账户→CashAccountSelector、收款方→SupplierSelector、股东ID/姓名→ShareholderSelector+联动readOnly、凭证URL→AttachmentUploader。

8. **是否允许进入 G1**：🟢 **允许**。G0 已明确：25 个主数据对象清单、12 个枚举迁移优先级、完整编码规则问题清单、48 个裸字段位置、5 类需审批主数据、角色权限矩阵、初始化顺序。G1 从补齐客户/供应商/账户 CRUD + sys_dict CRUD 开始。
