# G118 权限集 PBAC 两层模型（治理②）2026-06-15

> 启用已布线但空置的 sys_permission_set 体系。能力集 = 可复用的 菜单×操作 捆绑；
> 角色/用户由能力集组合。运行时解析早已在 auth.service 三路并集（role / role_set / user_set）。

## 关键认知

`auth.service.ts` 登录时已查三路喂 `resolvePermissions`（含 deny/scope/优先级）——
PBAC 引擎整条链路已就绪，G118 只补 **种子 + CRUD + UI**，不改解析器。

## G118-A（本阶段：种子 + 后端 CRUD）

**种子**（`migrations/20260615_g118a_permission_sets_seed.sql`）——顺带落地 G115 遗留两子任务：
- `PSET_SHAREHOLDER_READONLY` 股东权益只读（7 菜单仅 V）→ 配 宋雷/陈逸飞/薛刚（看数禁操作）。
- `PSET_PROCUREMENT_APPROVE` 采购审批（采购 申请/订单/付款 给 V,A）→ 配 王乐金。
- 用户直绑 `sys_user_permission_set`；受影响用户 perms_version+1。

**后端 CRUD**（`modules/permission-sets/`）`@Controller('api/permission-sets')`：
- GET `/` 列表（明细数/角色数/用户数）、GET `/:code` 详情（明细+菜单名+绑定角色/用户）
- POST `/`、PATCH `/:code`、DELETE `/:code`
- PUT `/:code/items` 覆盖明细
- POST/DELETE `/:code/roles/:roleCode`、`/:code/users/:userId` 绑定/解绑
- 任一变更后对受影响用户 perms_version+1（直绑 ∪ 经角色绑）。

验证：本地种子落库（2 集/10 明细/4 人）；解析链路冒烟（宋雷得 7 菜单 V、王乐金得采购 V,A）；API tsc 0 error。

## G118-B（下阶段：管理 UI）
- 系统设置加「权限集」页：能力集 CRUD + 明细（菜单×CRUD）编辑 + 绑定角色/用户。
- 角色编辑器、用户编辑器内嵌「分配能力集」。
