# BUGTASK-20260718-0005 A4 前端修复报告

## 结论

**PASS WITH CONDITIONS / GO-HOLD-FAIL：HOLD**

前端防错修复、聚焦回归、Web 类型检查与受影响路由编译均通过。尚未完成可登录浏览器运行态、CI/CD、生产 smoke 和业务验收，因此不得宣称源 Bug 已解决，发布状态保持 `HOLD`。

## 来源问题与路由核对

- Source bug：`BUG-20260718-0005`
- Source task：`BUGTASK-20260718-0005`
- 现象：作业台集蛋数量录入后点击“确认录入”，出现服务器内部错误。
- 实际验收路由：`/terminal/packaging/source-receive`
- 合同 `Route` 字段误填为 `/finance2/ar-ledger`；页面快照也来自该误填路由，不是故障页。本次依据标题与 acceptance criteria 修复实际集蛋页。
- 合同提供的本地附件位于工作区外，当前沙箱不可读取；未伪造截图证据。

## Dry-run 诊断与根因

集蛋页原先仅以“已选鸡舍、总数大于零、次品数不超总数”判断能否提交，未要求活动班次。未开班时仍会调用 `POST /api/packaging/terminal/source-batches/receive`，并明确发送 `shiftId: null`。

同一作业台的包装提交已有一致的前端约束：只有 `currentShift.status === 'OPEN'` 才允许提交。集蛋页缺少该约束，使本可在前端阻止的无效请求进入服务端错误路径。

本任务未读取或修改 `apps/api/**`，因此不能单凭前端证据确认分类器所述 `RBAC_403`，也不能排除服务端在合法活动班次下仍存在独立问题。

## 改动文件

- `apps/web/src/app/(terminal)/terminal/packaging/source-receive/page.tsx`
  - 活动且具有服务端 ID 的班次成为提交前置条件。
  - 未开班时禁用“确认录入”，并显示可访问的明确提示。
  - 提交请求只发送已验证的非空 `shiftId`。
  - 已填写但未提交的数据继续阻止误跳至分级页。
  - 原错误显示、提交 loading、鸡舍 loading/空态与成功后刷新逻辑保留。
- `apps/web/src/lib/source-receive-submit.ts`
  - 新增活动班次 ID 的纯函数校验。
- `apps/web/src/lib/source-receive-submit.test.ts`
  - 覆盖活动班次、关闭班次、缺失班次和无服务端 ID 的班次。

## 权限与状态审计

- RBAC/权限可见性：未修改终端布局、导航、认证上下文、角色或权限映射；未扩大任何入口或操作权限。
- DataScope、审计、附件 ACL：未修改。
- 错误态：服务端错误仍显示；新增未开班本地提示使用 `role="status"`，提交错误使用 `role="alert"`。
- Loading：提交中的禁用与“提交中...”保持不变。
- Empty：鸡舍列表无数据和当日记录为空行为保持不变。

## 桌面与移动行为

- 桌面：静态检查通过。底部操作栏保持原布局；活动班次下按钮行为不变，未开班提示占用既有消息区域。
- 移动/终端窄视口：静态检查通过。未新增固定宽度或全局样式，提示复用既有可伸缩消息容器；触控按钮与数字键盘路径未改变。
- 浏览器运行态：未完成。Browser 运行时返回无可用浏览器实例，无法执行真实桌面/移动点击与截图验证。

## 验证结果

- `git diff --check`：PASS。
- `cd apps/web && ./node_modules/.bin/vitest run src/lib/source-receive-submit.test.ts`：PASS，1 file / 2 tests。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`：PASS，0 errors。
- `cd apps/web && ./node_modules/.bin/next build --webpack --experimental-build-mode compile --debug-build-paths 'src/app/(terminal)/terminal/packaging/source-receive/page.tsx'`：PASS，route compile successful。
- 编译存在既有警告：`outputFileTracingRoot` 与 `turbopack.root` 不一致、自定义 Cache-Control、middleware convention deprecated；均非本任务引入。

## HOLD 条件

1. CI/CD 完整 Web Gate 通过。
2. 在可登录环境分别用桌面和移动/终端视口 smoke 实际集蛋路由。
3. 未开班时确认按钮不可提交且不产生 receive 请求。
4. 已开班且具有合法 `shiftId` 时完成一次集蛋录入并回查当日记录。
5. 用 `ROLE_PKG_OP`、`ROLE_LINE_SUPERVISOR`、`ROLE_ADMIN` 及无权账号核对入口与提交权限；由安全/后端 Gate 验证分类器报告的 `RBAC_403`。
6. 后端确认合法班次请求不再返回 5xx，业务方完成验收后才可关闭 Bug。

本任务未 merge、push、deploy、执行 migration、写数据库或修改任务板。
