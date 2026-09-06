# 三页显示缺陷核查（采购申请 / 门店库存 / 鸡蛋库存）

> 日期：2026-09-04
>
> 性质：核查与实施方案，**本轮零业务代码实施**
>
> 决策门：以下方案须经主 agent 复核并由用户确认后，方可实施。

## 结论摘要

| 页面 | 现状判定 | 根因 | 建议改法（待确认） |
|---|---|---|---|
| `/procurement2/requests` | 缺陷属实；上轮采购 P1 漏了公司、项目、申请人 | 列表无 JOIN，只返回实体快照；详情仅补过物料名称；申请人未返回账号 | 后端补 canonical 公司、项目、用户投影；前端统一名称优先、编码兜底，申请人显示“姓名（账号）” |
| `/store/inventory` | 缺陷属实；桌面和移动端均只显示编码 | API 已 JOIN 仓库/库区/库位，但只投影仓库部分名称，未 JOIN SKU 名称；前端没有消费名称 | API 补 SKU 三语、仓库三语、库区/库位单名；前端复用 `formatMasterData` |
| `/sales2/inventory` | 排版缺陷属实，集中在窄屏/平板 | 页面内联固定布局、双层 padding、部分表格无局部横滚、三列卡片与筛选栏无断点 | 抽出页面 CSS，对齐门店库存/补货页的桌面表格与移动卡片基线，建立三档响应式布局 |

## 1. 采购申请页

### 1.1 当前渲染

列表表头确有公司、项目、申请人（`apps/web/src/app/(admin)/procurement2/requests/page.tsx:497-504`），但单元格分别是：

- 公司：`row.companyCode`，仅编码（`:538`）。
- 项目：`row.projectCode ?? "—"`，仅编码（`:539-546`）。
- 申请人：`row.requesterName ?? "—"`，仅创建时快照（`:547-550`）。

详情同样没有 canonical 投影：公司拼 `companyCode + companyName`（`:617-619`），项目拼 `projectCode + projectName`（`:620-622`），申请人只显示 `requesterName`（`:626-628`）。前端 `PurchaseRequest` 类型也没有 canonical display 或申请人账号字段（`:42-64`）。

后端列表在 `apps/api/src/modules/procurement-v2/services/requests.service.ts:162-188` 使用 `reqRepo.createQueryBuilder('r')`，没有公司、项目、用户 JOIN，并在 `:204-205` 直接返回实体。详情在 `:209-231` 仅对明细物料补多语言名称。创建时 `companyName/projectName` 来自 DTO（`:245-254`），`requesterName` 来自当前用户显示值（`:262-265`）；`getUser()` 仅取 `user.name ?? user.username`，并未读取 `sys_user.real_name`（`:52-57`）。

### 1.2 与上轮采购 P1 对照

上轮提交 `08fa7adf`（`fix: procurement p1 localized name projections`）改动了采购 dashboard、订单、收货、申请及契约测试，但申请页的实际覆盖仅是详情物料查询：`requests.service.ts:225-231` 从 `mst_materials` 投影 `material_name/_en/_lo`。契约测试 `apps/api/src/modules/procurement-v2/services/procurement-localized-names.contract.spec.ts:15-24` 对申请也只锁定 `material_name_lo`。

**判定：上轮明确漏了公司、项目、申请人三列，不能把订单/申请/收货的 supplier/material/SKU/warehouse 名称投影视为已覆盖这三列。** 后续提交 `5931a2b7` 也只调整详情物料的 `formatMasterData` 渲染。

### 1.3 根因与改法

canonical 依据：公司来自 `sys_organizations` 且 `org_type='COMPANY'`；既有 company display JOIN 模式见 `apps/api/src/modules/master-data/master-data-runtime.service.ts:549-565`。项目唯一主表为 `biz_projects`（`docs/M2_PROJECT_CONSOLIDATION.md:41-49`），名称列为 `project_name`。用户真实姓名/账号来自 `sys_user.real_name` 与 `sys_user.username`（`docs/schema-snapshot.sql:8404-8418`）。

待确认的实施方案：

