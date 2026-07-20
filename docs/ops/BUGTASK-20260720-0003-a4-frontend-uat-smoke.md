# BUGTASK-20260720-0003 A4 前端修复报告

## 结论

**PASS WITH CONDITIONS / 发布状态：HOLD**

前端页面级修复、聚焦回归及 Web 类型检查通过。未执行 CI/CD、部署、生产 smoke 或业务验收，因此不宣称源 Bug 已在生产解决；这些 Gate 完成前发布状态保持 HOLD。

## 来源问题

- Bug：`BUG-20260720-0003`
- Task：`BUGTASK-20260720-0003`
- 路由：`/breeding/feed`
- 现象：饲料台账数值列的菜单标题与下方内容未对齐。
- 验收目标：同一列标题与内容使用一致的水平对齐方式，并保持桌面及移动端可读。

## Dry-run 诊断与根因

附件截图显示，“单位”“昨日库存”“今日入库”“日用量”“出库合计”“当前库存”“可用天”等标题均靠左，而对应数据分别居中或靠右。

页面原先给标题使用通用 `text-align` 工具类，但共享表格规则 `.table th { text-align: left }` 的选择器优先级更高，覆盖了这些工具类。动态鸡舍标题使用内联右对齐，因此不受同一问题影响。该问题属于纯前端 CSS 优先级与页面布局问题；任务无需后端、数据库、RBAC 或 DataScope 改动。任务上下文中的 `RBAC_403` 自动分类与截图及源码证据不符，本次未据此扩大范围。

## 改动文件

- `apps/web/src/app/(admin)/breeding/feed/page.tsx`
  - 引入页面作用域样式。
  - 数值列标题统一靠右，单位与可用天标题统一居中，与各列内容一致。
  - 表格容器由内联样式迁移为页面级滚动容器。
- `apps/web/src/app/(admin)/breeding/feed/feed.module.css`
  - 用更明确的页面级选择器覆盖共享标题左对齐规则。
  - 保留桌面最小可读宽度；窄屏使用横向滚动，不压缩或错列。
- `apps/web/src/__tests__/breeding-feed-layout.test.ts`
  - 覆盖标题对齐、桌面/移动响应式、权限及 loading/empty/error 状态。
- `apps/web/src/lib/feed-ledger.test.ts`
  - 将旧内联滚动断言同步为页面级滚动容器断言。

## 验证结果

- `git diff --check`：PASS。
- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/breeding-feed-layout.test.ts src/lib/feed-ledger.test.ts`：PASS，2 files / 9 tests。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`：PASS，0 errors。
- 桌面布局检查：PASS（源码与聚焦断言）。完整表格保持 `1080px` 最小宽度；数值标题靠右、单位与可用天居中，与数据单元格一致。
- 移动布局检查：PASS（源码与聚焦断言）。`<=768px` 保持 `980px` 表格最小宽度，并由容器提供触摸横向滚动，列关系不折叠错位。
- 权限可见性：PASS。保存按钮及可编辑字段继续受 `usePermission('MENU_BREEDING')` / `canEdit` 控制，未扩大权限。
- 状态保持：PASS。加载、空数据、请求/保存错误提示及保存中禁用状态均保留。
- 浏览器运行态：HOLD。本地执行 `./node_modules/.bin/next dev -p 3000` 被沙箱拒绝端口绑定，返回 `listen EPERM 0.0.0.0:3000`；未伪造桌面或移动截图。

## 后续 Gate

1. CI/CD 完整 Web Gate 通过。
2. 在可运行环境分别以桌面和移动 viewport smoke `/breeding/feed`，检查有/无动态鸡舍列两种数据形态。
3. 使用具备 `MENU_BREEDING:E` 与仅查看权限的账号，确认保存按钮和编辑输入的可见性未变化。
4. 验证接口失败、空数据和加载状态仍正确显示。
5. 业务方确认标题与内容对齐后，方可将 Bug 标记为 resolved。

本任务未修改 `apps/api/**`，未 merge、push、deploy、执行 migration 或写数据库。
