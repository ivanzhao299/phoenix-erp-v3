# Agent Platform V2 A4 UI/UX Role Review

## 1. Why Strengthen A4

The previous A4 name emphasized UAT smoke, but real ERP delivery also needs focused frontend page development, UI/UX polish, styling, responsive layout, and permission-aware interaction design. Without a clear A4 UI/UX mandate, frontend improvement requests could be routed too narrowly or delayed behind backend work.

## 2. Modified Files

1. `docs/ops/AGENT_REGISTRY.md`
2. `docs/ops/AGENT_CAPABILITY_MATRIX.md`
3. `docs/ops/AGENT_ROUTING_RULES_V2.md`
4. `docs/ops/AGENT_PARALLEL_EXECUTION_POLICY_V2.md`
5. `docs/ops/AGENT_DISPATCH_MAP.json`
6. `docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md`
7. `docs/ops/AGENT_TASK_BOARD.md`

## 3. New A4 Responsibility

`A4-Frontend-UAT-Smoke` remains the canonical branch/worktree name. The role is now explicitly `A4-Frontend-UIUX-UAT`.

A4 owns:

1. frontend page development;
2. UI/UX optimization;
3. style adjustment;
4. form/list/detail/modal/drawer/filter layout;
5. buttons, menus, tags, status colors, icons, spacing, and layout polish;
6. PC/mobile responsive adaptation;
7. frontend permission visibility;
8. route and menu display;
9. UAT smoke validation.

## 4. Capability Tags

1. `frontend-implementation`
2. `ui-ux-polish`
3. `responsive-layout`
4. `form-layout`
5. `table-list-ux`
6. `route-menu-visibility`
7. `permission-aware-ui`
8. `uat-smoke`

## 5. Routing Rules

Frontend/UI keywords such as 页面, 前端, UI, UX, 样式, 美化, 好看, 清爽, 现代化, 布局, 按钮, 表格, 表单, 弹窗, 抽屉, 筛选, 状态标签, 颜色, 间距, 响应式, 移动端, PC端, 交互, 用户体验, UAT, and smoke route primarily to A4.

## 6. Collaboration

1. Pure style optimization: A4 executes, A1 validates, A3 not required.
2. New API needed: A3 owns backend, A4 owns frontend/UI, A2 reviews permission risk, A1 validates.
3. Permission buttons/menu visibility: A4 owns display, A2 reviews RBAC/DataScope, A1 validates.
4. Production deployment: A6 owns runbook, A7 owns GO/HOLD/ROLLBACK gate.

## 7. Parallel Development

A4 can run in parallel with A3 when `apps/web/**` and `apps/api/**` work is separated and the API contract is frozen or mocked. A4 may coordinate with A1/A2 in parallel for planning, but final A1 validation and A2 permission review happen after relevant UI changes are ready.

## 8. Current Limits

A4 still cannot modify backend code, migrations, schema/entity/table/column, deployment logic, or database state. Real code work requires user approval.

## 9. Next Recommendation

Merge this documentation update to main so future natural language requests for frontend polish, UI/UX, responsive layout, and permission-aware UI route cleanly to A4.
