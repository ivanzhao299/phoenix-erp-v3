# 逐用户 RBAC × 页面生产烟测 — 最终报告

> task #27 · 2026-06-29 · 生产前最后一轮权限/数据域对齐
> 方法：本容器无 docker、无生产库，实时影子登录走全栈不可行 →
> 采用**与运行时同源的权威静态模型**：角色权限矩阵（seed 迁移）× 页面所需权限（前端 usePermission/Sidebar + 后端 @RequireMenu）× 数据域，逐角色交叉核对并对照 seeded `sys_menu` 目录验证。

---

## 1. 执法机制（坐实）

| 层 | 机制 | 关键事实 |
|---|---|---|
| 后端 | `MenuGuard` + `@RequireMenu(menu, perm, altMenus?)`（按 controller 挂，非全局 APP_GUARD） | 顺序：`@Public`→放行 → JWT 失败 401 → 无 @RequireMenu→仅登录 → **ROLE_ADMIN 直通** → 菜单未注册→403 `NOT_REGISTERED` → 权限位不足→403 `DENIED` → `*`/altMenus OR 命中→放行 |
| 注册表 | `menu-registry.service` 启动期 hydrate，**源=`sys_menu` 实表**（非空时整体替换；文件内 FALLBACK 仅当 sys_menu 空才生效） | **只存在于 FALLBACK 的菜单码在生产=死码** |
| /api/crud | 通用 CRUD 控制器仅 `AuthGuard('jwt')`，内部 `checkTableAccess()` 按 `tableToFallbackMenu()` 自判 + 注入 `store_code/site_code` 行级数据域 | FE 路由码 与 BE 表→菜单码 可能不一致（见 F9） |
| 前端 | admin layout `canAccessPath()` 对照 Sidebar 菜单树（最长前缀继承）+ 页面级 `usePermission` 控按钮 | **`canAccessPath` 对不在侧栏树的路由 fail-open**（仅 advisory，真执法在后端） |
| 数据域 | `data-scope.service`：`allowedCompanyCodes/ProjectCodes/WarehouseCodes`；ROLE_ADMIN/GROUP→isGlobal | GLOBAL_TABLES（wms_*/mst_*/product_*/sys_*）无行级 scope；跨公司驾驶舱页 `dataScopeApplied=false` 故意全集团 |

**registeredMenuCount = 171** 个 `sys_menu` 实表菜单码。

## 2. 规模

- 角色：**65** 个 seeded 角色（9 个 UAT 画像 + 50+ 迁移补建；真实生产用户按角色映射，RBAC 以角色为准，逐用户差异在数据域）。
- 页面：**227** 条路由（~150 PC + 28 mobile，含子路由）。
- 三层授权源（按迁移序）：DDL 基线矩阵 → V2 模块 seed + g5a backfill + 增量 delta → TS 原子菜单 seed/cleanup/repair。

## 3. 发现清单（按严重度，均已对 ground truth 核验）

| ID | 级别 | 类别 | 标题 | 影响角色 | 处置 |
|---|---|---|---|---|---|
| **F1** | critical | 403-unseeded | 整个 `/store-payment` 功能对非超管 403：5 个 `MENU_STORE_PAYMENT*` 从未写入 sys_menu，且**无任何角色授权** | CASHIER/STORE_MGR + 全体非超管 | **需决策**（见 §5） |
| **F2** | critical | 403-unseeded | 报销 `/finance2/reimbursements` 对非超管 403：`MENU_FIN2_REIMBURSE` 从未写入 sys_menu（仅 FALLBACK），既有 12 角色授权因缺菜单行静默失败 | 全体财务角色 | **✅ 已修**（本次迁移：补菜单行 + 重放 g5a 授权） |
| **F3** | high | scope-leak | 公司绑定的 ROLE_PRC_BUYER 对集团共享供应商主数据有**写**权（C,E,X，无行级 scope）+ 跨公司采购看板 | PRC_BUYER | 需决策 |
| **F4** | high | scope-leak | 单场区 ROLE_FARM_CASHIER 可达跨公司集团驾驶舱 `/dashboard`（dataScopeApplied=false） | FARM_CASHIER | 需决策 |
| **F5** | high | role-access-gap | `/breeding/daily-inbound` 半破：页 GET source/mode 需 `MENU_INV_SOURCE_MODE:V`，FARMER/FARM_MGR 未授 | FARMER, FARM_MGR | **✅ 已修**（补 :V 只读） |
| **F6** | medium | fe-fail-open | `MENU_SALES2_DASHBOARD` 被 FE Sidebar/home 引用但**从未 seeded、无后端执法**；/sales2 实由 SALES2_ORDER/analytics 控制器服务 | （FE 门禁失效，BE 用别码） | 需决策 |
| **F7** | medium | role-access-gap | ROLE_FIN_ACCT 缺 FIN2 核心菜单：无 MENU_FIN2_AR（→/finance2/ar 403）、无 MENU_FIN2_EXPENSE（→/expenses 403）、MENU_FIN2_AP 仅 V（不能建 AP） | FIN_ACCT | 需决策（取决于会计职责边界） |
| **F8** | medium | scope-leak | 场区绑定 ROLE_FARM_MGR 被授集团采购看板 + 供应商主数据（view） | FARM_MGR | 需决策 |
| **F9** | low | menu-drift | `/breeding/henhouse|immune|medicine` FE usePermission 码 与 BE /api/crud 表→菜单码不一致（brd_houses→FARM_MASTER、brd_vaccinations/medications→FARM_DATA） | 窄域角色潜在（VET 当前持 FARM_DATA 故今日不破） | 需决策 |
| **F10** | low | mobile-no-gate | (mobile) layout 仅强制登录；delivery/expenses/workflow/notifications 无 MobilePermissionGate（后端端点**有**守卫，仅 FE 壳可见，非数据泄漏） | 任意登录手机用户（仅 UX） | 可后补 gate |
| **F11** | — | resolved | **假警**：所有 workflow 读端点均有守卫；MENU_BREEDING / FIN2_CASH_MASTER·VIEW·TXN / PROD_INBOUND / INV_SOURCE_MODE / SALES2_INVENTORY+INV_BATCH(altMenu) / MD_BUSINESS_UNIT / SHAREHOLDER_* / PRC2_ORDER 均正确 seeded；MENU_ANALYTICS 未 seeded 但仅作 MENU_DASHBOARD 的 OR-altMenu，非破障 | 无 | 无需动作 |

