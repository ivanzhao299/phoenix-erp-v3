# 库存管理 9 项字段显示缺陷核查（2026-09-03）

> 范围：只读核查，不含业务代码、迁移或生产写入。实施方案须经主 agent 复核，并在通知用户、取得确认后执行。

## 结论摘要

本轮可以确定：用户看到的大多数纯编码不是 PR #165 部署或浏览器缓存问题，而是 **PR #165 未覆盖相应页面，且这些页面继续直接渲染 Generic CRUD 返回的原始编码**。

PR #165 的 merge commit 为 `d24886f59736e05745dc700ba3d41b94e51b188e`，实际只改了库存 Admin 的 `/warehouse/expiry`、`/warehouse/locations`、`/warehouse/loss-report`、`/warehouse/query` 四页，以及 `inv_batches`、`wms_locations` 两张表的名称展开。它没有改 `inbound`、`outbound/issues`、`transfer`、`stocktake`、`ledger`、`warehouses`。

对 `/warehouse/query`，代码已接名称格式化；仍只见编码有三种代码可解释路径：名称 JOIN 不覆盖物料/旧产品身份、名称字段为空时 formatter 按设计回退 code、专用接口 404 时回退 Generic CRUD。是否还叠加“生产未部署/旧前端缓存”，当前不能凭代码断定：生产 `/api/health` 可达且 DB connected，但健康响应不含 build SHA；当前工作机也没有受控生产审计凭据，无法取得认证后的批次响应。

另一个重要歧义是第 8 项：当前 `/warehouse/query` **没有新建表单，只有只读列表和搜索框**（`apps/web/src/app/(admin)/warehouse/query/page.tsx:71-124`）。因此“库存查询-表单（新建）”不是现仓代码中的该路由区域；若 UAT 的确看到该表单，需先确认截图/URL/部署版本，不能把入库表单臆定成它。

## PR #165 覆盖边界与“为何仍见编码”

- merge：`d24886f5`；分支提交：`70f907f7`（审计）、`0a9212a3`（名称显示）、`85ec78e`（workflow 枚举）、`321abda7`（门禁报告）。
- `/warehouse/query` 已在 `apps/web/src/app/(admin)/warehouse/query/page.tsx:159-181` 对品目、仓库、库位、门店调用 `formatMasterData`，状态调用 `formatBusinessEnum`。
- `/warehouse/expiry` 当前在 `apps/web/src/app/(admin)/warehouse/expiry/page.tsx:81-85,200-203` 使用同一名称 formatter。
- `/warehouse/locations` 当前在 `apps/web/src/app/(admin)/warehouse/locations/page.tsx:434-440` 格式化库位、仓库、库区、门店。
- `/warehouse/loss-report` 当前在 `apps/web/src/app/(admin)/warehouse/loss-report/page.tsx:212-227` 修正仓库/库区/批次/品目列。
- 后端只对白名单 `inv_batches`、`wms_locations` 展开名称，见 `apps/api/src/modules/generic-crud/generic-crud.service.ts:2478-2498`；其余 WMS 表最终仍是 `SELECT *`，见同文件 `2498-2512`。
- `formatMasterData` 缺名称时返回 code，见 `apps/web/src/lib/business-display.ts:31-40`；locale 名称回退为当前语言 → zh → en → lo → 基础名，最终再退 code，见 `apps/web/src/lib/localized-master-data.ts:7-23`。

所以逐项判定为：1 的“库存查询”部分已覆盖但数据身份/JOIN 不全；2–7、9 是明确漏页；8 在当前路由不存在，必须先对齐 UAT 页面身份。生产未部署或未刷新目前只是待排除因素，不是已证实根因。

## 9 项逐项核查

### 1. 库存查询列表

**当前渲染**：页面优先 GET `/api/inventory/batches`，404 才 fallback `/api/crud/inv_batches`（`query/page.tsx:30-42`）。列表品目取 `sku_name/product_name`，编码取 `material_code/sku_code/product_code`，随后调用 formatter；库位同样格式化（`query/page.tsx:159-181`）。专用查询已 JOIN 仓库三语、SKU 三语、库位名、门店三语（`apps/api/src/modules/wms/wms.service.ts:1297-1315`）。

**现状判定/根因**：PR #165 确实覆盖本页，但没有 JOIN 物料名称；旧批次若只有 `product_code` 也缺产品名称，因而品目必然回退 code。库位只返回单一 `location_name`，若生产该列 NULL 也回退 code。接口另有 `qty_available > 0`、固定 `LIMIT 200`，列表可能不完整。

