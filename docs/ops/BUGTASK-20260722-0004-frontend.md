# BUGTASK-20260722-0004 前端修复报告

## 结论

**PASS WITH CONDITIONS / HOLD**

前端已修复交班页错误日期查询、分级数据仅依赖浏览器缓存、请求失败静默显示全 0，以及窄屏卡片不可用的问题。不得宣称源 Bug 已解决：当前后端交班汇总没有返回实际入库/托盘/标签数量，前端无法在不推测数据的前提下满足“全部按实际数量显示”。保持 HOLD，等待后端补齐、CI/CD、生产 smoke 和业务验收。

## 来源与根因

- Source bug: `BUG-20260722-0004`
- Source task: `BUGTASK-20260722-0004`
- 页面：`/terminal/packaging/shift-close`（提报入口快照为 `/bug-reports`）
- 前端根因：交班请求传入 `undefined` 日期；分级读 `localStorage` context，刷新或换终端后归零；请求异常被吞掉并继续渲染初始 0。
- 跨层条件：`GET /api/packaging/terminal/reports/shift-summary` 目前只提供接收、异常和包装汇总；没有真实入库、托盘及标签汇总。现有页面把入库箱数等同包装箱数、托盘数按 25 箱推算，不符合“实际数量”验收口径。

## 改动文件

- `apps/web/src/app/(terminal)/terminal/packaging/shift-close/page.tsx`
  - 使用当前班次 `productionDate + shiftId` 查询。
  - 同步读取服务端 active grading，浏览器缓存仅作兼容回退。
  - 加入错误态和重试，避免失败伪装为全 0。
  - 内容区允许滚动，保留加载、无班次、完成态及原有交班权限行为。
- `apps/web/src/app/(terminal)/terminal/packaging/shift-close/shift-close.module.css`
  - 桌面维持三列/两列；`<=760px` 改为单列。
- `apps/web/src/__tests__/packaging-shift-close-summary.test.ts`
  - 覆盖班次日期、服务端分级、错误重试和移动端断点。

## 验证

- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/packaging-shift-close-summary.test.ts`：PASS，1 file / 3 tests。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`：PASS，0 errors。
- `git diff --check`：PASS。
- 桌面：三列汇总、两列差异区结构保留。
- 移动端：760px 以下汇总和差异区单列，主内容可纵向滚动。
- RBAC/DataScope：未改变路由、菜单、鉴权头或写接口；提交交班仍走原 `closeShift`。
- 状态：加载态保留；新增显式错误和重试；无班次/已交班空态保留。

## 后续 Gate

1. 后端交班汇总按 `shiftId` 返回真实分级、标签打印、入库箱/枚、托盘数量，禁止由前端推算。
2. 补齐后进行联调回归，核对同一班次五段作业台账。
3. CI/CD、生产路由 smoke、RBAC 角色复核与业务验收全部通过后，方可将 Bug 从 HOLD 改为 resolved。
