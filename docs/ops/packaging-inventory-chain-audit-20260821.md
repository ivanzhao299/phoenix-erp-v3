# 包装交接 → 库存入账链路审计（2026-08-21）

## 1. 结论

本次生产现象不是 schema drift，也不是包装交接代码漏写库存，而是当前库存来源模式的预期行为：窗口内 5 条交接全部属于 `TEMP_PRODUCTION_INBOUND` 场站。TEMP 模式由日产蛋入库链路持有库存，包装交接只写 `pkg_handover_records`，刻意不再生成 `source_type='PACKAGING'` 的 `inv_batches` 或 `PACKAGING_INBOUND` 流水，防止双写。

生产实际模式：

| scope_level | scope_code | mode |
|---|---|---|
| GROUP | ALL | TEMP_PRODUCTION_INBOUND |
| SITE | CS-0001 | TEMP_PRODUCTION_INBOUND |
| SITE | FARM-DP | TEMP_PRODUCTION_INBOUND |
| SITE | FARM-MS | PACKAGING_INBOUND |

因此观察到的 5 条记录无需改变 TEMP/PACKAGING 业务逻辑，也不应擅自修改生产配置。审计另发现 SITE 模式解析被 legacy 兼容逻辑旁路，已在本分支修复；若业务决定让 CS-0001 或 FARM-DP 在交接时生成包装库存，仍需先完成 TEMP 库存切断与对账，再把对应 SITE 配置切到 `PACKAGING_INBOUND`，不能只改配置而保留日产蛋写入，否则可能双写。

## 2. 完整调用链

### Terminal 真实车间流

```text
POST /api/packaging/terminal/packing/submit
  → PackagingTerminalBffController.submitPacking
  → INSERT pkg_packing_records
  → 此时不写库存

POST /api/packaging/terminal/warehouse/confirm
  → 校验 packingCode、location，且库位存在并非 LOCKED
  → PackagingInventoryIntegrationService.completeTerminalPacking
    → SELECT pkg_packing_records(code, production_date, batches_json)
    → batches_json 按 grade/spec 转为产出 items
    → generateSaleableFromOutputs
      → packaging_batch_ref + source_type='PACKAGING' 幂等检查
      → InventorySourceModeService.resolveMode(SITE → COMPANY → GROUP → 默认 TEMP)
      → TEMP：skippedByMode=true，totalInbound=0，不写库存
      → PACKAGING：仅 ACTIVE 且可售等级进入 createSaleableBatch
        → EggInventoryService.createProductionBatch
        → INSERT inv_batches(source_type='PACKAGING', packaging_batch_ref=packingCode)
        → INSERT inv_ledger(change_type='PACKAGING_INBOUND', ref_no=packingCode)
  → 库存已存在/生成成功，或 TEMP 合法跳过，才 INSERT pkg_handover_records
  → getWarehouseHandoverStatus
    → TEMP：handover 存在即 COMMITTED
    → PACKAGING：handover + 正数库存证据才 COMMITTED
```

关键实现：`apps/api/src/modules/bff/bff.controller.ts` 的 `submitPacking`、`confirmHandover`、`getWarehouseHandoverStatus`；`apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts` 的 `completeTerminalPacking`、`generateSaleableFromOutputs`；最终库存写入在 `egg-inventory.service.ts#createProductionBatch`。

### Admin 包装任务流（不是本次 7 条 Terminal 包装记录的主链）

`POST /api/packaging/tasks/:id/pack-complete` 会写自身的批次/流水并建立 `wms_inbound(PENDING, type='PACKING')`，随后调用 `completePackagingBatch`。本次窗口内唯一 `wms_inbound` 为 `type='PURCHASE'`、`task_no='INB-20260821-LH7H'`，与 5 条交接无关。

## 3. 触发条件矩阵

| 模式/条件 | warehouse confirm 行为 | inv_batches / inv_ledger | 交接状态 |
|---|---|---|---|
| TEMP_PRODUCTION_INBOUND | 包装库存合法跳过 | 不生成包装来源库存；库存应由日产蛋链路负责 | handover 存在即 COMMITTED |
| PACKAGING_INBOUND，可售数量 > 0 | 交接时直接正式入账 | 写 `PACKAGING` 批次和 `PACKAGING_INBOUND` 流水 | 库存证据 + handover 后 COMMITTED |
| PACKAGING_INBOUND，已存在包装批次 | 幂等返回 | 不重复写 | handover 后 COMMITTED |
| PACKAGING_INBOUND，无可售数量/空 batches | `totalInbound=0` | 不写 | 新 handover 不落库；保持 PENDING |
| 包装记录不存在 | 返回 note | 不写 | 新 handover 不落库；保持 PENDING |
| 库位为空、不存在或 LOCKED | 请求在库存调用前失败 | 不写 | 不落 handover |
| 库存写入异常 | catch 后显性返回失败 | 事务/下游错误决定 | 新 handover 不落库；不会伪成功 |
| 未配置任何模式 | resolver 默认 TEMP_PRODUCTION_INBOUND | 包装库存跳过 | handover 可 COMMITTED |

