# RBAC 父权限清账审计报告 — 2026-06-27

> 批次：父权限→原子权限清账「下一批」（4 任务）。
> 执行方式：本会话无运行栈/无生产 DB 通道 → 采用**代码+seed 源头静态审计 + 并行只读子代理**（GUARDRAILS #57 允许并行只读诊断）。
> live 生产复核单列为 Gate（见末尾）。

## 0. 事实纠正

- 权限授权表实名 **`sys_role_menu_permission`**（列 `role_code` / `menu_code` / `perm_codes` 逗号分隔 `V,C,E,D,A,X`）。任务描述中的 `role_menu_permission` 不存在。证据：`apps/api/ddl/01_create_rbac_tables.sql:55-62`。
- main 近期 `fix(rbac): remove ... parent fallback` 系列改的是**代码层父权限兜底**（前端 `getVisibleMenu` / 后端 guard fallback），**不等于** seed 授权已清零。两者独立。

## 1. 范围与方法

- 6 个粗父菜单：`MENU_FIN2 / MENU_PRC2 / MENU_PRC2_MASTER / MENU_WORKFLOW / MENU_MASTER / MENU_SETTINGS_IT`（`ROLE_ADMIN` 豁免，可持有）。
- 原子替换映射：`scripts/ops/audit-role-permission-matrix.mjs:21-78`。
- guard 机制：
  - 前端：`usePermission(menuCode)` → `hasMenuPerm`（`apps/web/src/hooks/usePermission.ts:65`、`apps/web/src/contexts/AuthContext.tsx:93`）。
  - 后端：`@RequireMenu(menu, perm)` + `MenuGuard`（`apps/api/src/common/guards/menu.guard.ts:43,92`），权威源 = JWT.permissions（来自 `sys_role_menu_permission`）；`ROLE_ADMIN` 第 92 行直通。

## 2. 任务 1 — 粗父菜单是否清零（源头侧）

**结论：seed 源头仍存在约 60+ 条「非 ADMIN 角色 × 粗父菜单」授予，且无任何后续迁移 DELETE 撤销。**

| 粗菜单 | 非 ADMIN 残留角色数 | 严重度 |
|---|---|---|
| MENU_WORKFLOW | 25+（几乎全员） | 🔴 最高 |
| MENU_FIN2 | 17+ | 🔴 |
| MENU_PRC2 | 7+ | 🟠 |
| MENU_PRC2_MASTER | 7 | 🟠 |
| MENU_MASTER | 4（SYSOPS/FARM_MGR/HR_ADMIN/STORE_MGR） | 🟡 |
| MENU_SETTINGS_IT | 1（ROLE_SYSOPS） | 🟡 |

5 个目标角色全部命中。关键源头：`20260527_v2_menu_rbac_seed.sql:67-84,177-182,295-305`、`20260527_rbac_permission_fix.sql:37`、`20260531_role_runtime_phase_a.sql:53,115`、`20260602_finance_authority_phase1_c_menu_visibility.sql:19`。唯一触及目标角色的撤销 `20260609_g62` 只删运营越权，**不删粗 FIN2/WORKFLOW**。

**静态局限（必须明说）**：seed 为累积式（`ON CONFLICT` / `WHERE NOT EXISTS` + 局部 DELETE），且 g5a 注释明确「**DB 为权威，冲突保留 DB 值**」。纯静态不重放迁移、不查实库**无法 100% 断定最终生效态**。→ 须在生产跑 `scripts/ops/audit-role-permission-matrix.mjs` 查 `sys_role_menu_permission`（已单列 Gate）。可确证的是：迁移源头从未对这些组合下发撤销。

## 3. 任务 2 — 按角色最小权限精修（过宽原子包）

