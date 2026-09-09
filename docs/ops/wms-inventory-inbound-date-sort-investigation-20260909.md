# WMS 库存查询“入库日期”与默认排序核查（2026-09-09）

## 结论

本轮只核查，不改业务代码、schema 或数据。

1. 用户在通用入库单填写的“入库日期”权威源是 `wms_inbound.date`；采购 V2 收货的对应业务日期是 `prc2_receipts.receipt_date`。`egg_date` 是生产日期，不能复用为入库日期。
2. `inv_batches` 当前没有专门的入库日期列。`created_at` 表示批次记录写入库存台账的系统时间，只能回答“何时入账”，不能无条件冒充用户填写的业务入库日期。
3. 库存查询主 API 和 404 fallback 已按上轮契约 `egg_date DESC NULLS LAST, batch_no DESC, id DESC` 排序。页面既不展示 `egg_date`，普通入库等路径又不写 `egg_date`，所以用户看到的行在可见列上像是乱序。
4. 本次用户明确要求把该页默认排序从“生产日期降序”改判为“入库日期降序”。这是对 2026-09-08 上轮契约的覆盖，不是上轮 SQL 漏改。
5. 建议新增 `inv_batches.inbound_date DATE NULL`，在批次入账时快照业务单据日期；库存查询显式投影为 `inbound_date`，按 `inbound_date DESC NULLS LAST, batch_no DESC, id DESC`。不建议用查询时跨单据表猜测，也不建议直接把 `created_at::date` 标成入库日期。

## A. 数据链与根因

### A1. 日期语义与关系

| 字段 | 当前语义 | 是否可作为权威入库日期 |
|---|---|---|
| `inv_batches.egg_date` | 生产日期；迁移注释和生产批次写入均如此定义 | 否 |
| `inv_batches.created_at` | 批次记录创建/库存入账系统时间 | 仅可作为“入账时间”，不是单据业务日期 |
| `wms_inbound.date` | 通用入库单页面填写的“入库日期”，类型 `DATE` | 是，通用入库链权威源 |
| `prc2_receipts.receipt_date` | 采购 V2 收货业务日期 | 是，采购收货链权威源 |

证据：

- `inv_batches` 基础定义只有 `created_at`/`updated_at`，没有 inbound 日期：`apps/api/src/modules/generic-crud/generic-crud.service.ts:1299-1311`。
- `egg_date` 的 schema 注释是“生产日期”：`apps/api/migrations/20260527_sales_v2_phase7_egg_inventory.sql:13-20`；生产批次写入 `egg_date`：`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:314-350`。
- `wms_inbound.date DATE` 由 G17 加入：`apps/api/migrations/20260607_g17_outbound_dict_seed.sql:46-54`；入库页面字段 key 是 `date`：`apps/web/src/app/(admin)/warehouse/inbound/page.tsx:76-99`，保存 payload 会保留或默认该值：`apps/web/src/lib/warehouse-inbound.ts:51-67`。
- 通用入库确认只按 `task_no` 读取任务并写批次，写入列中没有单据日期或来源单号：`apps/api/src/modules/wms/wms.service.ts:349-385,489-518`。一张入库单可生成多个明细/批次，但批次没有可靠的直接外键保存该关系。
- 采购收货保存 `receipt_date`：`apps/api/src/modules/procurement-v2/services/receipts.service.ts:188-211`；确认调用 `inboundFromReceipt` 时未传日期：同文件 `:319-328`，WMS 写批次也未保存该日期：`apps/api/src/modules/wms/wms.service.ts:575-590,626-647`。

因此，现状不存在“直接存于每个 `inv_batches` 行、统一表示其业务入库日期”的权威值。通用入库可由单据一对多产生批次，但日期没有下沉；采购链只能借助 ledger `ref_no` 间接追到收货单。仅靠 `batch_no` 或 `created_at` 回推会混淆业务语义。

### A2. 查询、列与排序现状

- 页面 `/warehouse/query` 正常调用 `GET /api/inventory/batches`，仅 HTTP 404 时回退通用 CRUD：`apps/web/src/app/(admin)/warehouse/query/page.tsx:31-39`、`apps/web/src/lib/warehouse-query.ts:56-66`。
- 主 API 查询返回 `b.*`，当前排序是 `b.egg_date DESC NULLS LAST, b.batch_no DESC, b.id DESC`，并在排序后截取 200 行：`apps/api/src/modules/wms/wms.service.ts:1331-1353`。
- fallback 也执行同一生产日期契约：`apps/api/src/modules/generic-crud/generic-crud.service.ts:2580-2599`。
- 页面不做客户端排序，过滤后直接 `map`，展示顺序完全来自 API：`apps/web/src/app/(admin)/warehouse/query/page.tsx:58-60,152-155`。
- 当前列为“批次号、库存品目、仓库、库位、库存数量、状态、保质期至、归属门店”，没有入库日期或生产日期：同文件 `:132-142`；日期单元格读取的是 `expire_date || expiry_date`：`:175-177`。

