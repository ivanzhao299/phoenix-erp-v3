# 包装作业链提交 500 紧急修复（2026-09-10）

## 1. 真实故障证据

- 受控生产只读诊断 run `34440335856`，revision `f36aba52f6939261c7554e5cd734a4ccd1933b88`，`PRODUCTION_BUSINESS_WRITES=0`。
- `sys_error_logs` 命中两条真实 500：id `51927`（02:28:44 UTC）和 `51928`（02:28:49 UTC），用户 `songlei`，端点均为 `POST /api/packaging/terminal/grading/submit`。
- 原始错误均为 `invalid input syntax for type date: "Thu Sep 10"`。当天 `packing/submit` 没有错误行，API 当前日志尾也未保留对应堆栈。
- 生产 schema 已存在 `pkg_grading_source_links`、`pkg_grading_records.status`、`pkg_packing_records.grading_codes_json`；不是缺迁移或 NOT NULL 漂移。

用户在包装工作台看到的是整条“分级→包装”链路中断；真实失败发生在前一步分级提交，导致新分级与 source link 没有落库，包装页自然拿不到可提交的新批次。

## 2. 根因与调用链

1. Web `grading/page.tsx` 的 `handleSubmit` 调用 `packagingApi.submitGrading`，字段为 `shiftId/sourceBatchIds/outputs/idempotencyKey`。
2. API `bff.controller.ts:submitGrading` 锁定班次并读取 PostgreSQL `DATE production_date`。
3. 驱动在生产把 DATE 返回为 JavaScript `Date`；旧代码执行 `String(shift.production_date).slice(0,10)`，得到 `Thu Sep 10`。
4. 插入 `pkg_grading_records.production_date DATE` 时 PostgreSQL 拒绝该字符串并产生 500。

`grading/active` 的空聚合、`source_links=0`、DTO 和幂等 NOT NULL 均已逐项排查：旧分级确实无 link，但当前 packing ownership 会以 409 明确拒绝，不是此次 500；缺幂等键由 DTO 400 拒绝。

## 3. 修复

- 班次 SQL 显式读取 `production_date::text`，消除驱动 DATE parser 差异。
- 插入前仍做双保险规范化：接受 `YYYY-MM-DD...` 字符串或有效 `Date`，统一成 `YYYY-MM-DD`；无法规范化时给出明确服务端异常，禁止把截断星期文本传给数据库。
- pending 与事务锁定来源都只接受 `batch_status='RECEIVED'`，阻断已按 `GRADING-REPAIR-20260910` 作废的来源再次分级。
- 新增回归：生产 Date 对象、缺幂等键、VOID 来源 SQL 过滤、旧分级无 source link 返回业务冲突而非 500。

## 4. 本地验证

- API 定向 Jest：10/10 PASS。
- API `tsc --noEmit`：PASS，0 errors。
- Web `tsc --noEmit`：PASS，0 errors。
- nullable-in-unique：0 新违规；constraint drift：0 新 drift（1 条既有 allowlist）。
- TS migration down/no-data-DML：80/80 PASS；本修复无迁移。
- Web 全量 Vitest：548 PASS / 29 FAIL。29 个失败全部为三个既有 React 测试文件的 `act is not a function` 环境问题，本轮未改前端；不得记为全绿。
- scope-audit：本轮无 Web 字段改动；窄正则当前仓库 2 个既有命中，无新增。

## 5. CI、部署与生产复验

- PR `#227` 全部门禁通过后合并，merge revision `6792efcf10ab28db4fc2fdc644848c79fe7f5d16`。
- PR runner：Static Security/Freeze、Runtime Smoke、Web Vitest、API Build、V3 Regression、deploy PR regression 全绿；V3 packaging regression 在干净数据库真实执行通过。
- 显式 full deploy run `34441348164` 成功：双镜像构建、迁移链、API/Web 健康检查和部署 smoke 全部通过。
- 部署后只读 run `34442294824`：生产 checkout/API/Web revision 三对齐为 `6792efcf...`；48 小时窗口最新包装域 500 仍仅为部署前的 `51927/51928`（02:28 UTC），部署后截至 05:45 UTC 新增包装域 500 为 0。

### 5.1 已获批冒烟：恢复核查后停在隔离门禁

