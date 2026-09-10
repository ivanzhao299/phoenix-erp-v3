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

以上为首次报批时的停止点；获批后的实际执行结果续记于第 6 节。

## 6. 获批执行记录（2026-09-10）

### 6.1 门禁①：定向生产只读复核

- GitHub Actions：`Production Readonly Audit` run `34424086235`，head `a338442f0a288535fa1a8e68ddf9b21e7803fa91`，结论 `success`。
- 生产运行 revision 三对齐：checkout/API/Web 均为 `376429bd17ce96c67274c67d162b4bf4317dcc35`。
- SQL 在连接级 `default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY` 双保护内执行，末尾 `ROLLBACK`；`PRODUCTION_BUSINESS_WRITES=0`。
- 只读 bundle：`scripts/ops/readonly-audits/packaging-grading-duplicate-submit-20260910.sql`。

三段对账：

| shift_id | 来源批次 | 净集蛋 | 分级记录 | 分级合计 | 包装记录 | 包装合计 | 净集蛋-分级 | 分级-包装 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 54 | 1 | 300 | 1 | 300 | 1 | 300 | 0 | 0 |
| 55 | 1 | 300 | 3 | 900 | 1 | 300 | -600 | 600 |
| 56 | 2 | 196 | 3 | 294 | 1 | 90 | -98 | 204 |

班次 55 指定四条分级记录：

| id | code | 记录归属班次 | 数量/等级 | created_at | 包装消费班次 | 定性 |
|---:|---|---:|---|---|---|---|
| 71 | `GRD-20260909-136133` | 54 | 300 / GRADE_1 | 2026-09-09 02:32:16.133894 | 54、55 | 已确认跨班次重复引用；历史处置 HOLD |
| 72 | `GRD-20260909-265670` | 55 | 300 / GRADE_2 | 2026-09-09 08:57:45.670324 | 55 | 班次 55 净量只有 300，三笔合计 900；具体保留/冲销项 HOLD |
| 73 | `GRD-20260909-267637` | 55 | 300 / GRADE_2 | 2026-09-09 08:57:47.638061 | 55 | 同上；与前笔相隔约 2 秒，HOLD |
| 74 | `GRD-20260909-269652` | 55 | 300 / GRADE_1 | 2026-09-09 08:57:49.652964 | 55 | 同上；与前笔相隔约 2 秒，HOLD |

四条记录的 `source_batch_code` 均为空。现有证据足以确认班次级超量和跨班次引用，但不足以在不引入业务判断的情况下指定 72/73/74 中哪一笔是合法首笔；因此全部历史修复动作继续 HOLD，本轮没有生产数据修改。

### 6.2 门禁②：代码与 schema 修复

- 新增班次级 `GET /api/packaging/terminal/grading/pending?shiftId=`；只接受 OPEN 班次，按来源批次返回 `净集蛋-已关联输入` 的正余量。
- 分级 DTO 固定为 `shiftId:number + sourceBatchIds:number[] + outputs + idempotencyKey:string`；事务内 advisory lock 幂等键、锁班次、锁来源批次，并校验来源班次与鸡舍 DataScope。
- 超量与跨班次来源以 HTTP 409 硬拒绝；相同幂等键同载荷返回原结果，异载荷 409。
- 新增 `pkg_grading_source_links(grading_id, source_batch_id, input_qty)`；主键与列均 NOT NULL，`input_qty > 0`。
- `pkg_grading_records` 新增 NOT NULL `idempotency_key/payload_hash`，并建立库级唯一索引；历史行只补技术占位，不改变业务数量或归属。
- `grading/active` 改为按 shift 与有效来源关联汇总；包装跨班次默认拒绝，只有显式 `crossShiftReason` 才允许并写 `CROSS_SHIFT_GRADING_CONSUME` 审计。
- 分级页不再读取 today：无开放班次禁用；来源批次为最小处理单元；WIP key 含 shiftId；成功后清该来源 WIP 并重拉服务端 pending。`submittedHouses` 仅保留为瞬时交互态。
- 集蛋页按业务暂定口径保留同舍多次采集，每条来源批次独立展示；更正从“按舍清零其他行”收紧为按 `sourceBatchId` 精确更正。最终“每舍每班一次/允许多次”仍为待业务确认项。
- TypeORM 迁移：`1789012800000-GovernPackagingGradingSubmissions.ts`，包含 `down()`；已随 full deploy 在生产成功执行。迁移只新增治理结构并为旧记录补技术幂等占位，未修改旧记录数量/班次/业务归属，也未执行历史数据修复。

