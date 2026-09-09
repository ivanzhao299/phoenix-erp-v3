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

本节是调查阶段的原始门槛；用户随后已授权实施并定案“同一批次多次入库取最早日期”。实际执行状态以 E 节为准。

## E. 执行记录（2026-09-09）

用户已授权按 §B 全案实施，同批次合并定案为最早非空 `inbound_date`（FEFO 库龄语义）。

### E1. Schema 与查询契约

- 新增 TypeORM 迁移 `1788943471000-AddInventoryInboundDate.ts`：`inv_batches.inbound_date DATE NULL`，并建立与
  `inbound_date DESC NULLS LAST, batch_no DESC, id DESC` 完全匹配的查询索引；`down()` 先删索引再删列。
- 主 API 改为显式批次字段投影，明确包含 `inbound_date`，不再以 `b.*` 作为该接口契约。
- Generic CRUD 404 fallback 同步改为相同排序；排序仍在 `LIMIT/OFFSET` 之前。
- 前端在“状态”之后、“保质期至”之前增加“入库日期”，空值显示 `-`，loading/empty `colSpan=9`；
  `ui.入库日期` 的 zh/en/lo 三语资源已存在并复用。

### E2. 写路径决策

| 链路 | `inbound_date` 口径 |
|---|---|
| 通用 WMS 入库（正常/破损） | `wms_inbound.date` |
| 采购 V2 收货 | `prc2_receipts.receipt_date` 显式传给 WMS |
| 生产临时/统一生产批次 | `eggDate`（该链明确的生产入库业务日） |
| 集蛋班次 | `pkg_shifts.shift_date` |
| 分级、包装中间批次 | `NULL`；现有 current time/dateKey 仅用于编号/保质期，不能证明入库业务日 |
| 调拨直达/签收目标批次 | 调拨完成/签收动作的 `CURRENT_DATE`，不复制源批次日期 |
| Sales V2 退货回库 | 回库事务当日，显式参数传入 |
| 门店 POS 退货隔离批 | 退货逆向动作的 `CURRENT_DATE` |
| 农场药品入库 | 请求的 `logDate` 规范化值 |
| 采购 V1 旧旁路 | `NULL`；没有可证明的业务日期字段 |

所有存在 `ON CONFLICT(batch_no)` 的本次触及入库链，日期更新均为：旧值空则补新值、新值空则保留旧值、
双方非空取 `LEAST`。禁止 `COALESCE(inbound_date, created_at::date)`。

### E3. 历史回填资产

回填不放入 schema migration，拆为：

1. `scripts/ops/wms-inbound-date-backfill-preflight.sql`：只读事务，逐批汇总两条唯一许可证据链，输出可证明、
   多日期歧义及既有非空数量，并断言候选处于 NULL 态。
2. `scripts/ops/wms-inbound-date-backfill-apply.sql`：单事务、锁定候选、仅更新“唯一业务日期 + 当前仍为 NULL”的行；
   更新前逐行输出带 `id + batch_no + 写入日期` 守卫的反向 SQL，更新后逐行断言。
3. `scripts/ops/wms-inbound-date-backfill-verify.sql`：只读事务，断言唯一证据行全部等于证据日期、歧义行继续为 NULL，
   并输出全表日期分布。

允许的历史证据仅为 `inv_ledger.ref_no = wms_inbound.task_no → wms_inbound.date` 与
`inv_ledger.ref_no = prc2_receipts.receipt_no → prc2_receipts.receipt_date`。多日期、无关联、日期为空全部保持 NULL。
截至本地提交前未连接或写入生产数据库，因此没有伪造生产回填数量。

### E4. 验证记录

| 检查 | 实际结果 |
|---|---|
| API 定向 Jest（10 suites） | PASS，145 tests |
| Web 定向 Vitest（2 files） | PASS，9 tests |
| API `tsc --noEmit` | PASS |
| Web `tsc --noEmit` | PASS |
| constraint drift / nullable unique | PASS，0 新违规 |
| TS migration down / no-data-DML | PASS，78 migrations |
| entity drift baseline | PASS，0 漂移 |
| `git diff --check` | PASS |
| API 全量 Jest | 97 suites / 819 tests PASS；另有 `chanjet-callback.controller.spec.ts` 两个既有收敛等待用例固定 5000ms 超时，单文件复跑同签名（2 failed / 37 passed） |
| Web 全量 Vitest（`NODE_ENV=test`） | PASS，107 files / 574 tests |

