# Issue #400 — 日产蛋入库台账等级投影修复报告

- Issue: https://github.com/ivanzhao299/phoenix-erp-v3/issues/400
- Branch: `codex/manual-121-egg-inbound-grade-ledger`
- BASE_MAIN_SHA: `5f51ec2bba6cbeaad96bd038af7244afcc22c0b3`
- 日期: 2026-10-17（Asia/Singapore）
- 交付状态: **PARTIAL / CONDITIONAL**。已证实并修复查询覆盖缺陷；原生产实例的准确根因尚未证实，不应直接宣称 Issue 已完整解决。

## 根因证据与证据边界

正常 main 的完整九档写入链在隔离 PostgreSQL 18 下通过：`GRADE_1..GRADE_5 / DIRTY / CRACKED / BROKEN / DAMAGED` 分别写入 11、22、33、44、55、66、77、88、99 枚，批次和流水逐档一致，总数 495。**没有复现正常请求自行把九档写成破损蛋。**

已证实的查询缺陷：原 `getLedger()` 使用 `COALESCE(b.grade_code_std, b.quality_grade, l.quality_grade)`，把批次当前分类置于流水发生时的等级之前。隔离数据明确构造“批次当前等级均为 BROKEN，但流水仍保存九档”的形态后，原 main 的真实 GET API 与页面稳定把九档都展示为 BROKEN；修复后展示九档原始事件等级及名称、数量。

构造形态只能证明查询缺陷的因果，不能证明生产记录必然处于该形态。本轮未连接生产数据库、未执行生产账号写测试，Issue 附件原始 URL 返回 404；没有生产 batch/ledger/SKU/master 快照支持判断生产问题属于“写入已错”还是“查询覆盖”。如果生产的 `inv_ledger.quality_grade` 本身全为 BROKEN，此修复不会从日报总量推断九档，也不会修改历史库存。后续需要在单独授权的只读调查中核对原记录。

## 数据链

1. 日报九档输入：`apps/web/src/app/(admin)/breeding/daily/page.tsx:302` 从 `gradeQty` 构建 `eggs_by_grade`；`:382` 原样生成入库 `items`。
2. 入库 API：`InventorySourceController.productionInbound` 委派 `ProductionInboundService.recordProductionInbound`。
3. `production-inbound.service.ts:215` 逐档匹配 ACTIVE SKU，`:223` 传原始等级，`:225` 传标准 SKU 等级。
4. `egg-inventory.service.ts:322` 写入批次旧/标准等级，`:353` 写流水，`:362` 保存事件等级；没有统一 BROKEN 的正常写分支。
5. `farm-egg.service.ts:76` 读取统一库存流水。已修复此处事件/批次等级优先级。
6. `daily-inbound-ledger/page.tsx:85` 使用 API 的 `grade_name*` 和 `grade` 显示，未发现前端把九档统一回退成 BROKEN 的映射。

## 修改

- 事件等级能匹配非 DEPRECATED 主数据时优先保留；NULL、空串、未知旧别名及已 DEPRECATED 的 `L` 等旧编码回退批次标准等级。INACTIVE 历史标准等级仍可正确显示。
- 同一等级表达式同时用于代码与三语名称 JOIN，避免名称/代码脱节。
- TEMP 写入只有批次 `collection_batch_ref=HOUSE-<houseCode>`，流水 `house_code` 为空。只读查询使用该追溯引用补齐鸡舍；鸡舍名称必须通过 farm 公司归属与批次公司一致，防止异常引用显示他公司鸡舍名。
- 保持 `PRD-EGG-%` 产品过滤、公司 DataScope、日期 WHERE、事件显示日期和排序不变。未扩大库存查询集合。
- 补全接口已投影的名称字段类型。

修改文件以下五个，无日报共享页面改动：

