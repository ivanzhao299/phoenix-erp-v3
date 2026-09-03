# 主数据中心 9 页公司/类型显示缺陷核查（2026-09-03）

> 性质：核查轮，只读取证，零业务实施。本文的实施方案须经复核并由用户确认后才可执行。
>
> 用户验收口径：公司统一显示“公司名称（公司编码）”；类型随 `zh/en/lo` 界面语言显示，未知值保留原码。`sys_organizations` 真实只有基础名 `org_name` 与中文名 `org_name_cn`，不得伪造英文或老挝文公司名。

## 1. 结论摘要

用户报告的 9 页缺陷均能由当前源码解释，不是单纯的浏览器缓存问题：

1. 八个涉及公司的页面中，列表和详情都直接渲染 `company_code`；通用 Runtime 的列表/详情是 `SELECT *`，没有 JOIN `sys_organizations`，因此多数表根本拿不到公司名称。
2. 项目、供应商、仓库、资金账户的“类型”列表/详情均直接显示原码。表单虽有中文 option，但它只解决当前中文表单，不能让列表/详情随 locale 切换。
3. 供应商本轮期望只涉及类型。其真实归属模型是 `shared_scope + owner_company_code/name`，主数据 Runtime 当前未接入；不能为了“九页统一”臆造一个 `company_code`。
4. 类型不能直接一律改成 `sys_dict`：四个目标类型目前都没有已核实的对应字典，且项目、供应商、仓库、资金账户均存在不同程度的历史值域漂移。安全的显示层先采用“已知值 locale formatter，未知值原码”；字典化和数据清洗应作为后续独立治理。
5. 全站已有 `formatMasterData()` / `masterNameWithCode()`，无需另建一套平行格式规范；但建议增加很薄的共享 company adapter，统一识别 Runtime 返回的公司展示字段并调用既有 formatter。
6. 历史 UIX/G55/G83/i18n/UAT 轮都曾触碰这些页面，但没有覆盖本轮“列表/详情公司双显、类型随语言”的精确断言；不得据此把本缺陷标成已修。
7. 另外发现两个不应静默混入显示补丁的缺陷：司机页前端 `codeKey="driver_name"` 与后端主键 `driver_code` 再次错配；车辆类型生产/历史数据允许中文自由文本，而当前表单只提供四个英文码。二者应在实施前纳入明确决策与回归。

## 2. 共性渲染链与根因

### 2.1 列表

`MasterDataRuntimePanel` 的列定义只有 `{ key, label }`，见 `apps/web/src/components/master-data/MasterDataRuntimePanel.tsx:44-51`。实际单元格在同文件 `352-361` 直接读取 `r[c.key]`；只有列对应表单字段设置了 `dictType` 时才通过 `codeMap` 转译。

因此：

- `company_code` 没有统一名称 lookup/formatter，必然显示编码；
- 项目/供应商/仓库/资金账户的类型字段没有 `dictType`，必然显示原码；
- 表单里的静态 option label 不会自动作用于列表。

### 2.2 表单

通用表单只有字段声明 `type: "company"` 时才渲染 `CompanySelector`，否则落到普通文本框，见 `MasterDataRuntimePanel.tsx:82-127`。当前项目、客户、仓库、资金账户已接 selector；门店、司机、车辆、银行账户仍是普通 input。

`CompanySelector` 调 `/api/lookup/companies`，读取真实 `orgName/orgNameCn`，但当前 label 仅为 `orgNameCn || orgName`，没有编码双显，见 `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:146-158`。

### 2.3 详情

通用详情抽屉在 `apps/web/src/components/master-data/MasterDataDetailDrawer.tsx:154-165` 直接读取 `info[f.key]`；KPI 配置也直接使用 `info.company_code` 或类型原值。独立客户/供应商详情页同样直读字段。因此 selector 在表单中显示了名称，不能证明详情已修。

### 2.4 API

主数据 Runtime 类型配置位于 `apps/api/src/modules/master-data/master-data-runtime.service.ts:79-190`。列表为 `SELECT * FROM <table>`（`538-549`），详情为 `SELECT * ... WHERE code = $1`（`575-588`）；`companyCol` 只用于 DataScope，不会展开名称。

