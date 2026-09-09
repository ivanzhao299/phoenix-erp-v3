# 包装作业台“库存未入账”只读核查（2026-09-09）

> 范围：设计核对、代码链路、生产只读取证、待批修复与补账方案。
> 红线：本轮未修改代码、配置或生产数据；以下方案与补账清单均待用户确认。

## 1. 结论

今日症状已定位为**库存来源模式的场站身份口径错配，加上 TEMP 上游当日未入账**，不是仓库还有一个待确认步骤，也不是库存写到了另一张台账：

1. 包装作业台真实场站为 `LPH_MENGSAI`；`inv_source_mode` 只有 `SITE/FARM-MS=PACKAGING_INBOUND`，没有 `SITE/LPH_MENGSAI`。
2. 模式解析按场站码精确匹配；匹配不到后回落 `GROUP/ALL=TEMP_PRODUCTION_INBOUND`。
3. Terminal `warehouse/confirm` 因此按 TEMP 语义跳过包装库存写入，但仍允许写交接记录并返回 `COMMITTED`。
4. 今日窗口内又没有任何 `inv_batches` 或 `inv_ledger` 新记录，说明设计上应承担 TEMP 库存的日产蛋入口也没有为这 300 枚形成库存。
5. 结果是：交接单存在，包装批次、流水、WMS 入库单均不存在，库存确实从未入账。

根因分类是 **a 的模式门控分支未执行过账**，更精确地说是“本应作为孟赛灰度键的 SITE 配置使用了旧码 `FARM-MS`，运行时班次使用新码 `LPH_MENGSAI`，从而错误回落 TEMP”。没有证据支持 b（写错公司/仓库/产品后不可见）、c（事务回滚但仍成功）或 d（权限/DataScope 拦截且吞错）。不过现代码确有一个后续必须一并修正的仓位口径风险：即便进入 PACKAGING 模式，库存服务目前仍会默认写 `WMS-VTE-MAIN / INBOUND-DOCK`，没有使用交接传入的 `CS-KW-MS01`。

## 2. 权威设计语义

### 2.1 G4-E 与后续收口的关系

早期 G4-E 报告把包装、交接都描述为进入 `inv_batches + inv_ledger` 唯一台账（`docs/g4e-production-packaging-governance.md:192-204`）。后续 P1A/P1C/R0 对真实运行链路作了更精确的收口，故当前应以后续设计为准：

- `docs/production-inventory-source-mode-phase-p1a.md:17-24,34-45,57-73`：TEMP 与 PACKAGING 两种库存来源互斥；TEMP 由日产蛋入口写，PACKAGING 由包装整合服务写。
- `docs/packaging-runtime-convergence-phase-p1c.md:40-57`：`packing/submit` 尚未实际交接，过早；采用 `warehouse/confirm` 作为库存生成点。
- `docs/production-runtime-rebuild-phase-r0.md:153-169,194-203`：Terminal `warehouse/confirm → completeTerminalPacking → inv_batches + inv_ledger` 是包装库存唯一入口，包装人员不直接更新台账。
- `docs/ops/packaging-inventory-chain-audit-20260821.md:53-66`：PACKAGING 模式在交接事务中直接正式入账；TEMP 模式不需要再点通用 WMS inbound confirm，包装交接只是避免双写，库存理应已由日产蛋入口生成。

因此，设计答案是：

- **不是**“交接给仓库后还要仓库端二次收货才能入账”。
- `PACKAGING_INBOUND` 下，包装作业台的成品交接确认就是正式过账时点，由 `PackagingInventoryIntegrationService → EggInventoryService` 同步写唯一台账。
- `TEMP_PRODUCTION_INBOUND` 下，包装交接不写库存，但这只在日产蛋入口已经形成同量库存时才是正确状态。

## 3. 前端到库存台账调用链

```text
warehouse-handover “确认入库”
  → handleSubmit
  → packagingApi.confirmHandover
  → POST /api/packaging/terminal/warehouse/confirm
  → PackagingTerminalBffController.confirmHandover
  → PackagingInventoryIntegrationService.completeTerminalPacking
  → generateSaleableFromOutputs（幂等 + 来源模式门控）
  → EggInventoryService.createProductionBatch
  → INSERT inv_batches
  → INSERT inv_ledger(change_type='PACKAGING_INBOUND')
```

关键出处：

- 前端确认提交：`apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx:102-126,523-534,586-600`。
- API 客户端：`apps/web/src/lib/packaging-api.ts:184-192`。
- BFF 确认入口、模式跳过成功判定与交接落表：`apps/api/src/modules/bff/bff.controller.ts:2289-2378`。
- 包装记录、班次、场站上下文：`apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts:245-303,321-349`。
- 模式精确匹配及 SITE→COMPANY→GROUP 优先级：`apps/api/src/modules/sales-v2/services/inventory-source-mode.service.ts:36-52`。
- 包装库存幂等与模式门控：`apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts:87-183`。
- 批次和流水写入：`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:314-367`。

注意：Terminal 主链**不经过** `apps/api/src/modules/terminal/packaging.service.ts#packComplete`；后者是历史 Admin/PC 流，不应拿其 `wms_inbound(PENDING)` 作为本次 Terminal 交接的后续步骤。

## 4. “库存入账证据”判定

状态接口为 `GET /api/packaging/terminal/warehouse/status?packingCode=...`：