TEMP 模式不需要再点一次包装 inbound confirm 才生成包装库存；它的设计含义正是“库存已在日产蛋入口生成，包装交接不重复入账”。通用 `/api/inbound/confirm` 是独立 WMS 入库链，并非 Terminal `warehouse/confirm` 的后续必经步骤。

## 4. 生产只读证据

审计 workflow：GitHub Actions run [32460978538](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32460978538)，结论 `success`；审计窗口 `2026-08-19 17:00:00 UTC`（含）至 `2026-08-21 07:44:00 UTC`（不含）。workflow 使用 `PGOPTIONS='-c default_transaction_read_only=on'` 与 `BEGIN TRANSACTION READ ONLY` 双层只读，并通过 `psql -v` 传递时间参数。

### 包装与交接

- `pkg_packing_records` 7 条；每条 `batches_json` 都是 `grade / boxes / eggs / spec / specId` 结构，生产字段完整。
- `pkg_handover_records` 5 条。该表没有独立 `status`、`mode`、`site_id`、`warehouse_code`、`location_code` 列；实际目标库位记录在 `location`，状态与模式由运行时计算，场站由 `shift_id → pkg_work_shifts.site_id` 得出。
- 5 条均有合法库位 `CS-KW-006`，均能关联包装记录和班次，没有 site 解析数据缺失。

| packing_code | eggs / boxes | shift_id | site_id | shift status | 实际模式 | 运行时状态/分支 |
|---|---:|---:|---|---|---|---|
| PKG-20260821-476346 | 300 / 10 | 48 | CS-0001 | OPEN | TEMP | COMMITTED；合法跳过包装库存 |
| PKG-20260821-984095 | 600 / 20 | 45 | FARM-DP | CLOSED | TEMP | COMMITTED；合法跳过包装库存 |
| PKG-20260821-629354 | 300 / 10 | 44 | CS-0001 | CLOSED | TEMP | COMMITTED；合法跳过包装库存 |
| PKG-20260820-070592 | 300 / 10 | 43 | CS-0001 | CLOSED | TEMP | COMMITTED；合法跳过包装库存 |
| PKG-20260820-978233 | 300 / 10 | 35 | CS-0001 | CLOSED | TEMP | COMMITTED；合法跳过包装库存 |

`COMMITTED` 是按当前 `getWarehouseHandoverStatus` 的确定性规则重建：handover 存在且解析模式为 TEMP。数据库 handover 表本身不持久化该状态。

另外两条包装记录未出现在 5 条交接中，说明尚未完成 warehouse confirm；它们与“已交接但无包装库存”的五条根因判定无关。

### 库存与 WMS

- `inv_batches`：0 条窗口新增或以这 7 个 packing code 为 `packaging_batch_ref` 的批次。
- `inv_ledger`：仅两条 `FARM_IN / HOUSE_CS_03`，无包装关联流水。它们反而与 TEMP 由上游生产入口持有库存的设计一致，但本次审计未把这两条具体数量与五条包装逐笔勾稽，不能据此宣称数量已完全对平。
- `wms_inbound`：1 条 `PENDING`，但为 `PURCHASE / SKU-1-LOOSE / 72000`，并非包装入库单。
- 窗口班次分布：`CS-0001 = 8`、`FARM-DP = 1`。

## 5. 可能断点与生产对照

| 候选断点 | 代码结果 | 生产对照 |
|---|---|---|
| mode 未配置 | 默认 TEMP，合法跳过包装库存 | 已明确配置，且 5 条均为 TEMP |
| site_id 缺失/解析失败 | 会回落 COMPANY/GROUP/default | 5 条 shift 均有 site_id；但当前服务未读取它，见下方潜在缺口 |
| 仓库/货位无效 | confirm 在写 handover 前 400 | 5 条已有 handover 且 location 为 CS-KW-006，排除 |
| `safe()` 吞异常 | 当前 confirm 主链使用 try/catch 并显性返回失败，新 handover 不落 | 与 5 条已有合法 TEMP handover 不符 |
| PACKAGING 模式产出全不可售/空数量 | 不写新 handover | 5 条均已写 handover，且实际为 TEMP |
| 状态停 PENDING | PACKAGING 缺库存时会 PENDING/HANDOVER_ONLY | TEMP 下 handover 即 COMMITTED；WMS 的 PENDING 是无关采购单 |
| schema drift | 读取/插入会失败 | `shift_id`、`grading_codes_json` 均存在，排除 |

## 6. 与历史修复的关系

