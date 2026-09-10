# H-DEBUG-A01 历史渗入全链清查（H-DEBUG-A01，2026-09-10）

## 1. 边界与证据

- 本报告仅做生产只读核查；未修改来源、分级、包装、库存或流水。
- 受控 run：`Production Readonly Audit` `34440332774`，revision `f36aba52f6939261c7554e5cd734a4ccd1933b88`；生产 checkout/API/Web 均为 `dc2d2aa524444ec3f82a579b7cf5461f01f9acf1`。
- 双保护：连接级 `default_transaction_read_only=on` + `BEGIN TRANSACTION READ ONLY`，末尾 `ROLLBACK`；runner 输出 `PRODUCTION_BUSINESS_WRITES=0`。
- 查询包：`scripts/ops/readonly-audits/h-debug-a01-history-chain-20260910.sql`。

## 2. 三条历史来源

| source id | 日期 | shift / 班次 | 数量口径 | 状态 | 直接 source link |
|---:|---|---|---|---|---|
| 16 | 2026-07-30 | 22 / `SH-20260730-1111` | 300-0-0 = 净 300 | RECEIVED | 0 |
| 34 | 2026-08-20 | 43 / `SH-20260820-2971` | 302-1-1 = 净 300 | RECEIVED | 0 |
| 38 | 2026-08-21 | 48 / `SH-20260821-3015` | 302-1-1 = 净 300 | RECEIVED | 0 |

三条均为 CLOSED 班次。它们产生于 source-links 治理之前，所以 `source_batch_code` 和关联表均不能直接证明归属；下列归因依据同班次唯一来源与秒级时间线，属于强推断，处置前仍须逐项批准。

## 3. 逐班次三段对账

| shift | 全班净集蛋 | ACTIVE 分级 | 包装 | 库存/入库流水 | 差额（集蛋-分级 / 分级-包装） |
|---:|---:|---:|---:|---:|---:|
| 22 | 900 | 900 | 0 | 0 / 0 | 0 / 900 |
| 43 | 300 | 1500 | 300 | 0 / 0 | -1200 / 1200 |
| 48 | 300 | 600 | 300 | 0 / 0 | -300 / 300 |

### shift 22

- 来源共 3 条，每条净 300；id 16 位于第二条，创建于 `06:40:15.040216`。
- 分级 id 12/13/14 各 300，分别创建于 `06:39:56.765215`、`06:40:20.666075`、`06:41:37.387410`。
- 时间顺序一一对应，故 id 16 最可能进入分级 id 13 / `GRD-20260730-620666`（300）；未包装、未入库存。

### shift 43

- id 34 是班次唯一来源，净 300。
- 分级 id 42/43/44/45 为 300/300/600/300，均在来源后 6–31 秒创建，合计 1500；均无 source link。
- 包装 `PKG-20260820-070592` 为 300 枚，并在 `grading_codes_json` 中引用上述四条及其他班次分级 code；未查到库存批次或 `PACKAGING_INBOUND` 流水。

### shift 48

- id 38 是班次唯一来源，净 300。
- 分级 id 53/54 各 300，均在来源后 6–9 秒创建，合计 600；均无 source link。
- 包装 `PKG-20260821-476346` 为 300 枚，并引用 id 53/54 及其他班次分级 code；未查到库存批次或 `PACKAGING_INBOUND` 流水。

## 4. 污染清单与待批建议

沿用 `GRADING-REPAIR-20260910` 的软作废口径：保留历史行与审计，不物理删除，不直接改 `inv_batches` / `inv_ledger`。

| 对象 | 建议 | 状态 |
|---|---|---|
| source 16/34/38 | `batch_status → VOID`，原因 `test-house-pollution` | HOLD，待批 |
| grading 13 | `status → VOID`；它与 source 16 的秒级序列最匹配 | HOLD，待批 |
| grading 42/43/44/45 | 全部来自只有一条测试来源的 shift 43；`status → VOID` | HOLD，待批 |
| grading 53/54 | 全部来自只有一条测试来源的 shift 48；`status → VOID` | HOLD，待批 |
| packing 21/25 | 不宜仅删除 grading 引用后保留为正常包装。建议先由业务裁定整单 VOID/测试隔离口径；两单均未入库存，暂无反向库存动作 | HOLD，待批 |

shift 43/48 的包装引用混入其他班次 code，不能仅按数组删除 H-DEBUG code 就宣称包装合法。批准执行前应生成 guarded preflight/apply/verify 三段包，并冻结这两张包装单全字段哈希与全量库存/流水哈希。

## 5. 停止点

本轮到只读报告即止。生产业务数据写入为 0；上述 9 条 source/grading 与 2 条 packing 建议均未执行。