### 6.3 验证流水

| 验证 | 结果 |
|---|---|
| API tsc | PASS，0 errors |
| Web tsc | PASS，0 errors |
| API 定向 Jest | PASS，28/28（含 pending、超量、同/异载荷幂等、并发重放、跨班次隔离、旧 BFF 回归） |
| Web 定向 Vitest | PASS，15/15（字段契约、WIP 清态、来源批次展示、交班汇总） |
| g198 nullable-in-unique | PASS，0 新违规 |
| g201 constraint drift | PASS，0 新 drift；1 个既有 allowlist |
| TS migration down() / DML gate | PASS，79/79；本迁移的历史技术占位 DML 有明确豁免理由 |
| API 全量 Jest | 823 passed / 2 failed / 6 skipped；2 个失败均为既有 `chanjet-callback.controller.spec.ts` 5 秒 timeout，本次未改该文件 |
| Web 全量 Vitest | 548 passed / 29 failed；29 个失败均为 3 个既有 React 测试文件的 `act is not a function` 环境噪声，本次定向测试全绿 |
| 本机包装真实回归 | 未运行：本机 3100 API 未启动；由干净 runner CI 执行 |

### 6.4 PR、CI、部署与生产复验

- PR：`#225`（`fix/grading-idempotency-governance-20260910`）。首轮静态门禁因新增 i18n key 与审核标签生效时序失败，随后复用已注册 locale key，并补 `reviewed-frozen-boundary` / `reviewed-security-touch` 后重跑通过。
- 干净 runner regression 首轮在迁移链发现历史结构问题：空库在 TypeORM migration 前尚无 `pkg_grading_records`（过去依赖应用运行时 Generic CRUD 建表），新迁移的 `ALTER TABLE` 因此失败。已将两张 canonical 包装基表的 `CREATE TABLE IF NOT EXISTS` 前置到 TS 迁移，生产已有表时为 no-op；该轮失败已阻断部署，没有生产变更。
- PR 最终干净 runner 全绿：CI Build run `34425987125`、V3 regression run `34425987218`、deploy workflow PR regression run `34425987286`，另含 Runtime Smoke、Static Security/Freeze、Vitest 全部通过。
- PR 于 2026-09-10 合并；merge revision：`f7664fad643d991b8cac8aeb50aecf03567df198`。合并 push run `34426408925` 完成类型检查、回归和双镜像构建，但按工作流安全规则未执行 SSH deploy；没有把这次绿色误记为发布成功。
- 显式批准的 full deploy：run `34426961764`，结论 `success`。生产 checkout 从 `376429bd` 前进到 `f7664fad`；部署前备份成功，`GovernPackagingGradingSubmissions1789012800000` 在生产事务中执行并提交，API/Web 容器健康、Nginx 配置检查和 Web smoke 均通过。
- 部署后受控只读复验：run `34427569522`，结论 `success`；checkout/API/Web revision 均为 `f7664fad`。SQL 确认迁移记录、关联表、幂等 NOT NULL 列与唯一索引存在；关联表为 `0` 行，符合本轮不回填、不改历史业务数据的红线。当前 6 个 OPEN 班次各有正余量来源，班次 56 返回 2 条。
- HTTP 只读断言：OPEN 班次 `pending` 返回 200 且班次 56 为 2 个独立来源批次；缺少 `shiftId` 返回 400；CLOSED 班次返回 409。生产 API 最近 60 分钟包装分级错误窗口为 `0`，`PRODUCTION_BUSINESS_WRITES=0`。只读启动期间出现的 Generic CRUD/字典建表与插入失败均是连接级 read-only 保护主动拒绝，未落库。
- 部署后复验 bundle：`scripts/ops/readonly-audits/packaging-grading-governance-postdeploy-20260910.sql` 与 `.http.json`；bundle commit `59d1e4de`。历史数据修复仍为 **HOLD**，修复脚本完成后另行逐项报批，本轮未动生产历史数据。

## 7. 分级重复历史修复受控执行（2026-09-10）

### 7.1 用户裁定与逐笔结论

