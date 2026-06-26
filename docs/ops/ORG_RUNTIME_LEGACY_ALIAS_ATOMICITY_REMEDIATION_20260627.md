# 组织运行时旧权限别名收口（2026-06-27）

## 背景

前序批次已将 `MENU_SYS_ORG` 从组织、公司、事业群与 DataScope 入口移除，并通过 `SeedOrgDataScopeAtomicMenus1782049418112` 把旧授权继承到 `MENU_MD_ORG`、`MENU_MD_COMPANY`、`MENU_SETTINGS_DATA_SCOPE` 等原子菜单码。

本轮继续收口遗留的 `MENU_ORG_VIEW` / `MENU_ORG_MANAGE` 旧别名，避免用户只持历史组织别名时绕过新的主数据原子权限矩阵。

## 修改范围

- `apps/api/src/common/guards/master-data-type.guard.ts`
- `apps/api/src/modules/org/organization.controller.ts`
- `apps/api/src/modules/org/org.controller.ts`
- `scripts/ci/check-menu-permission-atomicity.mjs`

## 整改内容

1. `MasterDataTypeGuard` 不再允许 `organization` 类型通过 `MENU_ORG_VIEW` / `MENU_ORG_MANAGE` 访问。
2. `/api/organizations/*` 运行时组织树接口统一使用 `MENU_MD_ORG`，只保留 `MENU_SETTINGS_USER` 作为用户组织绑定面板读取组织树的明确上下文权限。
3. 组织创建、更新、启停、删除只认 `MENU_MD_ORG` 对应操作位。
4. 更新控制器注释，避免后续继续把组织运行时描述为旧权限别名。
5. CI 原子权限检查增加 `MENU_ORG_VIEW` / `MENU_ORG_MANAGE` 回归守卫。

## 风险控制

- 不修改数据库结构。
- 不新增 migration。
- 不修改角色授权数据。
- 不修改业务数据。
- 依赖既有原子菜单迁移已把旧 `MENU_SYS_ORG` 授权继承到新菜单码。

## 验证计划

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`

## 结论

GO WITH CONDITIONS。组织运行时旧权限别名已从代码入口移除；后续角色矩阵盘点应确认生产角色均通过 `MENU_MD_ORG` / `MENU_MD_COMPANY` 获得应有权限。