- `12535ceb` 恢复了模式互斥：`completeTerminalPacking` 不再用 `requireInventory=true` 覆盖 TEMP；TEMP 下应返回 `skippedByMode=true`、`totalInbound=0`。
- `213f76e9` 配套允许 TEMP 合法跳过后提交交接，并在状态查询中把 handover 视为 COMMITTED。
- `65872b0d` 的 `requireInventory` 能力仍在，但当前 Terminal 主链不再强制调用；其“所有模式都必须有包装库存证据”的语义已被上述两个提交有意调整。
- `7599d1f4` 曾做大范围同名收口，后被 `96a6d6c0` 明确 revert；不能用它判断当前语义。
- `89c1895d` 继续补齐统一 egg ledger 维度，但没有撤销 TEMP/PACKAGING 互斥。
- `81fb76d0` 为兼容旧 schema 去除了 Terminal 路径的 shift 查询；生产 schema 已恢复完整，但该兼容逻辑仍留在当前代码。

生产行为与 `12535ceb + 213f76e9` 的修复预期完全一致。

## 7. SITE 模式解析缺口与修复（不是本次现象根因）

`completeTerminalPacking` 当前把 `siteCode` 固定为 `null`，`getTerminalInventoryMode` 也用空 rows 解析模式。因此实际运行时没有按 `shift_id → pkg_work_shifts.site_id` 使用 SITE 配置，而是回落 COMPANY/GROUP/default。

本次 5 条不受影响：CS-0001、FARM-DP 与 GROUP/ALL 都是 TEMP，正确解析 SITE 或回落 GROUP 的结果相同。但 FARM-MS 已配置为 `PACKAGING_INBOUND`；如果 FARM-MS 走同一 Terminal 链路，修复前会错误回落到 GROUP TEMP，导致本应交接即入账却被跳过。

本分支已完成最小修复：

1. 恢复 `pkg_packing_records.shift_id → pkg_work_shifts.site_id` 查询。
2. `completeTerminalPacking` 与 `getTerminalInventoryMode` 复用 `loadTerminalPackingContext`，避免 confirm 与刷新状态模式不一致。
3. 只有 PostgreSQL `undefined_column (42703)` 才使用不含 `shift_id` 的 legacy 查询；其他数据库错误继续显性抛出。
4. 库存批次恢复写入 `collectionBatchRef=SHIFT-<shift_id>`。
5. 新增 SITE=PACKAGING、SITE=TEMP、无 shift 回落、状态刷新一致、legacy 缺列五组测试。

## 8. 配置/操作建议

当前不做配置变更。若业务决定把某场站切为包装库存权威源，操作顺序应为：

1. 对齐该场站 TEMP 上游库存与包装交接数量，确认切换时点和存量处理。
2. 部署并验证本分支的 SITE 模式解析修复。
3. 停止该 SITE 的 TEMP 日产蛋库存写入路径。
4. 经审批后将 `inv_source_mode(SITE, <site_code>)` 更新为 `PACKAGING_INBOUND`；本报告不执行生产写入。
5. 真实跑一笔包装提交 → warehouse confirm，核验 `inv_batches.packaging_batch_ref`、`inv_ledger.change_type='PACKAGING_INBOUND'`、数量和幂等重试。
6. 前端继续显示当前来源模式；建议把 TEMP 的“交接已完成，库存由日产蛋链路持有”和 PACKAGING 的“待库存入账/已入账”做成明确状态，而不是统一显示模糊的交接成功。

## 9. 变更与验证

- 分支：`codex/packaging-inventory-chain-audit-20260821`
- workflow 提交：`629ed395 ci: deepen packaging inventory chain audit`
- workflow 验证：run 32460978538 成功，生产 SQL 全部在只读事务中完成。
- 静态验证：`git diff --check` 通过；GitHub Actions 实际解析并运行 workflow 成功。
- API 修复文件：`packaging-inventory-integration.service.ts`；测试文件：`packaging-inventory-integration.service.spec.ts`。
- API TypeScript：`tsc --noEmit` 通过。
- Web TypeScript：`tsc --noEmit` 通过。
- API 全量 Jest：56 suites / 502 tests 全部通过；其中新增 Terminal 模式测试 5/5 通过。
- 说明：`pnpm test -- --runInBand` 被项目脚本误解析为测试 pattern，未执行任何用例；随后使用 `pnpm exec jest --runInBand` 正确完成全量验证。
- 决策：观察到的 5 条链路属于 TEMP 设计行为，不修改生产配置；代码仅修复独立的 SITE 灰度解析缺口。
- main 合并提交：`79092bf2 fix: merge packaging inventory chain audit`，已推送。
- push CI：run [32461444350](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32461444350) 成功；Type-check/Regression、API/Web 镜像构建均通过。push 流程按仓库策略不直接部署，Deploy job 正常 skipped。
- 显式生产部署：`mode=api`、`approve_production=true`，run [32461969808](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32461969808) 成功；API 镜像构建、`Deploy via SSH`、部署通知全部通过，Deploy job 耗时 2m9s。
