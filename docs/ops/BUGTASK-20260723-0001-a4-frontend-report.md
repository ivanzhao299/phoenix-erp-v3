# BUGTASK-20260723-0001 A4 前端修复报告

## 结论

**PASS WITH CONDITIONS — 发布建议：HOLD**

本地代码修复、聚焦回归测试和 Web 类型检查通过。当前执行环境禁止监听本地端口，未能完成改动版本的真实浏览器桌面/移动 smoke；在 CI/CD、授权环境 smoke 和业务验收完成前，不声明生产问题已解决。

## 来源

- Bug：`BUG-20260723-0001`
- Task：`BUGTASK-20260723-0001`
- Route：`/home`
- 现象：运营工作台右上角“待办 / 超时 / 高危告警”数字卡仅展示，无法点击跳转。
- 附件：`01-1784769391292-9ada96f5.png`

## 根因与修复

`HeroBanner` 的三个 `NumberBubble` 使用普通 `div` 渲染，未提供链接目标或交互语义。

修复后：

- “待办”和“超时”在用户具备 `MENU_WORKFLOW_TODO:V` 时跳转 `/workflow/todos`。
- “高危告警”继续受既有 `MENU_MD_QUALITY:V` 可见门禁约束，并跳转 `/data-quality`。
- 无相应查看权限时不渲染可点击入口，避免透出无权限路由。
- 链接支持键盘焦点、hover 和触控；移动窄屏下指标组换行到欢迎信息下方。
- 数值为 `0` 时仍可进入对应列表页。

## 变更文件

- `apps/web/src/app/(admin)/home/page.tsx`
- `apps/web/src/app/(admin)/home/home.module.css`
- `apps/web/src/lib/home-navigation.ts`
- `apps/web/src/lib/home-navigation.test.ts`
- `docs/ops/BUGTASK-20260723-0001-a4-frontend-report.md`

## 状态与权限回归

- RBAC：新增跳转通过原子菜单查看权限计算；未扩大权限范围。
- DataScope / 审计 / 附件 ACL：未修改请求、数据或附件链路。
- Loading / error：原有 silent 请求与空值降级保持不变。
- Empty：`0` 数值与空待办状态保持可见；有权限时仍可进入列表。
- 高危告警可见性：保持 `hasQualityPerm` 门禁。

## 验证

通过：

```text
cd apps/web && ./node_modules/.bin/vitest run src/lib/home-navigation.test.ts
Test Files 1 passed; Tests 9 passed

cd apps/web && ./node_modules/.bin/tsc --noEmit
exit 0

git diff --check
exit 0
```

桌面证据：源附件 2000×1081 清晰确认三个目标数字卡及原始不可点击问题。修复保持桌面双列 Hero，指标链接位于右侧并允许必要时换行。

移动检查：CSS 在 `max-width: 720px` 将 Hero 切为单列，指标链接左对齐并换行；交互目标保留原卡片尺寸。代码与类型检查通过，但未完成真实浏览器截图。

受限项：

```text
next dev -p 3000
Error: listen EPERM: operation not permitted 0.0.0.0:3000
```

## 放行条件

1. CI Web typecheck 与相关测试通过。
2. 在可监听端口且具备测试账号的环境完成 `/home` 桌面与移动 smoke。
3. 分别验证有/无 `MENU_WORKFLOW_TODO:V`、有/无 `MENU_MD_QUALITY:V` 的入口可见性和跳转。
4. 完成生产 smoke 与业务方验收后，方可将状态从 HOLD 调整为 GO。