**改法**：专用批次 projection 补物料与旧产品名称（按真实身份字段分支，禁止模糊猜 JOIN），库位补语言列；保留 code。前端继续统一输出 `名称（编码）`。移除 404 fallback 前须确认所有部署均有专用接口，否则至少对 fallback 响应做同等契约测试。

### 2. 出库管理

**当前渲染**：列表在 `apps/web/src/app/(admin)/warehouse/outbound/page.tsx:256-270` 直接显示 `warehouse_code`、`item/item_name`、`destination_house_code`、`operator`；没有名称 formatter。表单虽使用 Warehouse/House/User 等 Selector（`118-182`），显示 label 不等于列表 API 已有名称。

**缺口**：Generic CRUD 未 JOIN 仓库、品目、用户；列表只读 `destination_house_code`，非 HOUSE 的 CUSTOMER/WAREHOUSE/STORE/DEPARTMENT/PROJECT/EMPLOYEE/SUPPLIER/OTHER 去向甚至不显示。后端已把多态值归一到 `destination_code`（`apps/api/src/modules/wms/wms-outbound-policy.ts:239-248`），但读取 projection 没解析名称。操作员落库为当前账号 username，且后端会覆盖表单所选值（`wms.service.ts:831-833,915-917`）。

**改法**：新增出库专用只读 projection，返回 `warehouse_name_*`、品目名称、`operator_name`、`destination_name_*`；前端以统一去向列显示 `名称（编码）`。实际操作人若必须是登录人，应将表单改成只读自动带出；若允许代指定，则需另行定义权限并修改写入规则。

### 3. 入库管理

**当前渲染**：列表在 `apps/web/src/app/(admin)/warehouse/inbound/page.tsx:161-176` 直接显示仓库 code、品目原值、operator。表单字段已用 warehouse、inventoryItem、user selector（`74-95`）。专用 pending/task 查询能 JOIN 仓库，task items 能 JOIN产品名（`wms.service.ts:210-250`），但当前列表走 Generic CRUD。

**缺口**：`wms_inbound` Generic CRUD 无仓库/品目/用户名称；主表默认 operator 是 username，而确认流水有路径写 `userId`（`wms.service.ts:347-349`），身份口径不一致会让单一 username JOIN 漏匹配。

**改法**：列表改用专用 projection或为该表增加显式安全 projection，补仓库、品目、operator 名称；先统一 operator 的存储口径，再按 `sys_user.username` 或真实 `user_id` JOIN。

### 4. 领用管理

**当前渲染**：`/warehouse/issues` 只是复用 OutboundPage（`apps/web/src/app/(admin)/warehouse/issues/page.tsx:1-5`），所以继承第 2 项全部缺口。去向表单按类型切换 House/Customer/Warehouse/Store/Department/Project/User selector；SUPPLIER 与 OTHER 仍共用文本框（`outbound/page.tsx:149-176`）。

**缺口**：列表仅显示鸡舍编码，所有非鸡舍去向均被遗漏；没有多态名称解析。后端仅校验类型和值非空，未验证对应主数据存在、ACTIVE 与 scope（`wms-outbound-policy.ts:251-283`）。

**改法**：由后端按 `destination_type + destination_code` 做白名单分支 JOIN/查询，返回统一 `destination_name_*`；HOUSE/CUSTOMER/WAREHOUSE/STORE/DEPARTMENT/PROJECT/EMPLOYEE/SUPPLIER 分别走对应主数据，OTHER 只能原文展示，禁止伪造翻译。SUPPLIER 表单改 SupplierSelector；同时补 ACTIVE/scope 校验。

### 5. 调拨管理

**当前渲染**：`apps/web/src/app/(admin)/warehouse/transfer/page.tsx:129-168` 直接显示调出/调入仓 code、reason code、operator。表单 reason 已是 `INV_TRANSFER_REASON` DictSelect，operator 已是 UserSelector（`102-110`），但列表不消费 label。

**缺口**：`wms_transfer` 无名称 JOIN；字典控件只解决表单，不解决列表。经办人主表同时可能有 operator/operator_id，但读取不 JOIN 用户。

**改法**：projection 补 `from_warehouse_name_*`、`to_warehouse_name_*`、`operator_name`；列表原因复用运行时字典 label，随 zh/en/lo 切换且未知值原样回退。实施前顺带阻断本页已发现的独立流程风险：页面状态 `PENDING/DONE/CANCELLED` 与后端 `PENDING/IN_TRANSIT/RECEIVED/COMPLETED` 不一致（`transfer/page.tsx:115-127`；`wms.service.ts:1730-1869`），但该风险不应混进本轮“只显示修复”静默上线。