已有销售查询的可靠关联口径是：公司组织需满足 `org_type='COMPANY'`，业务 `company_code` 对应 `COALESCE(sys_organizations.company_code, sys_organizations.org_code)`；例如 `apps/api/src/modules/sales-v2/services/sales-orders.service.ts:229-232`。实施不能只按 `org_code` 猜测 JOIN。

## 3. 9 页逐页核查

| 页 | 列表当前实际渲染 | 表单当前实际渲染 | 详情当前实际渲染 | 接口名称能力 | 判定、根因与最小改法 |
|---|---|---|---|---|---|
| 项目档案 | `company_code`、`project_type` 原值，`projects/page.tsx:42-45` | 公司已是 `type:"company"`；类型为四项静态 select，`:23-33` | `company_code`、`project_type` 及 KPI 公司均原值，`detail-configs.tsx:327-350` | `biz_projects` 无公司名称列；Runtime 无 JOIN，配置见 service `94-102` | **缺陷确认**。列表/详情公司走共享双显；项目类型走 locale formatter，未知码原样。表单 option 同源 formatter，不能保留孤立中文常量。 |
| 客户档案 | 公司列为 `company_code`，`customers/page.tsx:27-42`；客户类型已挂 `SAL_CUSTOMER_TYPE` 字典 | 公司已是 selector，并尝试带出 `company_name`，`customers/_fields.ts:4-16` | 独立详情及抽屉均显示 `company_code`；独立详情头部还直显 `customer_type`，`customers/[code]/page.tsx:172-187,301-307` | `sal_customers` 有可为空的 `company_name`，Runtime `SELECT *` 会带出，但可能陈旧/NULL；专用 CustomersService 另有 JOIN `company_name_display`，主数据页未使用 | **缺陷确认**。不能只信冗余 `company_name`；Runtime 返回 canonical 展示名，列表、抽屉、独立详情统一双显。客户类型现有字典路径保留，独立详情也接字典/统一 formatter。 |
| 供应商档案 | `supplier_type` 原值，`suppliers/page.tsx:35-41` | 三项中文静态 select，`suppliers/_fields.ts:7-10` | 基础信息与副标题均为原始 `supplier_type`，`suppliers/[code]/page.tsx:172-188,300-309` | Runtime 配置没有 `companyCol`；实体真实归属为 `shared_scope + owner_company_code/name`，`prc2-supplier.entity.ts:77-99` | **类型缺陷确认**。只修类型显示；不要虚构 `company_code`。先以 formatter 覆盖已知码并保留未知码。归属模型未接 Runtime 是独立治理项。 |
| 仓库档案 | `type`、`company_code` 原值，`warehouses/page.tsx:40-45` | 公司已是 selector；类型为六项中文静态 select，`:27-35` | 类型、公司均原值，`detail-configs.tsx:266-306` | `wms_warehouses` 无公司展示名；Runtime 无 JOIN | **缺陷确认且值域高风险**。公司双显；类型仅显示层 locale 化，不先收窄值域。生产已有 G15/Chanjet 多套值，详见 §5。 |
| 门店档案 | `company_code` 原值，`stores/page.tsx:20-46` | `company_code` 未声明 `type:"company"`，实际普通 input | `company_code` 原值，`detail-configs.tsx:517-524` | `mst_stores` Runtime 配置有 `companyCol`，但无 JOIN，service `128-134` | **缺陷确认**。列表/详情双显；表单换 CompanySelector，保留原 code 写值。`operation_type` 已挂 `STORE_OP_TYPE`，不是本轮类型缺口。 |
| 司机档案 | `company_code` 原值，`drivers/page.tsx:20-38` | 普通 input | KPI 与基础信息均为 `company_code`，`detail-configs.tsx:558-572` | `sal_drivers` 无公司名 JOIN，service `170-175` | **缺陷确认**。列表/详情双显，表单换 selector。另：页面 `codeKey="driver_name"`，后端是 `driver_code`，须作为同批 P0 回归或独立先修，不能忽略。 |
| 车辆档案 | `company_code` 原值，`vehicles/page.tsx:38-43` | 公司普通 input；车辆类型四项静态 select，`:24-35` | 公司原值；KPI 类型也原值，`detail-configs.tsx:593-618` | `sal_vehicles` 无公司名 JOIN，service `177-182` | **公司缺陷确认**。表单换 selector，列表/详情双显。车辆类型虽不在用户本轮“类型”点名内，但详情裸码且存量口径冲突；不应趁机强制迁移。 |
| 资金账户档案 | `company_code`、`account_type` 原值，`cash-accounts/page.tsx:33-39` | 公司 selector + 只读 `company_name`；类型五项中文静态 select，`cash-accounts/_fields.ts:4-22` | KPI 和基础信息均直显公司 code/类型 code，`detail-configs.tsx:396-421` | `fin_cash_accounts` 有冗余 `company_name`，Runtime 无 canonical JOIN | **两项缺陷确认**。公司 canonical 双显；类型复用/扩展既有 finance formatter，未知码原样。不要让冗余名称覆盖组织主档现名。 |
| 银行账户中心 | `company_code` 原值，`bank-accounts/page.tsx:32-38` | 普通 input，`bank-accounts/_fields.ts:4-18` | KPI/基础信息均为 `company_code`，`detail-configs.tsx:445-472` | `fin_bank_accounts` 只有 `company_code`，无 entity、无公司名列；Runtime 无 JOIN，service `136-141` | **缺陷确认**。表单换 selector；Runtime canonical 展开；列表/详情双显。 |

