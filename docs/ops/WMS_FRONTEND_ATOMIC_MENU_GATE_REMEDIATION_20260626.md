# WMS Frontend Atomic Menu Gate Remediation - 2026-06-26

## 背景

用户要求全局解决角色权限混乱、菜单门禁不准确、颗粒度不够等问题：无权限的子菜单和按钮不应展示，有权限的功能应正常展示和使用。

## 发现

库存/WMS 多个前端页面仍使用 `ROLE_ADMIN / ROLE_WMS_MGR / ROLE_FIN_CFO` 等角色名硬编码控制按钮。这会导致：

1. 用户拥有菜单原子权限但角色名不在白名单时，按钮不显示。
2. 用户角色名在白名单但菜单权限未授权时，按钮错误显示，点击后再被后端拒绝。
3. 前后端门禁语义不一致，造成“无权限字段/按钮透传”。

## 修复范围

修改：

- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
- `apps/web/src/app/(admin)/warehouse/outbound/page.tsx`
- `apps/web/src/app/(admin)/warehouse/transfer/page.tsx`
- `apps/web/src/app/(admin)/warehouse/stocktake/page.tsx`
- `apps/web/src/app/(admin)/warehouse/loss-report/page.tsx`

## 修复内容

1. 移除 WMS 页面内的角色硬编码按钮判断。
2. 改用 `useAuth()` 的原子权限：
   - `canCreate('MENU_WMS_INOUT')`
   - `canEdit('MENU_WMS_INOUT')`
   - `canDelete('MENU_WMS_INOUT')`
   - `canApprove('MENU_WMS_INOUT')`
   - `canExport('MENU_WMS_INOUT')`
3. 新增、编辑、删除、审核、扫码确认、导出按钮均按菜单权限显示或隐藏。
4. 操作回调中也加入同样权限保护，避免仅隐藏按钮不足。

## 安全边界

- 未修改后端。
- 未修改数据库。
- 未执行 migration。
- 未改变 WMS API。
- 未放宽任何权限。

## 验证

- Web typecheck：PASS。
- W5 closeout gate：待本批提交前执行。

## 结论

GO WITH CONDITIONS。

本批消除 WMS 高频页面的前端角色硬编码残留，使前端操作门禁与动态菜单权限矩阵对齐。后续仍需继续审计移动端 dashboard、终端页和老页面中的角色硬编码展示逻辑。