1. `apps/api/src/modules/farm/farm-egg.service.ts`
2. `apps/api/src/modules/farm/farm-egg.pg.spec.ts`
3. `apps/web/src/__tests__/daily-inbound-ledger.live.dom.test.tsx`
4. `apps/api/src/modules/analytics/services/production-localized-names.contract.spec.ts`（CI 旧静态契约维护，见下文）。
5. 本报告。

## 验证

使用独立容器 `issue400-pg18`，仅绑定 `127.0.0.1:15450`，独立数据库/用户 `issue400` 与 `issue400` schema。测试使用专用、公开的本地 fixture 凭据，不读取 `.env`、`DATABASE_URL` 或 `DB_*`。最小隔离 schema 仅用于相关服务的真实 SQL；未运行迁移、未声称覆盖全库真实部署约束。

复跑：

```bash
docker run -d --name issue400-pg18 \
  -e POSTGRES_USER=issue400 -e POSTGRES_PASSWORD=issue400-local-fixture \
  -e POSTGRES_DB=issue400 -p 127.0.0.1:15450:5432 postgres:18-alpine
cd apps/api
ISSUE400_PG_PORT=15450 ./node_modules/.bin/jest \
  src/modules/farm/farm-egg.pg.spec.ts \
  src/modules/sales-v2/services/production-inbound.service.spec.ts \
  src/modules/sales-v2/services/egg-inventory.service.spec.ts \
  src/modules/farm/farm.service.spec.ts --runInBand
```

Node 20.20.2 / pnpm 9.15.9；四个定向 API suites **45 tests PASS**，其中 PG suite 5 项；最后一项另外启动 Web Vitest，真实 ledger 页面通过 HTTP 访问同一 Nest/PG fixture，三语展示与无页面查看权限共 **4 DOM tests PASS**，没有替换 API response。

| 检查 | 结果 |
|---|---|
| 原 main 正常九档请求、批次/流水编码与数量 | PASS |
| 原 main 条件形态（batch BROKEN / ledger 九档） | FAIL_AS_EXPECTED，GET 与 UI 均失败 |
| 修复后相同条件形态 | PASS，九档编码/名称/数量及495合计 |
| 不同日期、两个同公司鸡舍、两个公司、admin global | PASS |
| scoped 公司读取、空授权读取、越公司入库拒绝403 | PASS |
| TEMP 与合法 PRD-EGG 包装来源、非蛋品过滤 | PASS |
| NULL/空串/未知/DEPRECATED事件等级、INACTIVE历史标准等级 | PASS |
| 鸡舍异常跨公司引用不泄露名称 | PASS |
| logDate为空的后续 RESERVED 事件显示原 created_at 日期 | PASS |
| API 与 Web `tsc --noEmit --incremental false` | PASS，两端0错误 |
| Web display / localized master name 回归 | PASS，2 files / 18 tests |
| 修改文件 lint | 0 errors；新测试0 warnings；service仅既有getStock any warning |
| Scope-audit | 实测公司隔离PASS；页面2个date input、0个主数据裸input，日期/公司参数绑定保留 |
| `git diff --check` | PASS |

测试的身份认证 guard 与库存模式为 fixture adapters，controllers / services / HTTP / PG / 页面均真实。公司权限检查执行真实 service 逻辑；没有声称真实生产 JWT/组织角色的端到端登录验收。默认不带 `ISSUE400_PG_PORT` 时 PG suite 显式 skip，不计为 PASS；DOM suite 由 PG suite 提供真实临时 API 地址。

原 main before 实测 1 PASS / 4 FAIL，正常九档用例通过，覆盖错误、house 与页面回归失败；最终 after 45 API tests与内嵌4 DOM tests通过。根因原实例未证实，故不填写无条件 `ROOT_CAUSE=VERIFIED`。

## 独立审查、安全与兼容

独立 reviewer 复核了等级旧别名、历史 inactive 等级、house JOIN 与公司绑定、日期兼容。依据审查取消了额外日期 SELECT 改动，补充旧别名和 RESERVED 回归。当前 SQL 无用户输入拼接、无倍增 JOIN；公司过滤与 MenuGuard/DataScopeGuard 未改动。