## 4. 公司名称能力与统一方案评估

### 4.1 真实能力

`SysOrganizationEntity` 只有以下可用名称：

- `org_name`：必填基础名称；
- `org_name_cn`：可空中文名称；
- `org_short_name`：可空简称。

证据：`apps/api/src/modules/org/entities/sys-organization.entity.ts:48-61`；组织运行时迁移见 `apps/api/migrations/20260531_org_runtime_phase1.sql:22-31`。没有 `org_name_en` 或 `org_name_lo`，因此英文/老挝文界面必须显示真实基础名（若中文名策略命中则显示中文名），不得翻译、音译或复制字段冒充三语数据。

### 4.2 推荐返回契约

在 `MasterDataRuntimeService` 对配置了 `companyCol` 的类型统一增加只读 projection，原字段保持不变，并新增不会撞到业务冗余列的展示字段：

- `company_display_name` ← `sys_organizations.org_name`；
- `company_display_name_zh` ← `sys_organizations.org_name_cn`；
- `company_code` 继续原样返回。

JOIN 采用已验证的公司身份条件：`org_type='COMPANY' AND COALESCE(company_code, org_code)=base.company_code`。实施前必须确认该等价键不会产生重复；若生产存在重复，查询必须以受约束的唯一选择或先治理数据，不能用不稳定的 `LIMIT 1` 掩盖。

列表与详情都应使用同一 projection；`listActive()` 只返回 selector 的 code/name，不属于这 9 页列表/详情契约，可不扩字段。

### 4.3 推荐前端复用

现有 `formatMasterData(row, nameBase, code, lang)` 已统一执行当前语言→回退名称→编码及“名称（编码）”格式，见 `apps/web/src/lib/business-display.ts:39-40` 与 `apps/web/src/lib/localized-master-data.ts:7-23`。

建议只增加一个薄的 `formatCompany(row, companyCode, lang)` adapter，内部固定调用：

```ts
formatMasterData(row, 'company_display_name', companyCode, lang)
```

这样 9 页不会各自手拼括号/空值，也不会误把业务表中可能陈旧的 `company_name` 当 canonical 名称。`CompanySelector` 的 label 同步改用既有 `masterNameWithCode()` 实现名称（编码）双显。

通用 Runtime 列建议扩展可选 formatter/display kind，而不是在组件里对所有 `key === 'company_code'` 写隐式魔法；明确声明可防其他 code 列被误格式化。详情字段/KPI也应复用同一 adapter。

## 5. 类型枚举真实来源与处理建议

