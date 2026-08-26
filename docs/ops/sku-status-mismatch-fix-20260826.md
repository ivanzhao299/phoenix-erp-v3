# SKU 状态/生效期与入库引用口径闭环（2026-08-26）

## 1. 生产取证

- 既有只读生产审计 run `32921803697`：`product_skus` 有 54 条 ACTIVE、54 个不同
  `sku_code`。旧审计未输出 `effective_date/expire_date`，本次已扩充只读 workflow，新增
  全量状态、生效期、近期 `wms_inbound` 身份字段及错误日志查询。
- `sys_error_logs` 的既有 run `32798119645` 命中 2026-08-25 的 5 条生产入库 500，均为
  `INSERT has more expressions than target columns`，属于日产蛋入库旧故障，不是本次 WMS
  确认的 BadRequest 文案。
- BadRequest 不一定写入 `sys_error_logs`；在扩充审计前，仓库中没有足够证据锁定用户所选
  SKU。因此不做猜测性数据修正。

## 2. 链路与根因判定

### 2.1 报错时点

- 新建保存走 `POST /api/crud/wms_inbound`，只持久化 PENDING 单据，不调用
  `resolveInventoryItem`。
- 点击确认才走 `POST /api/inbound/confirm` → `WmsService.confirmInbound` →
  `resolveInventoryItem`，题述文案只能在确认阶段出现。
- `CrudForm.onPickKeys` 语义为“目标字段 ← raw 字段”。入库页配置会正确写入
  `item_type/sku_code/product_code`，不存在 camelCase 落库失配。

### 2.2 H1–H4

| 假设 | 结论 | 依据 |
|---|---|---|
| H1 状态双轨 | 排除代码层双轨 | 档案 `GET /master-data/runtime/sku` 与 WMS 均直接读取 `product_skus.status`；Panel 只是标签展示，不另算状态 |
| H2 生效期链路 | 确认存在系统性口径失配 | runtime `/sku/active` 过滤生效期；SKU Selector、库存品目 lookup、WMS/价格校验此前只过滤 ACTIVE |
| H3 Selector 值域 | 确认存在 | `/product-master/skus` 与 `/lookup/inventory-items` 此前均忽略生效期，与 runtime active 不同 |
| H4 提交值失配 | 当前管理端排除 | Selector raw → snake_case 映射正确；旧数据/其他客户端仍由确认兼容路径处理 |

题述“下拉可选但确认报不存在或停用”在同一数据库快照、同一现行代码下不能由过期 SKU
单独造成，因为旧 WMS 校验也未过滤日期。可成立的剩余条件是选择后到确认前状态变化、旧客户端/
旧单据身份值，或线上 revision 与当前源码不同。最终归因以扩充后的生产只读结果为准。

## 3. 语义裁定与修复

裁定采用保守引用语义：可用于新业务单据的 SKU 必须同时满足：

```text
status = ACTIVE
AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
AND (expire_date IS NULL OR expire_date >= CURRENT_DATE)
```

- `/lookup/inventory-items`、`/product-master/skus`、WMS 确认（含 legacy SKU fallback）、
  价格明细 SKU 校验统一使用该口径。
- WMS/价格错误文案增加“不在生效期”，避免把过期误导成档案不存在。
- SKU 档案详情同时展示生效日期和失效日期。
- runtime 保存增加 `effective_date <= expire_date` 校验，阻止反向区间。
- FROZEN/ARCHIVED 仍严格拒绝，没有放宽停用保护。

管理档案仍需展示所有生命周期记录；因此精确不变量是：**所有业务 Selector 可选集合 = 所有
保存/确认引用校验可接受集合**。档案中 ACTIVE 但尚未生效/已经失效的记录会明确显示日期，但不会
出现在业务 Selector。

## 4. 同类口径矩阵

| 类型 | 档案/runtime active | Selector/lookup | 保存校验 | 结论 |
|---|---|---|---|---|
| SKU | ACTIVE + 生效期 | 本次统一为 ACTIVE + 生效期 | WMS/价格本次统一 | 已闭环 |
| customer | ACTIVE + 生效期 | 仅 ACTIVE | 多数业务只存 code | 待抽取共用引用网关 |
| supplier | ACTIVE + 生效期 | ACTIVE + is_active | 多数业务只存 code | 另有 DataScope 失配，需独立治理 |
| warehouse | ACTIVE + 生效期 | ACTIVE + OPERATIONAL | WMS 另校验 domain/scope | 日期仍失配 |
| store/cash-account | ACTIVE + 生效期 | 仅 ACTIVE | 各模块分散 | 日期仍失配 |
| grade/spec | runtime 按生效期 | 产品 API 仅 ACTIVE | 表单日期写入曾被忽略 | 需单独修正字段模型后统一 |
| material/product/project | 配置为无生效期 | ACTIVE | ACTIVE | 明确豁免 |
| driver/vehicle | runtime 尝试按生效期 | Selector 主要客户端滤状态 | writableCols 不含日期 | 模型/页面失配，需独立迁移治理 |

本次没有把不同表结构强行批量套 SQL：grade/spec/driver/vehicle 存在“页面字段、runtime
writableCols、生产 schema”三方差异，直接扩张会有生产 500 风险。后续应建立单一
`referenceable` 查询网关，再逐类型迁移，而不是继续复制日期条件。

其他核查结果：`price-items.service` 已随 SKU 修复；POS `getProducts()` 还存在漏掉
`sal_price_items.status='ACTIVE'` 的独立缺陷，价格册对 customer/channel/company 的引用校验也
不完整，建议作为销售定价治理单独闭环，避免扩大本次 WMS 修复半径。

## 5. 回归与发布记录

- API 定向 Jest：`wms.service.spec.ts`，增加 SKU 查询必须包含双日期边界的回归断言。
- API 全量 Jest：66 suites / 585 tests PASS。
- Web 全量 Vitest：80 files / 444 tests PASS。
- API/Web `tsc --noEmit`：PASS。
- `git diff --check`：PASS。

生产只读 run、PR、main CI、full 部署、revision 和原操作复测结果在执行后追加于本节。