1. 列表和详情查询统一补 LEFT JOIN，保留原快照字段作兼容 fallback。
2. 公司以 `company_org.org_type='COMPANY' AND COALESCE(company_org.company_code, company_org.org_code)=r.company_code` 关联，返回 `companyDisplayName`（以及既有模式需要的中文字段）；显示“名称（编码）”。
3. 项目以 `biz_projects.project_code=r.project_code` 关联，返回 `projectDisplayName`；canonical 为空时回退 `projectName`，再回退编码。
4. 申请人以 `sys_user.user_id=r.requester_id` 关联，分别返回 `requesterRealName` 与 `requesterUsername`；显示 `真实姓名（username）`，真实姓名为空时避免重复，直接显示账号。
5. 列表和详情共用同一格式化函数，避免两处规则漂移。

## 2. 门店库存页

### 2.1 当前渲染与 API 契约

三 Tab 定义为 `ALL / AVAILABLE / QUARANTINE`（`apps/web/src/app/(admin)/store/inventory/page.tsx:9`），查询 `GET /api/v2/store-sales/inventory`（`:16`）。当前桌面列：SKU 为 `sku_code || product_code`（`:20`），仓库、库区、库位分别直接显示 `warehouse_code/zone_code/location_code`（`:21`）；移动卡片同样只显示这些编码（`:29`）。

后端 `apps/api/src/modules/store-pos/services/store-inventory-query.service.ts:62-81` 已 JOIN `wms_warehouses w`、`wms_locations loc`、`wms_zones z`，但 SELECT 只包含：

- SKU/批次基础字段，没有 `product_skus.sku_name*`；
- 仓库有 `warehouse_name`、`warehouse_name_zh`，缺 `_en/_lo`；
- 库区只有 `zone_code/zone_type`，没有 `zone_name`；
- 库位只有 `location_code`，没有 `location_name`。

因此缺口分类为：

| 字段 | 后端 | 前端 | 处置 |
|---|---|---|---|
| SKU 名称 | 未 JOIN/未投影 | 无名称字段可消费 | JOIN `product_skus`，投影 `sku_name/_en/_lo`；前端三语 helper |
| 仓库名称 | 已投影部分名称 | 已有名称未消费 | 补齐 `_en/_lo`，前端消费；这是“前端已有未消费 + 后端多语不完整” |
| 库区名称 | 已 JOIN，未投影 | 无名称字段 | 投影 `z.zone_name`；单名（编码） |
| 库位名称 | 已 JOIN，未投影 | 无名称字段 | 投影 `loc.location_name`；单名（编码） |

`wms_zones` 与 `wms_locations` 当前只有单一名称列；不能虚构 `_en/_lo`。SKU/仓库多语言列已有迁移依据 `apps/api/src/database/migrations/1782700000000-AddMasterDataMultilingualNames.ts:34-45`。

### 2.2 建议改法

1. `StoreInventoryQueryService` 增加 SKU JOIN，并投影 `sku_name/_en/_lo`、`warehouse_name/_zh/_en/_lo`、`zone_name`、`location_name`。
2. 前端扩展 `Row`，桌面列与移动卡片统一复用 `apps/web/src/lib/business-display.ts:52-54` 的 `formatMasterData`；其底层 `localizedMasterName` 与 `masterNameWithCode` 位于 `localized-master-data.ts:7-24`。
3. SKU 显示名称（编码），按当前 locale 选择名称并按 `zh → en → lo → base → code` 兜底；库区/库位按真实单名显示“名称（编码）”；仓库按三语名称显示“名称（编码）”。
4. 可选但建议同步将 `sku` 搜索扩展到 `sku_name/_en/_lo`，否则用户看到名称却不能按名称搜索。

## 3. 鸡蛋库存页排版

### 3.1 重叠区域与根因

该页没有独立 CSS module，大量布局是 `apps/web/src/app/(admin)/sales2/inventory/page.tsx` 内联样式。确认的风险点如下：