| 类型 | 当前权威/约束 | 已发现真实值域及漂移 | 本轮建议 |
|---|---|---|---|
| 项目 `project_type` | `biz_projects` 为 varchar，注释/页面四值；无对应 sys_dict | 主数据页：`INVESTMENT/OPERATION/COST_CENTER/PROFIT_CENTER`；旧 `shr_projects`、采购 DTO 还有完全不同的两套值域 | 显示层新建 `projectType` locale domain，覆盖主表四值，未知值原码。不要把旧表/DTO 值硬并成同一业务枚举；另开一致性治理。 |
| 供应商 `supplier_type` | varchar nullable，无 CHECK，DTO 只校验 string；无对应 sys_dict | 页面三值 `LOCAL/OVERSEAS/AGENT`；seed 还出现 `RAW_MATERIAL/PACKAGING`，归档代码又有 `FEED/MEDICINE/EQUIPMENT/...` | 优先复核既有 `BUSINESS_ENUMS.procurementSupplierType`，它目前不含页面三值，不能直接套用。建立覆盖已知存量的 locale map，未知值原码；值域清洗后再决定字典化。 |
| 仓库 `type` | varchar，无 CHECK/DTO/sys_dict | 页面六值；G15 七值；Chanjet/生产历史还有 `GENERAL/COLD_STORAGE`，另有 `NULL` | 只做显示层 formatter，必须覆盖至少已核实的真实值且 fallback 原码。不得用页面六值重写存量。仓库类型双维度治理沿用 `docs/ops/warehouse-type-and-permission-research-20260825.md` 的独立决策，不混进本补丁。 |
| 资金账户 `account_type` | DTO/entity/正式 CHECK 为五值 | `BANK/CASH/VIRTUAL/SHAREHOLDER/INTERNAL`；旧 Finance2 UI/seed 另有 `EWALLET/PERSONAL_AGENT` | 新建 `cashAccountType` locale domain或收敛 Finance2 既有 map，至少覆盖五个权威值及可见遗留值；未知值原码。DB/DTO 漂移另开治理。 |

表单静态 option 必须与列表/详情共享同一 label 源，避免“表单中文、列表英文码”的再次分叉。若最终选择 `sys_dict`，需先完成生产字典只读核验、值域裁定、TS 字典迁移（含 `down()`）及存量兼容；本核查不建议在未核验前创建四个新字典。

补充：客户 `customer_type` 已使用 `SAL_CUSTOMER_TYPE`；门店 `operation_type` 已使用 `STORE_OP_TYPE`。二者应继续走字典，不退回本地常量。

## 6. 与既有修复轮的覆盖对照

| 页面 | 已有覆盖证据 | 为什么本轮仍不是重复修 |
|---|---|---|
| 项目/客户/供应商 | UIX-7/UIX-8 产品化；G83 selector/dict；UAT-1/2；2026-06-28 三语提交 `24a15806` | 历史轮覆盖页面结构、Runtime、表单选择器或其他详情缺陷，没有“公司名称（编码）+类型 locale”的列表/详情逐列断言。 |
| 仓库 | G55C 切 Runtime；G83 公司/经理 selector；三语提交；仓库类型专项调研 | 专项调研明确证实值域并存，但没有实施本页类型显示或公司名称 JOIN。 |
| 门店/银行账户 | G55A 时为占位/不存在，G55C 后新建 Runtime；UAT-2 有 API 建档 | API 建档和页面存在不等于显示契约；当前代码仍直显 code，表单仍是普通 input。 |
| 司机/车辆 | G55C 切 Runtime；UAT-1 曾修 PK/不存在日期列；三语提交 | UAT 修的是可用性/schema；当前公司显示仍未展开，而且司机 PK 配置疑似回潮。 |
| 资金账户 | G55C 切 Runtime；G83 selector；三语提交 | 表单已有名称带出，但列表/详情仍读 `company_code/account_type` 原值。 |

历史证据入口：`docs/g55a-master-data-center-full-audit.md:40-52,251-261`、`docs/g55c-master-data-center-completion-and-ux-standardization.md:220-245`、`docs/g83-drawer-field-governance.md:43-47`、`docs/uat1-user-acceptance-test-report.md:50-79`、`docs/uat2-real-operation-acceptance-test.md:41-55`。UIX-9A 曾明确浏览器实测未完成（`docs/uix9a-master-data-productization-final.md:130-155,207-212`），不能作为本轮真实页面 PASS。

## 7. 生产只读抽查

### 7.1 本轮实际完成