- 班次 55：保留首笔 `id=72 / GRD-20260909-265670`（300 / GRADE_2）；`id=73 / 267637` 与 `id=74 / 269652` 为约 2 秒间隔的技术重复候选，计划软作废。
- 班次 56：`id=75 / GRD-20260910-180875` 与 `id=76 / 278853` 分别紧随两个独立来源批次产生，均为 98 / GRADE_1 合法首笔；`id=77 / 306173` 在 `278853` 后 27.32 秒、载荷完全相同，计划软作废。按最初证据，合法和为 `98+98=196`。
- `GRD-20260909-136133` 归属班次 54。班次 55 包装 `PKG-20260909-293183` 的计划修正是仅保留 `265670` 引用，同时移除 `136133` 和两条 VOID 引用；包装 `10 箱 / 300 枚`、库存和 ledger 均不得改变。

### 7.2 已交付的安全机制

- migration `1789099200000-AddGradingVoidAudit.ts` 为分级记录增加 `ACTIVE/VOID`、作废原因、时间与执行者；不删除历史行。
- 所有分级待处理量、汇总、活动分级和包装所有权查询只计 `ACTIVE`；VOID 行的来源关联不会继续占用可分级量。
- 三段 SQL 固化逐行数量、等级、完整 `outputs_json`、时间、包装引用及来源净量；apply 使用单个 SERIALIZABLE 事务，输出 guarded 反向 SQL，并断言包装物流字段、全量 `inv_batches` 与 `inv_ledger` 哈希不变。
- 本地验证：API/Web tsc 0 errors；BFF 定向 Jest 28/28；nullable-in-unique、constraint drift、TS migration down()/no-data-DML 门禁通过。
- 首次交付 revision `dc2d2aa524444ec3f82a579b7cf5461f01f9acf1` 已 push；push CI `34430085691 / 34430085697 / 34430085719 / 34430085706` 全绿。显式 full deploy `34430506560` 成功，checkout/API/Web revision 一致，VOID schema 已上线。

### 7.3 Preflight 失败与强制停止

- 修复前初始只读证据 run `34429503414`（02:27 UTC）确认班次 56 仅有来源 `id=46/47`，净集蛋 `196`；当时班次仍为 OPEN。
- 生产 preflight run `34430945517` 在任何业务 UPDATE 前失败，数据库异常为 `source net baseline mismatch`。事务为只读，未进入 apply；`pkg_grading_records`、包装引用、库存与 ledger 均未被本轮修复修改。
- 随后只读差异复核 run `34431039492` 查明：02:28:15 UTC 新增了班次 56 来源 `id=48 / SRC-20260910-H-DEBUG--R3VW / H-DEBUG-A01 / total=100 / dirty=1 / cracked=1`，使班次 56 来源从 2 行/净 `196` 变为 3 行/净 `294`。分级仍为 3 行/`294`，因此当前生产态已不再满足用户指定的“班次 56 净 196”审计基线。
- 依照“逐行基线不一致即停、失败即停”红线，**未触发 execute，也未触发 post-apply verify**。计划中的 `id=73/74/77` 仍为 ACTIVE，包装引用仍保持原状；不得把本轮记为修复 PASS。

### 7.4 后续恢复条件

只有在业务明确裁定新增 `H-DEBUG-A01` 来源是否为合法生产数据、测试污染或另一个待修对象，并重新冻结班次 56 的净集蛋口径后，才能更新 reviewed baseline 并重新从 preflight 开始。不能仅为让脚本通过而把 `196` 改成 `294`。

### 7.5 `H-DEBUG-A01` 来源溯源与分级处置（2026-09-10）

