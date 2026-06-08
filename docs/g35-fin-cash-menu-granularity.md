# G35 · fin_cash 父子菜单粒度统一

## 一句话
G34 暴露的 A1 欠债延伸：后端 `fin-cash.controller.ts` 17 endpoint 全用父菜单 `MENU_FIN2_CASH`，前端 page.tsx 按子菜单（MASTER/VIEW/TXN）分流——前后端权限粒度不一致。G35 把 controller 改子菜单 + 老角色权限下沉 + 收回 G34 临时父菜单兜底。

## 审计

### 旧状态
- `apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts`
  - `const MENU = 'MENU_FIN2_CASH'`（父菜单）
  - 17 个 `@RequireMenu(MENU, 'V'|'C'|'E'|'A')` 全引用父菜单
- 前端 `apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx`
  - `usePermission('MENU_FIN2_CASH_MASTER')` / `usePermission('MENU_FIN2_CASH_TXN')` 分流按钮
- G34 临时补：`ROLE_MENGSAI_DONGPENG_TREASURER` 配 `MENU_FIN2_CASH:V,C` 兜底
- 子菜单 3 个（MASTER/TXN/VIEW），缺 `MENU_FIN2_CASH_TRANSFER`
- 6 老角色全在父菜单（ADMIN/CASH/FIN_ACCT/FIN_CFO/HQ_FINANCE/TREASURY_MANAGER），子菜单 0 配置

## 改造

### 1. 新建 `MENU_FIN2_CASH_TRANSFER`
| menu_code | menu_name_zh | parent_code |
|---|---|---|
| MENU_FIN2_CASH_TRANSFER | 资金转账 | MENU_FIN2_CASH |

### 2. controller 17 endpoint 细分映射

| Endpoint | 旧 | 新 |
|---|---|---|
| GET accounts | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_VIEW:V** |
| GET accounts/summary | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_VIEW:V** |
| GET accounts/:id | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_VIEW:V** |
| POST accounts | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_MASTER:C** |
| PATCH accounts/:id | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_MASTER:E** |
| POST accounts/:id/freeze | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_MASTER:E** |
| POST accounts/:id/unfreeze | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_MASTER:E** |
| POST accounts/:id/close | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_MASTER:E** |
| GET transactions | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_TXN:V** |
| POST transactions/manual | MENU_FIN2_CASH:C | **MENU_FIN2_CASH_TXN:C** |
| GET transfers | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_TRANSFER:V** |
| GET transfers/:id | MENU_FIN2_CASH:V | **MENU_FIN2_CASH_TRANSFER:V** |
| POST transfers | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_TRANSFER:C** |
| POST transfers/:id/submit | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_TRANSFER:E** |
| POST transfers/:id/approve | MENU_FIN2_CASH:A | **MENU_FIN2_CASH_TRANSFER:A** |
| POST transfers/:id/execute | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_TRANSFER:E** |
| POST transfers/:id/cancel | MENU_FIN2_CASH:E | **MENU_FIN2_CASH_TRANSFER:E** |

附带修正：`POST accounts` 原 `E` 不准（建账户语义是 C），改 `MASTER:C`。

### 3. 老角色权限下沉（防 regression）

| 角色 | 原父菜单 perm_codes | 下沉到 4 子菜单 |
|---|---|---|
| ROLE_ADMIN | V,C,E,D,A,X | 全继承（ADMIN 通常 isGlobal 直通） |
| ROLE_CASH | V,C,E | MASTER/TXN/TRANSFER 各 V,C,E；VIEW: V |
| ROLE_FIN_ACCT | V,C,E | 同上 |
| ROLE_FIN_CFO | V,C,E,A,X | MASTER/TXN/TRANSFER 各 V,C,E,A,X；VIEW: V |
| ROLE_HQ_FINANCE | V,C,E,X | MASTER/TXN/TRANSFER 各 V,C,E,X；VIEW: V |
| ROLE_TREASURY_MANAGER | V,C,E,X | 同上 |

### 4. 收回 ROLE_MENGSAI_DONGPENG_TREASURER 父菜单 C 兜底

`MENU_FIN2_CASH: V,C → V`（保留 V 让侧栏树展开父节点，但移除 C 兜底）

### 5. perms_version+=1

8 类角色用户（含 ADMIN、6 老角色、2 site 新角色）全部 token 失效，下次登录重算。

## 验证

### UAT 1: 王玮华核心功能

| 场景 | 期望 | 实测 |
|---|---|---|
| 登录后 fin_cash 权限 | 3 项（MENU_FIN2_CASH:V / TXN:V,C / VIEW:V） | ✅ |
| GET accounts | 200（VIEW:V） | ✅ |
| GET accounts/summary | 200 | ✅ |
| POST accounts | 403（无 MASTER 权） | ✅ MENU_PERMISSION_DENIED |
| GET transactions | 200 | ✅ |
| POST transactions/manual | 200 录入成功 | ✅ MAN-20260608-118550 |
| GET transfers | 403（无 TRANSFER 权） | ✅ |

### UAT 2: admin 回归

| Endpoint | 期望 | 实测 |
|---|---|---|
| GET accounts | 200 | ✅ |
| GET transfers | 200 | ✅ |
| GET transactions | 200 | ✅ |

老角色权限下沉后无 regression。

## 改动清单

- `apps/api/migrations/20260608_g35_fin_cash_menu_granularity.sql`（新建 TRANSFER 菜单 + 老角色子菜单权下沉 + 王玮华 C 兜底回收 + perms_version 递增）
- `apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts`（17 endpoint @RequireMenu 改子菜单 + 4 个新常量 MENU_VIEW/MASTER/TXN/TRANSFER）

## 留作 G36 的 F5 子任务

老 mig 重复重置欠债（如 `20260602_finance_authority_phase1_b_user_binding.sql` 每次 Deploy 重插王玮华旧角色）当前靠"新 mig 时间戳 > 老 mig"覆盖。长期治理需：

1. **CI lint**：deploy.yml 加 step 禁顶级 `/migrations/` 新增 SQL（强制走 `apps/api/migrations/`）
2. **sys_user_role.archived_at 列**：DELETE 不真删而 archived，老 mig INSERT 加 `WHERE NOT EXISTS (... archived_at IS NULL)` 守卫

## Tag

`v3-g35-fin-cash-menu-granularity`