- 查交接：`pkg_handover_records.packing_code = packingCode`（`bff.controller.ts:2219-2228`）。
- 查库存证据：`inv_batches.packaging_batch_ref = packingCode AND source_type='PACKAGING'`（`:2229-2235`）。
- `inventoryPosted = batchCount > 0 && totalInbound > 0`（`:2247-2275`）。
- TEMP 模式是特例：有 handover 即 `committed=true`，即使 `inventoryPosted=false`（`:2251-2254,2276-2284`）。

前端页面进入时只查询一次状态（`warehouse-handover/page.tsx:55-75`），没有轮询库存证据。提交返回后，`assertWarehouseHandoverCommitted` 只要求后端 `inventoryOk=true`（`packaging-api.ts:40-45`）；TEMP 合法跳过会满足该条件。完成页随后因 `inventoryPosted=false` 同时显示“已完成入库”和“尚未取得库存入账证据”（`warehouse-handover/page.tsx:136-168`）。

这段 UI 把两件不同的事混在一起：TEMP 合法跳过与异常缺账共用同一个“证据缺失”展示。本次生产事实证明它掩盖了真正的零库存，而不是一个异步轮询尚未完成。

## 5. 生产只读事实

受控 GitHub Actions：`Packaging Repro Readonly Audit` run [34304813512](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34304813512)，结果 `success`。审计窗口为 `2026-09-08 16:00:00` 至 `2026-09-09 15:59:59` UTC，即新加坡时间 2026-09-09 全天；实际执行于 `2026-09-09 02:50 UTC`。连接设置 `PGOPTIONS default_transaction_read_only=on`，SQL 使用 `BEGIN TRANSACTION READ ONLY`，无生产写入。

### 5.1 今日班次、包装和交接

| 项 | 生产事实 |
|---|---|
| 班次 | `id=54`, `SH-20260909-0794`, MORNING, LINE-02, OPEN |
| 场站 | `LPH_MENGSAI` |
| 包装记录 | `id=30`, `PKG-20260909-206420` |
| 数量 | 300 枚 / 10 箱 |
| 等级与规格 | `GRADE_1` / `精品礼盒(30枚/盒)`，`specId=PKG_PACK_SPEC_3` |
| 交接记录 | `id=25`, `WH-20260909-MTTHJQB8` |
| 接收与库位 | 宋雷 / `CS-KW-MS01` |
| 时间 | 包装 `02:33:26 UTC`；交接 `02:34:51 UTC` |

### 5.2 库存、流水、WMS 与模式

- 关联或窗口新增 `inv_batches`：**0 条**。
- 关联或窗口新增 `inv_ledger`：**0 条**。
- 窗口内 `wms_inbound`：**0 条**。
- 模式配置：
  - `GROUP/ALL = TEMP_PRODUCTION_INBOUND`
  - `SITE/CS-0001 = TEMP_PRODUCTION_INBOUND`
  - `SITE/FARM-DP = TEMP_PRODUCTION_INBOUND`
  - `SITE/FARM-MS = PACKAGING_INBOUND`
- 当前实际班次场站 `LPH_MENGSAI` 没有匹配配置，因此代码按 `inventory-source-mode.service.ts:40-49` 回落 GROUP TEMP。
- 生产 schema 中 `pkg_packing_records.shift_id` 与 `grading_codes_json` 均存在，可排除已知 schema drift。

### 5.3 四类候选判断

| 候选 | 结论 | 依据 |
|---|---|---|
| a) 交接写了但过账未执行/失败 | **命中“未执行”** | 模式门控回落 TEMP，明确跳过包装过账；交接记录已写 |
| b) 过账写错公司/仓库/产品口径 | 当前记录**排除已写错地方** | 全窗口 batches/ledger 都为 0，不是查询口径漏见；但默认仓位是后续风险 |
| c) 事务回滚但前端仍报成功 | **不支持** | 主链同步串行；异常时新 handover 不落表，而本次 handover 已存在；当前是 TEMP 成功分支 |
| d) 权限/DataScope 拦截且错误被吞 | **不支持** | POST 已完成并落 handover；库存服务内部是服务端 SQL，不再经过一次用户 DataScope 写权限判断 |

### 5.4 日志证据边界

当前专用只读 workflow 导出了数据库链路事实，但没有读取 Docker/API 日志；本工作机也不持有生产 SSH 入口。故本报告**不虚构** `02:34 UTC` 错误窗口的日志结论。

代码可确定：异常路径会输出 `[warehouse/confirm][ERR] 包装库存生成失败 packingCode=...`（`bff.controller.ts:2342-2346`）；本次数据库状态与模式配置已足以解释为何没有异常——模式跳过是正常分支，只记录普通 `[PkgInv] ... TEMP_PRODUCTION_INBOUND ... 跳过包装可售入库` 日志（`packaging-inventory-integration.service.ts:133-142`）。主 agent 复核时如需补齐日志原文，应只读筛选 `2026-09-09T02:33:00Z..02:36:00Z`，关键词 `PKG-20260909-206420|warehouse/confirm|PkgInv`。

## 6. 待批修复方案

### P0：统一孟赛 SITE 身份并恢复唯一库存来源

不要只把 `LPH_MENGSAI` 直接新增为 PACKAGING 配置后立即补账。先由主 agent/业务确认 `LPH_MENGSAI` 是当前孟赛权威场站码，并核对 `FARM-MS` 是否旧码或另一实体，然后按受控切换 SOP：

