# 通知与在线用户原子权限整改（2026-06-27）

## 背景

本轮继续清理“无权限菜单/无权限子段透传”和高风险入口粗粒度授权问题。审计发现通知配置日志仍通过 `MENU_SYS_MONITOR` 查看，在线用户页面前端缺少显式门禁，通知设置页高风险按钮主要依赖后端 403 拦截。

## 修改范围

- `apps/api/src/modules/notification/notification-config.controller.ts`
- `apps/api/src/modules/notification/presence.controller.ts`
- `apps/web/src/app/(admin)/settings/notifications/page.tsx`
- `apps/web/src/app/(admin)/settings/online-users/page.tsx`
- `scripts/ci/check-menu-permission-atomicity.mjs`

## 整改内容

1. 通知投递日志接口从 `MENU_SYS_MONITOR:V` 收紧为 `MENU_SETTINGS_NOTIFY:V`。
2. 通知设置页增加 `MENU_SETTINGS_NOTIFY:V` 页面级门禁。
3. 通知规则启停、试发、渠道启停按钮增加 `MENU_SETTINGS_NOTIFY:E` 前端控制，无编辑权限时显示只读。
4. 在线用户页面增加 `MENU_SYS_MONITOR:V` 页面级门禁，无权限时不调用 `/system/online-users`。
5. 在线用户后端注释同步为 `MENU_SYS_MONITOR`，避免后续误回退到旧 `MENU_SYSTEM` 表述。
6. CI 原子权限检查补充通知日志、通知设置页和在线用户页回归守卫。

## 风险控制

- 未修改数据库结构。
- 未新增 migration。
- 未修改业务数据。
- 未扩大任何角色权限。
- 保留后端 `MenuGuard` 强制校验，前端只做可见性和体验收紧。

## 验证计划

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`
