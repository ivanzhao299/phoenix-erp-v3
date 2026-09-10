# 包装作业台分级环节重复提交旧集蛋数据核查（2026-09-10）

## 1. 范围、红线与结论

- 范围：Terminal V3 真实车间流 `/api/packaging/terminal/*`，核查集蛋提交后旧数据在下一批分级时回流的问题。
- 本轮只读代码、执行生产只读工作流并形成方案；未修改前后端、未改 schema、未修生产数据。
- 生产只读证据：GitHub Actions `Packaging Repro Readonly Audit` run `34422584642`，查询窗口 `2026-09-01 00:00:00`（含）至 `2026-09-11 00:00:00`（不含），运行成功。SQL 在 `BEGIN TRANSACTION READ ONLY` 内执行，并通过容器环境设置 `PGOPTIONS=-c default_transaction_read_only=on`；`PRODUCTION_BUSINESS_WRITES=0`。

**结论：症状可由现有代码确定性解释，且后端允许重复落单。** 分级页不是读取“本批次未分级项”，而是每 5 秒读取“今日全部来源批次”，按鸡舍重新聚合；提交成功只把鸡舍记入当前 React 页面内存。重新进入/刷新后这个集合归零，旧批次再次成为待分级数据。与此同时，前端发送 `sourceBatchIds`，后端却只读取 `sourceBatchCode`，来源关系实际未建立；后端超量只告警仍插入，且以新时间戳 code 追加，不能幂等。

生产证据还出现一个高风险交叉引用：`GRD-20260909-136133` 同时进入班次 54（上午）的包装记录和班次 55（下午）的包装记录。它证明“旧分级 code 可跨班次被再次带入下游”；但现有审计输出没有该分级行的来源与数量，故本轮不把它直接定性为重复集蛋，更不虚构重复数量。

## 2. A — 复现链路定位

### A1. 集蛋提交后的前端状态

集蛋页 `apps/web/src/app/(terminal)/terminal/packaging/source-receive/page.tsx`：

1. `fetchRecords()` 调用 `getTodaySourceBatches()`，随后按 `house_code` 把当日各行数量累加（132–163），并每 5 秒重拉（166–175）。
2. 提交 `receiveBatch` 时携带当前 `shiftId`（205–224）；成功后只重拉今日记录、清空选中鸡舍和三个输入框（225–230）。它没有创建/持有“当前分级批次边界”。
3. `alreadyRecorded` 虽被计算（183），却不参与 `canSubmit`；相同鸡舍仍可再次选择、再次提交（183–199）。

所以集蛋表单自身确实清空了，问题不是三个输入框没清；旧记录留在后续列表的主因是查询语义和处理状态缺失。同鸡舍可重复录入则是额外的来源重复风险。

### A2. 分级页的数据来源和旧数据回流

分级页 `apps/web/src/app/(terminal)/terminal/packaging/grading/page.tsx`：

1. 页面调用 `packagingApi.getTodaySourceBatches()`（53–58），接口映射见 `apps/web/src/lib/packaging-api.ts:137`；每 5 秒轮询（63–69）。
2. 页面把接口返回的所有行按鸡舍聚合，累加 `available`，并把所有行 id 推入 `batch_ids`（71–94）。没有按 `shift_id`、已分级状态或来源剩余量过滤。
3. `submittedHouses` 初始化为内存空集合（104–105），提交成功后只加入当前鸡舍（184–185）。刷新或重新进入页面后该集合必然丢失。
4. 分级输入却写入按自然日命名的 localStorage（97–103、147–152）。因此重新进入时“完成标记丢失、旧输入仍可能恢复、今日旧来源又被拉回”。
5. 自动选择逻辑会选择首个 `available > 0` 且不在内存集合里的鸡舍（116–122），使旧鸡舍再次进入可提交态。
6. 提交时前端发送 `sourceBatchIds: activeHouse.batch_ids`（176–183），是数组字段。

