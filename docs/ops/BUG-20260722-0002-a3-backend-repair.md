# BUG-20260722-0002 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS**

本地后端已修复“集蛋作业确认交班”接口的权限语义错配。该结论仅代表源码、聚焦回归测试和 API 类型检查通过；在 CI/CD、生产环境 smoke test 与业务验收完成前，不宣称线上问题已解决。

## 来源问题

- Bug：`BUG-20260722-0002`
- Task：`BUGTASK-20260722-0002`
- 现象：作业台 → 集蛋作业 → 确认交班返回 HTTP 403
- 实际接口：`POST /api/packaging/terminal/shifts/:id/close`

## 诊断与根因

前端确认交班调用 `packagingApi.closeShift`，对应后端 `PackagingTerminalBffController.closeShift`。该端点原先仅声明：

```ts
@RequireMenu('MENU_PKG_OP', 'E')
```

系统同时为集蛋业务注册了原子菜单 `MENU_PROD_COLLECTION`。因此，拥有 `MENU_PROD_COLLECTION:E` 的集蛋作业人员若没有重复授予 `MENU_PKG_OP:E`，会被 `MenuGuard` 返回 `MENU_PERMISSION_DENIED`（HTTP 403）。这是接口权限声明与业务原子权限不一致，不是 SQL、表结构或 DataScope 问题。

任务上下文记录的 `ROLE_ADMIN` 在当前源码中由 `MenuGuard` 明确直通；因此无法仅凭附件上下文证明该次线上请求携带的 JWT 角色/权限快照与页面展示身份一致。生产 smoke 时必须核对真实响应子码和会话 token。

## 修复

仅对确认交班端点增加集蛋原子权限作为 OR 备选：

```ts
@RequireMenu('MENU_PKG_OP', 'E', ['MENU_PROD_COLLECTION'])
```

仍要求有效 JWT，且必须具备 `MENU_PKG_OP:E` 或 `MENU_PROD_COLLECTION:E`；没有移除守卫、没有通配放行，也没有修改 DataScope、审计或附件 ACL。

## 改动文件

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/api/src/modules/bff/bff.controller.spec.ts`
- `docs/ops/BUG-20260722-0002-a3-backend-repair.md`

## 验证

- 聚焦测试：`cd apps/api && ./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand` → **PASS**（1 suite，7 tests）
- API 类型检查：`cd apps/api && ./node_modules/.bin/tsc --noEmit` → **PASS**（exit 0，0 errors）
- 静态审计：确认改动只涉及指定端点的 `RequireMenu` 元数据，无 migration/schema/entity/table/column 改动。

## 发布条件

1. CI/CD 通过。
2. 使用真实集蛋作业角色验证确认交班不再返回 403，并确认无权限用户仍返回 403。
3. 使用报告中的管理员账号重新登录后复测，核对请求携带的 JWT 与 403 响应子码。
4. 完成生产 smoke 与业务方验收后，才可关闭 Bug。
