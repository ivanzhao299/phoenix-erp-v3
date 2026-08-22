# 包装作业台退出与切换导航修复（2026-08-22）

## 1. 核查事实

### 登录落点与权限面

- 桌面端访问 `/` 时，`apps/web/src/middleware.ts` 仅把 `ROLE_ADMIN`、`ROLE_SYSOPS` 导向 `/dashboard`，其他已登录用户落到 `/home`。
- `/dashboard` 页面和 admin layout 均按菜单权限二次守卫：持有 `MENU_DASHBOARD:V` 才能看到集团驾驶舱；无权限用户会转到其首个可访问菜单或 `/home`。
- `AuthContext.hasPermission` 对 `ROLE_ADMIN` 与 `permissions: ['*']` 放行，普通用户按 JWT 中的 `MENU_CODE:V,C,...` 判断。
- 因此，纯 `MENU_PKG_OP:V` 用户登录后落 `/home`，不能实际使用 `/dashboard`；给这类用户显示“返回管理后台”会造成错误引导。兼有 `MENU_DASHBOARD:V` 的用户才有可靠的 admin 返回目标。

### 终端内部导航

- `/terminal/home` 是现有作业台选择中心，按权限展示包装、仓储、配送入口。
- `TerminalNavRail` 的包装导航已经包含 `/terminal/home`，包装作业员可从左侧“首页”回到作业台选择中心。
- 包装 dashboard 可进入开班/交班及集蛋接收、分级、包装、标签、入库、异常等步骤；各流程页已有前后步骤跳转。此次故障是跨 layout 的退出与切换缺口，不需要重做包装流程导航。

### 平板与窄屏

- 终端采用固定左侧导航轨和 46px 顶栏，既有顶栏没有媒体查询。
- 新增顶栏操作采用与“退出”相同的视觉规格，并在 900px、700px 断点压缩间距、隐藏用户名、限制按钮宽度，避免返回按钮挤占窄屏作业空间。

## 2. 简短设计稿与取舍

1. 后台 Sidebar 的“包装作业台”入口使用 `target="_blank" rel="noopener"`。后台标签页保留，浏览器标签切换即是低成本、符合用户认知的“最小化”。登录状态可通过现有 localStorage fallback 在新标签页恢复。
2. 终端顶栏仅在 `hasPermission('MENU_DASHBOARD', 'V')` 为真时显示“返回管理后台”，点击进入 `/dashboard`。判断复用 AuthContext 权限权威，不按角色名猜测。
3. 纯终端账号不显示 admin 返回按钮，继续使用现有左轨“首页”进入 `/terminal/home`，避免 `/dashboard` 权限陷阱。
4. 不新增迁移；新文案使用 `t(key, 中文 fallback)`。不额外改造 shift-open/shift-close 导航，避免把跨壳修复扩张为流程重设计。
5. 未采用可选的动态 tab 标题：当前 terminal layout 是 client component，单独引入标题生命周期或 server/client 双层 layout 对本次故障收益有限；新标签入口的 title 已明确提示“在新标签页打开”。

## 3. 改动清单

- `apps/web/src/components/layout/Sidebar.tsx`：包装终端入口改为安全的新标签页打开。
- `apps/web/src/app/(terminal)/layout.tsx`：新增按权限显示的 admin 返回动作。
- `apps/web/src/app/(terminal)/terminal-layout.module.css`：统一顶栏按钮样式与窄屏适配。
- `apps/web/src/lib/terminal-navigation.ts`：抽取返回权限与目标的纯逻辑。
- `apps/web/src/lib/terminal-navigation.test.ts`：覆盖 dashboard 用户与纯包装操作员分支。
- `apps/web/e2e/terminal-exit-navigation.spec.ts`：覆盖新标签、admin 返回、纯终端隐藏三个场景。
- `apps/web/src/__tests__/bug-20260723-0005-packaging-workbench-navigation.test.ts`：把旧的“禁止新标签”回归断言更新为本次确认的新行为。

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| Web `tsc --noEmit` | 通过，0 errors |
| Web Vitest | 通过，73 files / 412 tests |
| Web production build | 通过，231 个静态页面生成完成 |
| Playwright 新增 3 场景 | 用例已收集；宿主 Chromium 在测试执行前因缺少系统动态库 `libnspr4.so` 无法启动，3 条均未进入页面逻辑。项目红线禁止未经确认安装项目外系统包；权限分支由 Vitest 覆盖，新标签契约由既有源码回归测试覆盖。 |

## 5. 发布与生产核实

待 main push、CI、显式 `mode=web / approve_production=true` 部署完成后回填最终 workflow、commit SHA 与生产只读 revision。
