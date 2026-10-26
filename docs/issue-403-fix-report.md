# Issue #403 — 九档日报显示与指定日期导出

- Issue: https://github.com/ivanzhao299/phoenix-erp-v3/issues/403 （REQ-003 / P2）
- Branch: `codex/req-003-daily-grade-export`
- BASE_MAIN_SHA: `5f51ec2bba6cbeaad96bd038af7244afcc22c0b3`
- 研发与隔离验证日期：2026-10-17（Asia/Singapore）

## 根因与修复前复现

1. `daily/page.tsx:loadData` 将原始日报投影为展示对象时丢弃 `eggs_by_grade`，历史表只渲染总量、脏蛋、破损蛋。
2. 原 `handleExport` 使用尚未提交的录入表单 `rows` 生成 CSV，未查询历史日报，日期由录入表单决定。
3. 隔离 PostgreSQL HTTP 测试还暴露了业务日期偏移：驱动将 SQL `DATE` 解析为本地午夜，`toDateOnly` 调 `toISOString()` 后在 +08 时区变成前一天。

基线复现使用 `git show BASE:path` 临时提取原页面和 controller，运行相同 DOM 与 HTTP 场景；临时源码已删除，不提交旧页面副本：

- 原页面真实 DOM：九档明细元素不存在，1 个断言按预期失败。
- 原 controller + 隔离 PostgreSQL：新增导出路径 404，4 个 HTTP 场景按预期失败。
- 修复中第一次真实 +08 PG 验证：日期断言失败（并未改低预期），修正日期转换后通过。

## 最终行为

- 原列表保留产蛋总数、脏蛋、破损蛋、死亡、淘汰、淘汰原因、饲料、温湿度、备注；增加完整九档明细列。
- 数量直接读取 `eggs_by_grade`，不使用总产蛋数推算。缺失等级显示 `—`、CSV 留空；显式 `0` 保留。当前 ACTIVE 等级来自既有 `useProductGrades`；历史未知编码另列保留。
- 导出按钮打开日期弹窗，默认浏览器本地日历日期。支持指定一个自然日，SQL `log_date = YYYY-MM-DD`，不把用户选择转换成 UTC；相邻日期不混入。
- 弹窗明确导出该日期所有有权查看的鸡舍，与录入鸡舍选择无关，避免将历史检索与录入默认鸡舍绑定。
- 新增只读 `GET /api/crud/brd_daily_logs/export?log_date=YYYY-MM-DD`，要求 `MENU_FARM_DAILY:X`，继续委托原 `findAll` 校验原读取权限与 DataScope。无读取权者即使持导出权也不能导出。既有 admin 兼容约定保持。
- 一次授权过滤 SQL 取得最多 20,001 条，形成同语句 MVCC 快照；超过 20,000 明确拒绝，绝不下载截断结果。服务端内部 Symbol 控制专用上限，HTTP query 无法伪造；普通列表仍最多 1,000。导出不依赖页面的 30/100 条历史加载，也不使用 offset 多页循环，避免并发增删导致页偏移遗漏。
- CSV 包含日期、农场、鸡舍、班次、原总量/死淘/原因/饲料/用水/自用/温湿度/备注、九档编码与名称；UTF-8 BOM、CRLF、字段引号和换行转义，防用户文本触发表格公式。
- 空数据、网络/权限异常、超时、取消、超限均有处理；只有成功完整取数后才生成下载。新文案与标准九档名称覆盖中、英、老三语，已有本地化主数据优先保留。

## 修改文件

- `apps/web/src/app/(admin)/breeding/daily/page.tsx`：新增投影字段、历史明细列，导出入口交由独立组件；不修改保存及入库逻辑。
- `apps/web/src/components/breeding/DailyGradeDetails.tsx`：独立九档展示及本地化名称。
- `apps/web/src/components/breeding/DailyReportExport.tsx`：独立日期弹窗、真实授权 API、状态及下载。
- `apps/web/src/lib/daily-report-export.ts`：业务日期、原始等级、快照完整性检查、CSV。
- `apps/web/src/locales/{zh,en,lo}.json`：新文案。
- `apps/api/src/modules/generic-crud/{generic-crud.controller.ts,generic-crud.service.ts,daily-export-policy.ts}`：只读导出权限门、内部快照查询上限、业务日期转换。
- 新增 `daily-export.integration.spec.ts`、`daily-report-export.test.ts`、`daily-grade-export.dom.test.tsx`、`daily-grade-missing.dom.test.tsx`。