用户已批准一次最小真实分级+包装成功 POST，本轮无需重新请求原审批；但要求独立受控来源、明确测试标识、无库存影响、不重复创建、保留链路 ID 与请求响应，且测试残留清理不得扩大历史 12 行清单。原方案“物理删除五类测试行”已失效，**禁止执行**。

- 恢复只读 run [34448940336](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34448940336)，07:14:45 UTC，checkout/API/Web 均为 `6792efcf10ab28db4fc2fdc644848c79fe7f5d16`。
- 查全部 source links 为 **0 行**，05:00 UTC 后无新增来源、分级、包装或班次；所有 SMOKE 标识查询无记录。前轮没有可复用的成功链路实证，也没有发现遗留的受控测试数据。
- **具体隔离障碍**：`PackagingTerminalBffController.getContext`（当前约 1340 行）选择当天最新 OPEN 班次，不按测试标识、产线或操作者隔离；`getTodayShifts`/`getTodaySourceBatches` 同样不排除测试记录。因此创建 OPEN 的 SMOKE 班次会进入真实操作员全局上下文，单纯名称前缀不能保证隔离。真实 schema 的包装表无 status/void 字段，`loadTerminalPackingContext` 也不拒绝测试/作废包装，留下测试包装仍有被交接入库风险。
- 按已授权范围中的“若无法隔离或保证库存零影响，先停报具体原因”，**不执行任何 smoke POST 或 SQL seed**。不使用真实 OPEN 班次，不盗用/消耗用户来源，不交接/入库/销售，不创建主数据，不通过改历史行或物理删除隐去残留。
- 本次 smoke 写入 **0 行，ID 无，残留 0**；source→grading→packing ID、请求/响应、source_links=30、pending 30→0、同 key replay 不增量等证据 **未产生**。先前 GET 200、零新 500 和 CI 包装回归均不替代这项生产验收。状态 **BLOCKED_ISOLATION / NOT PASS**。

后续需先实现并部署隔离方案：受控测试班次/来源在真实上下文和有效汇总中不可见、所有库存入口拒绝测试链、测试链有可追溯保留状态；只允许专属测试调用访问。然后冻结独立班次+来源的身份与稳定幂等键，创建最小 30 枚来源、一次分级及一次包装，不交接；每步先查末态，重复请求只用于验证已有幂等契约，不盲重放。保留隔离残留清单与方案，未经额外明确授权不清理或扩展历史清单。当前未实现该配套隔离，也未触发 full deploy。

### 5.2 中断原因、历史写入及新阻断证据

- 旧 bash-50 输出不可追回，无法还原进程中断原因。最后可验证动作 [schema run 34444253090](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34444253090) **成功**；artifact 为 0 个，schema 在 base64 日志，已成功还原读取。不能称为 schema dump 或 apply 失败。
- 本次 H-DEBUG 审批为 **12 行**：source 16/34/38；grading 13/42/43/44/45/53/54；packing 21/25。生产仍为原态，无该审批执行审计。
- 先前其他审批已实际更新来源 48、分级 73/74/77、包装 31（5 业务行，execute `34434992200`、verify `34435059608`），恢复核查确认其末态，本轮没有重放。
- 新依赖：包装 21/25 对应交接 17/20；分级 53/54 被清单外包装 26/27/28 引用。遵守新依赖即停与单事务限制，当前 12 行未执行，也不改上述清单外对象。明细见 [H-DEBUG 报告](h-debug-a01-history-chain-audit-20260910.md)。
- 全量库存 297 行/哈希 `3cf89cb78648b6a0be73ee05c5a6586a`，ledger 252 行/哈希 `8bf9bb0111ac503e85eec8bf53e517df`，均与前次治理一致。

### 5.3 本次真实本地验证及旧失败复核

所有本地测试显式 `NODE_ENV=test`：API tsc、Web tsc 均 0 errors；API BFF+grading-governance 两 suite **31/31 PASS**；Web 全量 **577/577 PASS（108 文件）**；nullable unique、constraint drift、终端包装 scope-audit 均完成。没有运行生产写入测试。

