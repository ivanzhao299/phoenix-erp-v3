# G5-A · RBAC 双轨统一治理报告

完成时间：2026-06-06

## 1. 背景

### 1.1 双轨问题

Phoenix ERP V3 长期并存两套 RBAC 校验路径：

| 路径 | 数据源 | 校验时机 | 规模 |
|---|---|---|---|
| 静态 | `apps/api/src/common/guards/rbac.matrix.ts`（编译时） | MenuGuard 同步校验 | 1251 行 / 55 角色 / 759 单元 |
| 动态 | `sys_role_menu_permission` 表（运行时） | auth.service 登录时解析进 JWT | 730 行 / 44 角色 / 731 perm 记录 |

**问题**：MenuGuard 只读静态矩阵；**动态表的修改不生效**。这导致：
- 业务方在主数据中心 UI 给角色加权限"看似配好"但 endpoint 仍 403
- 自定义角色（如 `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR`）必拒
- 47% 权限单元在两边不重叠（参考 [`g5-a-rbac-audit.md`](./g5-a-rbac-audit.md)）

### 1.2 触发事件

2026-06-06 宋明光（孟赛蛋鸡场生产数据主管）配置后访问日产蛋入库、日报录入、库存查询等多个菜单 → 全部 `MENU_PERMISSION_DENIED`。

排查链：sys_role_menu_permission 已给他配 `MENU_FARM_DATA:V / MENU_PROD_INBOUND:V,C,E / ...` 24 条 → DB 配置正确 → **但 MenuGuard 走静态矩阵 → 必拒**。

## 2. 解决方案

### 2.1 策略：DB 优先 + 矩阵增量回填

| 数据类别 | 处理 |
|---|---|
| matrix only 单元（337）| INSERT NOT EXISTS 进 DB |
| DB only 单元（308）| 保留不动（自定义角色保持有效） |
| 冲突单元（54）| 保留 DB 值（业务方手动治理痕迹） |

### 2.2 关键审计发现

**冲突项不是"DB 改坏"，而是"DB 比矩阵更精细"**：

```
ROLE_HQ_FINANCE × MENU_FIN2_CASH    矩阵 V,X    →  DB C,E,V,X  （DB 加权）
ROLE_FARM_MGR  × MENU_BREEDING      矩阵 全权    →  DB C,E,V    （DB 收紧）
ROLE_CEO       × MENU_WORKFLOW      矩阵 A,V,X  →  DB 全权     （DB 加权）
```

业务方 manual 操作 DB 后的状态比代码里的矩阵更靠近真实需求 → 必须保留。

## 3. 实施清单

### 3.1 代码改动

| 文件 | 改动 |
|---|---|
| `apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql`（新）| 337 单元 INSERT + 自动备份表 |
| `apps/api/src/common/guards/menu.guard.ts` | 删 `hasMenuPermission` 静态校验调用；纯走 JWT.permissions |
| `apps/api/src/common/guards/rbac.matrix.ts` | 头注释标 deprecated；`hasMenuPermission` 改 stub 永远返 false |
| `scripts/g5a-rbac-audit.mjs`（新）| 审计脚本：diff matrix vs DB |
| `scripts/g5a-gen-seed.mjs`（新）| seed 生成器：matrix only → INSERT SQL |
| `docs/g5-a-rbac-audit.md`（新）| 审计原始报告 |
| `docs/g5-a-rbac-unified.md`（本文件）| 实施记录 |

### 3.2 MenuGuard 新流程

```
1. JWT 校验 (super.canActivate)
2. 写 CLS user 上下文
3. 读 @RequireMenu 元数据 (无 → 仅需登录)
4. 检查 menu_code 注册 (isMenuRegistered，仍读 rbac.matrix.ts；G5-A++ 会改读 sys_menu)
5. 唯一权威：JWT.permissions
   - '*' 通配 → 放行 (admin)
   - 'MENU_XXX:V,C,E' 匹配 → 放行
   - 否则 → 403 MENU_PERMISSION_DENIED
```

### 3.3 备份与回滚

