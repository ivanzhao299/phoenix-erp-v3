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

### 5.1 真实成功型提交冒烟待批

要完成“生产真实分级提交 → 包装提交”的成功型冒烟，必须创建并随后清理隔离测试数据；现有真实 OPEN 班次/来源不能拿来消耗，否则会改变业务数量。按“若需生产数据配合先报批”红线，本轮停在以下精确范围：

1. 创建 1 个 `SMOKE-PKG-DATE-20260910-*` OPEN 班次与 1 个同前缀来源批次，净量 30；使用明确测试 site/house 标识。
2. 以稳定幂等键提交 1 条分级（`GRADE_1=30`），断言 HTTP 200、`production_date=2026-09-10`、source link=30；重放同 key 断言 replay 且不增行。
3. 提交 1 条包装（1 箱/30 枚），断言 HTTP 200；不执行交接/入库，因此不触碰 `inv_batches/inv_ledger`。
4. 冻结创建 id/code 后，按依赖顺序仅删除这次 smoke 的 packing → source link → grading → source → shift 五类测试行；前后断言非 smoke 行哈希不变。
5. 查询 smoke 窗口 `sys_error_logs` 和 API Docker 日志，要求 grading/packing submit 500 均为 0。

在获得该生产测试数据写入与清理批准前，不把成功型生产提交冒烟记为 PASS。
