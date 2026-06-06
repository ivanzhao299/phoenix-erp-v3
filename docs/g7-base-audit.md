# G7 · 全栈底座自测 + 漂移收口报告

完成时间：2026-06-06

## 1. 审计范围

针对 G6 RBAC 清理后做全栈自测，重点：
- 用户 / 角色 / 组织 / 权限关联完整性
- G5/G6 代码改动是否有死引用 / 漂移
- 前后端命名一致性

## 2. 关键发现

### 2.1 用户组织绑定 — **23/41 active 用户孤儿**（57% 缺失）

SSH 实测：

```
sys_user 41 active 用户
sys_user_role 关联：42 行 ✓
sys_user_orgs 关联：仅 18 个用户 ✗
孤儿用户：23 个
```

**孤儿用户分类**（含角色）：

| 类型 | 数量 | 用户示例 | 处理 |
|---|---|---|---|
| ALL 集团管理类 | 10 | admin / xuefeng (WMS_MGR) / 2 个 REGION_MGR | → ORG-GROUP (id=9) |
| PILOT-MS + STORE-MS 孟赛 | 8 | pilot_* 7 个 + chenling | → SITE-MENGSAI-LAYER (id=18) |
| STORE-VTE/BLX/HSI/SYB 门店 | 6 | store_mgr1 / cashier / alue / 等 | → 暂绑 ORG-GROUP，业务方调 |

**影响**：DataScopeService 解析 → fallback 到 storeCode 字段 → 跨站点漂移风险。

### 2.2 死引用扫描

| 文件 | 死引用 | 处理 |
|---|---|---|
| `Sidebar.tsx:265` | 注释 "ROLE_MENU_MATRIX 匹配" | ✅ 改为 JWT.permissions 描述 |
| `inventory-source.controller.ts:54` | 注释 "rbac.matrix 中..." | ✅ 改为 sys_role_menu_permission |
| `MasterDataSelectors.tsx:11` | 注释 "复用 G3-A /master-data/runtime/..." | ✅ 改为 G5-B/G7 数据源说明 |
| `apps/api/dist/common/guards/rbac.matrix.js` | 编译产物 | ⏭ CI rebuild 自然覆盖 |
| `apps/web/.next/*` | dev 缓存 | ⏭ pnpm dev 重启自然清理 |

### 2.3 migration / scripts 历史引用（保留）

| 文件 | 内容 | 处理 |
|---|---|---|
| `migrations/*.sql` (10+) | 历史 menu seed mig 注释 | ✅ 保留作为变更记录 |
| `scripts/g5a-*.mjs` | G5-A 审计 / seed 生成器 | ✅ 保留作为 SOP 工具 |
| `menu-registry.service.ts` | 注释提及 rbac.matrix | ✅ 保留（说明来历）|

## 3. 实施改动

### 3.1 文档 / 注释收口

- `Sidebar.tsx` 权限检查注释更新（删 ROLE_MENU_MATRIX 提法）
- `inventory-source.controller.ts` RBAC 提法收口
- `MasterDataSelectors.tsx` 数据源说明更新到 G5-B/G7

### 3.2 孤儿用户分配

`migrations/20260606_g7_assign_orphan_users_org.sql`：
- 3 段 `INSERT NOT EXISTS` 守卫，幂等
- 23 个孤儿用户全部分配 sys_user_orgs 记录
- 业务方可在主数据中心调整到精细组织

### 3.3 巡检脚本扩展

`scripts/g5c-rbac-audit.sh`：
- 新增 `/api/sys/menu-registry/stats` 端点检查（G6 新功能）

## 4. 收口后基础底座状态

```
用户：    sys_user 41 active
角色：    sys_user_role 42 → 100% 用户有角色 ✓
组织：    sys_user_orgs 18 → 41（mig 跑后）→ 100% 用户有组织 ✓
权限：    sys_role_menu_permission 883 行（G5-A backfill）✓
菜单：    sys_menu 118 行（启动期 hydrate）✓
DataScope: 所有用户可解析有效范围 ✓
RBAC 守卫：MenuGuard / generic-crud / DataScopeGuard 全栈一致 ✓
```

## 5. 漂移防回归措施

- G5-C 巡检 CI 跑（13 项 → G7 后 14 项含 menu-registry/stats）
- TABLE_PERM_MAP @deprecated 注释提示新表走 fallback
- menu-registry.service 内联 FALLBACK 不依赖 rbac.matrix.ts
- 文档明确指向："业务方加菜单 / 加用户 / 加组织"全部走主数据中心 UI

## 6. 未做（明确留下）

| 项 | 原因 |
|---|---|
| STORE-VTE/BLX/HSI/SYB 6 用户的精细 SITE 映射 | 业务上不清楚对应 SITE，留主数据中心 UI 由业务方分配 |
| `apps/api/dist/common/guards/rbac.matrix.js.map` | CI 重建后自动覆盖 |

## 7. 验证

- ✅ tsc 双端 0 errors
- ⏳ 部署后跑 G5-C 巡检 14/14 应通过
- ⏳ SSH 跑 mig 后查 orphan count 应 = 0

---

**Tag**：`v3-g7-base-audit`
**Migration**：`20260606_g7_assign_orphan_users_org.sql`
**改动**：4 文件 + 1 mig + 1 文档
