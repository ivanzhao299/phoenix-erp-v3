# BUGTASK-20260723-0007 前端修复报告

## 结论

**PASS WITH CONDITIONS**

本地前端已补齐销售价格册“提交审批时选择下一审批人”的交互和请求参数。此结论不代表线上缺失的审批规则已经配置，也不代表缺陷已在生产解决；仍须 CI/CD、生产语义冒烟及业务验收。

## 来源与根因

- 来源缺陷：`BUG-20260723-0007`
- 来源任务：`BUGTASK-20260723-0007`
- 实际故障接口：`POST /api/v2/sales/pricing/books/365/submit`
- 报告所带路由 `/procurement2/requests` 与故障接口不一致。采购申请页只是验收参照实现。
- 前端根因：销售价格册提交仅显示通用确认框并发送空 `{}`，没有采购申请页已有的审批候选加载、下一审批人选择和 `approverUserId` 提交能力。
- 非前端条件：接口返回“当前业务未配置审批规则”。审批规则配置/后端审批业务类型匹配不在 A4 允许范围，本任务未写数据库、未改 API、未执行迁移。

## 改动文件

- `apps/web/src/app/(admin)/sales2/pricing/page.tsx`
  - 保留 `MENU_SALES2_PRICE` 的 `canApprove` 可见性门禁。
  - 以 `MENU_SALES2_PRICE:E` 加载审批候选，并附带价格册 `company_code` 进行公司数据域过滤。
  - 新增响应式 `ModalV2` 选择器、提交说明、加载态、无候选空态和提交中禁用态。
  - 提交所选 `approverUserId`；保留“按审批规则提交”路径；API 错误继续显示在页面错误区。
- `apps/web/src/__tests__/bug-20260723-0007-sales-pricing-approver.test.ts`
  - 覆盖 RBAC、DataScope 参数、审批人请求体及加载/空态/错误态。

## 验证

- `vitest run src/__tests__/bug-20260723-0007-sales-pricing-approver.test.ts src/__tests__/sales-pricing-lifecycle-actions.test.ts src/__tests__/sales-pricing-book-id.test.ts`
  - PASS：3 个文件、12 个测试。
- `tsc --noEmit`
  - PASS：0 errors。
- 页面结构检查
  - 桌面：候选区限高滚动，操作区右对齐并可换行。
  - 移动：共享 `ModalV2` 负责小屏容器，候选按钮满宽，底部操作区 `flex-wrap`，不会依赖固定桌面宽度。
  - 权限可见性、加载、空、错误状态均保留。
- 聚焦 ESLint
  - 条件：目标历史文件当前存在既有 lint 债务（`no-explicit-any`、`set-state-in-effect` 等），因此页面级 lint 命令非零；本任务未扩展范围清理整页历史债务。

## 后续强制门禁

1. 后端/配置负责人确认销售价格册审批业务类型已有与采购申请等价的规则，或确认显式 `approverUserId` 可合法启动流程。
2. CI 复跑 Web typecheck、测试与项目既定 lint gate。
3. 在生产用具备 `MENU_SALES2_PRICE:A` 的账号验证按钮可见，用无该权限账号验证不可见。
4. 分别以有候选、无候选、接口 400 三种场景做桌面和移动端语义冒烟。
5. 业务确认所选审批人实际收到待办后，方可关闭缺陷。