1. 冻结该 SITE 的 TEMP 日产蛋写入入口，确认切换时点，防止双写。
2. 评估并清理/迁移旧 `SITE/FARM-MS` 模式配置的身份语义。
3. 经 `/warehouse/source-mode` 风险评估、二次确认和审计，把权威 SITE `LPH_MENGSAI` 切为 `PACKAGING_INBOUND`。
4. 增加配置完整性校验：ACTIVE 场站/班次使用的 `site_id` 必须能命中权威场站标识；孤儿 SITE 配置和回落 GROUP 必须告警，不再静默造成错误来源模式。

### P0：交接库位必须传入库存写入

当前 `confirmHandover` 只把 `companyCode` 传给 `completeTerminalPacking`（`bff.controller.ts:2329-2335`）；后者没有 warehouse/location 参数，最终 `createProductionBatch` 使用默认 `WMS-VTE-MAIN / INBOUND-DOCK`（`egg-inventory.service.ts:337-366`）。修复时应：

- 从已校验的 `wms_locations.location_code` 反查所属 `warehouse_code`；
- 把 `warehouseCode + locationCode` 沿 `confirmHandover → completeTerminalPacking → generateSaleableFromOutputs → createSaleableBatch → createProductionBatch` 显式传递；
- 以 `packaging_batch_ref=packingCode` 保持幂等；
- 交接、批次、流水在公司/仓库/库位维度一致后才返回成功。

### P1：修正状态与提示语义

- PACKAGING 模式：明确显示“库存已入账”或“入账失败/待重试”，不可把失败显示成完成。
- TEMP 模式：不能只凭 handover 宣称“已完成入库”；应另查对应 `TEMP_PRODUCTION_INBOUND` 批次/流水数量并与包装交接勾稽。只有上游库存证据存在且数量对平，才显示“交接完成，库存由日产蛋入口持有”。
- TEMP 上游证据缺失时，状态应为“交接完成但库存未入账（阻断）”，建立仓库/生产待办，而不是通用黄色提示。
- 页面无需轮询同步事务；提交后的一次权威状态刷新足够。若未来改异步过账，再增加有上限轮询与最终失败态。

### P1：事务边界

现流程库存批次/流水与 handover 不是同一显式事务。修复时应把 PACKAGING 的库存生成和 handover 落表纳入同一数据库事务，避免未来出现半成功；TEMP 则只在上游库存证据勾稽通过后提交 handover 的“库存完成”状态。

## 7. 今日历史补账清单（待批）

本轮只形成候选，不执行补账。

| 班次 | packingCode | handoverCode | 场站 | 数量 | 等级/规格 | 目标库位 | 当前库存证据 | 待批动作 |
|---|---|---|---|---:|---|---|---|---|
| `SH-20260909-0794` / id 54 | `PKG-20260909-206420` | `WH-20260909-MTTHJQB8` | `LPH_MENGSAI` | 300 枚 / 10 箱 | `GRADE_1` / `PKG_PACK_SPEC_3`（精品礼盒 30 枚） | `CS-KW-MS01` | batch 0 / ledger 0 / WMS 0 | 身份与来源模式获批、仓位传递修复部署后，走受控幂等重放补账 |

补账口径：

1. 权威数量以 `pkg_packing_records.batches_json` 的可售等级逐项为准，本班次候选为 300 枚；补账前必须与实物、箱码、交接单复核。
2. `source_type='PACKAGING'`，`change_type='PACKAGING_INBOUND'`，`packaging_batch_ref='PKG-20260909-206420'`，`collection_batch_ref='SHIFT-54'`。
3. 公司码由权威场站/组织关系确定，不得使用当前服务的猜测回退；仓库由 `CS-KW-MS01` 主数据反查，location 必须为 `CS-KW-MS01`。
4. 等级需经当前字典映射把 `GRADE_1` 解析成标准 grade；规格以 `PKG_PACK_SPEC_3`/规格主数据核对，不按自由文本臆测 SKU。
5. 通过修复后的 `completeTerminalPacking` 受控重放，依赖 `packaging_batch_ref + source_type` 幂等保护；禁止手工直接 INSERT `inv_batches`/`inv_ledger`。
6. 补账前再次只读确认该 packingCode 仍为 batch 0 / ledger 0；补账后核验批次数量、流水数量、仓库/库位、FIFO 可见性与重复调用不增量。

## 8. 报批项

请主 agent/用户逐项确认后才进入实施轮：

1. `LPH_MENGSAI` 是否为孟赛当前权威 SITE 码，`FARM-MS` 是否应退役/迁移。
2. 孟赛是否正式切为 `PACKAGING_INBOUND`，以及 TEMP 日产蛋入口的冻结切换时点。
3. 是否批准 P0 代码修复：真实 warehouse/location 贯通 + 模式/场站配置一致性告警 + 事务收口。
4. 是否批准 P1 UI/状态语义修复及 TEMP 上游库存勾稽。
5. 是否批准按 §7 对唯一候选班次执行受控补账；批准前不触碰生产数据。

## 9. 本轮边界

- 已执行：设计与代码只读核查；生产双重只读审计；新增本报告。
- 未执行：代码、schema、配置、生产数据修改；补账；部署；模式切换。
- 尚缺：目标分钟级 API/Docker 日志原文。该缺口不改变由数据库事实与确定性模式解析得到的根因，但实施前建议由主 agent补齐留档。

## 10. 获批后执行记录（2026-09-09）

