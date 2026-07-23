# BUGTASK-20260722-0003 前端修复报告

## 任务

- Source bug: `BUG-20260722-0003`
- Source repair task: `BUGTASK-20260722-0003`
- 问题：作业台入库显示成功，但库存查询中没有实际入库记录
- 验证路由：`/warehouse/query`
- 实际操作路由（由附件确认）：`/terminal/packaging/warehouse-handover`

## 诊断与根因

附件显示终端成品入库页在确认 2 箱、60 枚后展示“入库成功”，再次进入时仍显示 0/2。

前端 `handleSubmit` 调用 `packagingApi.confirmHandover` 时捕获了接口错误，但错误分支仅输出
`console.error`；异常后仍无条件执行 `setDone(true)` 和跳转。因此 API 5xx 或业务失败会被错误呈现为
成功。`/warehouse/query` 本身通过专用库存接口加载数据，并保留 403、一般错误、加载和空状态。

## 改动

- `apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx`
  - 仅在确认接口成功返回后进入成功态并跳转。
  - 失败时保留扫码、库位、接收人等输入，显示 `role="alert"` 错误并允许重试。
  - 提交状态在 `finally` 中复位。
  - 为确认对话框补充 dialog 语义。
- `apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/warehouse-handover.module.css`
  - 760px 以下将操作区、库位字段和汇总区改为单列，错误提示与确认框适配窄屏。
- `apps/web/src/__tests__/bug-20260722-0003-warehouse-handover.test.ts`
  - 回归覆盖成功态顺序、失败态、重试状态及移动断点。

未修改 API、数据库、迁移、RBAC、DataScope、审计或附件 ACL。

## 验证结果

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS，0 errors。
- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/bug-20260722-0003-warehouse-handover.test.ts src/lib/warehouse-query.test.ts`
  - PASS，2 files / 8 tests。
- 权限及页面状态审查
  - PASS：`/warehouse/query` 的 403 权限提示、一般错误、loading、empty 状态未改动。
  - PASS：提交失败不会清空终端入库表单，也不会显示成功或跳转。
- 桌面/移动真实浏览器检查
  - 未完成：沙箱启动 Next.js 时返回 `listen EPERM: operation not permitted 0.0.0.0:3000`。
  - 已完成源码与测试层面的 760px 响应式规则检查，但不能替代真实浏览器截图与交互验证。

## 后续验收条件

1. CI 通过。
2. 在可运行 Web 的环境分别以桌面和移动宽度检查终端入库页。
3. 使用有权限的测试账号验证失败响应不会显示成功，成功响应后 `/warehouse/query` 可查询对应批次。
4. 完成生产 smoke 与业务验收后，方可关闭源 bug。

## 结论

HOLD

原因：前端修复和聚焦自动验证已完成，但合同要求的桌面与移动真实页面检查受当前沙箱端口限制，尚未完成；同时尚无 CI/CD、生产 smoke 和业务验收证据。