### 6. 盘点管理

**当前渲染**：列表直接显示 `warehouse_code`、`item`、`operator`（`apps/web/src/app/(admin)/warehouse/stocktake/page.tsx:241-303`）；表单却填写 `auditor`（`106-108`），审核服务也写 `auditor`（`wms.service.ts:1929-1931`）。

**缺口**：除无名称 JOIN 外，还存在“盘点员”字段错位：列表读 operator、表单/审核写 auditor，可能直接显示空而不仅是纯账号。

**改法**：产品先确认“录入员”和“盘点/审核员”语义；若一列代表盘点员，则统一读 auditor，并返回 `auditor_name`；如两者均需，拆成 `operator_name（operator）` 与 `auditor_name（auditor）`。仓库、品目补显式名称 projection。

### 7. 库存台账

**当前渲染**：页面用 `<DataTable table="inv_ledger">`（`apps/web/src/app/(admin)/warehouse/ledger/page.tsx:42-45`）；operator/store_code 直接字符串渲染（`28-40`）。change_type 已有 formatter，与本缺陷无关。

**缺口**：`inv_ledger` 只有 operator、store_code 等编码，Generic CRUD 不 JOIN `sys_user` 或门店。实际写入通常是 username（例如盘点流水见 `wms.service.ts:1918,1960-1972`）。

**改法**：增加只读 projection，按 `sys_user.username = inv_ledger.operator` 返回 real_name，按既定门店主数据返回 store name；保留兼容 fallback。前端显示 `姓名（账号）`、`门店名称（编码）`。

### 8. 库存查询“新建表单”

**当前渲染**：当前 `/warehouse/query` 没有新建按钮、CrudForm、品目/库位/状态/门店字段，只存在只读列表和搜索框（`query/page.tsx:71-124`）。因此无法在当前源码中为所述四个控件给出渲染行号。

**现状判定/根因**：这不是 PR #165 漏了该页的某个现存 form hunk，而是 UAT 页面身份/部署版本与当前源码不一致。可能是旧部署、另一 URL、弹窗来自其他页面，或需求意指尚未存在的创建能力；没有截图/URL前不能选定改动点。

**确认后改法**：若实际指入库表单，当前品目使用 InventoryItemSelector（`inbound/page.tsx:79-88`），仓库 selector 已名称双显，但该表单根本没有 location/store 字段；若是要给库存查询新增编辑 inv_batches 的表单，则会触碰“库存台账唯一写入口”铁律，不应直接开放 Generic CRUD 新建。需要用户提供 UAT URL/截图后再定方案。

### 9. 仓库主档

**当前渲染**：旧 `/warehouse/warehouses` 列表的 status 没有 render（`apps/web/src/app/(admin)/warehouse/warehouses/page.tsx:19-26`），DataTable 默认 `String(row.status)`（`apps/web/src/components/data-table/DataTable.tsx:195-204`），所以裸显 ACTIVE/INACTIVE。表单选项其实已用 `t('status.active/inactive')`（`warehouses/page.tsx:33-36`）。

**根因**：明确是列表漏 formatter，不是名称 NULL，也不属于 PR #165 覆盖页。

**改法**：列表按稳定 i18n key 显示 status；未知状态保留 code，不凭空翻译。仓库 selector 本身已按 locale 输出 `名称（code）`（`MasterDataSelectors.tsx:268-289`），无需重写。

## 操作员/经办人/盘点员的统一 JOIN 方案

真实数据库列口径是 `sys_user.user_id / username / real_name`，证据见 `apps/api/src/auth/auth.service.ts:94-100`。当前 SysUserEntity 与数据库存在历史命名差异，因此本轮建议沿用 WMS 已广泛使用的 raw SQL projection，不新增 ORM join。

最小策略：

1. 仅有字符串 operator/auditor 时，以 `sys_user.username = base.operator` JOIN；兼容历史 user_id 值可增加受控第二分支，但先以生产只读样本确认，避免宽泛 OR JOIN。
2. 有 `operator_id` 时优先 `sys_user.user_id = operator_id`，username 为兼容 fallback。
3. 返回原 code 与独立 `operator_name`/`auditor_name`，前端统一 `姓名（账号）`；`SYS` 或已删除用户继续显示原值。
4. 不把 `real_name` 覆盖到 operator 字段，避免提交、筛选、审计链断裂。

## 后端需补清单

