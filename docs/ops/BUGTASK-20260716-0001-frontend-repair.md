# BUGTASK-20260716-0001 前端修复报告

## 结论

**PASS WITH CONDITIONS（本地前端门禁通过；发布决策 HOLD）**

本地代码、聚焦回归测试和 Web 类型检查通过。受执行沙箱禁止监听本地端口影响，无法完成真实浏览器端到端保存操作；在 CI/CD、测试环境桌面/移动端 smoke、生产 smoke 与业务方验收完成前，不声明 BUG-20260716-0001 已解决，也不建议发布。

## 来源问题

- Bug：`BUG-20260716-0001`
- 修复任务：`BUGTASK-20260716-0001`
- 路由：`/breeding/flock`
- 现象：编辑鸡群档案后，回到列表仍显示旧的存栏量等内容，需要手动刷新。
- 附件：`01-1784163499439-dff7ab8f.png`，桌面截图显示列表存栏量为 500 羽、编辑抽屉中的当前存栏为 0。

## 根因

页面把成功文案传给 `updateRecord`。该方法会等待用户关闭成功弹窗才返回，因此页面在用户“回到列表”之后才调用未等待的 `load()`。同时旧版 `useCrud` 的 GET 没有显式绕过浏览器 HTTP 缓存，紧随 PUT/POST 的列表刷新可能拿到缓存结果。

## 改动文件

- `apps/web/src/app/(admin)/breeding/flock/page.tsx`
  - PUT/POST 成功后先 `await load()`，再关闭抽屉、清理编辑状态并显示成功提示。
  - 写入和刷新期间禁用保存按钮，防止重复提交，并显示“保存中...”。
  - 原有 PBAC 可见性、DataScope 请求路径、表单字段和错误弹窗逻辑保持不变。
- `apps/web/src/hooks/useCrud.ts`
  - CRUD 列表 GET 使用 `cache: 'no-store'`，避免编辑后的刷新读取浏览器陈旧缓存；同一遗留 hook 的其他修改页同步受益。
- `apps/web/src/lib/bug-20260716-0001-flock-refresh.test.ts`
  - 覆盖刷新/关闭/成功提示的执行顺序、重复提交保护和 no-store 策略。

## 状态与权限检查

- 权限：新建按钮和行操作仍分别沿用 `canEditFlock`；未扩大任何可见性或操作权限。
- DataScope / RBAC / 审计 / 附件 ACL：请求端点、鉴权头和数据载荷均未改变。
- 错误态：PUT/POST 失败仍由 `useCrud` 展示原错误弹窗，且不会关闭编辑抽屉。
- 空态：`DataTable` 的原空数据行未改变。
- 加载态：新增保存按钮禁用及“保存中...”反馈；列表和抽屉原有渲染保持不变。

## 桌面与移动端检查

- 桌面：已检查源 Bug 的 2000×1081 附件；列表、横向列和 460px 编辑抽屉结构未改，修复仅改变保存时序及按钮状态。
- 移动端：静态检查确认 `DataTable` 继续使用 `overflowX: auto`，`RightDrawer` 继续使用 `maxWidth: 96vw`，新增按钮状态没有固定宽度或新增溢出风险。
- 条件：尝试启动 `next dev` 做真实浏览器验证时，沙箱返回 `listen EPERM 0.0.0.0:3000`。因此真实桌面/移动端交互 smoke 必须由 CI 或可监听端口的测试环境补做。

## 验证结果

```text
cd apps/web && ./node_modules/.bin/vitest run src/lib/bug-20260716-0001-flock-refresh.test.ts
PASS：1 file，3 tests

cd apps/web && ./node_modules/.bin/tsc --noEmit
PASS：0 errors

git diff --check
PASS

cd apps/web && ./node_modules/.bin/eslint 'src/app/(admin)/breeding/flock/page.tsx' src/hooks/useCrud.ts src/lib/bug-20260716-0001-flock-refresh.test.ts
HOLD（既有基线）：5 errors / 7 warnings；命中均位于本任务未改的既有代码行（effect、any、未使用变量及 hook dependencies），本次新增行未产生 lint 诊断

cd apps/web && ./node_modules/.bin/next dev
HOLD（环境条件）：listen EPERM 0.0.0.0:3000
```

检索工具说明：当前环境没有 `rg`（`command not found`），诊断阶段使用 `find`/`grep` 等价检索源码。

## 发布前条件

1. CI 通过 Web 类型检查和聚焦回归测试。
2. 测试环境分别以桌面和移动视口验证：编辑存栏量并保存，关闭成功提示后列表立即显示服务端最新值，无需刷新页面。
3. 验证无编辑权限用户看不到行编辑/新建入口，API 错误时抽屉保留且错误提示可见。
4. 完成生产 smoke 与业务方验收后，才可将发布决策由 HOLD 调整为 GO，并关闭源 Bug。