共享页面改动位置（便于集成）：imports；`loadData` 增 `eggsByGrade`；移除旧 `handleExport`；PageHeader 替换导出按钮；历史表增加一列、colSpan 13、横向滚动。未改 `selectedHouse`、保存、入库或九档输入事件。

## 验证证据

隔离容器 `phoenix-issue403-pg18`，PostgreSQL 18，回环随机端口 50749，数据库 `issue403_fixture`。仅该 fixture 执行建表/测试数据写入；`synchronize=false`、`migrationsRun=false`。未读取生产 .env，未连接任何生产 DB。

| 检查 | 结果 |
|---|---|
| Web targeted + relevant regression（5 套） | 18/18 PASS |
| API generic controller/service + PG HTTP（3 套） | 68/68 PASS |
| 其中 PG HTTP | 5/5 PASS，`TZ=Asia/Singapore` |
| API TypeScript | PASS，`tsc --noEmit --incremental false` |
| Web TypeScript | PASS，`tsc --noEmit --incremental false` |
| 新 Web 文件 ESLint | PASS，0 error |
| 相关 API 文件 ESLint | PASS，0 error；存量 any 警告未绕过 |
| scope-audit | PASS，3 个页面/组件共 0 裸归属编码 input；导出继续使用原读取 scope |
| diff whitespace | PASS |

覆盖实际保存数据的全部九档、显式零/缺失/旧编码、总数与死淘保留、DOM 日期选择和点击下载、空/异常状态、导出权限隐藏、真实 HTTP 的 X/V 双权限、同公司 fixture site A/跨公司 site B、admin、恶意归属 query、1005 条超过列表上限、普通列表上限不变、20001 条明确拒绝、相邻日期与 +08 午夜、三语键、CSV 中文/引号/换行/公式防注入。

测试身份由隔离 guard 注入，实际 controller RBAC、scope 分发、SQL 与 PostgreSQL 执行；未用生产账号写入。真实登录/JWT 签发与生产组织树不在本分支测试范围；#401 的权威组织范围及组合效果由统一集成环境额外验证。没有运行生产、同步、恢复、部署、迁移、全量 UAT 或浏览器视觉检查。Required CI 由 Draft PR 创建后单独记录，不能以本地测试代替。

## 独立审查与兼容

独立只读审查 `export_403_review` 已复核权限、私有 Symbol、普通列表上限、单 SQL 快照、SQL DATE 本地日期语义、CSV；原 offset 分页风险已按审查建议改为单 SQL 快照。最终 CI 状态由 Orchestrator 汇总。

- PR #384 HEAD `4e3948dafeaf72499a25d3e88f42feae147d0bc2`：其日报改动在提交后入库响应契约、失败提示及重试保护；本修复不触及该块。业务上导出读取已保存日报，不执行库存入库。共享页面存在文本集成风险，集成必须保留 #384 响应成功判断并验证组合效果。
- PR #385/#386：本分支未触及其业务改动；是否有全量文本冲突及组合回归由统一集成报告记录。
- #401：导出委托同一个 `findAll`，自然继承其修复的权威组织/公司/鸡舍范围；集成务必保留 scoped 路径的 `enrichDailyLogRows`，保证日期/原因契约。
- #402：独立输入组件块与本修复不重叠。
- 好业财恢复：未改 Chanjet API、运维/部署、配置 floor、工作流、生产恢复记录或其他 worktree。

## 安全及生产影响

只读新增 API，无 schema 或迁移，无历史数据修复。用户不能通过 query 提升普通列表上限或替换授权 scope；新增导出权不授予原本不可读的记录；原文本按 CSV 安全规则处理。20,000 条内占用应用内存，超限明确拒绝，后续若需更大规模可另行设计异步导出。

```ini
ROOT_CAUSE=VERIFIED
REPRODUCTION_BEFORE=FAIL_AS_EXPECTED
REPRODUCTION_AFTER=PASS
TARGETED_TESTS=PASS
TYPECHECK=PASS
RELEVANT_REGRESSION=PASS
SECURITY_REVIEW=PASS
REQUIRED_CI=PENDING_DRAFT_PR
MAIN_MERGE_EXECUTED=NO
PRODUCTION_DEPLOY_EXECUTED=NO
PRODUCTION_DATABASE_MUTATION=NO
CHANJET_RECOVERY_MUTATION=NO
```

本报告仅申请研发变更审查；保留 Draft、reviewed-frozen-boundary 及现有审批要求。合并、部署需单独批准。