- 外层再次 `padding:24`（`:1114-1117`），admin content 自身已有 `padding:20px 24px` 且 `overflow-x:hidden`（`apps/web/src/app/(admin)/admin.module.css:157-162`）。可用宽度被二次压缩，溢出内容又被裁掉。
- 批次表有 `scrollX + minWidth:1180 + 固定列宽`（`:608-622`），虽然能局部滚动，但多个单元格 `whiteSpace:nowrap`（`:637-659`）。
- 临期表虽有 `scrollX`，却是 `tableLayout:fixed;width:100%` 且无 `minWidth/colgroup`（`:720-724`），窄屏会把 9 列强压进容器。
- 损耗分析两张表没有 `scrollX`，只有固定布局（`:1002-1005`、`:1029-1033`）。结合全局表头 `white-space:nowrap` 与较大 cell padding（`apps/web/src/components/ui/admin-ui.module.css:273-290`），会发生文字挤压、遮盖或裁切。
- 损耗统计卡固定三列且无断点（`:987-996`），320–390px 下每列不足以容纳长标题及徽章，是最明确的卡片重叠点。
- 临期筛选栏（`:697-714`）和损耗筛选栏（`:972-979`）不换行；创建表单固定三列（`:541-557`）；四个 Tab 不换行也不横滚（`:1140-1159`）。这些在手机宽度会溢出，并被父级 `overflow-x:hidden` 裁剪。
- 首页 8 张 KPI 使用 `auto-fit/minmax(180px,1fr)`（`:1122-1137`），通常不会互相覆盖，但平板和手机缺少受控列数，视觉高度和顺序不稳定。

### 3.2 对齐设计系统基线的具体调整

参考 `/store/inventory` 的 `inventory.module.css`（768px、390px 断点，桌面表格/移动卡片分离）以及 `/store/replenish` 的桌面表格/移动卡片与手机单列表单模式：

| 档位 | 布局调整 |
|---|---|
| 桌面 `>=1200px` | 去掉页面重复 padding，由 `PageShell/admin content` 统一承载；KPI 保持自动网格；临期及两张损耗表全部加局部 `overflow-x:auto`、显式 `min-width` 和列宽；页面本身不产生横向滚动 |
| 平板 `769–1199px` | KPI 3 列或 2 列；创建表单 2 列；全部筛选栏允许换行/网格化；损耗卡 2 列；Tab 局部横滚 |
| 手机 `<=768px` | KPI 2 列，损耗卡 1 列；筛选栏与创建表单 1 列；Tab 横向滚动或换行；优先采用门店库存页的移动卡片替代表格，最低限度也须保证表格局部横滚 |
| 小屏 `<=390px` | KPI 可降 1 列；收紧卡片 padding/字号；保持控件全宽；不得依赖页面级横滚查看操作按钮 |

实现时应抽出页面级 CSS module，停止继续叠加内联断点逻辑。此次只给方案，未改布局，也未假定任何 API 数据内容。

## 4. 生产只读抽查

### 4.1 本轮结果与边界

本轮确认 `GET https://erp.eggslao.com/api/health` 返回 200，且环境为 production、数据库 connected。生产业务 GET 在无认证条件下均返回 401；仓库本机没有生产 token 或数据库 secret。因此本轮**不能**声称采购申请、门店库存名称列为非 NULL，也不能给出鸡蛋库存实时数据量。

鸡蛋库存快照接口源码为 `GET /api/farm/egg/stock`，返回 `{ grade, name, qty, trays }`（`apps/api/src/modules/farm/farm-egg.service.ts:17-21,49-68`）；这是结构事实，不是本轮生产样本。历史文档 `docs/ops/production-procurement-localized-name-audit-20260902.md:178-187` 曾记录部分生产分析名称样本为 `NO_SAMPLE`，也不能替代 2026-09-04 实时结论。

生产只读审计已有受控通道：`scripts/ops/run-production-readonly-audit.sh:20-25,41-48,77-80` 强制 HTTP 仅 GET/HEAD、SQL `READ ONLY` 并最终 `ROLLBACK`。实施前应通过该通道补跑：

- 采购申请列表与详情：记录有值行数，以及 company/project/requester canonical 字段空值率；
- 门店库存：记录总行数，以及 SKU/仓库/库区/库位名称的非空率和样本；
- 鸡蛋库存 `/api/farm/egg/stock`：记录 `data.length`，验证 `grade/name` 非空、`qty/trays` 为数值，并记录最长展示值长度，作为布局夹具边界。