后端 `GET source-batches/today` 位于 `apps/api/src/modules/bff/bff.controller.ts:1455-1480`。SQL 仅限定 `psb.production_date = today`，返回当日全部 `pkg_source_batches`；虽然额外返回全日 `total_graded_today`，但没有逐来源扣减，也没有排除已经分级的来源批次。分级页实际未使用真正的 `source-batches/pending` 接口。

根因链为：

`今日全部来源查询` → `前端按鸡舍全量聚合` → `完成态仅存在页面内存` → `刷新/下一轮集合归零` → `旧来源再次可选、可提交`。

### A3. 后端幂等性与数量保护

Terminal BFF 的 `POST grading/submit` 位于 `apps/api/src/modules/bff/bff.controller.ts:1958-2031`：

- 接口按 `production_date` 计算全日可分级量和全日已分级量（1977–2007），没有按 `shift_id` 或来源批次核验。
- 超过余量只加入 warning，随后仍插入记录（2010–2027）。
- 每次生成时间戳后缀的新 `GRD-*` code；`ON CONFLICT(code) DO NOTHING` 只能处理偶然 code 冲突，不是业务幂等。
- 写库参数读取 `body.sourceBatchCode`（2022–2027），而当前前端发送 `sourceBatchIds`。因此 `pkg_grading_records.source_batch_code` 通常为 NULL，无法追溯“某 collection 是否已分级”。
- 表结构只有 `code UNIQUE`；`shift_id`、`source_batch_code` 都可空，且没有来源级唯一约束（`apps/api/src/modules/generic-crud/generic-crud.service.ts:1965-1974`）。
- `GET grading/active` 按自然日无条件累加所有分级记录（2062–2081），重复提交会直接放大可包装数量。

因此，同一来源的串行重复提交和并发重复提交均没有服务端防线，双倍风险成立。

## 3. B — 生产数据影响面（只读）

### B1. 已核实事实

生产窗口内共查到 3 个 V3 班次，均为 `LPH_MENGSAI`：

| shift_id | 班次号 | 生产日/班型 | 状态 | 包装记录 | 包装枚数 | 关键 grading 引用 |
|---:|---|---|---|---:|---:|---|
| 54 | SH-20260909-0794 | 2026-09-09 / MORNING | CLOSED | PKG-20260909-206420 | 300 | `GRD-20260909-136133` |
| 55 | SH-20260909-8669 | 2026-09-09 / AFTERNOON | CLOSED | PKG-20260909-293183 | 300 | `GRD-20260909-136133`、`265670`、`267637`、`269652` |
| 56 | SH-20260910-1597 | 2026-09-10 / MORNING | OPEN | PKG-20260910-203573 | 90 | `GRD-20260910-180875` |

异常候选：班次 54 与 55 的包装记录共同引用 `GRD-20260909-136133`。班次 55 的 `grading_codes_json` 混入了班次 54 已使用的 code，符合“旧分级结果跨下一班次回流”的数据形态。

### B2. 证据边界

本次受控工作流输出了班次、包装、交接、库存/WMS，但没有输出 `pkg_source_batches` 与 `pkg_grading_records` 明细。因此：

- 尚不能列出“同一 collection 被多条 grading 记录引用”，因为当前写入链本身把前端数组字段丢掉，`source_batch_code` 很可能为空；即使为空，也不能反证没有重复。
- 尚不能给出班次 54/55 的集蛋净量、分级总量及精确差额。
- 不能仅凭共同 grading code 把 300 枚定性为重复；它目前是必须复核的高风险候选，不是已确认应删除的数据。
- 本轮历史修复清单因此保持 **HOLD**，不得直接删改。

批准实施前应先以相同双层只读保护补跑定向 SQL，至少输出：`pkg_source_batches(id,batch_code,shift_id,house_code,total/dirty/cracked/received,created_at)`、`pkg_grading_records(code,shift_id,source_batch_code,outputs_json,total_output,created_at)`，并按班次核对 `净集蛋 = total-dirty-cracked`、分级合计、包装合计。由于旧记录缺少可靠 collection 外键，判重还必须结合创建时间、班次、鸡舍、数量签名和操作日志人工确认。