- `GET https://erp.eggslao.com/api/health`：HTTP 200，响应确认 `env=production`、`db.connected=true`、`is_production=true`。
- 未认证的主数据业务 GET 返回 401，符合保护预期。
- 本机 3000/3100 无服务，且没有可用生产数据库连接；未尝试任何生产写入。

### 7.2 当前不能冒充完成的部分

本轮最终交付限定为“纯文档 commit”。仓库受控生产只读 workflow 只允许执行已提交到 `scripts/ops/readonly-audits/` 的清单；现有清单没有覆盖这 9 张表，而当前工作机没有 production environment token/DB secret。因此本轮**未取得**九页当前生产 Runtime 响应中的公司名称 NULL、公司 JOIN 命中率、四类类型分布。

上一轮 agent 误跑到库存 9 项的既有审计输出，只能证明受控通道和生产健康，不能作为本轮九页数据证据，本文明确排除该结果。

已有受控历史证据只能辅助说明仓库类型确有多值：`docs/ops/warehouse-type-and-permission-research-20260825.md:142-171` 记录当时生产仓库包含 `GENERAL/RAW_MATERIAL/COLD_STORAGE/EGG_FARM/.../NULL`；它不是 2026-09-03 本轮实时抽样，不能替代实施前复验。

### 7.3 实施前必须补跑的只读清单

经用户确认进入实施轮后，先提交并运行专用只读 SQL/GET manifest，至少输出：

1. 8 个公司维度表各自总行数、`company_code` NULL/空值、对 canonical company JOIN 命中/未命中、重复命中；
2. `sys_organizations` 公司行中 `org_name/org_name_cn` NULL/空值及 `COALESCE(company_code,org_code)` 重复；
3. 项目、供应商、仓库、资金账户及车辆类型的 `value × count`（NULL 单列）；
4. 九个 Runtime GET 响应同时保留 code 和新增 display 字段，且 DataScope 行数不因 LEFT JOIN 改变；
5. checkout/API/Web revision 与错误窗口。

必须继续使用 `.github/workflows/production-readonly-audit.yml` 的连接级只读、`BEGIN TRANSACTION READ ONLY`、GET/HEAD 限制与最终 ROLLBACK；不能把 seed、测试 fixture 或旧报告写成当前生产事实。

## 8. 后端需补清单

1. Runtime service 增加配置驱动的 company display projection，覆盖 `project/customer/warehouse/store/driver/vehicle/cash-account/bank-account` 的 list/get；供应商不套用。
2. 返回独立 `company_display_name/company_display_name_zh`，保留所有原 code；不得覆盖业务表已有 `company_name`。
3. JOIN 必须保持现有 DataScope WHERE 语义；别名全部加表前缀，避免新增 ambiguous column；列表行数、详情越权行为与更新/transition 的 `get()` 复用都要回归。
4. 对 canonical company 等价键做重复保护与契约测试；发现脏数据先报告，不能任意挑一行。
5. 不为显示缺陷新增 entity “未来字段”；projection 使用 raw SQL alias，与 DB 实存列对齐。
6. 类型显示优先前端 locale formatter。本轮不要求后端伪造类型 label；若后续字典化，API 才返回字典 code/label 契约。

## 9. 前端需补清单

1. 增加共享 `formatCompany` adapter，内部复用 `formatMasterData`；Runtime columns/detail fields 支持显式 formatter/display kind。
2. 八页列表、所有通用抽屉、客户/供应商独立详情与 KPI 逐处接入，不能只改表格。
3. 门店、司机、车辆、银行账户表单的 `company_code` 改为 `type:"company"`；项目、客户、仓库、资金账户保留已有 selector。所有公司 selector label 改为名称（编码）。
4. 项目/供应商/仓库/资金账户的 option、列表、详情共用 locale enum source；未知 code 原样。
5. 客户类型继续用 `SAL_CUSTOMER_TYPE`，门店经营类型继续用 `STORE_OP_TYPE`。
6. 司机 `codeKey` 回潮与车辆无效日期字段另列明确修复项；未经确认不把车辆存量类型强改成英文码。

## 10. 实施拆分（待用户确认）

### P0-A：只读生产预检