mig 自动建 `_backup_sys_role_menu_permission_pre_g5a` 表（首次跑时备份，二次跑保留首次）。

回滚（仅 G5-A 影响范围）：

```sql
DELETE FROM sys_role_menu_permission p
USING _backup_sys_role_menu_permission_pre_g5a b
WHERE p.role_id = b.role_id AND p.menu_id = b.menu_id
  AND NOT EXISTS (
    SELECT 1 FROM _backup_sys_role_menu_permission_pre_g5a bb
    WHERE bb.role_id = p.role_id AND bb.menu_id = p.menu_id
  );
```

或全量恢复：

```sql
TRUNCATE sys_role_menu_permission;
INSERT INTO sys_role_menu_permission SELECT * FROM _backup_sys_role_menu_permission_pre_g5a;
```

## 4. 验证计划

### 4.1 自动（CI）

- TS 类型检查通过
- migration 在 CI 测试库跑通（sys_role_menu_permission 存在时 INSERT，不存在时跳过）
- breeding/sales/finance 回归测试不回归（用 `test_farm_mgr` 等老角色）

### 4.2 手动（部署后 SSH curl）

```bash
# 1. admin 持 '*' → 任何 endpoint 应 200
TOKEN=$(login admin)
curl -H "Authorization: Bearer $TOKEN" /api/lookup/companies
# expect: code=200, data:[...]

# 2. 宋明光持 MENU_FARM_DAILY:V,E → POST /daily-logs 应 200
TOKEN=$(login songmingguang)
curl -X POST -H "Authorization: Bearer $TOKEN" /api/v3/farm/daily-logs ...
# expect: code=200, msg="日报提交成功"

# 3. ROLE_FARM_MGR 等老角色 → 各业务 endpoint 应 200
TOKEN=$(login test_farm_mgr)
curl -H "Authorization: Bearer $TOKEN" /api/crud/brd_houses
# expect: code=200, data:[...]
```

## 5. 影响面 & 后续

### 5.1 立即生效

- 所有自定义角色（38 个 DB only）走 MenuGuard 即得到正确响应
- 老角色行为不变（matrix only 已物化到 DB，**未来覆盖** RBAC 漏洞）
- admin `permissions=['*']` 通配生效，超管不受影响

### 5.2 漏配的菜单守卫（已知）

- `isMenuRegistered` 仍读 `rbac.matrix.ts` → 新菜单需在矩阵 key 注册（仅 key 不读 perms）
- G5-A++ 后续：改读启动期缓存的 `sys_menu` 表，矩阵彻底退役

### 5.3 关联阶段

- **G5-B Lookup endpoint 范式化**：现在改 MasterDataSelectors 切到 `/api/lookup/*` 不再担心 MENU 守卫错配
- **G5-C 自动化非 ADMIN 巡检**：用 sys_role_menu_permission 作为真相基线 CI 跑
- **G5-D Scope 类型化**：与 RBAC 解耦，可独立推进

## 6. 风险已知

| 风险 | 缓解 |
|---|---|
| `isMenuRegistered` 仍读静态矩阵 → 新菜单漏注册会 NOT_REGISTERED | G5-A++ 改读 sys_menu；中期内每次加菜单同步改矩阵 |
| 现存用户 JWT 仍持旧 perms | 让用户重登（perms_version 不强制 bump 避免误踢） |
| 备份表占用 ~50KB 存储 | 业务确认稳定后可 drop |

## 7. 数据回到 G5-A 前

```
roles in matrix only DB:      55  →  55（不变）
matrix-only cells:           337  →  0（全部写入 DB）
DB only cells:               308  →  308（保留）
冲突 cells:                   54  →  54（保留 DB 值，待业务方决策）
sys_role_menu_permission 行数：730 → 1067 (730 + 337)
```

预期 g5a backfill mig 跑完 sys_role_menu_permission 行数 ≈ 1067。

---

**Tag**：`v3-g5-a-rbac-unified`
**关联**：[`g5-a-rbac-audit.md`](./g5-a-rbac-audit.md)
**Migration**：`20260606_g5a_rbac_matrix_backfill.sql`
