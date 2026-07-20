# BUGTASK-20260720-0001 前端修复报告

## 结论

**PASS WITH CONDITIONS**

本地前端修复与聚焦回归通过。尚未经过 CI/CD、可运行环境桌面/移动浏览器 smoke、生产 smoke 和业务验收，因此不声明源缺陷已在生产解决。

## 来源

- Bug：`BUG-20260720-0001`
- Repair task：`BUGTASK-20260720-0001`
- Route：`/sales2/orders`
- 现象：提交、发货等工作流动作成功后，列表行的状态和按钮不自动更新；列表直接操作失败时也没有可见反馈。

## 根因

1. `doAction` 依赖各 mutation endpoint 的响应体，并将响应浅合并到旧列表行。响应未包含完整订单或标准订单对象时，旧 `status` 保留，状态徽标和动作按钮不会变化，必须手动刷新。
2. `actionError` 仅在新建/详情弹窗内部渲染。从列表行直接触发的 403 或其他请求失败没有可见错误，表现为“点击无反应”。

## 改动文件

- `apps/web/src/app/(admin)/sales2/orders/page.tsx`
  - mutation 成功后重新查询当前分页/筛选条件，以服务端状态为准刷新行和动作按钮；详情打开时继续单独刷新详情。
  - 列表上下文显示 `role="alert"` 的动作错误。
  - 动作请求进行中禁用列表动作按钮，避免重复提交。
  - 未改变 `canCreate`、`canTransit` 权限判断、请求身份令牌或 DataScope 参数。
- `apps/web/src/__tests__/sales-orders-actions.test.ts`
  - 覆盖成功后重新加载、禁止旧响应浅合并、列表错误可见和防重复点击契约。

## 状态保留检查

- 权限可见性：`MENU_SALES2_ORDER` 的 `canCreate` / `canTransit` 条件保持不变。
- DataScope / audit / attachment ACL：未改请求授权、选择器或附件逻辑。
- Loading：原列表骨架屏保留；动作进行中按钮禁用。
- Empty：原 `EmptyState` 保留。
- Error：原列表加载错误保留，并新增列表动作错误提示。
- 响应式：桌面表格继续使用 `min-width: 920px`；窄屏继续横向滚动；创建表单在 `640px` 以下保持单列。

## 验证

执行：

```bash
cd apps/web
./node_modules/.bin/vitest run \
  src/__tests__/sales-orders-actions.test.ts \
  src/__tests__/sales-orders-response.test.ts \
  src/__tests__/sales-orders-responsive.test.ts
./node_modules/.bin/tsc --noEmit
git diff --check
```

结果：

- Vitest：3 files passed，7 tests passed。
- Web TypeScript：0 errors。
- `git diff --check`：通过。
- 桌面/移动静态响应式契约：通过。
- 真实浏览器 smoke：**未完成**。本地 Next.js 启动失败，环境返回 `listen EPERM 0.0.0.0:3000`；未访问或操作生产环境。

备注：当前 shell 无 `rg`（`command not found`），诊断改用限定目录的 `find` / 文本搜索，没有将空输出误报为 PASS。

## 放行条件

1. CI 完成 Web typecheck 与相关测试。
2. 在可运行测试环境使用具备和不具备相应权限的账号分别验证：成功动作后状态/按钮立即更新；403 等失败显示错误且不伪造状态变化。
3. 分别以桌面和移动视口验证 `/sales2/orders` 的提交、分配、拣货、装车、发货、送达、签收及取消链路中适用步骤。
4. 完成生产 smoke 和业务方验收后，方可将源 Bug 标记为已解决。