API 的两个超时已按项目既定惯例完成噪声定性：当前 `git diff` / `git status` 均未触及任何 Chanjet 路径；失败测试仍为
`waits for bounded list convergence before accepting ERP mirror readback` 与
`caps successful-but-stale mirror reads at three before compensating`，同为固定 5000ms 超时，与此前
`g202-sales-order-detail-refresh-acceptance-audit.md`、`sales-order-submit-inventory-shortage-audit-20260903.md`、
`three-page-display-defect-audit-20260904.md` 等多轮记录签名一致。仓库 CI 在干净 `ubuntu-latest` runner 上显式设置
`NODE_ENV=test`，故如实记为“本机已知噪声，CI 权威”，不将其虚报为本地 PASS，也不再阻断交付。

Web 首次全量运行继承外层 `NODE_ENV=production`，3 files / 29 tests 因 React `act is not a function` 失败；按 CI
真实环境显式 `NODE_ENV=test` 重跑后 107 files / 574 tests 全部通过。当前尚未记录 CI、PR、full deploy、revision
三方一致、生产回填或生产只读复验结果；这些步骤执行前均不能记 PASS。

### E5. PR / CI 执行记录与停止点

- 实现提交：`0ae44810`（`fix: 修复库存入库日期与排序`），分支
  `fix/wms-inbound-date-20260909`，PR `#219`。
- PR 首轮已通过：Runtime Smoke、Web Vitest、Detect change scope；Web CI 进一步确认干净 runner 全量通过。
- 冻结/安全门禁默认按设计阻断。人工逐文件复核后，PR 已登记 `reviewed-frozen-boundary` 与
  `reviewed-security-touch`；本地显式 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的 W5 closeout
  20/20 PASS。GitHub 对原 run 的 rerun 仍使用首次事件载荷，环境变量继续为 false，因此该次 rerun 不能记 PASS；
  需由后续新 PR 事件重新触发标签判定。
- CI 权威 `V3 Regression Suite` 在干净 `ubuntu-latest`、`NODE_ENV=test` 环境真实失败：WMS 模块
  23/41 项失败。首个根因信号为 `confirmInbound` 返回 HTTP 400
  `{"code":400,"msg":"字段不存在，请联系管理员"}`，随后调拨等依赖断言级联失败；这不是既有 Chanjet 超时噪声。
  当前证据显示 regression job 的测试数据库未获得新增 `inv_batches.inbound_date` 列，命中新写入 SQL 时失败，但尚未
  完成 CI 初始化链根因修复与权威复跑，故不得宣称结论已闭环。

依用户红线“若 CI 权威环境也失败则真停”，本轮停止在 PR #219，未合入 main、未触发 full deploy、未执行生产
preflight/apply/verify、未做生产只读查询与三端 revision 复验。生产数据库保持未触及状态。

### E6. CI 回归库迁移链修复与续行记录

- 对 GitHub Actions run `34332644451` 的权威日志复核纠正了 E5 的初步归因：
  `AddInventoryInboundDate1788943471000` 已被 TypeORM 发现并成功执行，
  `inv_batches.inbound_date` 的建列 SQL 及迁移记录均出现在日志中；真实首错为
  `POST /api/inbound/confirm` 查询 `wms_inbound.date` 时触发 PostgreSQL `42703 column "date" does not exist`。
- 根因是初始化时序：冻结 G17 SQL 在 `wms_inbound` 不存在时通过条件分支静默跳过补列；
  该表直至 API 启动后才由 Generic CRUD runtime repair 创建，导致迁移记录显示成功而 schema 末态缺列。
- 修复：尚未发布的 `1788943471000-AddInventoryInboundDate` TS 迁移先幂等建立
  `wms_inbound` 最小规范表并确保业务日期列 `date` 存在，再建立
  `inv_batches.inbound_date`；Regression workflow 在启动 API 前新增真实数据库末态断言，
  同时检查 `public.wms_inbound.date` 与 `public.inv_batches.inbound_date`，任一缺失立即红灯。
- 本地验证：API tsc 0 errors；Web tsc 0 errors；`check-constraint-drift` 为
  0 new drift / 1 既有 allowlisted；`check-nullable-in-unique` 0 违规；API 入库日期契约
  4/4 PASS；Web 查询排序契约 1/1 PASS。尝试以一次性 PostgreSQL 18 空库重放 CI 脚本时，
  宿主机缺少 `psql` 客户端，脚本在首条 DDL 前真实失败，未记 PASS；临时容器已清理。
- 本节记录提交前状态；新 PR 事件、CI 权威结果、合入、full deploy、三端 revision、
  生产回填三段式及只读复验均待后续实际执行后补记，不提前宣称完成。

### E7. 生产部署、确定性回填与最终复验

#### E7.1 Rollout 环境修复与部署

