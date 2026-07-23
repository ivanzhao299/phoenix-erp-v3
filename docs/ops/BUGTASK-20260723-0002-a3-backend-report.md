# BUGTASK-20260723-0002 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS — GO（仅进入 CI/CD 与 UAT 验证，不代表生产问题已解决）**

本地后端修复与静态 RBAC 回归测试通过。尚未执行部署、生产冒烟或业务验收；在这些 Gate 全部通过前，不应关闭源 Bug。

## 来源问题

- Bug：`BUG-20260723-0002`
- Task：`BUGTASK-20260723-0002`
- 现象：作业台集蛋作业点击“确认开班”返回 HTTP 403
- 请求：`POST /api/packaging/terminal/shifts/open`

## 复现与根因

源码调用链显示“确认开班”请求进入 `PackagingTerminalBffController.openShift`，但方法的 RBAC 元数据仅要求 `MENU_PKG_OP:E`。集蛋岗位使用 `MENU_PROD_COLLECTION:E`；同一控制器的交班方法已经把该菜单配置为备选权限，开班方法遗漏了对应配置。

因此合法集蛋编辑用户在任何 SQL 执行前即被 `MenuGuard` 拒绝并返回 403。任务上下文中的 `PG_SQL` 自动分类与源码证据不符；本问题不需要 SQL、schema、entity 或迁移变更。

## 最小修复

- `apps/api/src/modules/bff/bff.controller.ts`
  - 为 `openShift` 增加 `MENU_PROD_COLLECTION` 备选菜单。
  - 仍要求 `E` 权限；未绕过 JWT、RBAC、DataScope、审计或附件 ACL。
- `apps/api/src/modules/bff/bff.controller.spec.ts`
  - 增加 `openShift` RBAC 元数据回归测试，锁定主菜单、权限等级及备选菜单。

## 验证结果

```text
cd apps/api
./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand

PASS
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

```text
cd apps/api
./node_modules/.bin/tsc --noEmit

PASS (exit 0, no output)
```

只读检索首选工具 `rg` 在当前环境不可用（`command not found`），诊断改用 `git grep` 完成。

## 条件与后续 Gate

1. CI 必须通过。
2. 部署后以拥有 `MENU_PROD_COLLECTION:E`、但不依赖 `MENU_PKG_OP:E` 的真实集蛋岗位账号执行 API/页面冒烟。
3. 业务方确认“确认开班”成功，且无越权访问后再验收关闭。
4. 本任务未写数据库、未执行迁移、未部署、未推送。