增加本轮专用 readonly manifest，核实公司等价键、名称 NULL、类型分布和九页响应。若 company 等价键重复或 JOIN 大量未命中，暂停代码实施并先给出数据治理方案。

### P0-B：共享读模型与显示组件

后端一次性补 Runtime canonical company projection；前端补共享 company adapter、column/detail formatter 能力和 CompanySelector 双显。先用 contract tests 锁住“名称与编码同时返回/显示”。

### P0-C：八页公司修复

逐页改列表、表单、详情/KPI；客户的独立详情也必须覆盖。供应商不加入虚构公司列。

### P0-D：四类类型 locale 修复

以已核实值域建立 locale domains，表单/列表/详情同源，未知值原码。仓库和值域治理解耦；不在此阶段做 schema/数据迁移。

### P0-E：伴随缺陷

至少修复或单独阻断司机 `driver_name/driver_code` 错配。车辆类型和无效日期字段先以生产抽查定范围，未经明确裁定不改数据语义。

### P1：类型字典/值域治理（独立审批）

生产分布核实后，再决定项目、供应商、仓库、资金账户是否进 `sys_dict`，并同步 DTO/entity/CHECK/迁移末态/写入路径。仓库类型继续遵守既有 facility/usage/capability 双维度调研，不以显示补丁替代模型决策。

## 11. 测试与防回潮计划

### 11.1 纯函数与组件契约

- `formatCompany`：基础名、中文名、zh/en/lo 回退、空名回退 code、名称（编码）、名称等于编码时不重复。
- 四类 formatter：每个已知 code 在 zh/en/lo 的断言；空值为 `—`；未知值严格返回原码。
- Runtime column/detail config：八页公司列必须声明 company formatter；四页类型列必须声明对应 enum formatter。
- CompanySelector：label 必须同时包含真实名称和编码，`value` 仍是 code。

### 11.2 API 契约

- 八种 Runtime list/get 同时返回原 `company_code` 与 display 字段；无公司匹配时仍返回业务行并回退 code。
- JOIN 前后记录数一致；同 code 跨公司不串名；非全局 DataScope 集合和越权详情 404 行为不变。
- customer/cash-account 业务冗余 `company_name` 不覆盖 canonical display。

### 11.3 locale 浏览器断言

新增 `apps/web/e2e/display-defects-i18n.spec.ts`，对九个 route mock 真实形状的 Runtime/lookup/dict 响应并断言：

- `zh → en → lo → zh` 动态切换后，类型 label 随语言变化；
- 公司因无 en/lo，三种语言均按真实基础/中文回退显示，代码始终保留；
- 列表、表单 selector、详情/KPI分别断言，不能互相替代；
- 异步数据加载后切换语言不残留旧 label；未知 enum 不消失、不被伪译。

现有语言机制与 E2E 模板见 `apps/web/src/contexts/LanguageContext.tsx:45-119`、`apps/web/e2e/sitewide-i18n-hydrator.spec.ts:26-94`。