在取得认证只读 runner 结果前，这三项均标记为 **NOT VERIFIED（非 FAIL、非 PASS）**。

## 5. 测试计划（实施轮）

### 5.1 采购申请：locale 与防回潮

- API 契约测试锁定三条 JOIN、别名与 fallback；列表和详情都必须返回 company/project/user display 字段。
- 以 canonical 名称、快照名称、仅编码三组 fixture 验证 fallback 顺序。
- 前端对 `zh/en/lo` 逐语言断言公司/项目显示“名称（编码）”；申请人断言“姓名（账号）”，姓名为空时不出现 `账号（账号）`。
- 源码契约禁止公司/项目列退回裸 `row.companyCode/row.projectCode`，禁止申请人只消费 `requesterName`。

### 5.2 门店库存：locale 与防回潮

- Service spec 断言 SKU、仓库、库区、库位名称投影；验证缺名称时 LEFT JOIN 不丢库存行。
- `zh/en/lo` fixture 断言 SKU/仓库按 locale 选择并显示“名称（编码）”，zone/location 始终按真实单名（编码）。
- 桌面表与移动卡片必须调用同一 helper；契约测试禁止四列再次直接裸渲染 code。
- 搜索若纳入本次范围，测试三语 SKU 名称均可命中，同时保留编码/批次搜索。

### 5.3 鸡蛋库存：三档真实渲染

- Playwright 使用 1440、1024、768、390、320px viewport；mock API 注入长 SKU 名、长批次号、大数值、长时间文本及空数组。
- 对首页 KPI、损耗卡、四 Tab、三组筛选栏、创建表单、批次/临期/损耗表逐项截图与可见性断言。
- 每档断言 `document.documentElement.scrollWidth === document.documentElement.clientWidth`；表格若超宽，只允许其局部容器 `scrollWidth > clientWidth`。
- 断言文本 bounding boxes 不相交、按钮可点击、焦点可达；`<=768px` 断言桌面表隐藏且移动卡片出现（若采用推荐模式）。
- 保留源码/CSS 契约测试锁定 1200/768/390 三档规则，防止后续删除断点或 `overflow-x:auto`。

## 6. 实施边界与确认项

本报告只新增文档，没有修改前后端、迁移、测试或生产数据。建议用户确认以下范围后再进入实施轮：

1. 采购申请显示格式采用“公司名称（编码）/项目名称（编码）/姓名（账号）”。
2. 门店库存 SKU 与仓库使用三语名称；库区/库位按现有单名显示“名称（编码）”，本轮不扩 schema 做三语治理。
3. 鸡蛋库存采用桌面表格 + 手机卡片方案，而不是仅用横向滚动作为手机端最终体验。
4. 授权通过现有 production readonly workflow 补跑认证 GET/SELECT，结果作为实施验收证据。

## 7. 实施记录（2026-09-04）

用户已确认三项一起修复，并将门店库存名称搜索纳入范围。本轮完成：

- 采购申请：列表与详情均 LEFT JOIN `sys_organizations`、`biz_projects`、`sys_user`，返回 `companyDisplayName`、`projectDisplayName`、`requesterRealName`、`requesterUsername`；公司 canonical → 快照 → 编码、项目 canonical → 快照 → 编码。前端列表与详情共用显示函数，申请人 `real_name` 为空且 canonical 账号存在时只显示账号。
- 门店库存：查询仍以 `inv_batches` 为唯一事实源，新增 `product_skus` LEFT JOIN；投影 SKU `sku_name/_en/_lo`、仓库 `_zh/_en/_lo`、库区和库位真实单名。`sku` 参数同时覆盖编码、产品、批次及三语 SKU 名称；编码仍是筛选提交值。桌面表和移动卡片均调用 `formatMasterData`。
- 鸡蛋库存：新增页面级 `inventory.module.css`，去除页面重复 padding；建立 `769–1199`、`<=768`、`<=390` 响应式规则。批次/临期在手机使用卡片，超宽桌面表仅在局部容器滚动；临期及两张损耗表均有显式 `min-width`，Tab 可局部横滚，筛选和表单在手机单列，小屏 KPI 单列。

