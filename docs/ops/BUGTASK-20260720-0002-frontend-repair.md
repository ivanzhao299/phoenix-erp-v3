# BUGTASK-20260720-0002 前端修复报告

## 结论

**PASS WITH CONDITIONS**

本地前端请求契约修复与聚焦回归通过。尚未经过 CI/CD、可运行环境的桌面/移动真实浏览器 smoke、生产 smoke 和业务验收，因此不声明源 Bug 已在生产解决。

## 来源

- Bug：`BUG-20260720-0002`
- Repair task：`BUGTASK-20260720-0002`
- Route：`/breeding/feed`
- 现象：在「今日入库」录入数量后点「保存」无有效反馈，刷新后数量未增加。

## 根因

1. 页面向 `POST /api/farm/feed/ledger` 发送 `{ date, rows }`，而端点契约要求 `{ date, items }`。端点因缺少 `items` 返回 `{ code: 400, msg: '缺少 date 或 items' }`，没有执行保存。
2. 该业务错误使用 HTTP 200 返回，原 `apiPost` 只检查 HTTP status，仍将它当作成功并显示「已保存」，导致虚假成功。

## 改动文件

- `apps/web/src/app/(admin)/breeding/feed/page.tsx`
  - 使用 `{ date, items }` 作为保存 payload。
  - 检查业务响应 `code`；业务失败不再显示「已保存」，改为可见的 `role="alert"` 错误。
  - 成功后使用服务端返回的台账行刷新页面状态。
  - 保存中按钮继续禁用，并增加 `aria-busy`。
- `apps/web/src/lib/feed-ledger.ts`
  - 新增可测试的保存 payload 和响应解包函数。
- `apps/web/src/lib/feed-ledger.test.ts`
  - 覆盖 `items` 契约、服务端行回填、HTTP 200 业务失败、RBAC/错误/loading/响应式页面契约。

## 状态与边界检查

- 权限可见性：仍使用 `usePermission('MENU_BREEDING')` 的 `canEdit`；无 E 权限用户不显示保存按钮与可编辑输入。
- DataScope / audit / attachment ACL：未改身份令牌、端点、scope 参数、审计字段或附件逻辑。
- Loading：原加载行保留；加载和保存时禁用保存。
- Empty：原「暂无数据」行保留。
- Error：HTTP 错误和业务 `code != 200` 均显示告警，不会伪造成功。
- 桌面/移动：修复未改布局；工具栏保留 `flexWrap: 'wrap'`，表格容器保留 `overflow: 'auto'` 以供窄屏横向滚动。源码契约检查通过；真实浏览器检查被本地端口权限阻断，列为放行条件。

## 验证

```bash
cd apps/web
./node_modules/.bin/vitest run src/lib/feed-ledger.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint \
  'src/app/(admin)/breeding/feed/page.tsx' \
  src/lib/feed-ledger.ts src/lib/feed-ledger.test.ts
git diff --check
```

- Vitest：6 tests passed。
- Web TypeScript：0 errors。
- ESLint：聚焦文件 0 errors。
- `git diff --check`：通过。
- Playwright 前置：`npx` 可用。
- 真实浏览器 smoke：**未完成**。本地 Next.js 启动被环境拒绝：`listen EPERM 127.0.0.1:3000`。未访问或操作生产环境。

备注：当前 shell 无 `rg`（`command not found`），诊断改用限定目录的 `find` / `grep`，没有将空输出误报为 PASS。

## 放行条件

1. CI 完成 Web typecheck 与聚焦测试。
2. 在可运行测试环境，用具备 `MENU_BREEDING:E` 的账号分别在桌面和移动视口录入「今日入库」；确认请求体含 `items`、成功后页面显示服务端值，刷新后数量保留。
3. 用仅 `MENU_BREEDING:V` 的账号确认不出现编辑/保存入口；用失效权限或测试错误响应确认页面显示错误且不显示「已保存」。
4. 完成生产 smoke 和业务方验收后，方可将源 Bug 标记为已解决。
