# BUGTASK-20260716-0004 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS（GO：进入 CI/CD 与生产烟测；尚不可宣称生产问题已解决）**

本地后端修复与聚焦回归验证通过。未部署、未写数据库、未执行迁移、未推送。最终关闭缺陷仍须经过 CI/CD、生产环境烟测和业务验收。

## 来源问题

- Bug：`BUG-20260716-0004`
- Task：`BUGTASK-20260716-0004`
- 路由：`/breeding/daily-inbound`
- 现象：提交日生产日报后，“日产蛋入库”点击“从日报预填”提示“暂无日报或未按 9 档录入”。

## 诊断与根因

任务自动分类为 `RBAC_403`，但本地源码不支持该结论：预填接口为 `GET /api/v3/farm/daily-logs/eggs-breakdown`，守卫权限是 `MENU_FARM_DAILY:V`；报告用户为 `admin / ROLE_ADMIN`。现象文案也来自业务数据完整性判断，而非后端 403。

实际根因是蛋等级主数据演进后，日报后端仍有两处旧契约：

1. G67 已将 ACTIVE 可售等级从 `XL/L/M/S/XS` 改为 `GRADE_1..GRADE_5`，但日报提交逻辑仍按旧五档求和，可能把九档日报的 `eggs_produced` 派生为 0。
2. 预填接口直接聚合 `eggs_by_grade` 的现有键。日报 JSON 若省略数量为 0 的档位，响应就是稀疏对象，入库端会判定不是完整九档。

## 修复

- 日报提交时从 `product_grades` 的 ACTIVE、可售记录动态取得等级编码，再派生 `eggs_produced`，不再硬编码旧五档。
- 预填接口从 ACTIVE 等级主数据初始化完整等级对象，缺省数量补 0，再叠加指定日期/鸡舍的日报数量。
- 保留既有 `MenuGuard`、`DataScopeGuard`、鸡舍归属兜底查询与参数绑定；未扩大权限或数据范围。

## 变更文件

- `apps/api/src/modules/farm/farm.service.ts`
- `apps/api/src/modules/farm/farm.service.spec.ts`
- `docs/ops/BUGTASK-20260716-0004-a3-backend-report.md`

## 验证

1. 聚焦回归：
   - 命令：`cd apps/api && ./node_modules/.bin/jest src/modules/farm/farm.service.spec.ts --runInBand`
   - 结果：PASS，1 suite / 13 tests。
   - 覆盖：`GRADE_1..5` 可售数量正确派生；稀疏日报 JSON 返回完整 ACTIVE 九档并补 0；既有 DataScope 鸡舍归属兜底保持通过。
   - 测试中的“无可用 PRD-EGG 批次”是 mock 环境触发的既有降级告警，suite 通过且未连接数据库。
2. API 类型检查：
   - 命令：`cd apps/api && ./node_modules/.bin/tsc --noEmit`
   - 结果：PASS，0 errors。
3. Diff 静态检查：
   - 命令：`git diff --check -- apps/api`
   - 结果：PASS，无 whitespace error。

## 后续条件

- CI/CD 构建及测试通过。
- 在生产只读烟测中，以已提交九档日报的日期调用预填接口，确认 `logs > 0` 且 `eggsByGrade` 含当前 9 个 ACTIVE 等级。
- 业务方在“日产蛋入库”页面确认九档数量正确预填，再执行正常业务验收。
- 若生产 `product_grades` 的 ACTIVE 集合不是预期九档，应先 HOLD 并按主数据治理流程修正；本任务未获 schema、migration 或数据库写入授权。