- PR #384：修改其 production-inbound service/controller/spec 与 daily 页面，本 PR不修改这些文件；读模型兼容其逐档批次/流水事务、稳定 source key 幂等语义。统一集成环境仍需使用 #384 组合回归，不把静态兼容写成集成 PASS。
- PR #384 原有多班次重复同 SKU/等级时幂等响应首条 batchNo 复用风险由独立审查另行记录，本 PR不混修。
- PR #385 / #386：本 PR修改文件无预期重叠；最终以 Orchestrator 文件清单与组合测试为准。
- 好业财恢复：未修改其 API、worktree、部署、config floor、恢复记录，未执行只读探针或同步。
- 已知基线日期语义：原 WHERE 对 `log_date=NULL` 的后续流水使用批次 egg_date 筛选，但显示 created_at 日期。回归保留此现状；若需统一所有库存事件日期语义，应另行定义范围处理。

## 交付状态

```ini
ISSUE_400_STATUS=PARTIAL_CONDITIONAL_QUERY_FIX
ROOT_CAUSE=VERIFIED_QUERY_DEFECT_PRODUCTION_INSTANCE_UNVERIFIED
REPRODUCTION_BEFORE=FAIL_AS_EXPECTED_CONDITIONAL_FIXTURE
MAIN_NORMAL_INBOUND_REPRODUCTION=PASS_NO_ORIGINAL_FAILURE
REPRODUCTION_AFTER=PASS_CONDITIONAL_FIXTURE
TARGETED_TESTS=PASS
TYPECHECK=PASS
RELEVANT_REGRESSION=PASS
SECURITY_REVIEW=PASS_CHANGED_SCOPE_STATIC_AND_ISOLATED_SERVICE_CHECKS
REQUIRED_CI=PENDING_RERUN_AFTER_STATIC_CONTRACT_FIX
PRODUCTION_DATABASE_MUTATION=NO
PRODUCTION_MIGRATION=NO
PRODUCTION_DEPLOY=NO
CHANJET_RECOVERY_MUTATION=NO
```

仅交付 Draft PR供审查。主线合并、生产部署、生产只读根因补证及任何生产数据处理均未获本轮授权。

## CI 旧静态契约维护（PR #407，run 39015158770）

远端 CI 的 `production-localized-names.contract.spec.ts` 使用 `toContain('l.house_code, h.house_name')` 检查整个 service 源文本。现在合法输出是计算表达式 `AS house_code, h.house_name`，真实 PG 与 DOM 输出字段未丢失，因此旧断言错误地拒绝了修复。

本地先原样复现：该 suite **1 FAIL / 2 PASS**，失败点与 CI 相同。仅替换 ledger 的该用例：执行真实 `FarmEggService.getLedger()`，捕获发往 mocked datasource 的 SQL，检查 `grade`、`house_code` 输出别名、实际 `h.house_name` 及三语 `g.grade_name*` 投影、日期及公司范围绑定参数、公司过滤和结果行保留。未向源代码加凑断言的注释，也未修改等级、归属或其他业务逻辑。SQL 输出另由原有真实 PG 与真实页面测试验证。

维护后执行完整 API 单元测试：`cd apps/api && ISSUE400_PG_PORT=15450 ./node_modules/.bin/jest --runInBand`。结果 **117 suites / 1027 tests PASS**，另 **13 suites / 281 tests SKIPPED**（原有其他隔离集成环境未启用，不计为 PASS），耗时 98.611s；其中已包含 #400 的真实 PG suite 及内嵌 4 项真实 API 页面 DOM 测试。修改的契约文件 lint 0 errors / 0 warnings，`git diff --check` PASS。等待 Orchestrator push 后重新执行远端 Required CI；本地完整通过不等同于远端已通过。
