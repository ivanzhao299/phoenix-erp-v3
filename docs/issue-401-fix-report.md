# Issue #401 / MANUAL-122 — 日报授权可见性修复

- Issue: https://github.com/ivanzhao299/phoenix-erp-v3/issues/401
- Branch: `codex/manual-122-daily-report-visibility`
- BASE_MAIN_SHA: `5f51ec2bba6cbeaad96bd038af7244afcc22c0b3`
- 隔离 worktree: `.worktrees/manual-122-daily-report-visibility`
- 本报告描述隔离环境中已复现的代码根因；未查询或修改生产 `songmingguang` 账号及其组织配置。

## 根因与修复

日报 POST 使用 `FarmController` 的 `MENU_FARM_DAILY:E`，经真实 DataScope 及 `house → ACTIVE farm → company/site` 权威关系绑定归属。列表 GET 的原菜单权限为 `MENU_FARM_DATA:V`，但 `brd_daily_logs` 未加入 `BREEDING_SCOPED_TABLES`，仍将遗留 `req.user.storeCode` 直接注入 `site_code`。合法公司/农场用户的 storeCode 是 farm 编码、空值或陈旧 SITE 时，已经保存的记录返回空；admin 的全局路径仍能查询。隔离 PostgreSQL 的真实 POST/HTTP GET 在精确 BASE 上复现了该不对称。

前端同时把录入默认鸡舍用于历史列表过滤，先取全域最新 100 条再按舍过滤并截 30 条，导致其他有权鸡舍记录被默认隐藏，或被别舍记录挤出 API 第一页。

修复包含：

1. 日报加入既有 scoped breeding 查询入口；GET 菜单要求保持原样，未新增菜单放行、账号角色或组织授权。
2. 日报行作用域通过 `house_code → brd_houses.farm_code → ACTIVE brd_farms` 校验，不信任可能缺失/陈旧/伪造的日报 farm/site/company 快照；仅有 house_code 的历史记录也按真实归属可读。未改写任何历史记录。
3. DataScope 新增内部可选 `allowedBreedingCompanyCodes`，区分显式 COMPANY/REGION 范围与 SITE 为公司级主数据上卷得到的父公司范围。SITE 账号不会因此读到同公司其他场；SITE + 显式同公司或跨公司组织绑定仍保留其明确授权。既有 `allowedCompanyCodes` 及其他消费者语义不变。
4. 日报全局标志只接受实际解析的 DataScope；缺少身份/范围时拒绝全部，不以 storeCode=ALL 回退全局。
5. scoped 返回继续使用原日期规范化和死淘原因字典 enrichment，保持列表契约。
6. 历史鸡舍/日期与录入表单分离，默认显示当前账号已授权的近期记录；查询在 API 分页前过滤、每页 30 条。保存后定位所保存的舍/业务日期，筛选写入页面 URL，支持刷新及登录返回。过期异步响应不能覆盖新的筛选结果。

查询权威链要求农场 ACTIVE；鸡舍记录本身不额外要求 ACTIVE，以保留停用鸡舍的既有历史查询。鸡舍已物理删除、无权威农场、农场非 ACTIVE 时非全局用户 fail-closed；本轮不修复生产主数据。

## 修复前后验证

固定 Node 20.20.2 / pnpm 9.15.9。测试不读取 dotenv、应用数据库配置或生产凭据。

真实 PostgreSQL 18 使用独立容器 `phoenix-issue401-isolated-pg`，只监听 `127.0.0.1:15441`，数据库 `issue401_fixture`。测试要求显式 `ISSUE401_PG_URL`，强制 loopback 和精确 fixture 数据库名，禁止 schema synchronize、禁止 migration；DDL/DML 只创建/重置此隔离 fixture。

Nest HTTP 使用实际 `GenericCrudController` / `FarmController`、实际 `GenericCrudService` / `FarmService`、实际 `MenuGuard` / `DataScopeGuard`、实际 `DataScopeService` 及真实 PG 组织和数据范围表。JWT 策略仅在测试宿主中替换为本地 fixture 用户/角色权限加载，未调用生产登录服务。UI 为真实 React 页面 DOM/effect 测试，传输层使用 fixture；未宣称已完成生产浏览器验收。

| 检查 | 结果 |
|---|---|
| 精确 BASE 的同一 PG/HTTP 用例 | 6 failed / 1 passed，预期失败；POST 保存成功后本人 GET 空，跨范围旧路径亦暴露风险 |
| 精确 BASE 的同一页面 DOM 用例 | 3 failed，预期失败；默认舍隐藏授权记录、无独立历史筛选、保存定位缺失 |
| 修复后 API 定向及相关回归 | 8 suites / 103 tests PASS，含 PG/HTTP 7 项 |
| 修复后 Web DOM + breeding 逻辑 | 2 suites / 8 tests PASS，含 DOM 4 项 |
| API tsc --noEmit | PASS，0 errors |
| Web tsc --noEmit | PASS，0 errors |
| API 修改文件 ESLint | PASS，0 errors；保留既有 warnings |
| Web 修改文件 lint debt gate | PASS，未增加错误债务；旧日报页仍有 7 errors / 13 warnings，新测试 0 errors |
| diff whitespace | PASS |