对前次 29 个 `act is not a function`，当前继承的 `NODE_ENV=production` 已实查；React index.js 在 production 分支加载不导出 act 的模块，而 react-dom-test-utils.production.js 调用 React.act。无需改代码，显式 test 后 29 个及其余 Web 测试全部通过。这是已核实的当前环境机制；旧 bash 精确环境不可追回，不能用“未改前端”替代根因证据。详细命令和机制记录见 [local-validation.txt](runs/h-debug-resume-20260910/local-validation.txt)。

### 5.4 交付边界

恢复工作只新增受控只读 SQL 与证据文档；没有运行时代码或迁移变更，没有新部署。生产仍运行已部署的日期 500 修复 revision `6792efcf...`。两项生产任务仍未完成：H-DEBUG 12 行清理被依赖/schema 门禁阻断；成功 POST 冒烟被隔离门禁阻断。PR #228 持续记录当前结果，不把尚未完成的任务写成 closeout PASS。

### 生产 preflight 实际拒绝记录

[run 34449200039](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34449200039)，bundle `9cc70494ee593c18c4f6cfb620f5cb3ffad6fc5c`，07:18:00 UTC，三端 revision 仍为 `6792efcf...`。12 行完整原态比较通过后，SQL 以 exit 3 拒绝：

```
H_DEBUG_PURGE_BLOCKED: UNAPPROVED_HANDOVER_DEPENDENCIES,
UNAPPROVED_PACKING_DEPENDENCIES,PACKING_VOID_SCHEMA_NOT_DEPLOYED
```

这是实际生产门禁失败，**不是清理成功**。连接为 read-only，错误导致事务结束回滚；没有业务 DML。库存/ledger 行数与哈希再次与 07:14:45 及前次治理一致。失败时 ssh-action 没有返回 capture_stdout，上传 artifact 只有空日志；已从 Actions step 原日志提取脱敏证据至 `runs/h-debug-resume-20260910/preflight-34449200039.txt`，不把空 artifact 当成未执行。GitHub 日志对某条清单外 grading code 尾部作了 `***` 掩码，保留原样，不据此认定数据漂移；目标全字段基线仍以 34448940336 artifact 为准。

另直接下载前项 execute `34434992200` 的 artifact，确认 `UPDATE 1 + UPDATE 3 + UPDATE 1`、`INSERT 1 + INSERT 3 + INSERT 1` 与最终 **COMMIT**：前项实际更新 5 个业务行并追加 5 个审计行，绝非“从未写入”。本次新写入仍为 0，未执行旧包。

## 6. VOID 与测试隔离实施续行（2026-09-10，部署前）

CLI stderr os error11 / exit101不是业务验收；独立只读run34450975790的SQL已成功，仅artifact留档因stdout环境变量过长失败。新只读依赖run34452868722成功，未重复业务写入。包装26/27/28另有交接21/22/23；与既有交接17/20一起列入待批清单，不能仅凭引用53/54整单认定污染。完整逐行清单、事实/推断边界见[H-DEBUG报告第7节](h-debug-a01-history-chain-audit-20260910.md#71-逐行待批清单)。

已实现：包装ACTIVE/VOID审计、幂等与事务余量保护、交接/库存/直接销售依赖拒绝直接VOID、消费过滤；四表默认false的is_test；ROLE_ADMIN显式测试模式、双向来源/查询隔离、禁止测试交接库存、可审计关闭测试班次。仅schema迁移，无历史业务DML。普通同舍同班多次采集不合并。历史混合引用余量保守扣减，不能推算每个分级实际消耗。

本地NODE_ENV=test：双端tsc通过；API833通过/13条件性跳过；其中本轮PG suite另行在独立PG18真实执行12/12；Web577/577；scope/约束/81条迁移门禁通过。独立代码和SQL审查已完成。新增PG集成纳入CI。本节尚未声明CI/部署完成，以后续实际run为准。

生产POST计划已由主agent复核，**本轮不执行**：只允许管理员显式测试模式，独立测试班次/来源30枚，不引用真实入库单；稳定分级/包装key；按每步已存在末态决定是否执行；验证pending30→0、同key重放不增量；禁止交接/库存/销售；审计结束保留测试记录。计划必须在部署后只读隔离验收通过且后续用户允许执行的轮次中使用；不把本轮GET或本地PG通过写成生产POST成功。

原12行清理、新依赖处置、真实成功POST验收继续暂缓；本轮截至部署前业务DML0、生产测试记录0。