### 7.1 测试与本地验证

- API 定向 Jest：2 suites / 9 tests，全通过；覆盖采购三组 JOIN/别名/fallback 契约、门店名称投影与 `sku_name/_en/_lo` 搜索。
- Web 定向 Vitest：3 files / 12 tests，全通过；覆盖 zh/en/lo 名称（编码）、申请人姓名（账号）与空姓名、快照/编码 fallback、两页防回潮和鸡蛋库存布局契约。
- Web 全量 Vitest：105 files / 564 tests，全通过。
- API / Web `tsc --noEmit`：均 0 errors。
- API 全量 Jest：92 suites / 763 tests 通过，1 suite 中 2 tests 失败；失败位于未改动的 `chanjet-callback.controller.spec.ts`，原因均为 5000ms timeout。相关专项仍全绿，未将全量结果标记为 PASS。

### 7.2 远端与生产验证

交付使用 `scripts/ops/readonly-audits/three-page-display-defects.{sql,http.json}` 做认证只读名称抽查，并由 runner 强制校验三端 revision、只读事务和近 60 分钟接口错误窗口；鸡蛋库存页面另做公开 200 冒烟。workflow artifact 与交付回执记录最终运行结论；没有受控 workflow 结果前，生产业务验证保持 **NOT VERIFIED**。

## 8. 鸡蛋库存桌面重叠回归（2026-09-06）

### 8.1 根因与修复

- 生产复测发现 `/sales2/inventory` 批次表公司名称侵入可用量列。根因是 11 列 `<colgroup>` 声明合计 1306px，但 `.batchTable` 同时使用 `table-layout: fixed; width: 100%; min-width: 1180px`，浏览器会压缩固定列；132px 公司列又缺少 overflow 裁切。
- 批次表改为 11 个 CSS 列类，列宽依次为 `180/130/120/80/240/110/110/100/120/120/210`，固定总宽和最小宽均为 1520px。公司显示包入带完整 `title` 的 `.companyCell`，以 ellipsis 截断；数量统一右对齐、等宽数字、不换行且裁切，可用量保留强调色。
- 临期表移除 `nth-child` 隐式列宽，新增 9 列 `<colgroup>`，列宽依次为 `180/130/130/80/240/110/120/120/100`，固定总宽和最小宽均为 1210px，并复用公司与数量安全样式。
- `.tableScroll` 增加 `min-width: 0`，宽表只在局部容器横向滚动。FIFO 页没有结果表格；损耗两表已有固定最小宽与局部横滚，未发现本次公司列侵入路径。`<=768px` 仍隐藏桌面表并使用原移动卡片，未改库存数据、接口或后端权威语义。

### 8.2 本地真实几何与门禁

- Playwright Chromium 使用长公司 fixture `老挝凤凰农业发展有限公司（COMP-LAO-AGRI）`、可用量 `54,321`、总量 `98,765`。在 `2784x1511`、`1440x900`、`1024x768` 三个桌面视口逐项读取 `getBoundingClientRect()`，断言公司文字矩形不越出公司单元格、公司/可用量/总量相邻边界互不相交、五位数量完整可见；批次和临期表均通过。在 `390x844` 断言桌面表隐藏、移动卡片显示完整公司和 `54,321 / 98,765`。四个视口均生成全页截图和 `cell-geometry.json` Playwright 附件。
- 源码契约 Vitest：`three-page-display-defects.test.ts` 5/5 通过，锁定 11/9 个 colgroup、1520/1210 总宽、companyCell/numericCell/numericAccent 与长公司 fixture。
- Web 全量 Vitest：105 files / 568 tests 全通过（显式 `NODE_ENV=test`；宿主默认非标准 `NODE_ENV` 会令 React production build 的 `act` 不可用）。API/Web `tsc --noEmit` 均 0 errors；根目录 API+Web production build 通过；constraint/null-unique/entity-drift 三项门禁通过。

### 8.3 PR、部署与生产复验

修复 PR 为 `#195`；已按冻结边界治理流程加 `reviewed-frozen-boundary` 审核标签。待远端 CI、合并、full deploy 和生产真实浏览器复验完成后回填；在此之前保持 **NOT VERIFIED**。
