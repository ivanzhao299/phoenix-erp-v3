# H-DEBUG-A01 历史渗入全链清查（H-DEBUG-A01，2026-09-10）

## 1. 边界与证据

- 本报告记录两轮生产只读核查；本次 H-DEBUG-PURGE 清理未执行。其他审批下已完成的生产修复见第 6 节，不能据此报告旧文字推断生产从未写入。
- 受控 run：`Production Readonly Audit` `34440332774`，revision `f36aba52f6939261c7554e5cd734a4ccd1933b88`；生产 checkout/API/Web 均为 `dc2d2aa524444ec3f82a579b7cf5461f01f9acf1`。
- 双保护：连接级 `default_transaction_read_only=on` + `BEGIN TRANSACTION READ ONLY`，末尾 `ROLLBACK`；runner 输出 `PRODUCTION_BUSINESS_WRITES=0`。
- 查询包：`scripts/ops/readonly-audits/h-debug-a01-history-chain-20260910.sql`。

## 2. 三条历史来源

| source id | 日期 | shift / 班次 | 数量口径 | 状态 | 直接 source link |
|---:|---|---|---|---|---|
| 16 | 2026-07-30 | 22 / `SH-20260730-1111` | 300-0-0 = 净 300 | RECEIVED | 0 |
| 34 | 2026-08-20 | 43 / `SH-20260820-2971` | 302-1-1 = 净 300 | RECEIVED | 0 |
| 38 | 2026-08-21 | 48 / `SH-20260821-3015` | 302-1-1 = 净 300 | RECEIVED | 0 |

三条均为 CLOSED 班次。它们产生于 source-links 治理之前，所以 `source_batch_code` 和关联表均不能直接证明归属；下列归因依据同班次唯一来源与秒级时间线，属于强推断。用户后续已批准第 4 节精确 12 行，但新发现的依赖必须按第 6 节停住。

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

## 4. 用户已批准的精确清单（12 行）

沿用 `GRADING-REPAIR-20260910` 的软作废口径：保留历史行与审计，不物理删除，不直接改 `inv_batches` / `inv_ledger`。

| 对象 | 建议 | 状态 |
|---|---|---|
| source 16/34/38 | `batch_status → VOID`，原因 `test-house-pollution` | 已批准；执行 HOLD，见第 6 节 |
| grading 13 | `status → VOID`；它与 source 16 的秒级序列最匹配 | 已批准；执行 HOLD，见第 6 节 |
| grading 42/43/44/45 | 全部来自只有一条测试来源的 shift 43；`status → VOID` | 已批准；执行 HOLD，见第 6 节 |
| grading 53/54 | 全部来自只有一条测试来源的 shift 48；`status → VOID` | 已批准；执行 HOLD，见第 6 节 |
| packing 21/25 | 用户已批准两单整单 VOID；保留原记录，禁止只摘除引用后冒充正常包装 | 已批准；执行 HOLD，见第 6 节 |

shift 43/48 的包装引用混入其他班次 code，不能仅按数组删除 H-DEBUG code 就宣称包装合法。批准执行前应生成 guarded preflight/apply/verify 三段包，并冻结这两张包装单全字段哈希与全量库存/流水哈希。

## 5. 首轮停止点（历史）

首轮 run `34440332774` 仅只读。原报告把来源/分级写成 9 行是算术错误：实际为来源 3 + 分级 7 + 包装 2 = **12 行**；此前对话中的 13 行同样错误。当前审批引用为 `H-DEBUG-PURGE-20260910`，不增加任何对象。



## 6. 中断恢复核验与当前停止点（2026-09-10）

### 6.1 前轮究竟停在哪里