### 10.1 P0 / P1 本地实施

- 已贯通 `confirmHandover → completeTerminalPacking → generateSaleableFromOutputs → createProductionBatch` 的真实 `warehouseCode/locationCode`；库位从 `wms_locations` 反查仓库，Terminal 链缺少真实仓库或库位时失败关闭。
- Terminal 公司码改由 ACTIVE `brd_farms.farm_code → company_code` 权威关系解析，不再用销售客户表猜测孟赛公司。
- PACKAGING 模式的批次、流水、handover 共用同一 `EntityManager.transaction`；幂等重试额外校验仓库、库位和批次/流水数量一致。
- TEMP 模式新增日产蛋批次/流水勾稽；场站、生产日、数量未完全对平时不落新 handover，状态为阻断待处理。
- 状态接口在 PACKAGING 模式同时要求包装数量、批次数量、`PACKAGING_INBOUND` 流水数量相等；TEMP 模式只有上游证据对平才返回 `COMMITTED`。
- 模式解析新增 SITE 回落及解析异常结构化告警；配置列表读取时巡检 ACTIVE 场站、ACTIVE 班次与孤儿 SITE 配置。
- UI 已区分“库存已入账”和“交接完成，库存由日产蛋入口持有（批次/流水已对平）”；失败不会进入完成页。

本地定向验证：

- API `tsc --noEmit`：PASS。
- API Jest：3 suites / 47 tests PASS。
- Web `tsc --noEmit`：PASS。
- Web Vitest：2 files / 6 tests PASS。

续行提交前复验（commit `18e891ff` 所含代码）：API/Web `tsc` PASS；API 定向
Jest 3 suites / 31 tests PASS；Web 定向 Vitest 1 file / 4 tests PASS；W5 显式
冻结/安全审查 20/20 PASS；house ownership、主数据 legacy growth、三语 i18n 门禁 PASS。

### 10.2 模式切换前停止点

生产写入尚未执行。现网 `/api/v2/inventory/source/switch` 一次只能修改一个 scope，且现网仍运行修复前代码：

1. 若先将 `LPH_MENGSAI` 切为 PACKAGING，旧代码会立即启用包装入账但仍可能写默认 `WMS-VTE-MAIN / INBOUND-DOCK`。
2. 若先把 `FARM-MS` 迁回 TEMP/退役，`LPH_MENGSAI` 仍回落 GROUP TEMP，无法形成“先冻结 TEMP、再迁移旧码、最后切权威码”的无窗口原子操作。

因此该步骤不满足获批 SOP 的防双写/防错库位红线，执行已在任何生产配置写入、部署和补账之前停止。尚无 PR、CI run、deploy run、revision 或补账写入可记录，禁止将本节视为全闭环 PASS。
### 10.3 模式切换记录

执行入口：[Packaging Repro Readonly Audit run 34310509439](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34310509439)，执行 revision `f6a19f1d`；生产修复 revision 为已部署的 `1cb0ff65`。受控执行器先只读断言，随后仅通过 `/api/v2/inventory/source/switch` 修改模式并由应用写审计。

切换前只读闸门（UTC）：

| 断言 | 原始证据 | 结论 |
|---|---|---|
| 孟赛近期 TEMP 入口无写入 | `2026-09-09 03:49:31.124108..04:19:31.124108`；`TEMP_PRODUCTION_INBOUND ledger_count=0, ledger_qty=0, latest_at=NULL` | PASS |
| 目标补账前仍为空 | `PKG-20260909-206420: batch_count=0, batch_qty=0, ledger_count=0, ledger_qty=0` | PASS |
| 源单唯一且口径正确 | `shift_id=54`, `site_id=LPH_MENGSAI`, `total_eggs=300`, `GRADE_1`, `specId=PKG_PACK_SPEC_3`, handover `WH-20260909-MTTHJQB8` | PASS |
| 目标库位可用 | `CS-KW-MS01 → LPH_MS_EGG_FARM`, `location_status=NORMAL` | PASS |
| 配置处于获批前态 | `GROUP/ALL=TEMP_PRODUCTION_INBOUND`, `SITE/FARM-MS=PACKAGING_INBOUND`, 无 `SITE/LPH_MENGSAI` | PASS |

风险评估均返回 `canSwitch=true`、未完成包装批次 `0`；同时记录了系统中共有 `4` 笔待上架库存的风险快照，该指标不是孟赛 TEMP 近期在途流水。执行结果：

1. `SITE/FARM-MS`: `PACKAGING_INBOUND → TEMP_PRODUCTION_INBOUND`，以模式迁移语义退役旧孟赛包装来源配置；operator `admin`，审计时间 `2026-09-09 04:19:39.815057Z`。
2. `SITE/LPH_MENGSAI`: 无精确旧行（解析态 TEMP）→ `PACKAGING_INBOUND`；operator `admin`，审计时间 `2026-09-09 04:19:40.785475Z`。
3. 切换后 `/source/mode?siteCode=LPH_MENGSAI` 返回 `PACKAGING_INBOUND`；配置表存在精确 `SITE/LPH_MENGSAI` 行，因此解析无需回落 `GROUP/ALL`。切换后只读 SQL 与 `/source/configs`、`/source/audit` 三方一致。

模式切换结论：**PASS**。两条写入均由受控 API 完成并保留风险快照与审计记录。

### 10.4 补账核验与停止点

