# BUG-20260708-0005 A4 Frontend UAT Smoke Report

## Source

- Bug: BUG-20260708-0005
- Task: BUGTASK-20260708-0005
- Route: `/sales2/customers`
- Acceptance: 编辑页面添加状态下拉框；状态和风险等级保存时都可成功。

## Diagnosis

`apps/web/src/app/(admin)/sales2/customers/page.tsx` 的客户编辑抽屉只有 `riskLevel` 字段，没有 `status` 字段。保存时直接向 `/api/v2/sales/customers/:id` 发 PATCH。生产证据中黑名单客户 PATCH 返回 403 `黑名单客户不可编辑，请先解除黑名单`，并在前端形成 unhandled rejection。

前端可拥有的修复点是：编辑表单显式提供状态下拉，并在保存时将状态变更走现有状态动作接口 `activate/freeze/blacklist`，普通资料和风险等级仍走 PATCH；黑名单客户先解除黑名单再 PATCH，避免直接 PATCH 被后端拒绝。

## Changed Files

- `apps/web/src/app/(admin)/sales2/customers/page.tsx`
  - 新增客户状态选项和编辑抽屉 `status` 下拉。
  - 保存时从 PATCH payload 中移除 `status`，改用状态动作接口协调最终状态。
  - 黑名单客户改为先 `activate`，再保存风险等级等可编辑字段，必要时再 `freeze`。
  - 新增抽屉内保存错误 `role="alert"`，避免 403 变成未处理 promise。
- `apps/web/src/__tests__/sales-customers-status-edit.test.ts`
  - 覆盖状态字段、状态动作接口拆分、黑名单保存顺序和错误提示。
- `docs/ops/BUG-20260708-0005_A4_FRONTEND_UAT_SMOKE_REPORT.md`
  - 本报告。

## Verification Results

- PASS: `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- PASS: `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/sales-customers-status-edit.test.ts`
  - 3 tests passed.
- PASS WITH CONDITIONS: source-level responsive check for the affected drawer.
  - `RightDrawer` already switches to `100vw` / `100dvh` at `max-width: 768px`.
  - New status dropdown uses the same `CrudForm` select rendering as the existing risk-level dropdown.
  - Save error alert is rendered in normal drawer body flow above the form, not as an overlay, so it does not hide submit/cancel controls.
- HOLD: live desktop/mobile browser snapshots could not be captured in this sandbox.
  - `next dev -p 3005` failed with `listen EPERM: operation not permitted 0.0.0.0:3005`.
  - `next dev -H 127.0.0.1 -p 3005` failed with `listen EPERM: operation not permitted 127.0.0.1:3005`.
  - No existing local server was reachable for `/sales2/customers`.
- HOLD: `cd apps/web && ./node_modules/.bin/next build`
  - Failed before route compilation due Turbopack environment panic: `Symlink [project]/apps/web/node_modules is invalid, it points out of the filesystem root`.
  - This is a local worktree/sandbox dependency symlink limitation; Web typecheck and focused vitest still passed.

## Scope Notes

- 未修改 `apps/api/**`。
- 未修改迁移、schema、entity、table、column。
- 未执行数据库写入、迁移、部署、push。
- RBAC/DataScope/ACL 未绕过；前端仍使用原页面接口和既有状态动作接口。

## Result

PASS WITH CONDITIONS.

The frontend-owned defect was repaired and covered by typecheck plus focused regression coverage. Live desktop/mobile route verification and production acceptance remain required. This change must not be claimed production-resolved before CI/CD, production smoke, and business acceptance.