- 恢复时工作区干净，分支 `fix/packaging-submit-date-500-20260910`，HEAD `fcae2a244a182771c1fbd26166a5ecdad8599862`；远端同分支一致，main 为 `6792efcf10ab28db4fc2fdc644848c79fe7f5d16`。PR #227 已合并；#228 开放。
- 最后可验证的前轮动作是 [Dump Production Schema run 34444253090](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34444253090)，06:13:30 UTC **成功**完成，不是失败的 apply。artifact API 返回 0 个；schema 位于日志的 base64 段，已还原 662279 字节并读取相关表。
- 旧 bash-50 输出不可取回，无法认定其进程为何停止（终端断开、编排中断等均无证据）。记录支持“schema 已读完，随后没有新的受控清理/冒烟执行 run”，不支持把中断归因为数据库异常。
- 不依靠报告缺失推断零写入：[新的只读 run 34448940336](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34448940336) 在 **07:14:45 UTC** 核对真实全字段、关联与审计，生产 checkout/API/Web 均为 `6792efcf10ab28db4fc2fdc644848c79fe7f5d16`。本次目标来源 16/34/38 仍 RECEIVED，分级 13/42/43/44/45/53/54 仍 ACTIVE，包装 21/25 仍原始记录且 schema 无 status。无 H-DEBUG-PURGE 审计。
- 前项 `GRADING-REPAIR-20260910` **确实已写入**：来源 48 VOID；分级 73/74/77 VOID；包装 31 修正引用；业务更新共 **5 行**。原 execute `34434992200` / verify `34435059608`；当前审计 49（来源）、50/51/52（分级）及包装 31 末态佐证。原 apply 还新增包装引用审计 1 行（第 6.1 当前查询未按该无审批文本的 reason 取出，原 execute 为权威证据）。本轮未重放。

### 6.2 新依赖：禁止放行当前 12 行事务

| 被批准对象 | 新核实的清单外依赖 | 生产事实与影响 |
|---|---|---|
| 包装 21 / PKG-20260820-070592 | 交接 **17 / WH-20260820-MT1B5ET5** | 10 箱，2026-08-20 09:18:12，库位 CS-KW-006；不能再描述为“未交接” |
| 包装 25 / PKG-20260821-476346 | 交接 **20 / WH-20260821-MT2JB882** | 10 箱，2026-08-21 05:54:26，库位 CS-KW-006 |
| 分级 53 / GRD-20260821-451624、54 / GRD-20260821-454538 | 包装 **26 / PKG-20260821-872761**，班次 49 | grading_codes_json 同时包含两条目标分级 |
| 同上 | 包装 **27 / PKG-20260821-104819**，班次 50 | 同上 |
| 同上 | 包装 **28 / PKG-20260821-155047**，班次 51 | 同上 |

以上是新发现的旧依赖，不能误称为恢复期间新创建。目标包装直接关联库存/流水为 0，但交接行真实存在；“未查到库存”不等于“无下游依赖”。53/54 作废会影响清单外包装追溯。遵守用户“新依赖即停具体对象”与单事务要求，**全部 12 行 apply 暂停，不拆分执行其中安全子集**。不改交接 17/20，不改包装 26/27/28，不扩大审批清单。

### 6.3 受控包与 VOID 配套门禁

- 复用 `Production Readonly Audit`，没有新增执行器。新增恢复查询 `scripts/ops/readonly-audits/h-debug-resume-state-20260910.sql`；精确原态 preflight `scripts/ops/readonly-audits/h-debug-purge-preflight-20260910.sql` 冻结 **12 个完整 JSON 行**，逐行 id + code + 全字段对比；原态漂移即拒绝。
- preflight 在只读连接/只读事务内检查 source links、新交接、清单外包装引用、目标库存/ledger 和包装 VOID schema。当前应拒绝，不把“成功运行只读查询”记为清理 PASS。
- **apply / post-apply verify / guarded 反向 SQL 尚未生成或执行**：新依赖语义未裁定且包装 VOID schema 不存在，不能制作暗中接受依赖的可写包。旧 `packaging-grading-history-repair-20260910-*` 包只属于之前 5 行修复，禁止拿来执行本次任务。
- 包装 VOID 必须先配套迁移及消费过滤，再测试、CI、PR、full deploy、三端 revision 一致，之后才允许重新 preflight。当前未改运行时代码、未新增迁移、未触发部署。
- 已核实消费缺口：`bff.controller.ts` 的 `getContext` / `getTodaySourceBatches` / `correctBatch` / `getShiftSummary` 未完整排除来源 VOID；`getActiveGrading` 已包装扣减及包装汇总无包装状态过滤；`submitQCInspection` 可覆盖来源状态；`confirmHandover` 与 `packaging-inventory-integration.service.ts:loadTerminalPackingContext` 未拒绝作废包装；后者 legacy 42703 回落也必须失败关闭。来源 RECEIVED-only 分级 pending/submit 与 grading ACTIVE 过滤已存在。追溯展示可保留原行，但要显示作废，不能混入有效数量；通用 CRUD 仍需按其实际展示/消费调用补审核。
- 目标保持：班次 22 有效来源/分级各 600；43/48 有效来源/分级/包装各 0。**当前未达成**，不得修改其他行凑数。