同一 run 仅重放 `PKG-20260909-206420`。第一次 `warehouse/confirm` 返回 `idempotent=false`, `inventoryOk=true`, `totalInbound=300`；第二次相同请求返回 `idempotent=true`, `inventoryOk=true`, `totalInbound=300`。状态接口返回 `COMMITTED`，`inventoryBatchCount=1`, `totalInbound=300`, `ledgerInbound=300`, `inventoryMode=PACKAGING_INBOUND`。

补账后只读事实：

| 断言 | 原始证据 | 结论 |
|---|---|---|
| 批次数量 | `EGG-20260909-00001`, `qty=300`, `qty_available=300`, `source_type=PACKAGING` | PASS |
| 流水数量 | `id=291`, `PACKAGING_INBOUND`, `qty_change=300`, `ref_no=PKG-20260909-206420` | PASS |
| 公司 / 仓库 / 库位 | `COMP-LAO-AGRI / LPH_MS_EGG_FARM / CS-KW-MS01`，与库位反查一致 | PASS |
| FIFO 可见 | `AVAILABLE`, `qty_available=300`, `expire_date=2026-10-09`, `legacy_source=NULL` | PASS |
| 重复调用不增量 | 第二次返回 `idempotent=true`；最终仍为 1 batch / 1 ledger / 300 枚 | PASS |
| 鸡蛋库存读取可见 | `/api/packaging/terminal/inventory/by-packing/PKG-20260909-206420` 返回该唯一批次 | PASS |
| 等级 | `quality_grade=GRADE_1`, `grade_code_std=GRADE_1` | PASS |
| 礼盒规格 / SKU | `spec_code=NULL`, `sku_code=NULL`，未把源单 `specId=PKG_PACK_SPEC_3` 落入批次 | **FAIL** |

run 最终状态为 **FAILURE**。最终 SQL 在等级字典核验处还因生产 `sys_dict.config_json` 为 text、表达式缺少 `::jsonb` cast 而报错；执行器随后已修正该只读断言，但原始批次输出已独立证明规格/SKU 缺失，不能把本次补账记为全量 PASS。

停止点：按“失败即停”红线，run 结束后没有再次调用补账、没有直接修改 `inv_batches/inv_ledger`、没有尝试回滚或纠偏生产数据。当前生产末态为：模式切换已生效；目标已有 300 枚、正确仓库/库位且可用于 FIFO 的唯一批次与流水，但规格和 SKU 数据债仍待单独审计并走新的获批修复方案。

## 11. 包装批次规格 / SKU 断链核查（只读，待批）

### 11.1 定因结论

本轮可以确定存在**代码断链**，但现有生产留档不足以判断是否同时存在 SKU 主数据缺口；两者不得合并表述：

1. `pkg_packing_records.batches_json` 已保存 `specId=PKG_PACK_SPEC_3`，断链发生在 `completeTerminalPacking`：解析类型虽声明 `specId?: string`，组装下游 `items` 时却只传 `b.spec → specName`，丢弃 `b.specId`（`apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts:290-329`）。
2. `generateSaleableFromOutputs` 的契约只有 `specName`，再按 `packaging_specs.spec_name` 精确匹配 `spec_code`（`:103-116,193-214,438-459`）。因此字典展示名与规格主数据名称只要不完全一致，`specCode` 就降为 `NULL`；SKU 查询因缺少 `specCode` 不会执行有效匹配。
3. `createSaleableBatch` 已把解析结果传给 `createProductionBatch`（`:482-515`）；后者本来就接受 `skuCode/specCode`，且明确 INSERT 到 `inv_batches.sku_code/spec_code`（`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:256-303,318-350`）。故断点不在库存统一入口。
4. 对本批次可直接定为：`spec_code=NULL` 是上述编码丢失及名称匹配失败造成的代码断链。`sku_code=NULL` 至少是该断链的下游结果；在生产只读查出 `(product, grade, spec)` 的 SKU 行之前，不能声称礼盒 SKU 主数据存在，也不能声称其缺失。

### 11.2 `specId` 全链路与主数据语义

| 环节 | 实际行为 | 判定 |
|---|---|---|
| Terminal 规格选择 | `PKG_PACK_SPEC` 字典映射为 `{id: d.code, name: label}`（`apps/web/src/app/(terminal)/terminal/packaging/packing/page.tsx:40-56`） | `id` 是稳定编码，`name` 是本地化展示名 |
| 添加与提交 | 同时保存 `specId`、`spec`，完整 `items` 作为 `batches` 提交（`:102-130`） | 未丢失 |
| BFF 保存 | `JSON.stringify(batches)` 原样写 `pkg_packing_records.batches_json`（`apps/api/src/modules/bff/bff.controller.ts:2112-2151`） | 未丢失；生产源单已证实含 `PKG_PACK_SPEC_3` |
| `completeTerminalPacking` | 读取到 `specId`，但仅构造 `{grade, specName: b.spec, qty}` | **首个确定丢弃点** |
| `generateSaleableFromOutputs` | 按 `(grade,specName)` 聚合，以名称查 `packaging_specs.spec_code`，再以 `(grade_code,spec_code,status='ACTIVE')` 查 SKU | 名称耦合是第二层风险 |
| `createProductionBatch` | 接受并写入 `sku_code/grade_code_std/spec_code` | 能力完整，不是丢弃点 |