- 首次 rollout run `34336232797` 在 SQL 执行前失败：workflow 以不存在的硬编码容器名
  `phoenix_api` / `phoenix_web` 执行 `docker inspect`，原始错误为 `no such object: phoenix_api`。
  修复为在 `DEPLOY_PATH` 下通过 `docker compose ps -q api/web` 解析当前 Compose project 的容器，
  并对空容器 ID 与 checkout/API/Web revision 继续执行硬断言。修复提交 `f5cd3e2a`，PR #221 合入为
  `3e476e4f477cc47654d789ca12be514e18753ea0`；full deploy run `34338960930` 成功。
- 第二次 preflight run `34340129185` 的三端 revision 门禁通过，但只读事务内的
  `CREATE TEMP TABLE ... AS` 被 PostgreSQL 拒绝：`cannot execute CREATE TABLE AS in a read-only transaction`。
  该 run 未进入 apply、未写生产数据。preflight 改为等价纯 CTE 查询，保留候选明细、三类计数与 NULL
  硬断言；提交 `80b7b34f`，PR #222 合入为 `fafdde5187755aac85273dd58a221358259c6c5a`。
  full deploy run `34340811335` 成功，完整 regression、生产 SSH 部署及迁移步骤均通过。
- 最终只读审计资产由 PR #223 合入为 `376429bd17ce96c67274c67d162b4bf4317dcc35`；
  full deploy run `34342903984` 成功。生产审计 run `34344410748` 再次确认 checkout/API/Web 三端
  revision 全部为该 SHA，`inv_batches.inbound_date` 与 `wms_inbound.date` 两列末态均存在。

#### E7.2 生产回填三段式

| 阶段 | Workflow run | 结果 |
|---|---:|---|
| preflight | `34341954388` | PASS；逐批只读证据 18 行，`eligible_null_rows=18`、`ambiguous_rows=0`、`preexisting_nonnull_rows=0`，事务 `ROLLBACK` |
| apply | `34342020925` | PASS；先重跑同一 preflight，再在单事务锁定 18 行；输出 18 条带 `id + batch_no + inbound_date` 守卫的逐行反向 SQL，`applied_rows=18`，逐行断言后 `COMMIT` |
| verify | `34342228065` | PASS；独立只读复验 `proven_rows=18`、`verified_rows=18`、`unexpected_null_rows=0`、`mismatched_rows=0`，歧义保持 NULL 断言通过，事务 `ROLLBACK` |

apply 后全表分布为 `total_batches=297`、`dated_batches=18`、`undated_batches=279`，日期范围
`2026-07-13` 至 `2026-09-09`。被更新的 18 行仅来自 E3 固定的两条证据链；没有用 `created_at`、
`egg_date` 或批次号猜测日期，没有更新无关联或多日期行。

#### E7.3 最终生产只读复验

- 新增受控清单 `wms-inbound-date-closeout-20260909.sql/.http.json`。通用审计器增加可选
  `sqlRowMatch.responseIndex + exactFields`，用于把真实 API 指定位置的行与只读 SQL 精确对账。
- 首跑 `34344222726` 的 SQL 部分已通过：schema 两列存在；分布 `297/18/279`；未来日期 0；
  排序窗口最后有日期位置 18、首个 NULL 位置 19；`/api/inventory/batches` 近 60 分钟
  `sys_error_logs` 为 0。HTTP 首行批次也正确，但审计期望把 PG `DATE` 写成 `YYYY-MM-DD`，而 API
  返回 UTC ISO 字符串，因此以格式差异失败；该 run 未记 PASS，审计全程只读。
- 修正期望序列化后，最终 run `34344410748` PASS：`GET /api/inventory/batches` 返回 200、
  `data.length=200`、存在非空 `inbound_date`；API 第 1 行
  `IBN-20260909-YB5OED / 2026-09-09T00:00:00.000Z` 与数据库按
  `inbound_date DESC NULLS LAST, batch_no DESC, id DESC` 查询的第 1 行精确一致。
- 排序抽查头部依次从 `2026-09-09`、`2026-09-08`、`2026-09-07` 向下递减；18 条有日期行后，
  第 19 行开始为 NULL，证明 NULL 位于后段。目标 API 60 分钟数据库错误窗口为 0；通用容器日志
  错误门禁 `LIFECYCLE_PROCESS_LOG_ERROR_WINDOW_60M=0`；审计器最终记录
  `PRODUCTION_BUSINESS_WRITES=0`。

结论：入库日期 schema、写入/合并口径、生产迁移、18 行唯一证据历史回填、API 投影、默认降序与
`NULLS LAST` 均已获得生产实证。本节保留所有失败 run 与原因，不将环境/审计清单失败虚报为 PASS。