### 11.4 固定验证

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/web && pnpm test
node scripts/check-i18n-keys.js
node scripts/ci/check-i18n-hardcoded-literals.mjs --fail-on-uncovered
cd apps/api && pnpm test -- --runInBand
cd apps/api && bash test/scope-audit.sh
cd apps/web && npx playwright test e2e/display-defects-i18n.spec.ts
```

生产环境还需用同一只读 manifest 做部署前后对照，验证 revision、JOIN 命中率、响应字段和错误窗口。浏览器 hard refresh 只能作为部署确认，不能替代数据/API契约。

## 12. 等待用户确认

建议下一轮按 **P0-A → P0-B → P0-C → P0-D → P0-E** 执行，P1 类型模型治理继续独立冻结。

## 13. 执行记录（2026-09-03）

用户已确认 9 页方案、司机主键同批修复，并裁定车辆类型仅做显示层兼容。本轮据此进入实施。

### 13.1 生产只读预检

- 受控 workflow：`Production Readonly Audit` run `33739806864`，结论 `success`；连接级只读、事务只读、最终 `ROLLBACK`，`PRODUCTION_BUSINESS_WRITES=0`。
- revision：checkout/API/Web 均为 `157d2c4cca0a307db2d5429f1a36efe3680dd51a`（预检时生产 revision）。
- `sys_organizations`：公司 3 行，`org_name` 与 `org_name_cn` 均无空值；`COALESCE(company_code,org_code)` 重复 0。
- 8 表 JOIN：`biz_projects 13/13`、`sal_customers 87/87`、`wms_warehouses 31/31`、`mst_stores 10/10`、`sal_drivers 6/6`、`sal_vehicles 1/1`、`fin_cash_accounts 77/77`、`fin_bank_accounts 1/1`；全部无空公司、未命中和重复命中。
- 当前类型分布：项目 `INVESTMENT 1 / OPERATION 12`；供应商 `CHICK 2 / FEED 14 / LOCAL 4 / OTHER 1 / OVERSEAS 1 / PACKAGING 2 / RAW_MATERIAL 2 / VACCINE 1 / VETERINARY 7`；仓库 `NULL 1 / COLD_STORAGE 1 / EGG_FARM 2 / EGG_SALES 12 / FEED 2 / FINISHED 1 / GENERAL 6 / MEDICINE 2 / PURCHASE_RECV 1 / RAW_MATERIAL 3`；资金账户 `BANK 48 / CASH 20 / EWALLET 2 / PERSONAL_AGENT 3 / VIRTUAL 4`；车辆为历史中文自由文本 `厢式货车 1`。
- 首次 run `33739671806` 在预检脚本的常量折叠断言处失败；重复查询实际为 0。修正为运行期断言后重跑成功，不涉及生产写入。

### 13.2 实施内容

- 后端 Runtime list/get 对 8 个公司维度类型统一返回原 `company_code` 与 canonical `company_display_name/company_display_name_zh`，供应商维持原模型。
- 前端增加显式 `displayKind` 与薄 `formatCompany` adapter；8 个公司页和各详情/KPI 统一双显，CompanySelector 写值仍为编码。
- 项目、供应商、仓库、资金账户、车辆类型使用同源三语显示表；未知码和历史中文自由文本保留原值，不新增字典、不迁移存量。
- 司机页主键恢复为 `driver_code`，并加入 API/页面防回潮契约。

### 13.3 验证与部署

- 本地验证：API/Web `tsc --noEmit`、全量 build、Web Vitest（104 files / 561 tests）、API Jest 串行全量（90 suites passed、1 skipped；757 tests passed、6 skipped）、i18n key/硬编码门禁全部通过。新增 9 页三语/未知值/真实回退、8 表 JOIN 行数、司机主键及 9 页防回潮契约测试。
- 本地 Playwright 用例已编写，但当前 runner 缺少 Chromium 系统库 `libnspr4.so`，浏览器未能启动，故不将其记为通过；该环境限制不影响双端编译、单测、构建或生产 API 只读复验。
- push CI：run `33741589500`，结论 `success`；双端类型检查、迁移/约束/entity drift 门禁、API build、系统/养殖/包装/WMS/财务回归及 API/Web 镜像构建推送全部通过。
- full 部署：workflow_dispatch run `33742343372`，结论 `success`；部署目标 commit `4f7eb821e2c8b557c669b03972aa85c400f21a22`。
- 部署后受控只读复验：run `33742947769`，结论 `success`；checkout/API/Web revision 均为 `4f7eb821e2c8b557c669b03972aa85c400f21a22`，`PRODUCTION_BUSINESS_WRITES=0`。
- 8 表 JOIN 复验与预检行数一致，全部 `company_missing=0 / join_miss=0 / join_duplicate=0`；类型分布未改变，车辆历史中文自由文本仍为 `厢式货车 1`。
- 9 个 Runtime GET 均为 HTTP 200：项目 13、客户 87、供应商 34、仓库 31、门店 10、司机 6、车辆 1、资金账户 77、银行账户 1。8 个公司页均保留 `company_code`，且 `company_display_name/company_display_name_zh` 非空抽查通过；供应商仅验证既有 `supplier_code`，未虚构 `company_code`。
- 错误窗口：`MASTER_DATA_NINE_PAGE_ERROR_WINDOW_60M=0`，`LIFECYCLE_PROCESS_LOG_ERROR_WINDOW_60M=0`。