规格的库存列语义来自 H4 迁移：`sku_code → product_skus.sku_code`、`spec_code → packaging_specs.spec_code`，两列均可空（`apps/api/migrations/20260530_product_master_h4_inventory_sku.sql:5-18,41-45`）。当前 `inv_batches` 无 TypeORM entity，相关写入为 raw SQL。

既有写入方口径并不完全一致：日产蛋入口会先按 `(grade,spec)` 解析 ACTIVE SKU，再完整传 `skuCode/gradeCodeStd/specCode`（`production-inbound.service.ts:194-234`）；包装统一入口具备同样能力；退货回库会尝试同时写 SKU/规格（`egg-inventory.service.ts:853-875`）。WMS 入库、调拨和 POS 退货主要只写或复制 `sku_code`，不主动写 `spec_code`；Terminal 历史中间态及旧采购路径两列均可为空。因此本节历史影响面只统计 `PACKAGING` 与同源对照 `TEMP_PRODUCTION`，不把全库所有 NULL 一概判为异常。

### 11.3 生产主数据与历史影响面：最终只读证据

受控 `Production Readonly Audit` run [34316536104](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34316536104) 与补充 run [34316688161](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34316688161) 均为 `success`。最终受审 SQL revision 为 `c16cc0d8`；生产 checkout/API/Web revision 三方均为 `1cb0ff65`。连接级 `default_transaction_read_only=on`、SQL `BEGIN TRANSACTION READ ONLY`、末尾 `ROLLBACK`，并输出 `PRODUCTION_BUSINESS_WRITES=0`。

主数据事实：

1. 生产 `packaging_specs` 表只有 `spec_code/spec_name/status` 三个相关列，**没有 `product_code` 列**，因此不能虚构该字段。`spec_code='PKG_PACK_SPEC_3'` 查询为 **0 行**。
2. `sys_dict` 存在 ACTIVE `PKG_PACK_SPEC/PKG_PACK_SPEC_3`，但名称本身不一致：`name='精品礼盒(40枚/盒)'`、`dict_label_zh='精品礼盒(30枚/盒)'`、英文/老挝文均为 40 枚；编码存在不等于规格主数据存在。
3. `product_skus` 对 `product_code='PRD-EGG-GRADE_1' + grade_code='GRADE_1' + spec_code='PKG_PACK_SPEC_3'` 查询 ACTIVE 与非 ACTIVE 合计 **0 行**。
4. 最终分类为 **代码断链 + 主数据缺口**：代码丢弃 `specId` 是确定断链；生产同时缺 `PKG_PACK_SPEC_3` 规格主数据及目标 GRADE_1 SKU。名称 30/40 枚冲突必须先由业务拍板，不能直接把字典行复制成规格主数据。

历史影响面为 36 个批次（PACKAGING 4、TEMP_PRODUCTION 32），均为 `spec_code=NULL, sku_code=NULL`。4 个 PACKAGING 批次的不可变源单均明确给出 `specId=PKG_PACK_SPEC_3`、`spec='精品礼盒(30枚/盒)'`；其中 3 个 GRADE_1、1 个 GRADE_2。32 个 TEMP_PRODUCTION 批次没有包装源单或规格来源，不能因产品/等级相同而推断礼盒规格。

销售消耗核验：36 批次的 `FIFO_OUT` 汇总全部为 0；`sal_order_item_batch_allocation_actions.ledger_id → inv_ledger.id` 的订单级结果为 0 行，非 FIFO_OUT 或 allocation batch 不一致的异常结果也为 0 行。`qty_available=0` 的旧行由 EXPIRED/其他历史变化形成，但没有 FIFO_OUT/action 证据；本轮不反推其规格，也不改历史流水。

### 11.4 分情况修复方案（均待用户授权）

**情况 1：规格和 SKU 主数据均存在，纯代码断链。**

- 将下游 item 契约改为同时携带 `specCode` 与 `specName`；Terminal 主链以 `specId` 作为稳定编码，先校验 ACTIVE `packaging_specs.spec_code`，展示名只用于显示和 legacy 兼容。
- SKU 解析使用权威 `(product_code, grade_code, spec_code, status='ACTIVE')`，避免只按 grade/spec 命中另一产品；解析结果贯通 `createSaleableBatch → createProductionBatch`。
- 建议失败策略：`specId` 存在但规格主数据不存在时**阻断入账**；规格存在但 SKU 不存在时默认也阻断，避免新增不可精确销售/FIFO 匹配的库存。只有业务明确批准 legacy 兼容时，才允许降级“写 `spec_code`、`sku_code=NULL`”，并产生结构化告警和待办，禁止静默降级。
- 测试至少覆盖礼盒、散装两种规格端到端，以及规格存在但 SKU 缺失的阻断/获批降级分支；断言源 `specId`、批次 `spec_code/sku_code`、流水和幂等重放一致。

**情况 2：规格或 SKU 主数据缺口。**

- 以生产只读导出的缺失组合为唯一补录清单；若规格缺失，先在规格主数据通道建立 `PKG_PACK_SPEC_3` 对应记录并核对字典编码/多语言名称；若 SKU 缺失，再按权威产品 + `GRADE_1` + 礼盒规格建立 SKU。
- 禁止在包装代码中硬编码 `PKG_PACK_SPEC_3` 或虚构 SKU code；补录走主数据中心及既有审批/ACTIVE 工作流。主数据就绪后再跑端到端验证。
- 两种情况可以同时存在：代码必须修复稳定编码传递，主数据缺口也必须独立补齐；不能用补主数据掩盖名称耦合断链。