| 角色 | 过宽信号 | 建议收回 | 需业务确认 |
|---|---|---|---|
| **ROLE_FIN_ACCT** 🔴最严重 | 横跨 财务+采购+库存+门店+订单 5 域 | g5a 旧码 `MENU_FINANCE/INVENTORY/STORE/STORE_MGR/ORDERS/ORDER_MGR/WMS_VIEW/PROCUREMENT`（库存/门店/订单运营，与会计无关） | `MENU_PRC2_PAYMENT(V,C,E,X)` 会计录采购付款是否保留 |
| **ROLE_HQ_FINANCE** | 财务+股东+生产主数据 | 粗 `MENU_FIN2`；`MENU_MASTER_GRADE/PACKAGING/PRODUCT/SKU(V,X)` 生产主数据 | 股东写权 `SHAREHOLDER_MANAGE/CONTRIBUTION/SCOPE` |
| **ROLE_PRC_BUYER**（王乐金） | 采购+主数据+财务 | 粗 `MENU_PRC2/PRC2_MASTER`；`MENU_FIN2_AP(V)` 跨财务域 | `MENU_MD_MATERIAL(V,C,E)` 采购建/改物料是否下沉主数据中心（CLAUDE.md 约定6） |
| ROLE_FINANCE_REVIEW_MANAGER（刘杰） | 单一财务域，**最干净** | 仅粗 `MENU_FIN2` | 无明显越权 |
| ROLE_ADMIN | 豁免 | — | — |

每角色"建议最小集"明细见各子代理证据指针（§7）。

## 4. 任务 3 — 中心页卡片/按钮父权限残留（已清理）

**后端 9 个中心模块 controller：0 处引用粗父码**（精确正则零命中）——干净。
**前端仅 3 处残留**，全在 `Sidebar.tsx` 组头 perm，且对带 children 的组是**功能性死引用**（`getVisibleMenu` 只按子项原子 perm 过滤，组头 perm 从不被求值）。

⏸️ **建议修复·冻结期暂缓**（前端字符串字面量替换，已本地验证 web tsc 0 errors，但触发 freeze gate 故撤回，待解冻或 `ALLOW_FREEZE_TOUCH` 后落地）：

| file:line | 现状（粗码） | 建议（原子代表码） |
|---|---|---|
| `apps/web/src/components/layout/Sidebar.tsx:132` | `MENU_PRC2_MASTER` | `MENU_PRC2_DASHBOARD` |
| `apps/web/src/components/layout/Sidebar.tsx:168` | `MENU_FIN2` | `MENU_FIN2_DASHBOARD` |
| `apps/web/src/components/layout/Sidebar.tsx:194` | `MENU_WORKFLOW` | `MENU_WORKFLOW_TODO` |

行为不变（组在"任一子可见"时显示，组头 perm 不被求值），消除粗码字面量，对齐主数据/设置组头的干净写法。主数据中心、系统设置中心本就**零残留**。
**注**：`apps/web/**` 属冻结边界（`scripts/ci/check-freeze-boundaries.mjs`），本批不带应用代码改动，此 3 处归入"解冻后批次"。

## 5. 任务 4 — 五主体四向一致性矩阵（菜单/卡片/按钮/接口）

测试主体：王乐金(ROLE_PRC_BUYER)、刘杰(ROLE_FINANCE_REVIEW_MANAGER)、刘汉涛(ROLE_HQ_FINANCE+4副)、财务/高洋(ROLE_FIN_ACCT)、管理员(ROLE_ADMIN)。

**4 类系统性 drift：**

- **D1（高·系统性）** 侧菜单"任意 perm 位即显示" vs 后端"精确位拦截"。`Sidebar.tsx:295` + `AuthContext hasMenuPerm`（无 `permCodes` 即 true）。仅持 `X/A` 无 `V` 的项仍现于侧栏，进页 GET 一律要 `V` → 403。**对齐**：给页面入口型菜单项补 `requiredPerm:'V'`。
- **D2（高·系统性）** procurement v2 列表页**按钮零客户端 gating**（`procurement2/{orders,payments,requests,suppliers}/page.tsx` 无 `usePermission`），ROLE_PRC_BUYER（PAYMENT 仅 V）可见可点"新建付款单/确认付款",后端 403。与 finance 页 `usePermission().canCreate/canEdit` 真 gating 不一致。**对齐**：procurement 页统一引入 `usePermission`。
- **D3（高·数据·真实功能缺失）** `20260608_g35_fin_cash_menu_granularity.sql:34,52` 资金子菜单派生只含 6 角色，**漏掉 ROLE_FINANCE_REVIEW_MANAGER / ROLE_FINANCE_ANALYST** → 刘杰侧栏"资金账户/资金调拨"不显示、卡片不显示、`GET /api/v2/finance/cash/accounts`（要 `MENU_FIN2_CASH_VIEW:V`）403。三向"一致地全 deny"但**不符业务**（审核经理应能查资金）。**对齐**：补派生 `_VIEW`（见 §6 草案）。
- **D4/D6（中低·遗留）** 父码遗留 vs 子码控制器；legacy `MENU_FIN_*/MENU_PROCUREMENT/MENU_ORDERS` 死码残留 → 审计噪声。

