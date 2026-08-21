# G201 约束漂移静态门禁

日期：2026-08-21
范围：纯静态 CI 门禁，无数据库、无生产变更

## 1. 动机

P0-3、P0-4a、P0-4b 暴露了同一类缺口：应用写值语义已经演进，但数据库 `NOT NULL` / `DEFAULT` / `CHECK` 未同步，或表重建时历史 CHECK 被静默丢失。既有 entity-drift 需要真实数据库，nullable-in-unique 只检查 entity 唯一约束，迁移门禁只检查 down/DML/冻结目录，均不能在普通静态 CI 中捕获这三类事故。

## 2. 三方比对设计

- A（迁移链末态）：按文件名时间顺序重放顶级 `migrations/`、`apps/api/migrations/` 冻结 SQL，再重放 `apps/api/src/database/migrations/*.ts` 的 `up()` 约束 SQL，得到列的 NOT NULL、DEFAULT 和 CHECK 终态。
- B（基线意图）：记录冻结 SQL 曾声明的列级/表级 CHECK，防止后续重建或迁移无意丢护栏。
- C（代码写值）：扫描 API TypeScript raw INSERT 的 SQL 字面值及参数数组 null fallback、同模块 DTO `@IsIn` 与 entity `@Column({ nullable })`。

脚本为 `scripts/check-constraint-drift.js`，只使用 Node 内置 `fs/path`，不访问数据库、不安装依赖。

## 3. 规则

| 规则 | 比对 | 严重级别 | 对应事故 |
|---|---|---|---|
| R1 | INSERT 对列写 NULL/null fallback，但末态 NOT NULL 且无 DEFAULT | error | P0-3 |
| R2 | 基线声明过的列 CHECK 在末态完全不存在 | error | P0-4a |
| R3 | raw INSERT 字面值或可可靠映射的 DTO `@IsIn` 值不属于末态 CHECK 枚举 | error | P0-4b |
| R4 | entity nullable 与迁移推导末态 NOT NULL 不一致 | warn-only | 辅助 g197 |

未登记的 R1/R2/R3 使脚本退出 1。R4 只输出黄字，不进入 allowlist。

## 4. 解析范围与局限

当前覆盖 `CREATE TABLE` 列定义/表级 CHECK、`ALTER TABLE ADD/DROP CONSTRAINT CHECK`、`ADD COLUMN ... NOT NULL DEFAULT`、`ALTER COLUMN SET/DROP NOT NULL`、`SET/DROP DEFAULT`，并处理嵌套括号、引号、单条 ALTER 多 action。TS 仅重放 `up()` 中无插值的 `queryRunner.query(...)` 字符串；仓库现有 `addAndValidate(table, constraint, values)` 固定 helper 形态有显式展开。

已知局限：动态模板拼接、通用 CRUD 动态表/列、复杂 `DO $$` / `EXECUTE`、跨文件或 spread DTO 常量、非 IN/ANY 的复杂 CHECK 不能完整推导。脚本会保守跳过，不能替代真实数据库上的 g197 entity-drift；本次扫描报告 2 段动态 TS 迁移 SQL被跳过。

## 5. allowlist 存量核实

格式为 `规则|表.列|原因`，原因必填。本次只有一项：

- `R2|fin_cash_transactions.txn_type`：已核对 `20260526_finance_v2_phase3_cash_runtime.sql`，Phase 3 明确 DROP+重建资金流水，并以 `direction + source_type` 取代旧 `txn_type`；旧列及其 CHECK 属有意移除，不是漏护栏。

真实 bug 不得登记 allowlist。当前 R1/R3 无存量豁免。

## 6. 自测证据

`node scripts/check-constraint-drift.js --self-test` 内置四个最小 fixture：

```text
✅ R1 / P0-3 null write vs NOT NULL: red (R1)
✅ R2 / P0-4a dropped baseline CHECK: red (R2)
✅ R3 / P0-4b code value outside CHECK: red (R3)
✅ clean fixture: green
✅ self-test: 3 red fixtures detected; clean fixture green
```

仓库扫描基线：227 个冻结 SQL、61 个 TS 迁移、168 张表、134 个可识别 literal/null 写值、54 个 DTO 枚举、1427 个 entity 列；1 项有意移除进入 allowlist，R4 输出 24 项 warn-only 候选。

## 7. CI 接线

- `.github/workflows/ci-build.yml`：依赖安装后，先跑 g198 nullable-in-unique，再跑 `Check constraint drift (g201)`，随后 typecheck/build。
- `.github/workflows/deploy.yml` 的 `Type-check & Regression` job：g198 后、Build API 前运行同一命令。

两处均执行 `node scripts/check-constraint-drift.js`，无需数据库或额外依赖。

## 8. 本地验证

- `node scripts/check-constraint-drift.js`：exit 0，0 个新增漂移、1 个有意移除 allowlist、24 个 R4 警告。
- `node scripts/check-constraint-drift.js --self-test`：exit 0，三个历史事故 fixture 全红，clean fixture 绿。
- `node scripts/check-nullable-in-unique.js`：exit 0，0 违规（1 个既有白名单）。
- TS 迁移 down/no-DML：61 条全部通过（28 条既有文件级 DML 豁免）。
- API `tsc --noEmit`：0 errors；Web `tsc --noEmit`：0 errors。
- `apps/api/test/scope-audit.sh` 已真跑；本地 API 未启动，全部 HTTP 为 `000`，结果为 0 通过 / 30 失败 / 1 跳过。该脚本自身仍返回 0；本次未改业务、RBAC 或 DataScope，故记录为环境不可运行证据，不将其表述为 PASS。