### 11.5 存量补写方案与待批清单

先补主数据、再定最终写值；当前不能虚构 SKU code。待业务确认 30/40 枚名称后，主数据补录清单为：

| 顺序 | 主数据 | 待补组合 | 待拍板项 |
|---|---|---|---|
| 1 | `packaging_specs` | `spec_code=PKG_PACK_SPEC_3`，名称及单位数量按业务确认值创建并走 ACTIVE 工作流 | 中文标签为 30 枚，但 `name`/英文/老挝文为 40 枚，必须先统一 |
| 2 | `product_skus` | `PRD-EGG-GRADE_1 + GRADE_1 + PKG_PACK_SPEC_3` | `sku_code/sku_name` 由主数据中心生成或批准，禁止本报告命名 |
| 3 | `product_skus` | `PRD-EGG-GRADE_2 + GRADE_2 + PKG_PACK_SPEC_3` | 为受影响的 GRADE_2 包装批次补齐；同样不得虚构 code |

逐行候选如下；“待 SKU 补录后回填”表示 `spec_code` 有源单编码证据，但只有主数据创建并 ACTIVE 后才能把其实际 `sku_code` 定稿：

| batch_no | source | qty / available | 源规格证据 | spec_code 候选 | sku_code 候选 | 待批结论 |
|---|---|---:|---|---|---|---|
| `EGG-20260725-00001` | PACKAGING | 120 / 0 | `PKG_PACK_SPEC_3`, 30枚, GRADE_1 | `PKG_PACK_SPEC_3` | 待 GRADE_1 SKU 补录后回填 | 可补维度，严禁改数量/流水 |
| `EGG-20260725-00002` | PACKAGING | 60 / 0 | `PKG_PACK_SPEC_3`, 30枚, GRADE_2 | `PKG_PACK_SPEC_3` | 待 GRADE_2 SKU 补录后回填 | 可补维度，严禁改数量/流水 |
| `EGG-20260817-00001` | PACKAGING | 300 / 300 | `PKG_PACK_SPEC_3`, 30枚, GRADE_1 | `PKG_PACK_SPEC_3` | 待 GRADE_1 SKU 补录后回填 | 可补维度，严禁改数量/流水 |
| `EGG-20260909-00001` | PACKAGING | 300 / 300 | `PKG_PACK_SPEC_3`, 30枚, GRADE_1 | `PKG_PACK_SPEC_3` | 待 GRADE_1 SKU 补录后回填 | 可补维度，严禁改数量/流水 |
| `EGG-20260707-00001` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00002` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00003` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00004` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00005` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00006` | TEMP_PRODUCTION | 2 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00007` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260707-00008` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260715-00001` | TEMP_PRODUCTION | 2 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260716-00001` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260716-00002` | TEMP_PRODUCTION | 3 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260717-00001` | TEMP_PRODUCTION | 2 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260718-00001` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260718-00002` | TEMP_PRODUCTION | 2 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260718-00003` | TEMP_PRODUCTION | 3 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260723-00001` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00001` | TEMP_PRODUCTION | 19 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00002` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00003` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00004` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00005` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00006` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00007` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00008` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00009` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00010` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00011` | TEMP_PRODUCTION | 1 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00012` | TEMP_PRODUCTION | 20 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00013` | TEMP_PRODUCTION | 20 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00014` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260727-00015` | TEMP_PRODUCTION | 10 / 0 | 无 | 无安全候选 | 无安全候选 | 不补写 |
| `EGG-20260825-00001` | TEMP_PRODUCTION | 1 / 1 | 无 | 无安全候选 | 无安全候选 | 不补写 |

因此待批执行范围只有上述 4 个 PACKAGING 批次；32 个 TEMP_PRODUCTION 批次明确排除，除非未来取得逐批权威规格来源并重新报批。`packaging_spec` 当前也全为 NULL；本轮没有证据要求补 legacy 文本列，默认不改。

获批脚本应在单个事务内逐行处理：先锁定精确 `batch_no + packaging_batch_ref + source_type`，断言当前两列仍为空、数量/仓库/库位与留档一致、目标规格及 SKU 唯一且 ACTIVE；只 UPDATE 获批列；回读逐列断言；任何一行不符即 `ROLLBACK`。脚本必须附对应反向 UPDATE（仅在回读值仍等于本次写入值时恢复原 NULL），不得重放包装入账、不得触碰 `qty/qty_available` 或新增/修改 `inv_ledger`。

销售消耗处理原则：

- 未消耗批次可在上述断言后补写维度列，不改变 FIFO 数量和流水。
- 已发生 `FIFO_OUT` 或 allocation action 的批次，先证明出库按 `batch_no` 落账且补维度不会改变历史分配；原则上只补批次维度，不回写历史流水/订单。若历史销售明细的 SKU 与拟补 SKU 冲突，则停止逐行补写并单独对账，禁止自动追溯改写。
- FIFO 影响评估不能只看 `qty_available`；必须同时核对 `inv_ledger(batch_no, FIFO_OUT)`、allocation action 和订单明细。目标批次当前 `qty_available=300` 仅表明无数量扣减，正式执行前仍须重跑逐笔断言。

### 11.6 下一停止点