- 受控生产只读审计使用 `scripts/ops/readonly-audits/h-debug-a01-origin-20260910.sql`。首轮 run `34434045970` 已输出主要事实，但末尾因用户表名不匹配失败；事务处于 `default_transaction_read_only=on`，未产生写入。修正后的完整 run `34434161190` 成功，checkout/API/Web revision 均为 `dc2d2aa524444ec3f82a579b7cf5461f01f9acf1`，SQL 末尾 `ROLLBACK`，且运行器确认 `PRODUCTION_BUSINESS_WRITES=0`。
- 目标来源完整事实：`pkg_source_batches.id=48`，`batch_code/source_inbound_no=SRC-20260910-H-DEBUG--R3VW`，`shift_id=56`，`house_code=H-DEBUG-A01`，`total/dirty/cracked=100/1/1`，净量 `98`，`received_by=NULL`，`batch_status=RECEIVED`，创建/更新时间均为 `2026-09-10 02:28:15.597138 UTC`。该表没有 `created_by` 字段，故来源行本身不能提供创建账号。
- 鸡舍确已注册：`brd_houses.house_code=H-DEBUG-A01`，名称 `X`，状态 `ACTIVE`，创建于 `2026-06-08`；仓库留档又将其归类为 `TEST_OR_DEBUG / EXCLUDE_TEST_DATA`，并称为遗留测试鸡舍。生产历史还存在同舍来源 `id=16/34/38`（2026-07-30、08-20、08-21），本次并非该鸡舍首次进入包装来源数据。
- `pkg_grading_records.id=77 / GRD-20260910-306173` 创建于 `2026-09-10 00:31:46.173537 UTC`，比目标来源早约 `1:56:29`；`pkg_grading_source_links` 对目标来源或 id 77 均为 `0` 行。因此 id 77 **不可能是分了该来源的 98 枚**，两者在班次 56 上形成 `294` 仅是数量吻合，不能建立因果关联。
- `sys_operation_logs` 对目标创建时点前后 15 分钟、目标业务号/id 及 before/after JSON 均为 `0` 行；来源 `received_by` 为空，无法取得创建者账号、IP 或 UA。全仓及 git 历史仅证明 `H-DEBUG-A01` 是既存测试鸡舍，并在 Codex 协作提交的运维报告中被记录；精确来源号只出现于发现异常后的审计报告，没有 fixture、测试脚本或创建命令证据。提交的 Codex co-author 尾注不能反证生产写入者。
- 三选一结论：**无法定源**。证据支持“测试标识鸡舍产生了异常来源”，但不足以在“Codex 调试污染”与“用户侧测试数据”之间归责。依用户给定分支和失败即停红线，不修改 reviewed baseline，不执行来源/分级软作废，不执行班次 55 修复；`id=73/74/77`、来源 id 48、包装引用、库存和 ledger 均保持原状，等待用户裁定。

### 7.6 用户批复 A：分级历史修复最终执行（2026-09-10）

- 用户裁定 `H-DEBUG-A01` 为测试鸡舍污染后，reviewed baseline 更新为：班次 55 有效来源净量 `300`、ACTIVE 分级 `300`；班次 56 排除待作废来源 id 48 后有效来源净量 `196`、ACTIVE 分级 `196`。来源 id 48 仍作为历史行保留，仅将 `batch_status` 从 `RECEIVED` 软作废为 `VOID`，未物理删除。
- bundle revision `e225548816569f30fe82ecac121081e0ea870d96` 已 push。生产运行 revision 保持 checkout/API/Web 三对齐为 `dc2d2aa524444ec3f82a579b7cf5461f01f9acf1`；workflow 从该生产 revision 的受控容器执行随 run 单独上传的 reviewed bundle。
- 三段执行全部成功：preflight run `34434919666`；SERIALIZABLE apply run `34434992200`；只读 verify run `34435059608`。preflight 逐行确认来源 id 48 为 `RECEIVED`、分级 id 73/74/77 为 `ACTIVE`、包装 id 31 原始四条引用、id 71/班次 54 原状及班次 55/56 reviewed baseline 后才放行。
- apply 在单个 SERIALIZABLE 事务内完成：来源 id 48 → `VOID`，审计原因 `test-house-pollution`；分级 id 73/74/77 → `VOID`，审计原因 `duplicate-submit-first-valid`；操作者为 `controlled-repair-20260910`，审批引用为 `GRADING-REPAIR-20260910`。合法 id 71/72/75/76 保持 `ACTIVE`。
- 包装 `PKG-20260909-293183` 的 `grading_code/grading_codes_json` 修正为仅引用 `GRD-20260909-265670`；`10 箱 / 300 枚`及其他包装物流字段不变。apply 内部还对班次 54 来源、分级、包装整组行做前后哈希断言，确认班次 54 未改变。
- execute 输出并由 workflow artifact 留存 5 条 guarded 反向 SQL：id 73、74、77 三条状态恢复，来源 id 48 状态恢复并追加反向审计，以及包装引用恢复。没有执行任何反向 SQL。
- verify 结果为 `VERIFY_PASS`：班次 55 ACTIVE 分级 `300`，班次 56 ACTIVE 分级 `196`，均与排除 VOID 后来源净量对平；来源/分级审计记录存在；包装引用及物流字段符合裁定；班次 54 保持原状。
- 全量 `inv_batches` 哈希在 preflight/verify 均为 `3cf89cb78648b6a0be73ee05c5a6586a`；全量 `inv_ledger` 哈希均为 `8bf9bb0111ac503e85eec8bf53e517df`。库存和 ledger 未变化。本地 API/Web `tsc --noEmit` 均为 0 errors；本次只修改受控 SQL 与执行记录，不涉及 DataScope/UI 字段，scope-audit 无新增命中面。
