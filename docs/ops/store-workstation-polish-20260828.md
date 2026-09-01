# 门店工作台问题根因与完善方案（仅分析设计）

> 日期：2026-08-28（2026-08-29 完成代码复核）
>
> 范围：POS 成功提示、整单退货库存可见性、Terminal 与 Admin `/store/*` 样式
>
> 边界：本报告只读分析；未修改业务代码、数据库或生产数据。`QUARANTINE` 仍不可售。

## 0. 结论摘要

1. **“undefined 销售单创建成功”是确定的响应契约错配。** 创建接口返回
   `{ id, saleNo, totalAmount }`，Admin 与 Terminal 都读取 `sale.sale_no`。请求封装已经解开
   `response.data`，因此不是嵌套层级问题。
2. **退货库存没有丢失在退货写入链。** 整单退货严格按原 allocation 新建
   `inv_batches.status='QUARANTINE'`，落到 RETURNS binding 对应仓的 QUARANTINE 区位，同时写
   `inv_ledger.change_type='SALE_RETURN'`。
3. 用户最可能进入的 `/store/inventory` **完全不读 `inv_batches`**，而读独立的
   `store_inventory` CRUD 表；退货链从不写这张表。这是“退货成功但门店库存不显示”的首要根因。
   如果实际指 `/sales2/inventory`，则该页只查 `AVAILABLE`，隔离批次按设计必然不出现。
4. 推荐将 `/store/inventory` 收口到唯一批次台账，默认展示“全部在库”，分为“可售”和“隔离”
   两个视图；QUARANTINE 必须醒目可见但不得进入 POS、销售或补货可用量。质检转可售入口只有在
   现有 WMS 受控命令、权限和审计链确认后才建设，不能直接改状态。
5. 样式与交互最突出的问题是 Terminal 缺响应式与可靠反馈、父布局可能阻断触摸滚动，Admin
   简单 CRUD 吞操作错误且仍允许裸手填门店/SKU 编码。`/store/replenish` 可作为当前基线。

## A. POS 成功提示 `undefined`

### A1. 确切根因

数据链如下：

```text
POST /api/v2/store-sales
  → StorePosService.createSale()
  → { id: saleId, saleNo, totalAmount }
  → storePosRequest() 解开 response.data
  → 页面错误读取 sale.sale_no
```

证据：