### A3. “乱序”的根因

上轮提交 `9c5757e0` 已把 WMS 主查询从 `created_at DESC` 改为生产日期稳定排序，上轮报告也明确锁定该契约：`docs/ops/inventory-and-business-list-stable-sorting-closeout-20260908.md:20-30,34-45`。

当前代码不是没有 `ORDER BY`，而是排序口径与用户本次期望不同：页面隐藏排序键 `egg_date`，普通 WMS 入库、包装中间批次、调拨目标批次等路径还可能不写/不复制 `egg_date`。这些 NULL 行统一落在后段，再按批次号/id 排，用户依据可见的保质期或批次号观察，自然呈现为“乱序”。若线上实际连上述生产日期顺序也不满足，才需要另查部署 revision；仓库当前 `main` 与 `origin/main` 均已包含上轮提交。

## B. 口径定案与实施方案（待用户授权）

### B1. 权威值定案

选择“批次上的业务入库日期快照”，字段建议为 `inv_batches.inbound_date DATE NULL`：

- 通用 WMS 入库：确认时从 `wms_inbound.date` 写入每个产生/合并的批次。
- 采购 V2 收货：从 `prc2_receipts.receipt_date` 传入 WMS 并写入批次。
- 生产、包装、调拨等无独立入库单的库存增加：必须逐链定义业务日期；无法证明时保留 NULL，并记录来源，不拿 `egg_date` 代替。
- `created_at` 保留为审计/系统入账时间，可用于历史数据无法回填时的辅助展示或运维排查，但不应在 API 中无标识地 `COALESCE(inbound_date, created_at::date)` 后仍命名为“入库日期”。

选择快照而非查询时 join 的原因：现有批次没有统一 inbound 外键；同一批次可能经合并、调拨或其他库存动作演化；跨不同来源表动态猜测会产生歧义、性能成本和不可稳定复现的历史结果。专列能固定入账当时采用的业务日期，同时保留 `created_at` 作为技术审计时间。

需在实施前确认合并批次规则：若相同唯一键的库存被 upsert 到既有批次，不得静默覆盖旧批次的入库日期。优先方案是避免跨入库日期合并；若现有唯一键不允许，应明确采用最早入库日（库存年龄/FEFO 语义）并用测试锁定，而不是采用最后写入日。

### B2. 后端与前端改造

待授权后建议：

1. 新建 TypeORM TS schema 迁移，为 `inv_batches` 增加 nullable `DATE inbound_date` 及与查询匹配的索引；迁移实现 `down()`。业务历史回填若需要 DML，按迁移治理规则单独设计和审批，不能把不可靠值批量伪装为业务日期。
2. 所有能够证明来源日期的库存入账路径显式传递并写入 `inbound_date`；同时核对普通入库、采购收货、生产、包装、调拨、退货及门店相关路径。
3. 主 API 不再依赖含糊的 `b.*` 契约，至少显式保证响应有 `b.inbound_date AS inbound_date`；默认排序改为：

   ```sql
   ORDER BY b.inbound_date DESC NULLS LAST,
            b.batch_no DESC,
            b.id DESC
   ```

   404 fallback 的 `inv_batches` 默认排序同步修改，防止主路由缺失时契约改变。
4. `WarehouseQueryBatch` 增加 `inbound_date`；库存查询表在“状态”之后、“保质期至”之前增加“入库日期”，日期显示复用现有 `YYYY-MM-DD` 格式，空值显示 `-`，并把 loading/empty `colSpan` 从 8 改为 9。
5. 更新 `docs/ops/inventory-and-business-list-stable-sorting-closeout-20260908.md` 的后继留档或追加勘误说明：仅 WMS 库存查询默认契约由生产日期改判为入库日期；不要把销售库存、FEFO/临期或其他页面一并改掉。

### B3. 历史数据策略

必须先用生产只读审计量化来源覆盖率，再决定回填：

- 能以可靠 `inv_ledger.ref_no` 唯一关联 `wms_inbound` 或 `prc2_receipts` 的批次，可提出确定性回填方案。
- 一对多本身不是问题；多来源或同批次多次入库才是歧义，需列出冲突数，并明确采用最早日期、拆批或保持 NULL。
- 无可靠关联的历史行保持 NULL，排序 `NULLS LAST`。若业务需要展示入账日期，应另列“入账时间”或明确标注估算/回填来源，不能篡改“入库日期”定义。