生产只读证据已经补齐，最终分类及逐行候选见 §11.3/§11.5。当前停止在用户授权前：未修改应用代码、schema、主数据、配置或生产台账；未创建规格/SKU，未补写任何批次。下一步必须由用户拍板 30/40 枚权威语义、批准两组 SKU 主数据补录及 4 个 PACKAGING 批次的维度补写后，才能另开实施轮。

## 12. 获批修复执行记录（2026-09-09）

### 12.1 合并、门禁与受控脚本修正

- PR [#218](https://github.com/ivanzhao299/phoenix-erp-v3/pull/218) 在补充 `reviewed-frozen-boundary` 审批标签后，冻结门禁、双端 typecheck/build、回归、Runtime Smoke 与 Web Vitest 全部通过；merge commit 为 `199d22d1b25fe1d91930cb5f336114995be8d2f4`。
- 首次主数据 preflight run [34320853633](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34320853633) 在断言前失败：只读事务误选 batches 脚本并尝试 `CREATE TEMP TABLE`。未执行 apply，生产零写入。
- 第二次主数据 preflight run [34321079209](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34321079209) 进入只读事务后失败：SSH 环境覆盖通用 `TARGET` 变量，仍误选 batches 脚本。未执行 apply，生产零写入。
- 修正提交 `044e74a8` 移除只读 preflight 的临时表；提交 `86e71bc2` 改由 GitHub 表达式固定 SQL 路径并使用专用环境变量。两次均为脚本控制面修正，没有直接连接或写生产库。

### 12.2 主数据创建与字典统一

| 阶段 | Workflow run | 结果 |
|---|---|---|
| master-data preflight | [34321218160](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34321218160) | PASS；获批前态只读断言通过 |
| master-data apply + 内置 verify | [34321264947](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34321264947) | PASS；经生产 API 主数据服务执行 |
| master-data 独立 verify | [34321347333](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34321347333) | PASS；只读 |

实际生成并留档的编码：

- 规格：`PKG_PACK_SPEC_3`，`精品礼盒(30枚/盒)`，`qty_per_unit=30`，ACTIVE。
- GRADE_1 SKU：`SKU-0001`，组合 `PRD-EGG-GRADE_1 / GRADE_1 / PKG_PACK_SPEC_3`，ACTIVE。
- GRADE_2 SKU：`SKU-0002`，组合 `PRD-EGG-GRADE_2 / GRADE_2 / PKG_PACK_SPEC_3`，ACTIVE。
- `PKG_PACK_SPEC/PKG_PACK_SPEC_3` 字典中、英、老名称统一为 30 枚语义，`capacity/perBox/qty=30`，ACTIVE。

### 12.3 部署与批次补写

- 首次 full deploy run [34321404157](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34321404157) 成功；部署后只读 run [34322467304](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34322467304) 确认 checkout/API/Web 均为 `86e71bc2bf50dc9a8477179de1bb24bc3f9990c0`，60 分钟错误窗口为 0，业务写入为 0。
- batches preflight run [34322580736](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34322580736) PASS：四批两列仍为 NULL，数量、可用量、公司、仓库、库位、包装源证据、无 FIFO_OUT/分摊动作及唯一 ACTIVE 目标均通过。
- batches apply run [34322630222](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34322630222) PASS：单事务仅 UPDATE `spec_code/sku_code`，改变恰好 4 行并 COMMIT；逐行保护断言确认 `qty/qty_available/source/company/warehouse/location` 未变，未新增或修改 `inv_ledger`。run 同屏输出四条带回读值保护条件的反向 SQL。
- 独立基础 verify run [34322744046](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34322744046) PASS。

四批次最终值：

| batch_no | spec_code | sku_code | qty / available |
|---|---|---|---:|
| `EGG-20260725-00001` | `PKG_PACK_SPEC_3` | `SKU-0001` | 120 / 0 |
| `EGG-20260725-00002` | `PKG_PACK_SPEC_3` | `SKU-0002` | 60 / 0 |
| `EGG-20260817-00001` | `PKG_PACK_SPEC_3` | `SKU-0001` | 300 / 300 |
| `EGG-20260909-00001` | `PKG_PACK_SPEC_3` | `SKU-0001` | 300 / 300 |

### 12.4 最终只读验收

- 补强 verify 的首次 run [34322999423](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34322999423) 因把“获批排除的 32 个 TEMP 批次”错误写成“全表 TEMP 总数必须永远等于 32”而失败；这是过宽的只读断言，未触发写入或回滚。
- 收紧为报告中 32 个精确 `batch_no` 后，run [34323171532](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34323171532) PASS：四批维度完整；`SKU-0001` 为 3 批、可用量 600，`SKU-0002` 为 1 批、可用量 0；32 个获批排除的 `TEMP_PRODUCTION` 批次仍全部 `spec_code/sku_code=NULL`。
- 最终 full deploy run [34324090934](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34324090934) 成功。最终生产只读 run [34324668778](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34324668778) PASS：checkout/API/Web revision 均为 `dad46f92ee4cb261c636adebe5cbdf6cc47a97a2`；真实 GET `/api/v2/sales/inventory/batches?skuCode=SKU-0001` 返回 200、`data.length=2`；60 分钟错误窗口为 0；`PRODUCTION_BUSINESS_WRITES=0`。

最终结论：规格与两组 SKU 已通过主数据服务建立并 ACTIVE，字典已统一为 30 枚；四个获批 PACKAGING 批次仅补齐规格/SKU 维度，数量、可用量和流水未动；32 个无权威规格来源的 TEMP 历史批次未动。