## 4. C — 待批修复方案

### C1. 前端

1. 分级页改读后端“当前班次未分级来源”接口，强制传当前 `shiftId`；无开放班次不允许分级。
2. 不再按鸡舍把当日全部批次无限聚合。界面以来源批次为最小处理单元；如仍按鸡舍展示，提交集合也必须只含当前班次且服务端判定有剩余量的批次。
3. 提交使用统一字段，例如 `sourceBatchIds: number[]`；API DTO 与后端同名同类型，禁止当前 `sourceBatchIds` / `sourceBatchCode` 错位。
4. `submittedHouses` 仅作为交互态，不再作为业务完成态。成功后重新拉取服务端 pending 列表；开始新班次/日期变化时清理对应 WIP，WIP key 至少包含 `shiftId`，成功提交的来源输入立即删除。
5. 集蛋页允许同舍多次采集时，必须展示为不同来源批次；若业务口径为每舍每班一次，则禁用重复选择并由服务端唯一约束兜底。该口径需业务确认，不能只靠前端 `alreadyRecorded`。

### C2. 后端与数据库

1. 新增明确 DTO：`shiftId`、`sourceBatchIds[]`、`outputs`、`idempotencyKey`。事务内锁定来源批次，校验全部属于该班次/日期/权限范围。
2. 建来源分级关联明细（建议 `pkg_grading_source_links(grading_id, source_batch_id, input_qty)`），并对业务口径建立唯一约束；不要继续把多来源压入单个 nullable `source_batch_code`。
3. 待处理查询按 `shift_id` 返回 `净集蛋 - 已关联分级输入 > 0` 的来源；旧 `today` 接口不得再供分级待办使用。
4. 提交在同一事务内校验来源剩余量。超量必须 409/422 拒绝，不能 warning 后落库。
5. 使用客户端稳定 idempotency key 并建数据库唯一约束；相同 key + 相同载荷返回原结果，相同 key + 不同载荷返回冲突。按钮防连点只是辅助。
6. `grading/active` 改为按当前班次和有效关联汇总；跨班次打包必须是显式、可审计的业务动作，不能自然日自动串池。
7. 迁移遵守 TS TypeORM 新迁移规范，含 `down()`；新增唯一约束中的字段必须 NOT NULL。实施前核对实体、迁移末态和代码写值三对齐。

### C3. 历史数据修复清单（待批）

| 候选 | 当前结论 | 建议口径 | 状态 |
|---|---|---|---|
| 班次 55 `PKG-20260909-293183` 引用旧 code `GRD-20260909-136133` | 已确认跨班次共同引用，尚未确认数量重复 | 定向只读查清 4 条 grading 的数量/时间/来源；若 `136133` 已完整归属班次 54，则从班次 55 的消费集合移除，但不得删除班次 54 首笔 | HOLD |
| 其他同 collection 多 grading | 当前字段错位，现有证据无法可靠枚举 | 以来源净量、班次、鸡舍、时间、审计日志人工建映射；确认同一次提交的技术重复时保留首笔，后笔作废并生成等量反向库存/流水，不做物理删除 | HOLD |

“保留首笔”只适用于确认是同一业务动作的技术重试；真实分批分级不得合并或删除。任何数据修复都应生成可回滚脚本，先只读预演、再经用户逐项批准后执行。

## 5. 报批建议与停止点

建议按以下门禁分两步授权：

1. **定向生产只读复核**：补齐来源批次、分级明细、班次三段对账，形成最终受影响记录清单。此步不写生产。
2. **代码修复**：前端 pending/清态、后端 DTO/事务/幂等/强拒绝、schema 关联与唯一约束、回归测试。代码和迁移完成后另报历史数据修复脚本；生产执行再次单独授权。

本报告停止于根因与方案，未实施任何修复。