PG 作用域审计覆盖：本人保存后立即读取、重复刷新、新 JWT/清 scope cache；admin；同公司同事；跨公司查询空集及写入拒绝；无组织用户；缺失/陈旧/farm 维度 storeCode；客户端伪造 house/site/company 筛选；同公司双 SITE；SITE + 显式同公司/跨公司组织绑定；独立 extra farm 授权；历史稀疏归属和伪造跨公司快照；130 条其他记录下的分页前筛选；未认证 401 与原菜单缺失 403。REGION 同级公司授权与 GROUP 规则另有实际 resolve() 定向单测。

窄字段 scope-audit 实测日报页裸 house/farm/company/site `<input>` 数量 **0**，`HouseSelector` 数量 **2**（录入与历史筛选）。未执行仓库旧 `test/scope-audit.sh`：它硬编码 3100 和真实账号，不适用于本轮隔离身份；上述真实 PG/HTTP 作用域检查为本轮审计依据。

可复跑：

```sh
# 仅使用自行创建的 loopback issue401_fixture；示例地址的身份凭据应由测试环境单独提供。
cd apps/api
TZ=Asia/Singapore ISSUE401_PG_URL="$ISSUE401_PG_URL" ./node_modules/.bin/jest --runInBand --runTestsByPath \
  src/modules/generic-crud/daily-log-visibility.pg.spec.ts \
  src/modules/generic-crud/daily-log-visibility.spec.ts \
  src/modules/generic-crud/daily-scope-provenance.spec.ts \
  src/modules/generic-crud/generic-crud.controller.spec.ts \
  src/modules/generic-crud/generic-crud.service.spec.ts \
  src/modules/farm/farm.service.spec.ts \
  src/modules/org/services/data-scope.service.spec.ts \
  src/modules/org/guards/data-scope.guard.spec.ts
cd ../web
./node_modules/.bin/vitest run src/__tests__/daily-report-visibility.dom.test.tsx src/lib/breeding-daily.test.ts
```

未设置 `ISSUE401_PG_URL` 时 PG 套件显式 skip；本轮报告中的 PG PASS 均来自已设置环境并实际执行的运行。完整生产浏览器、生产原账号、全仓 build/verify 未执行。

## 独立审查与安全边界

独立 reviewer 已核验并推动修复：scoped enrichment 缺失、SITE 父公司上卷、缺身份 legacyGlobal、历史稀疏/伪造归属，以及混合组织授权丢失风险；Orchestrator 已确认最终独立审查无阻断。新增定向测试覆盖各项边界。RBAC 原 GET 权限未放宽；没有“创建者 OR 条件”绕过 DataScope，没有更改账号为 admin。

本改动触及 DataScope 和列入生产配置合同 criticalFiles 的 `generic-crud.service.ts`，属于需要独立安全/冻结边界审核的变更。未修改 floor/contract、工作流、审批标签或受控恢复记录；未来生产交付必须由恢复治理负责人重新审查配置 floor 兼容性。Required CI 与 reviewed-frozen-boundary 审批保留，由独立 Draft PR 的检查状态为准，不能以本地验证替代。

## 兼容性与共享文件

- PR #384 (`4e3948dafeaf72499a25d3e88f42feae147d0bc2`)：日报页面在入库响应判断处不同局部修改；本修复不改变入库 payload、数量、幂等键或事务。保存后历史刷新应与其真实成功响应契约一起集成回归，不能用 ours/theirs 覆盖。
- PR #385 / #386：本任务未把其改动混入分支，具体组合结论以统一集成报告为准。
- #402：九档输入局部独立组件，不涉及本修复作用域。
- #403：同页 loadData 的 `eggsByGrade` 映射和表格明细需与本修复历史过滤同时保留；导出复用 findAll 后自动遵守本作用域。#403 独立修复原 `toDateOnly(Date)` 在正时区的日期前移问题；集成须保留该日期 helper 修复与本 scoped enrichment，并在 Asia/Singapore PG 重跑。
- 共享日报页局部：historyHouse/historyDate 状态与 URL、loadData 查询/过期响应保护、历史 load effect、保存后定位、visibleReports、历史标题和筛选控件。不改九档输入及入库调用逻辑。
- 好业财恢复：无业务 API、定时任务、同步、事务、配置 floor 或生产记录修改。

## 文件清单

- `apps/api/src/modules/generic-crud/crud.constants.ts`
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/modules/org/services/data-scope.service.ts`
- `apps/api/src/modules/generic-crud/daily-log-visibility.spec.ts`
- `apps/api/src/modules/generic-crud/daily-log-visibility.pg.spec.ts`
- `apps/api/src/modules/generic-crud/daily-scope-provenance.spec.ts`
- `apps/web/src/app/(admin)/breeding/daily/page.tsx`
- `apps/web/src/__tests__/daily-report-visibility.dom.test.tsx`
- 本报告。

```ini
ROOT_CAUSE=VERIFIED_IN_ISOLATED_ENVIRONMENT
REPRODUCTION_BEFORE=FAIL_AS_EXPECTED
REPRODUCTION_AFTER=PASS
TARGETED_TESTS=PASS
TYPECHECK=PASS
RELEVANT_REGRESSION=PASS
SECURITY_REVIEW=PASS
REQUIRED_CI=PENDING_DRAFT_PR
PRODUCTION_DATABASE_MUTATION=NO
PRODUCTION_MIGRATION=NO
PRODUCTION_DEPLOY=NO
CHANJET_RECOVERY_MUTATION=NO
AUTO_MERGE=NO
```