- 后端创建结果只返回 camelCase `saleNo`：
  [store-pos.service.ts](../../apps/api/src/modules/store-pos/services/store-pos.service.ts#L311)。
- 共享请求封装返回 `response?.data ?? response`，已经处理嵌套：
  [store-pos-api.ts](../../apps/web/src/lib/store-pos-api.ts#L5)。
- Admin POS 成功 toast 读取不存在的 `sale.sale_no`：
  [store-pos/page.tsx](<../../apps/web/src/app/(admin)/store-pos/page.tsx#L619>)。
- Terminal POS 同样读取 `sale.sale_no`：
  [terminal/store-pos/page.tsx](<../../apps/web/src/app/(terminal)/terminal/store-pos/page.tsx#L51>)。

因此线上原文“`undefined 销售单创建成功`”对应 Admin 的拼接顺序；Terminal 会显示“成交成功
`undefined`”。两处是同一个错误契约，不是两个后端问题。

### A2. POS / 退货 / 班次 / 补货动态提示全扫

| 流程与位置 | 前端提示取值 | 后端实际返回 | 解包方式 | 风险结论 |
|---|---|---|---|---|
| Admin POS 创建并结账 | `sale.sale_no` | `{ id, saleNo, totalAmount }` | `storePosRequest` 解 `data` | **确定 undefined** |
| Terminal POS 创建并结账 | `sale.sale_no` | `{ id, saleNo, totalAmount }` | 同上 | **确定 undefined** |
| Admin POS 作废 | `voidTarget.sale_no`（列表行） | 作废响应 `{ ok, saleNo }` 未用于提示 | 同上 | 无响应错配；编号来自 DB 行 |
| Admin POS 整单退货 | `returnTarget.sale_no`（列表行） | 返回 `getSale()` 的 snake_case 行 | 同上 | 无响应错配；响应未插值 |
| Terminal 整单退货 | 固定文案 | 返回 `getSale()` | 同上 | 无动态响应字段 |
| Admin POS 开班 / 交班 | 固定文案 | 开班/交班返回 snake_case DB 行 | 同上 | 无动态响应字段 |
| Terminal 开班 / 交班 | 无成功动态文案 | 同上 | 同上 | 无动态响应字段 |
| 补货创建 | `r.id` 导航、`r.request_no` 成功提示 | `RETURNING *`，含 `id/request_no` | 同上 | 字段一致 |
| 补货提交 / 审批 / 发运 / 签收 / 关闭 | 固定文案 | 各动作返回更新行或 WMS 结果 | 同上 | 无动态响应字段 |
| Sales V2 退货动作 / 回库 | 成功不插值响应；失败取 `e.message` | 页面自有 fetch 返回完整 JSON | 不解 `data`，页面按结构读取 | 未见同类风险 |
| 包装开班 / 交班 | 固定 inline 成功提示；失败取 `message` | 返回值不用于成功文案 | `packagingApi` | 未见同类风险 |

相关实现出处：Admin 作废/退货
[store-pos/page.tsx](<../../apps/web/src/app/(admin)/store-pos/page.tsx#L413>)；补货创建与动作
[replenish/page.tsx](<../../apps/web/src/app/(admin)/store/replenish/page.tsx#L342>)；创建返回
[store-replenishment.service.ts](../../apps/api/src/modules/store-pos/services/store-replenishment.service.ts#L68)；
班次返回 [store-pos-shift.service.ts](../../apps/api/src/modules/store-pos/services/store-pos-shift.service.ts#L45)。

**实施口径建议：** 短修将两处读取统一为 `sale.saleNo`；同时为创建响应定义共享类型，避免继续用
`any`。不要为了兼容一个 toast 给后端重复返回 snake_case 与 camelCase。

## B. 退货后门店库存不可见

### B1. 退货实际写入事实

整单退货入口为 `POST /api/v2/store-sales/:id/return`，后端只允许 `COMPLETED` 单据并锁定原
`store_sale_allocations`。`reverseInventory()` 的行为为：

- 在 RETURNS 授权仓范围内精确查找 ACTIVE location + ACTIVE zone，且
  `zone_type='QUARANTINE'`；没有合规区位则整个退货回滚。
- 每条 allocation 按 `allocated_qty - returned_qty` 生成
  `RET-<sale_no>-<allocation.id>` 批次。
- 写 `inv_batches`：`source_type='STORE_RETURN'`、`source_no=<sale_no>`、
  `status='QUARANTINE'`，并写 allocation 的 SKU、规格、等级及 RETURNS 仓/位。
- 写 `inv_ledger`：`change_type='SALE_RETURN'`、门店、销售单号、公司、SKU、仓和库位。
- 最后将 allocation 的 `returned_qty` 更新到 `allocated_qty`。

核心证据见 [store-pos.service.ts](../../apps/api/src/modules/store-pos/services/store-pos.service.ts#L548)
与 [reverseInventory](../../apps/api/src/modules/store-pos/services/store-pos.service.ts#L1012)。RETURNS
binding 还必须与当前用户 `allowedWarehouseCodes` 取交集，见
[store-scope-policy.service.ts](../../apps/api/src/modules/store-pos/services/store-scope-policy.service.ts#L81)。

这与 V1-2 定稿“退货入隔离、质检后才能转可售”一致。历史修复报告也明确 RETURNS 区位按
`zone_type` 判断，而不是猜名称或编码，见
[store-pos-inventory-shortage-20260828.md](store-pos-inventory-shortage-20260828.md#L107)。

### B2. “门店库存”页面的真实数据源

| 页面 | 实际数据源 / WHERE | 与退货批次逐条件比对 | 不显示原因 |
|---|---|---|---|
| `/store/inventory` | Generic CRUD `store_inventory`；展示 `store_code/product_code/sku/qty_on_hand/qty_available` | 退货写 `inv_batches + inv_ledger`，不写 `store_inventory` | **首要根因：数据源是另一张表，无同步链** |
| `/sales2/inventory` | `inv_batches`，但强制 `status='AVAILABLE' AND qty_available>0` 且未过期 | 退货批次为 `QUARANTINE` | 按可售语义正确排除，但页面不能承担“全部门店库存” |
| `/store` 工作台 | Generic CRUD `inv_batches?limit=300`，无状态过滤；非全局用户按 warehouse DataScope | 状态不会排除；RETURNS 仓若不在 scope 会排除 | 理论上能计入 KPI，但不提供批次清单；scope 仍可能造成不可见 |
| `/warehouse/query` | `/api/inventory/batches`：正数量 + warehouse DataScope，无状态过滤 | 状态允许，仓 scope 必须命中 | 可见且展示状态；它不是门店业务入口 |

`/store/inventory` 的固定表名与字段见
[inventory/page.tsx](<../../apps/web/src/app/(admin)/store/inventory/page.tsx#L14>)；退货链未写该表。
`/sales2/inventory` 的可售过滤见
[egg-inventory.service.ts](../../apps/api/src/modules/sales-v2/services/egg-inventory.service.ts#L430)；通用批次查询的
DataScope 见 [generic-crud.service.ts](../../apps/api/src/modules/generic-crud/generic-crud.service.ts#L2329)。

因此在没有用户浏览路径或网络请求截图的前提下，不虚构唯一页面：

- 若用户从侧栏“门店库存”进入 `/store/inventory`，数据源分叉就是直接根因。
- 若实际进入 `/sales2/inventory`，`AVAILABLE` 过滤就是直接原因，但这是正确的“可售库存”口径。
- 若实际说 `/store` 工作台无指标变化，还需在实施前用退货单号只读核验批次仓是否处于该用户
  WarehouseScope；工作台吞错也可能把接口失败伪装成 0。

### B3. 方案选项

#### 方案 1：单页全状态 + 状态徽章

`/store/inventory` 改读 scoped `inv_batches`，展示状态、批次、数量、仓/区/位、来源销售单；
QUARANTINE 用醒目徽章，并提供状态筛选。

- 优点：改动直观，所有实物都可见，定位“货在哪”最快。
- 缺点：可售与不可售混在一个长列表，用户容易把正数量误读为可售量。

#### 方案 2：同一事实源，分 Tab（推荐）

仍以 scoped `inv_batches` 为唯一事实源：

- **全部在库**：所有正实物数量状态，默认入口，明确总在库/可售/隔离三个指标。
- **可售**：只含 `AVAILABLE`，供收银和补货参考。
- **隔离 / 待质检**：只含 `QUARANTINE`，展示 RETURNS 区位、来源单号、退货时间和待处理时长。

优点是既让退货立即可见，又不放宽可售语义；还能逐步淘汰 `store_inventory` 第二真相。缺点是需要
设计专用只读查询/BFF，而不是继续开放 Generic CRUD 直接编辑库存。

#### 方案 3：保留 `store_inventory`，建立投影同步

把 `inv_batches` 聚合投影到 `store_inventory`，页面继续读汇总表。

- 优点：表面改动较小。
- 缺点：引入同步时序、重放、对账和状态映射，继续维持第二真相；当前表也没有完整状态/区位模型。

**不推荐。** 若只为查询性能需要投影，应明确为可重建 read model，禁止人工 CRUD，并建设一致性监控；
不能让它继续成为可编辑库存来源。

### B4. 推荐语义与跨页统一口径

| 使用场景 | 推荐库存口径 | QUARANTINE |
|---|---|---|
| `/store/inventory` | 全部在库为默认；可售/隔离分 Tab | **显示**，醒目标记，不计可售 |
| Terminal POS 商品/结账 | 仅 `AVAILABLE` 且正可用、未过期、在 SALES 有效仓 | 不显示、不扣减 |
| Terminal 退货结果 | 成功反馈带销售单号，并说明“已进入隔离区待质检”；可链接到隔离 Tab | 可见但不可售 |
| 补货库存参考 / 审批 | 仅源仓 `AVAILABLE` | 不计可用量 |
| `/warehouse/query` | 全状态批次查询 | 显示状态，可筛选 |
| 资产/库龄分析 | 按状态分别计量，总资产可含隔离 | 单列隔离价值，不能混称可售 |
| 库存台账 | 全流水，并关联/展示批次当前状态 | `SALE_RETURN` 可追溯至隔离批 |

“质检转可售”入口不是简单 `UPDATE status`。实施前必须确认并复用 WMS 受控命令，至少要求权限、
质检结果、目标 SALES 区位、数量守恒、ledger、幂等与审计；若现有链路不满足，本阶段只展示待质检，
不提供转换按钮。

另有一项需要主 agent / 业务复核：当前退货批次写入 `qty=qty_available=退货量`，同时状态为
`QUARANTINE`。现有 POS、Sales FIFO、补货审批均还用 `status='AVAILABLE'` 双保险，不会把它出售；
但 `qty_available` 名称会误导只看数量的通用查询。可选择：

1. 保持当前字段含义，以状态决定可售，并要求所有消费方强制状态过滤；或
2. 将隔离批 `qty_available` 规范为 0，另以 `qty` 表示实物在库。

这是跨 WMS 的字段语义裁定，不能在本次显示修复中顺手改变；需要约束、既有查询、迁移末态和
写入路径三对齐后另案实施。

### B5. 其它库存视图对 QUARANTINE 的盲区

| 视图 / API | 当前行为 | 问题与建议 |
|---|---|---|
| `/warehouse/query`、`/api/inventory/batches` | 正数量、无状态过滤，页面展示状态 | 可见，基本正确；明确这是“全库存”而非“可售” |
| `/warehouse` 总览 | 无状态过滤，QUARANTINE 进入总量/临期 KPI | 指标需按状态拆分，避免隔离货被称为可用 |
| `/analytics/inventory` summary | QUARANTINE 进总批次/总量/等级桶，但不进 activeCount | 口径混合；API 返回分状态指标 |
| PDA inventory sync | 无状态过滤，响应不返回 status | **高风险**：终端无法识别隔离；至少返回状态并按任务语义过滤 |
| Terminal `/wms/stocktake` | 会加载 QUARANTINE，但 UI 不显示状态 | 盘点可包含隔离实物，但必须展示状态/区位，避免误判 |
| `/warehouse/ledger` | 不关联批次当前状态 | 流水可见但无法识别隔离；增加只读关联列/筛选 |
| `/api/lookup/batches` | 正数量、无状态过滤 | 供质检可合理，供出库则不合理；按 use-case 拆端点 |
| BFF `/inventory` | `qty>0` 聚合，无状态 | 总量混合；拆 total/available/quarantine/reserved |
| 销售 FIFO、POS FIFO、补货审批 | 均强制 `AVAILABLE` | **保持不变，当前口径正确** |
| Inventory Analytics | 明确返回 quarantine value | 合理；保持状态拆分 |

关键出处：WMS 批次/summary
[wms.service.ts](../../apps/api/src/modules/wms/wms.service.ts#L1265)，PDA
[terminal.service.ts](../../apps/api/src/modules/terminal/terminal.service.ts#L57)，Terminal 盘点
[stocktake/page.tsx](<../../apps/web/src/app/(terminal)/terminal/wms/stocktake/page.tsx#L28>)，补货审批
[store-replenishment.service.ts](../../apps/api/src/modules/store-pos/services/store-replenishment.service.ts#L94)，POS FIFO
[store-pos.service.ts](../../apps/api/src/modules/store-pos/services/store-pos.service.ts#L793)。

## C. 门店工作台样式与交互审查

### C1. 基线

`/store/replenish` 已具备 `PageShell`、结构化 toast、`ErrorState + retry`、区分加载/空态/筛选无结果、
桌面表格与移动卡片、权限门禁、selector、固定操作区及 `max-width:768px` 响应式规则。以下矩阵以此
为基线，不把共享 `DataTable` 已有的 loading/error/横向滚动能力误报为缺失。

### C2. Terminal 收银 / 退货 / 班次

| 严重度 | 页面 | 缺陷证据 | 设计建议 |
|---|---|---|---|
| P1 | 全 Terminal | 父 layout 固定 `100vw/100vh` 且 `touchAction:'none'`；子页依赖 overflow 滚动 | 将 touch-action 限于需防手势区域，内容区允许 `pan-y`；真机验证长页滚动 |
| P1 | `/terminal/store-pos` | Header 单行、门店 selector 固定 320px、购物车列最小 360px，无 media query | 窄屏 header 换行；商品/购物车改单列或抽屉；保留大触控目标 |
| P1 | 包装开班 | 双栏左侧固定 280px，外层和内容均 `overflow:hidden`，无断点 | 窄屏改单列，低高度允许滚动，底部主操作保持可达 |
| P1 | 包装交班 | 子容器 `overflowY:auto`，但父层 `touchAction:none` | 修正父层后做真实触屏回归 |
| P2 | POS 加载/错误/空态 | 初始无 loading；异常与成功共用可点击 div；商品/最近销售空数组无空态 | 统一 Loading、ErrorState/retry、EmptyState、success/error toast；提示条可键盘关闭 |
| P2 | POS 退货 | 原生 `prompt`，无 try/catch、busy、防重复提交或失败反馈 | 触屏 modal：原因必填、确认摘要、提交锁、成功结果与失败重试 |
| P2 | POS 权限 | 面板入口不受退货权限控制，仅行按钮受控 | 入口与动作统一门禁；无权时隐藏或说明 |
| P2 | POS 可访问性 | `−/＋` 无 aria-label；可点击 message 不是 button | 补语义、焦点态、键盘操作与 `role=alert/status` |
| P2 | POS 禁用反馈 | 现金账户缺失不进入 disabled 计算；离线按钮文案与实际“禁止成交”不够清晰 | 主按钮旁列出不可结账原因，选择账户前明确禁用 |
| P2 | 包装开班 | UI “未完成项”按全部项算，提交条件却排除 grader/scale；离线原因文案要求必填但逻辑不校验 | 建立单一必检规则；可选项显式标记；校验与文案一致 |
| P2 | 包装开/交班 | 场站失败伪装“无可选场站”，字典静默 fallback；交班分级空数组无空态 | 区分无权限/空数据/请求失败/降级，均提供重试或解释 |
| P3 | POS 设计一致性 | 核心文案硬编码中文，页面全部 inline style，未用共享 Button/状态组件 | 接入 i18n 与共享 token/components，抽 module CSS 响应式 |

证据集中于 [Terminal POS](<../../apps/web/src/app/(terminal)/terminal/store-pos/page.tsx#L55>)、
[Terminal layout](<../../apps/web/src/app/(terminal)/layout.tsx#L125>)、
[shift-open](<../../apps/web/src/app/(terminal)/terminal/packaging/shift-open/page.tsx#L229>)、
[shift-close](<../../apps/web/src/app/(terminal)/terminal/packaging/shift-close/page.tsx#L221>)。
当前没有独立 Terminal 退货 route，退货是 POS 页内面板。

### C3. Admin `/store/*`

| 严重度 | 页面 | 缺陷证据 | 设计建议 |
|---|---|---|---|
| P1 | inventory/daily/losses/receiving | `store_code`、SKU/product/operator 等仍为裸 text；库存还允许通用 CRUD | 用 StoreMembership/SKU/User selector；库存页面改只读事实查询，写动作走 WMS command |
| P1 | 同上 | 保存/删除只有 `try/finally` 或裸 await，无 catch/toast | 失败保留表单/确认上下文并 toast；成功后才关闭与刷新 |
| P1 | `/store` | `Promise.all(...).catch(() => {})`，API 失败会显示 0 与“暂无收货” | 页面 ErrorState + retry；错误时禁止展示误导性正常 KPI |
| P2 | `/store` | 主体固定 `1fr 280px`、快捷入口三列，无断点 | CSS 响应式：窄屏单列，入口 auto-fit/两列 |
| P2 | 简单 CRUD | 只使用 DataTable 通用“暂无数据”，缺业务空态与下一步 | 定制空态文案；有创建权限时提供明确 CTA |
| P3 | `/store` | `lowStock` 已计算但未展示；已有 module CSS 与大量 inline style 分叉 | 业务确认后展示或删除；收口到 module CSS/token |

对应证据：工作台加载与 KPI
[store/page.tsx](<../../apps/web/src/app/(admin)/store/page.tsx#L61>)；库存 CRUD
[inventory/page.tsx](<../../apps/web/src/app/(admin)/store/inventory/page.tsx#L38>)；日结
[daily/page.tsx](<../../apps/web/src/app/(admin)/store/daily/page.tsx#L38>)；损耗
[losses/page.tsx](<../../apps/web/src/app/(admin)/store/losses/page.tsx#L38>)；收货
[receiving/page.tsx](<../../apps/web/src/app/(admin)/store/receiving/page.tsx#L35>)。

已达标项也应保留：各简单 CRUD 已统一使用 PageHeader、RightDrawer、CrudForm、ConfirmDialog；共享
DataTable 已有加载、错误、空态与横向滚动。`/store` 刷新按钮有 loading 禁用，近期收货有空态；
`/store/replenish` 是当前最完整基线。

## D. 实施拆分（主 agent 复核后另轮执行）

### D0：先做只读复现定位

1. 记录用户实际访问 route 与对应 Network request。
2. 以销售单号只读核验 sale、allocation、`RET-*` 批次、`SALE_RETURN` ledger、RETURNS 仓/位和状态。
3. 以 amei 权限上下文核验 Store Membership、RETURNS binding 与 WarehouseScope 交集。
4. 明确 `qty_available` 在各状态的全局语义，再决定是否另立 WMS 治理任务。

### D1：小而确定的契约修复

- 两处 `sale.sale_no → sale.saleNo`。
- 建立共享 `CreateStoreSaleResult` 类型，移除创建结果的 `any`。
- 补 Admin 与 Terminal 成功提示测试，断言真实销售单号且不含 `undefined`。

### D2：库存只读模型收口

- 新建 scoped 门店库存 query/BFF，以 `inv_batches` 为事实源；默认全部在库，支持状态/门店/仓/区位/SKU。
- `/store/inventory` 改为只读的全部/可售/隔离 Tab，移除直接编辑库存入口。
- KPI 与 API 返回显式 `onHand/available/quarantine/reserved`，不靠前端猜状态。
- 对 `store_inventory` 做消费者审计；确认无权威写链后再制定冻结/退役方案，不能直接删表。

### D3：退货体验与受控质检衔接

- 退货 modal、原因校验、busy/幂等反馈、成功后展示单号与“隔离待质检”。
- 隔离列表关联来源销售单与 ledger。
- 只有现有 WMS 命令满足权限、质检、数量守恒、ledger、幂等后才增加“质检转可售”入口。

### D4：库存查询口径治理

- PDA 返回 status；stocktake 显示状态/区位；lookup 按用途拆分。
- 仓储/BFF/analytics KPI 区分全库存、可售和隔离。
- POS、销售 FIFO、补货的 `AVAILABLE` 条件设为契约测试硬门，禁止因“可见”需求放宽。

### D5：样式与反馈

- 先修 Terminal 触摸滚动、POS 响应式、退货反馈；再统一状态组件与 i18n。
- Admin 先修吞错与 selector，再做响应式和空态。
- 以 `/store/replenish` 的 PageShell、toast、ErrorState、移动 cards 和 CSS 断点为基线复用。

## E. 测试与验收计划

### 单元 / 契约

- `createSale` 返回类型与两入口 toast：销售单号必须出现，文本不得含 `undefined`。
- `returnSale`：COMPLETED 成功、非 COMPLETED/重复/并发退货拒绝；逐 allocation 数量、SKU/规格、
  `QUARANTINE + STORE_RETURN + SALE_RETURN`；任一库存/现金/AR 异常全事务回滚。
- Store scope：跨店、跨公司、RETURNS binding 不在 WarehouseScope 时 fail-closed。
- 库存 query：全部 Tab 包含 QUARANTINE，可售 Tab 严格排除；状态统计数量守恒。
- POS FIFO、Sales FIFO、补货审批继续断言 `status='AVAILABLE'`。

可复用现有测试：

- POS 原子性 [store-pos-atomicity.service.spec.ts](../../apps/api/src/modules/store-pos/services/store-pos-atomicity.service.spec.ts#L11)
- V1-2 契约 [store-pos-v1-2.contract.spec.ts](../../apps/api/src/modules/store-pos/store-pos-v1-2.contract.spec.ts#L4)
- Scope policy [store-scope-policy.service.spec.ts](../../apps/api/src/modules/store-pos/services/store-scope-policy.service.spec.ts#L25)
- Web API [store-pos-api.test.ts](../../apps/web/src/lib/store-pos-api.test.ts#L7)
- Terminal state [terminal-store-pos-state.test.ts](../../apps/web/src/lib/terminal-store-pos-state.test.ts#L4)
- 补货 UI 契约 [replenishment.contract.test.ts](<../../apps/web/src/app/(admin)/store/replenish/replenishment.contract.test.ts#L9>)

当前缺口：没有 `returnSale` 成功/重复/QUARANTINE 入库的后端行为测试；旧
`pos-store-regression.sh` 探测到已删除的 `/api/v3/pos` 后整体 SKIP，不能作为当前链路验收。

### API / 数据库集成

用临时 fixture 完成“开班→建单→支付→整单退货”，断言：

1. sale 为 `RETURNED`，allocation `returned_qty=allocated_qty`；
2. 每条 allocation 只有一个精确 `RET-*` 批次，状态 QUARANTINE、RETURNS 区位正确；
3. `SALE_RETURN` ledger、现金 OUT / AR reversal 与原单可追溯；
4. 第二次调用无任何第二副作用；
5. `/store/inventory` 全部/隔离可见，可售不可见；POS/补货仍不可消费。

### Web / E2E / 视觉

- Admin 与 Terminal 两入口均跑真实响应 mock，验证 toast 单号。
- 退货 modal：原因必填、取消、失败、重复点击、成功跳隔离 Tab。
- 390px、768px、桌面三档；真实触摸设备验证纵向滚动、软键盘、sticky 操作区。
- Loading / empty / error / retry / permission denied 四态逐页截图审查。
- 断网、接口 500、无商品、无最近销售、无场站、空字典等不能伪装成正常空态。
- 可访问性：焦点顺序、aria-label、alert/status、键盘关闭与颜色对比。

现有 Playwright 仅有补货生命周期与 390px smoke：
[store-replenishment.spec.ts](../../apps/web/e2e/store-replenishment.spec.ts#L38)。尚无真实 POS
开班→结账→退货浏览器 fixture，实施轮必须补齐或明确人工 UAT gate。

## F. 本轮复核边界

- 未访问或写入生产数据库；线上实测结果来自用户描述，代码链来自当前仓库。
- 未确认用户当时具体停留的库存 route，因此按三个候选页面分别给出可证伪结论；实施前 D0 必做。
- 未修改 toast、库存查询、样式、迁移、测试或配置。
- 未改变 `QUARANTINE` 不可售语义，也未建议直接更新状态绕过质检。

## G. 2026-08-29 实施记录

### G1. 已实施

- 创建销售响应统一为共享 `CreateStoreSaleResult { id, saleNo, totalAmount }`；Admin 与 Terminal 成功提示均读取 `saleNo`，契约测试用真实 `POS-20260829-00007` 断言无 `undefined`。
- 新增 `GET /api/v2/store-sales/inventory` 只读查询。门店必须来自有效 membership；仓库集合为该门店 ACTIVE `SALES + RETURNS` binding 与当前 `WarehouseScope` 的交集，任一上下文缺失均 fail-closed。查询事实源为 `inv_batches`，正实物口径为 `qty > 0`；可按状态、仓、区、位、SKU/产品/批次筛选，并返回 `onHand/available/quarantine/reserved` 明细指标。
- `/store/inventory` 已移除 `store_inventory` Generic CRUD 新增、编辑、删除入口，默认“全部在库”，另有“可售”“隔离/待质检”Tab；隔离行展示来源销售单、RETURNS 仓/区/位、退货时间及关联 `SALE_RETURN` ledger。
- Terminal 整单退货由 `prompt()` 改为 `ModalV2`：原因必填、确认摘要、busy 防重复、失败可重试，成功反馈包含销售单号及“已入隔离区待质检”；入口与动作均要求删除/退货权限。未增加质检转可售按钮，未改变 QUARANTINE 的 `qty_available` 语义。
- Terminal 根布局触控允许 `pan-y`；POS 在桌面双栏、900px 单列、520px 紧凑布局三档响应，包装开班在 760px 改单列且低高度可滚动，交班确认框增加窄屏上限。POS 增加 loading/empty/error/retry、语义化 alert/status 与数量按钮 aria-label。
- Admin `/store` 加入 `ErrorState + retry`，加载失败时不再显示误导性 0 KPI；工作台及快捷入口增加 768/420px 断点。daily/losses/receiving 的门店、SKU、操作员改用 Store/SKU/User Selector，损耗原因改用 `INV_LOSS_REASON`，保存/删除增加成功及失败 toast。
- PDA inventory pull 响应增加 `status`；Terminal 盘点批次及盘点清单显示状态、仓库和货位。

### G2. `store_inventory` 消费者审计

只读检索范围为 `apps/api/src`、`apps/web/src`、`apps/api/scripts`：

- Web 表级消费者原为 1 个：旧 `/store/inventory` Generic CRUD 页面；本次已移除，因此现行 Web 业务消费者为 0。
- API 业务 service 权威读写链为 0。仅剩 Generic CRUD allowlist/初始化兼容代码 4 处，不构成库存业务写链。
- 运维回归脚本 2 处（清理/历史说明），不是生产写入权威链。
- 结论：表保留，不删 schema、不迁移数据；建议冻结新增消费者与人工写入，另案核验生产 SQL 引用后退役。

### G3. 验证与待完成外部步骤

- API 专项覆盖：库存三 Tab/统计/ledger 关联/fail-closed；退货成功、重复、并发锁复检、库存异常回滚；既有 AVAILABLE FIFO/QUARANTINE 区位契约继续执行。
- Web 专项覆盖：两入口真实单号 toast、退货 ModalV2、权限与 busy、三档响应式、移动库存卡、三语键、触摸滚动。
- i18n 门禁真实修复：补齐 `ui.门店工作台加载失败` 的 zh/en/lo 三语值，未删除任何键；`node scripts/check-i18n-keys.js` 结果为三语各 14,256 键、7,795 个引用全部命中，hardcoded coverage 为 3,344/3,344。
- 冻结/安全触碰已逐文件复核并在 PR 登记 `reviewed-frozen-boundary`、`reviewed-security-touch`。改动未涉及 migration、entity、schema、TypeORM/database 或部署链；安全扫描唯一 finding 是事务测试 mock，权限与 DataScope 交集另行人工复核。`ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` 为 20/20 PASS。
- PR [#139](https://github.com/ivanzhao299/phoenix-erp-v3/pull/139) 在 head `dabbb137` 达到 7 success、0 failure、0 pending（3 项条件跳过），于 2026-09-01 合并，merge SHA `4866ce07329543732497d0e881af8f686db95603`。
- 首次 full 生产部署 [run 33459106042](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33459106042) 成功。生产只读复验随后发现退货 SQL 将 QUARANTINE 批次的 `qty_available` 错写为退货数量；未绕过门禁，代码改为插入与冲突更新均写 `qty_available=0`，并补专项回归（9/9 PASS）。修复提交 `1f91fef512be035f9455141b7b8d621feff740e2` 的 main CI [run 33460266027](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33460266027) 成功。
- 修复后的 full 生产部署 [run 33460884007](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33460884007) 成功。生产三方 revision 核实：checkout/API image/Web image 均为 `1f91fef512be035f9455141b7b8d621feff740e2`。
- 生产只读 G3 验收 [run 33461334860](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33461334860) 成功，且输出 `PRODUCTION_BUSINESS_WRITES=0`：
  - amei 上下文唯一命中 `STORE-HS-001`，角色 `CASHIER,STORE_MANAGER`，Sales binding 与 WarehouseScope 交集均为 true；`/store/inventory` 鉴权页面 HTTP 200。
  - 三 Tab：ALL=8、AVAILABLE=4、QUARANTINE=4；`onHand=2117`、可售口径 `status='AVAILABLE'` 合计 2103；AVAILABLE 返回无非 AVAILABLE 行，QUARANTINE 返回无非 QUARANTINE 行，三个响应 summary 一致。
  - D0 真实退货定位：`RET-POS-20260830-00028-4` / 销售单 `POS-20260830-00028` / 仓 `ST_LAO_XINGCHI_HS_001_SALES` / `status=QUARANTINE` / `SALE_RETURN` / `qty=2.000`。只读 SQL 与库存 API 等价命中；该批次在 ALL/QUARANTINE 口径可见，在 AVAILABLE 口径不可见。
  - 30 分钟 `store-sales` / membership 相关错误窗口计数为 0。
- 生产现存 4 条 QUARANTINE 行（含上述历史退货批）带有非零 `qty_available`，属于修复部署前遗留数据；本任务未执行生产数据修复。不可售仍由 `status='AVAILABLE'` 硬过滤保证，新退货写路径已固定为 0。遗留行应另立受控数据治理任务，在只读盘点、审批与可回滚脚本齐备后处理，不能直接放宽 QUARANTINE 状态。
