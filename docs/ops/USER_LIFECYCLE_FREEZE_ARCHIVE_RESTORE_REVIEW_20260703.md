# User Lifecycle Freeze / Archive / Restore Review

## 背景

用户管理此前只有基础冻结 / 解冻能力：

- `ACTIVE` 映射 `sys_user.status = 1`
- `FROZEN` / `INACTIVE` 映射 `sys_user.status = 0`
- 前端仅提供冻结 / 解冻按钮

缺口：

- 没有用户归档态。
- 没有恢复归档入口。
- BFF `/api/users/**` 用户状态变更未完整进入操作审计。
- 冻结接口未 bump `perms_version`，旧会话存在延迟失效风险。
- 后端缺少自冻结、特权账号、最后有效管理员保护。

## 本次实现

### 生命周期状态

采用非物理删除模型：

| 状态 | DB 值 | 含义 |
| --- | ---: | --- |
| ACTIVE | 1 | 可登录、可参与权限计算 |
| FROZEN | 0 | 临时冻结，不可登录 |
| ARCHIVED | -1 | 归档保留历史引用，默认不在日常列表显示，不可登录 |

恢复归档不直接启用账号，而是恢复到 `FROZEN`，由管理员再次人工解冻后才可登录。

### DB 迁移

新增迁移：

- `apps/api/src/database/migrations/1782730000000-AddSysUserArchiveLifecycle.ts`

新增字段：

- `sys_user.archived_at`
- `sys_user.archived_by`
- `sys_user.archive_reason`

新增约束：

- `chk_sys_user_status_lifecycle CHECK (status IN (-1, 0, 1))`

新增索引：

- `idx_sys_user_status`
- `idx_sys_user_archived_at`

### 后端接口

更新：

- `PUT /api/users/:id/status`
- `PUT /api/system/users/:id/status`

新增：

- `PUT /api/users/:id/archive`
- `PUT /api/users/:id/restore`
- `PUT /api/system/users/:id/archive`
- `PUT /api/system/users/:id/restore`

保护规则：

- 禁止冻结 / 归档当前登录账号。
- 禁止冻结 / 归档 `admin` 系统特权总控账号。
- 禁止冻结 / 归档最后一个有效 `ROLE_ADMIN`。
- 归档用户不能直接启用或冻结，必须先恢复归档。
- 归档用户除恢复外，不允许改基本信息、角色、角色授权或密码。

会话规则：

- 冻结 / 解冻 / 归档 / 恢复均 bump `perms_version`。
- JWT 校验每次核对 `sys_user.status` 与 `perms_version`。
- 冻结或归档用户的既有 token 立即失效。

### 操作审计

更新 `OperationLogInterceptor`：

- 覆盖 `/api/users/:id/status`
- 覆盖 `/api/users/:id/archive`
- 覆盖 `/api/users/:id/restore`
- 覆盖 `/api/users/:id/roles`
- 覆盖 `/api/users/:id/role-visibility`
- 覆盖 `/api/users/:id/password`
- 保留 `/api/system/users/**`

### 前端

更新：

- `apps/web/src/app/(admin)/settings/users/page.tsx`
- `apps/web/src/app/(admin)/settings/users/[id]/page.tsx`

能力：

- 默认筛选为“在管账号”，隐藏归档用户。
- 可切换“全部（含归档）”与“已归档”。
- 列表页支持归档、恢复归档、冻结、解冻。
- 详情页支持归档、恢复归档、冻结、解冻。
- 归档用户详情页进入只读，禁止继续编辑角色、组织、门店与密码。
- 恢复归档后提示进入冻结态，需要再次解冻。

## 验证

已执行：

- API typecheck: PASS
- Web typecheck: PASS

命令：

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
```

## 风险与后续

需要在目标环境执行新增 TypeORM migration 后，前端和 API 才可读取归档元数据字段。

建议后续补充：

- 用户归档前引用检查扩展到审批待办、负责人字段、用户数据域绑定。
- 增加用户生命周期操作的 E2E smoke。
- 在用户列表增加归档原因和归档时间的详情浮层。

## 结论

当前用户冻结 / 归档 / 恢复已补齐为可审计、可恢复、非物理删除的生产级生命周期闭环。