### 6.4 库存、冒烟和验证

- 07:14:45 快照：`inv_batches` 297 行，哈希 `3cf89cb78648b6a0be73ee05c5a6586a`；`inv_ledger` 252 行，哈希 `8bf9bb0111ac503e85eec8bf53e517df`，均与原修复 preflight/verify 一致。没有出现需要解释的全量哈希并发变化。
- 全部 `pkg_grading_source_links` 为 **0 行**；05:00 UTC 后来源/分级/包装/班次均无新增；SMOKE 标识班次/来源/分级/包装未命中。未发现可复用的既有成功分级→包装冒烟。精确证据在 `docs/ops/runs/h-debug-resume-20260910/production-state-34448940336.jsonl`。
- 冒烟已获批但 **BLOCKED_ISOLATION**：`getContext` 以当天最新 OPEN 班次作为全局上下文，`getTodayShifts`/来源 today 无测试过滤；SMOKE 前缀不能隔离真实操作员。包装没有 VOID 状态，无法保证测试残留不被交接入库。按用户“无法隔离则先停报”要求，不创建测试数据，不消耗任何用户已有来源。所需后续隔离方案见包装 500 报告。
- 本次生产业务 INSERT/UPDATE/DELETE **0 行**；生产迁移 **0**；来源/分级/包装/交接/库存/ledger 写入 ID **无**。真实成功 POST、请求响应、pending 扣减、幂等重放证据 **均未产生，不能 PASS**。测试残留 **0**，无需执行清理。
- 所有本地验证显式 `NODE_ENV=test`：API/Web tsc exit 0；API 两个 BFF suite **31/31**；Web 全量 **577/577，108 文件**；nullable-in-unique 0 新违规，constraint drift 0 新漂移（1 allowlist）；终端包装窄正则 scope-audit 两模式均 0 命中。见 `local-validation.txt` 与 `scope-audit.json`。
- 旧 Web `act is not a function` 已核查机制：当前继承环境 `NODE_ENV=production`；React 入口据此加载不导出 act 的 production 模块，react-dom test-utils 却调用 React.act。显式 test 后全量通过。旧会话精确环境不可追回，不能声称已经恢复历史进程证据，也不再以“没改文件”定性噪声。

### 生产 preflight 实际拒绝记录

[run 34449200039](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34449200039)，bundle `9cc70494ee593c18c4f6cfb620f5cb3ffad6fc5c`，07:18:00 UTC，三端 revision 仍为 `6792efcf...`。12 行完整原态比较通过后，SQL 以 exit 3 拒绝：

```
H_DEBUG_PURGE_BLOCKED: UNAPPROVED_HANDOVER_DEPENDENCIES,
UNAPPROVED_PACKING_DEPENDENCIES,PACKING_VOID_SCHEMA_NOT_DEPLOYED
```

这是实际生产门禁失败，**不是清理成功**。连接为 read-only，错误导致事务结束回滚；没有业务 DML。库存/ledger 行数与哈希再次与 07:14:45 及前次治理一致。失败时 ssh-action 没有返回 capture_stdout，上传 artifact 只有空日志；已从 Actions step 原日志提取脱敏证据至 `runs/h-debug-resume-20260910/preflight-34449200039.txt`，不把空 artifact 当成未执行。GitHub 日志对某条清单外 grading code 尾部作了 `***` 掩码，保留原样，不据此认定数据漂移；目标全字段基线仍以 34448940336 artifact 为准。

另直接下载前项 execute `34434992200` 的 artifact，确认 `UPDATE 1 + UPDATE 3 + UPDATE 1`、`INSERT 1 + INSERT 3 + INSERT 1` 与最终 **COMMIT**：前项实际更新 5 个业务行并追加 5 个审计行，绝非“从未写入”。本次新写入仍为 0，未执行旧包。