## 4. 逐角色可达性结论（核验角色）

`corePagesOK=true`（核心页可用，无 403 破障）：ROLE_ADMIN、CEO、FARM_MGR\*、VET、BREEDER、PKG_MGR、PKG_OP、WMS_OP、WMS_MGR、QA_MGR、QA_STAFF、FIN_CFO、PRC_BUYER\*、SALES_REP、SALES_MGR、LOG_MGR、DRIVER、FACTORY_MGR（\* 带越权项见 F3/F8）。

`corePagesOK=false`（有核心页破障）：
- **ROLE_CASHIER / ROLE_STORE_MGR** — `/store-payment` 全破（F1，授权无法补，须先 seed 菜单）。
- **ROLE_FIN_ACCT** — /finance2/ar、/expenses 403，/ap 不能建（F7）。
- **ROLE_FARMER** — /breeding/daily-inbound 半破（F5，**已修**）。
- **ROLE_FARM_CASHIER** — /finance2/cash-accounts 账户主档 tab 缺 CASH_MASTER:V（流水 tab 正常）；+ /dashboard 越权（F4）。

越权（可达 `dataScopeApplied=false` 集团页）：PRC_BUYER（F3，含写）、FARM_MGR（F8）、FARM_CASHIER（F4）。

## 5. 本次已落地修复

迁移 `1782710000000-FixReimburseMenuAndSourceModeGrants.ts`（纯 RBAC 配置 DML，幂等，含 down()，过 g197-H 豁免 / down 门禁）：
- **F2**：`INSERT MENU_FIN2_REIMBURSE` 进 sys_menu（列形对齐 FIN2 兄弟）+ 重放 g5a 既定 12 角色报销授权矩阵（恢复既定意图，非新授权）。
- **F5**：补 `MENU_INV_SOURCE_MODE:V` 给 FARMER/FARM_MGR（只读，A 切换仍受限）。

验证：API tsc 0 errors；TS 迁移 down() 门禁 ✅；no-data-DML 门禁 ✅（文件级 @allow-data-dml 豁免）。

## 6. 待你拍板（needs-decision，均涉财务/跨公司/职责边界，不宜盲目授予）

1. **F1 `/store-payment`（critical）**：需 seed 5 个 `MENU_STORE_PAYMENT*` 进 sys_menu + 授权。建议默认：CASHIER = PAYMENT/ACCOUNT 的 V,E；STORE_MGR = 再加 CONFIRM/VOID/EXPORT 的 A,X。**确认即补迁移**。或若该功能尚未上线则先从 Sidebar 摘除入口。
2. **F3 PRC_BUYER 写集团供应商主数据**：建议降为 V（只读浏览供选单），撤 C,E,X；采购建主数据应走主数据中心。
3. **F4 / F8 场区角色可见集团驾驶舱**：建议给 `/api/dashboard/kpi`、采购看板加数据域，或撤 FARM_CASHIER 的 MENU_DASHBOARD、FARM_MGR 的 MENU_PRC2_DASHBOARD。
4. **F7 FIN_ACCT 子账职责**：是否授 MENU_FIN2_AR(V,C)/MENU_FIN2_EXPENSE(V,C)/MENU_FIN2_AP(+C)？取决于会计 vs CFO 的分账职责。
5. **F6 MENU_SALES2_DASHBOARD**：seed 真菜单并授销售/高管，或把 Sidebar /sales2 改指向已 seeded 的 MENU_SALES2_ORDER。
6. **F9 FE/BE 菜单码对齐**：统一 generic-crud `tableToFallbackMenu()` 与 FE usePermission（brd_vaccinations/medications→FARM_VET、brd_houses→FARM_MASTER）。属纵深加固（后端已兜底），可批量。
7. **F10 手机端 MobilePermissionGate**：给 delivery/expenses/workflow/notifications 补 gate（UX 一致性；后端已守卫）。

## 7. i18n 阶段顺带捞出的「中文当后端值」隐患（独立于 RBAC，待核）

- `mobile/delivery/receipt` `setExceptionType('缺货')` 发中文而非 `SHORTAGE` 码；
- `mobile/*` 养殖页 `SHIFTS '早班'/'晚班'`、`WHOLE_FARM '全场'` 作后端值；
- `mobile/*` 采购页 `unit:'件'`、`reason:'常规采购补货'` 作后端默认值。

建议下一轮统一改为字典码/枚举码，避免多语言切换后写入脏数据。
