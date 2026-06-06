# G6 · RBAC 模块收紧打磨报告

完成时间：2026-06-06

## 1. 目标

把 G5 系列遗留的 RBAC 技术债彻底清理，形成最轻量、无漂移、整洁的 RBAC 模块。

## 2. 改动概览

### 2.1 代码量对比

| 文件 | G5 前 | G6 后 |
|---|---|---|
| `rbac.matrix.ts` | 1267 行 | **❌ 删除** |
| `menu.guard.ts` | 79 行 | 88 行 |
| `menu-registry.service.ts` | 55 行 | 100 行（内联 fallback snapshot） |
| `permissions.util.ts` | – | 58 行（**新**） |
| `menu-admin.controller.ts` | – | 35 行（**新**） |
| **核心 RBAC 总计** | **~1400 行** | **281 行（-78%）** |

### 2.2 文件清单 & 职责

```
apps/api/src/
├── auth/
│   ├── permissions.util.ts       ✨ G6 新增：JWT perms 解析（hasPerm/getMenuPerms）
│   ├── permissions-resolver.ts   ✅ 保留：登录时三路合并算法
│   └── jwt.strategy.ts           ✅ 保留
│
├── common/guards/
│   ├── menu.guard.ts             ✨ G6 重写：纯动态 + 统一 util
│   ├── menu-registry.service.ts  ✨ G6 重写：内联 fallback snapshot，删 rbac.matrix.ts 依赖
│   └── rbac.matrix.ts            ❌ G6 删除（1267 行 → 0）
│
└── modules/product-master/controllers/
    └── menu-admin.controller.ts  ✨ G6 新增：POST /reload + GET /stats
```

## 3. 改动详情

### ❌ 删除 `rbac.matrix.ts`（1267 行）

- `ROLE_MENU_MATRIX` 1232 行权限数据 — G5-A 改 MenuGuard 切动态后已 0 调用，仅 menu-registry 用 keys
- `hasMenuPermission()` stub — 永远返 false，0 调用
- `isMenuRegistered()` — 已迁到 menu-registry.service.ts

### ✨ 新增 `auth/permissions.util.ts`

统一 JWT permissions 字符串解析逻辑，消除 menu.guard 与 generic-crud 的两处复制：

```ts
hasPerm(permissions, menuCode, requiredPerm): boolean
getMenuPerms(permissions, menuCode): Set<PermCode>
```

`PermCode` 类型 + `ALL_PERM_CODES` 常量同步集中到此文件。

### ✨ 重写 `menu-registry.service.ts`

- 内联 `FALLBACK_MENU_CODES: readonly string[]`（115 个 menu_code snapshot 提取自 G5-A 前矩阵）
- 默认初始化与兜底都用同一常量，不再依赖 rbac.matrix.ts
- 新加 `rehydrate` export 别名

### ✨ 新增 `MenuAdminController`

```
GET  /api/sys/menu-registry/stats   — 调试：当前 Set 大小 + 数据源
POST /api/sys/menu-registry/reload  — 业务方新增菜单后即时刷新
```

业务方通过主数据中心 UI 加菜单后，调 reload 立即生效，无需重启 API 服务。

### ⚠️ 标 `@deprecated` TABLE_PERM_MAP（generic-crud/crud.constants.ts）

`generic-crud.controller` 的 RBAC fallback（按 menu_code 映射）已能完整替代硬编码白名单。
TABLE_PERM_MAP 暂保留向后兼容，G6+ 1 月观察期后整段删除。

新业务不要往这里加表 — 加在 `tableToFallbackMenu()` 即可。

### ✨ `menu.guard.ts` 重写

- 删除注释漂移（之前提"isMenuRegistered 仍读 rbac.matrix.ts"已过时）
- RBAC 检查改用 `hasPerm()` util
- 流程缩到 6 步清晰分支

### ✨ `generic-crud.controller.ts` 改造

- RBAC fallback 改用 `hasPerm()` util，删除重复的 split/map 逻辑
- 注释指向 G6 收紧

## 4. 受影响调用

| 文件 | 行为变化 |
|---|---|
| 所有 `@RequireMenu` endpoint | 性能微增（util 一次 find + split，复杂度不变 O(n)） |
| `/api/crud/*` | RBAC fallback 同步切 util；与 MenuGuard 完全同源 |
| `MenuAdminController` 调用方 | 新增端点：业务方加菜单可直接 reload |

## 5. 验证

- TS 类型检查 0 errors（apps/api/apps/web 双端）
- G5-C 巡检脚本 13/13 应继续 PASS（无业务行为变化）
- menu-registry fallback snapshot 含 115 个 menu_code（覆盖所有现存业务路径）

## 6. 风险

| 风险 | 缓解 |
|---|---|
| sys_menu 表读取失败时 fallback snapshot 落后 | snapshot 是 2026-06-06 快照；业务方新增菜单 6 月后需更新该常量（罕见） |
| MenuAdminController reload endpoint 未授权访问 | 守 `MENU_SYS_MENU:E` — 仅管理员 |
| TABLE_PERM_MAP 1 月后删除回归风险 | G5-C 巡检 + 真实测试用户矩阵自动验证 |

## 7. 后续

- 1 月：监控 TABLE_PERM_MAP 是否完全冗余，确认 0 漏后整段删除
- 长期：JWT storeCode / store_code 双命名统一（G5-D++ 一起做）

---

**Tag**：`v3-g6-rbac-cleanup`
**删除**：1267 行
**新增**：93 行（permissions.util.ts + menu-admin.controller.ts）
**净瘦**：~1100 行 / RBAC 模块 78%

**核心 RBAC 文件**：4 个（menu.guard + menu-registry + permissions.util + menu-admin），总 281 行