| 读取对象 | 最小新增返回列 |
|---|---|
| inventory batches | material/product 名称语言列；location 语言列 |
| wms_outbound / issues | warehouse、item、operator、picker、按 destination_type 解析的 destination 名称 |
| wms_inbound | warehouse、item、operator 名称；统一 operator 身份口径 |
| wms_transfer | from/to warehouse 名称、operator 名称；reason 由字典接口/前端运行时映射 |
| wms_stocktake | warehouse、item、operator/auditor 名称，并先确定盘点员字段语义 |
| inv_ledger | operator、store 名称（可同时补 warehouse/item，避免下轮重复） |
| wms_warehouses | 无需名称 JOIN；列表补状态本地化即可 |

所有 projection 必须显式列出允许 JOIN 的身份字段，不能根据 `*_code` 自动猜表；继续保留原编码列供写入、追溯和 DataScope。

## 生产只读抽查结果与缺口

本轮实际 GET `https://erp.eggslao.com/api/health` 返回 200，确认 production API 可达、数据库 connected。未认证业务 GET 返回 401，符合保护预期。

仓库规定的生产只读通道是 `.github/workflows/production-readonly-audit.yml:3-84`，执行器在 `scripts/ops/run-production-readonly-audit.sh:41-48,77-106` 强制 `default_transaction_read_only=on`、`BEGIN TRANSACTION READ ONLY`、超时、ROLLBACK，并把 HTTP 限定为 GET/HEAD。当前工作机没有 production environment secrets、可用 SSH alias 或本地 API，故没有取得以下真实值：

- inv_batches 中 material/product/location 名称 NULL 比例；
- operator 是 username、user_id、SYS 还是历史混用的分布；
- destination_type/code 对应主数据的命中率；
- store_code 对 canonical organization 与 mst_stores 的命中率；
- 生产前端/API build 是否包含 `d24886f5`。

这意味着：**漏页类根因已经由源码确证；库存查询的生产数据 NULL、部署版本与缓存因素仍待受控生产抽查，不能下结论。** 实施前应新增一份只读 SQL + GET manifest 并经 production workflow 运行，结果回填本报告或执行记录。

## 实施拆分（待用户确认后执行）

1. **P0 读模型**：为 outbound/issues、inbound、transfer、stocktake、ledger 建显式名称 projection；补 inventory batches 的物料/旧产品身份名称。
2. **P0 前端列表**：统一 `formatMasterData`/运行时字典 formatter；用户显示 `姓名（账号）`；多态去向显示 `名称（编码）`。
3. **P0 字段语义**：确认并修正 stocktake operator/auditor；统一 inbound operator 的 username/userId 口径。
4. **P1 仓库主档**：仅补旧页状态 i18n render。
5. **独立决策项**：第 8 项先由用户提供确切 URL/截图；调拨状态机、出库操作员是否允许代指定作为独立缺陷处理，不随显示补丁暗改业务。
6. **生产预检**：走受控只读 workflow 验证名称 NULL/映射命中与部署 SHA；实施完成后再部署/UAT。

## 测试计划

- API contract：逐表断言名称列与原编码同时返回；DataScope WHERE 不因 JOIN 被绕过；同 code 跨公司/站点不能串名。
- locale：zh/en/lo 当前语言优先，缺失时按既定链回退；三语均空才显示 code；不伪造 OTHER/未知 enum 翻译。
- 用户：real_name 有值显示 `姓名（账号）`，NULL/离职/SYS/历史 user_id 均有确定 fallback。
- 多态去向：覆盖 HOUSE、CUSTOMER、WAREHOUSE、STORE、DEPARTMENT、PROJECT、EMPLOYEE、SUPPLIER、OTHER，每一类型验证正确主数据表、ACTIVE 与 scope。
- 页面 contract：9 个目标区域逐列断言，不以 selector 的 label 测试替代列表测试。
- 回归：API/Web `tsc --noEmit`，Web vitest；新增库存名称 contract tests；执行真实 scope-audit。
- 生产只读：部署前后用同一 manifest 抽样名称非空率、JOIN 命中率与 build SHA；浏览器 hard refresh 只作为部署确认步骤，不作为根因修复。

## 等待用户确认的问题

1. 第 8 项 UAT 的确切 URL 与截图是什么？当前 `/warehouse/query` 无新建表单。
2. 盘点页“盘点员”应指录入人 `operator`，还是审核人 `auditor`，或需分两列？
3. 出库/领用“操作员”是否必须是当前登录人（只读自动带出），还是允许有权限的人代指定？
4. 是否批准下一轮先运行受控 production read-only audit，再按上述 P0/P1 拆分实施？