ROLE_ADMIN 四层全直通（`auth.service.ts:195 permissions=['*']` + guard:92 + AuthContext + hasMenuPerm '*'），完全一致，无 drift。

**可执行实测清单（有运行栈时逐主体点验，18 条）**——节选：

- 王乐金：进"采购/付款管理"→"新建付款单"按钮**可见可点**(确认 D2)→ `POST /api/procurement/v2/payments` 持 buyer token **403**(C 缺)；`approve` 403(A 缺)；`GET /payments` 200。
- 刘杰：侧栏"财务管理"下**应缺"资金账户/资金调拨"**(确认 D3)；`GET /api/v2/finance/cash/accounts` **403**；应收/应付/费用卡片可见、审批按钮可用、`approve` 200。
- 刘汉涛：资金账户/调拨**应可见**(HQ_FINANCE+TREASURY 在 g35 名单)；`POST /cash/transactions/manual` 200；TREASURY 采购付款 `approve` 403。
- 高洋：cash-accounts"新建账户"按钮应可见(`usePermission('MENU_FIN2_CASH_MASTER').canCreate`)，对照 procurement 无 gating 验证 D2。
- admin：12 个一级菜单全显示；任意写/审批/导出接口全 200。

## 6. Gated 修复草案（**未执行**，需 Gate + 生产 DB 通道）

草案 SQL 见 `docs/ops/runs/rbac-parent-clearance-20260627/`（**故意不放 `apps/api/migrations/`**，避免生产 Deploy 自动执行）：

1. `01_coarse_menu_revoke_candidate.sql` — 对非 ADMIN 角色撤销 6 粗父菜单（任务1"清零"执行候选；含前置 audit + 备份 + rollback 说明）。
2. `02_d3_cash_submenu_derive_candidate.sql` — 修 D3：对 REVIEW_MANAGER/ANALYST 派生 `MENU_FIN2_CASH_VIEW`(+fund 的 `_TRANSFER`)。

前端 D1/D2 改造（补 `requiredPerm:'V'` / procurement 页 `usePermission` gating）属代码变更，建议作为**独立后续批次**（涉及多文件行为变化，需逐页核对），本批不动。

## 7. 证据指针（关键）

- seed 源头：`20260527_v2_menu_rbac_seed.sql:67-84,177-182,295-305`
- D3 根因：`20260608_g35_fin_cash_menu_granularity.sql:34,52`（仅 6 角色派生）vs `20260608_g23_*`（任意父码角色派生）
- 前端 guard：`apps/web/src/contexts/AuthContext.tsx:93-117`；`Sidebar.tsx:295-312`
- 后端 guard：`apps/api/src/common/guards/menu.guard.ts:43,92`；资金子码 `apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:30-33`
- 按钮 gating 对照：finance `apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx:721,795` vs procurement `apps/web/src/app/(admin)/procurement2/payments/page.tsx:265,334,340`
- 用户→角色：`apps/api/migrations/20260614_g115_user_role_refinement.sql:25-58`

## 8. 下一步 Gate

**`APPROVE_RBAC_COARSE_MENU_LIVE_AUDIT`** — 在生产以只读跑 `scripts/ops/audit-role-permission-matrix.mjs`（SSH 并发 1，PGCONNECT_TIMEOUT 5），用 live `sys_role_menu_permission` 确证 §2 的 60+ 残留是否实际生效，产出"实库残留清单"。该清单 + §6 草案 → 再走 `APPROVE_RBAC_COARSE_MENU_REVOKE_EXECUTION`（备份 → 撤销 → 复核），方可写库。

**红线**：本批未写 DB、未跑迁移、未部署、未 push main。前端 3 处清理仅前端代码、web tsc 0 errors。