### B4. 同页及其他消费方影响

| 消费方 | 影响 |
|---|---|
| WMS 库存查询 | 直接受影响；新增列并改变前 200 条的排序/截断集合 |
| Terminal 盘点页 | 共用 `/api/inventory/batches`，会跟随新的初始行顺序；扫码按 `batch_no` 查找和提交不变（`apps/web/src/app/(terminal)/terminal/wms/stocktake/page.tsx:66-86`） |
| 临期预警页 | 共用 API 取候选集，之后按 `daysLeft ASC` 重排；显示顺序不变，但 200 条候选集可能变化（`apps/web/src/app/(admin)/warehouse/expiry/page.tsx:69-91`） |
| 库存 summary/分析页 | 使用独立 summary 查询；KPI 不受主查询排序影响。`recent` 仍按生产/分级日期排序，不应因本页改判自动改变（`apps/api/src/modules/wms/wms.service.ts:1365-1410`） |
| PDA 专用库存、Sales V2、门店库存 | 使用各自独立查询，仍按各自生产/状态业务契约；不属于本页默认排序改判范围 |
| 导出 | 未发现库存查询页的导出实现；盘点 CSV 导出的是盘点记录，不是本查询结果 |

## C. 生产只读抽查

本轮没有虚构生产结果。仓库/当前进程没有生产数据库连接变量或可确认的只读凭据；唯一受控入口是 `.github/workflows/production-readonly-audit.yml:41-48`，它通过 production environment 和 SSH secrets 执行，并强制 `default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`。触发 GitHub workflow 属于外部状态变更，本轮“纯文档提交”边界内未触发。

因此，现有批次的 `inbound_date` NULL 率/格式没有数值可报；并且当前 schema 本就不存在该列。授权实施前应通过受控入口至少获取：

- `inv_batches` 总行数，以及 `egg_date`/`created_at` 的 NULL 率、最小/最大值；
- 按 `source_type` 的分布；
- 可唯一关联 `wms_inbound.date`、可唯一关联 `prc2_receipts.receipt_date`、多日期冲突、完全不可关联的批次数及比例；
- 日期异常范围和未来日期数量。

`DATE`/`TIMESTAMP` 在 PostgreSQL 内部格式固定；“格式”检查应同时核查 API JSON 序列化样本，避免把类型检查与展示格式混为一谈。

## D. 测试计划

### D1. 列契约

- 页面/组件测试断言表头精确顺序：`批次号 → 库存品目 → 仓库 → 库位 → 库存数量 → 状态 → 入库日期 → 保质期至 → 归属门店`。
- 断言数据行中 `inbound_date` 出现在状态之后、保质期之前；`colSpan=9`。
- 断言 `YYYY-MM-DD`、ISO timestamp 防御性格式化和 NULL 显示 `-`。
- 类型/API normalize 测试锁定 `inbound_date` 不丢失；404 fallback 与主 API 响应一致。

### D2. 排序与稳定键

- API fixture 覆盖不同 `inbound_date`，断言日期非递增。
- 同日多批次断言 `batch_no DESC`；同日同批次断言 `id DESC`，形成全序。
- NULL 与非 NULL 混合时断言 `NULLS LAST`；全 NULL 时仍按 `(batch_no,id)` 稳定。
- 用超过 200 行和跨页/重复请求 fixture 断言排序发生在 `LIMIT` 前，边界不漂移、不重复、不漏行。
- 通用 CRUD fallback 同步断言相同 SQL 契约。

### D3. 写入与防回潮

- 通用入库确认断言 `wms_inbound.date` 下沉到新批次。
- 采购收货确认断言 `receipt_date` 传递并落到批次。
- 合并/冲突日期、无来源日期、调拨/包装/退货分别锁定批准后的规则。
- 防回潮静态/契约测试禁止 WMS 库存查询恢复为 `egg_date` 或只按非唯一日期排序；同时断言销售库存和临期排序契约没有被本页改判误伤。
- API/Web `tsc --noEmit`、相关 Jest/Vitest、`node scripts/check-constraint-drift.js`、entity drift 与 migration guard 全部通过后，才进入生产只读复验。

## 授权后的执行门槛

本报告只给出根因、口径和可执行方案。业务代码、迁移、历史回填和生产只读 workflow 均未执行。下一轮需用户明确授权实施，并确认“同一批次多次入库”的日期规则；生产只读覆盖率结果出来后，历史回填范围再定案。
