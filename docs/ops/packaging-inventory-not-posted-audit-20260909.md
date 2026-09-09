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
