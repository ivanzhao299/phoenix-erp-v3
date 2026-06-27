<!-- 由 naming-style-unification-audit 工作流(wf_34627c5e-ab9, 7 agents)2026-06-27 生成 -->

# 命名 / 模块 / 样式统一 — 整改计划（六域审计合成）

> 合成自 6 份只读分域审计：RBAC 原子码授权、Next.js 路由命名、前端组件复用、页面样式基线、后端 API path 规约、前后端 menu_code 一致性。
> 所有问题已按严重度排序、跨域去重，并打包成可独立 review+部署的批次。
> **总计**：去重后 27 个独立问题 → 9 个整改批次。其中 3 批为高回归风险（动 RBAC 授权 / 动全局组件 / 动路由守卫），列于最前并要求强制 code-review + 冒烟。

---

## 一、总览：严重度分布与跨域去重

| 严重度 | 数量 | 主题聚类 |
|--------|------|----------|
| **P0** | 3 | 选择器同名异源（绕过 ACTIVE 铁律）、mobile 全量绕过 shared-selectors、`.phx-*` 基线 0% 采用 |
| **P1** | 9 | RBAC MENU_MD_* 原子码授权缺口、前后端 menu_code 漂移×2、路由硬冲突×2、lookup/projects 多入口、遗留 /master/* 孤儿树、组织/字典双入口、DataTable/KpiCard 三套、finance2 硬编码 hex |
| **P2** | 10 | menu_code 半拆分非对称×2、procurement v1/v2 共存、版本规约缺失、DTO 不一致、死页/死链、抽屉/对话框多套、reimbursements 混样式、采购页第三套样式、缺 PageHeader |
| **P3** | 5 | 命名风格三套、死码清理、inline style 热点、门户硬编码 accent、store-payment 子码门控盲点 |

**跨域去重的关键合并项**（同一根因被多份审计独立命中）：

1. **MENU_MD_* 系统性漏 seed/漏授权** = RBAC 审计 finding#2 + menu_code 一致性审计的「MENU_MD_CENTER 类漂移」同源 → 合并入 **Batch 1**。
2. **`/master/*` 遗留树孤儿** = 路由审计 finding#1 + 样式审计「master/orgs 缺 PageHeader」+ 后端「api/master 无版本」三处指向同一废弃域 → 合并入 **Batch 4**。
3. **选择器同名异源 + mobile 绕过 ACTIVE** = 组件审计 finding#1/#2 + 样式审计「裸 select」+ 后端「api/lookup/* 重复层」四处共指「绕过 runtime/active」→ 合并入 **Batch 3**。
4. **finance2 硬编码 hex/Tailwind 数字色阶** = 样式审计 finding#2/#3/#4/#5 全在 finance2 → 合并入 **Batch 7**。
5. **menu_code 父/子码非对称（AR/AP/EXPENSE）** = menu_code 一致性 finding#3/#4 同模式 → 合并入 **Batch 2**。

---

## 二、分域问题表（按严重度，含证据锚点）

### P0（阻断 / 铁律违反 — 静默错用风险）

| # | 问题 | 域 | 证据锚点 | 批次 |
|---|------|----|----------|------|
| P0-1 | `design-system/forms` 自带 CompanySelector/ProjectSelector/UserSelector/StatusSelector，与钦定 shared-selectors 同名异源、无 ACTIVE 过滤，从 barrel import 极易误用 | 组件 | `design-system/index.ts:51,55`；`MasterDataSelectors.tsx:82-516` | **3** |
| P0-2 | 全部 mobile 页 0 复用 shared-selectors，手写 `<select>` + `fetch('/api/lookup/*')` 绕过 ACTIVE | 组件 | `mobile/prc-order/page.tsx:82,208-210`；`mobile/prc-request/page.tsx:666` | **3** |
| P0-3 | `.phx-*` 文档基线在 admin 页 0% 采用，文档与实现脱节，新人按文档写落空 | 样式 | `globals.css:383-589`；grep `className=.phx-` = 0 admin 文件 | **6** |

> 注：P0-3 不是回归风险，是「基线决策」类——需先定标杆（cockpit-styles vs .phx-*），故归入相对靠后的 Batch 6（决策批），但严重度保留 P0 以提示其影响新增代码方向。

### P1（高 — 看得见按钮但 403 / 路由静默覆盖 / 数据漂移）

| # | 问题 | 域 | 证据锚点 | 批次 |
|---|------|----|----------|------|
| P1-1 | 持 MENU_MASTER_DATA 角色缺约 15 个 MENU_MD_* 原子授权 → 主数据中心多数实体 403 | RBAC | `master-data-center.controller.ts:99-109`；`permissions.util.ts:26-39`；g5a:176,272,277 | **1** |
| P1-2 | MENU_FIN_AUDIT：Sidebar 用它门控 /dashboard，后端 /dashboard 用 MENU_DASHBOARD → 互斥 403/不显示 | menu一致 | `Sidebar.tsx:76`；`bff.controller.ts:16,632`；`dashboard/page.tsx:42` | **1** |
| P1-3 | MENU_FARM_FEED：饲喂保存按钮用它，后端保存接口用 MENU_FARM_DATA → 按钮亮但 403 | menu一致 | `breeding/feed/page.tsx:73`；`farm-feed.controller.ts:55` | **1** |
| P1-4 | 硬冲突：两个 controller 都注册 `api/v3/iot/devices` + `@Get('all-summary')`，一个静默覆盖 | 后端 | `iot-v3.controller.ts:12,25`；`mon-device.controller.ts:8,17`；`iot.module.ts:13-14` | **5** |
| P1-5 | 硬冲突：两个 StocktakeController 都注册 `api/stocktake`（terminal + wms），同名类 | 后端 | `terminal/stocktake.controller.ts:8`；`wms/inventory.controller.ts:8` | **5** |
| P1-6 | `api/lookup/*` 与 master-data/runtime/crud 重复同资源下拉层，无 canonical | 后端 | `lookup.controller.ts:23,146,227,249...` | **3** |
| P1-7 | `projects` 经 5 个 controller / 3 张表（biz_/prc2_/shr_projects）暴露 | 后端 | `biz-projects.controller.ts:22`；`procurement-v2/projects.controller.ts:16`；`shareholder.controller.ts:35` | **8** |
| P1-8 | 遗留 `/master/*` 整套与 `/master-data/*` 重复且基本孤儿；breeding 还跳 `/master/farms` 第二编辑入口 | 路由 | `Sidebar.tsx:220-248`；`breeding/page.tsx:582`；`middleware.ts`/`layout.tsx` | **4** |
| P1-9 | 组织架构双入口：`/settings/organizations` vs `/master-data/organizations` | 路由 | `Sidebar.tsx:222`；`settings/page.tsx:39` | **4** |
| P1-10 | 字典双入口：`/settings/dict` vs `/master-data/dictionaries` | 路由 | `Sidebar.tsx:239`；`dictionaries/page.tsx:234` | **4** |
| P1-11 | 三套 DataTable + 类型名 Column/DataTableProps 跨文件重名，易 import 错 | 组件 | `DataTable.tsx:11`；`data-table/DataTable.tsx:10,19`；`DataTableV3.tsx:23` | **9** |
| P1-12 | 两个同名 KpiCardV2.tsx，prop API 不兼容，一个 barrel 未导出 | 组件 | `design-system/KpiCardV2.tsx`；`cards/KpiCardV2.tsx`；`index.ts:15` | **9** |
| P1-13 | finance2/ar-reconciliation 全页硬编码 hex（39 处）+ 裸表单/表格 + 无暗色 | 样式 | `ar-reconciliation/page.tsx:111,129,159,193-210` | **7** |
| P1-14 | finance2/chanjet-sync 同款硬编码 hex（22 处）+ 裸 select/table | 样式 | `chanjet-sync/page.tsx:235,250,354-356` | **7** |

### P2（中 — 非对称设计 / 共存版本 / 死页 / 局部样式）

| # | 问题 | 域 | 证据锚点 | 批次 |
|---|------|----|----------|------|
| P2-1 | MENU_FIN2_AP_MASTER / EXPENSE_MASTER：FE 子码门控、BE 父码守卫（非对称） | menu一致 | `ap/page.tsx:599`；`fin-ap.controller.ts:46`；`fin-expense.controller.ts:26` | **2** |
| P2-2 | MENU_FIN2_AR_MASTER / AR_TXN：FE 三按钮子码、BE fin-ar 全父码（AR 子码零守卫） | menu一致 | `ar/page.tsx:819-820`；`fin-ar.controller.ts:60-146`；对照 `fin-cash.controller.ts:30-33` | **2** |
| P2-3 | MENU_MD_DICT 被引用但未 seed，且与 MENU_SETTINGS_DATA 命名冲突 | RBAC | `master-data-runtime.service.ts:76,480`；`master-data-type.guard.ts:48` | **1** |
| P2-4 | 命名分叉：MENU_MASTER_PRODUCT/GRADE/PACKAGING/SKU vs MENU_MD_* 两套并行 | RBAC | product-master 4 controllers；`1782052:31-34` | **1** |
| P2-5 | MENU_MASTER_DATA 粗父码被 1782052 清理排除，长期作超级码空转 | RBAC | `1782052...ts:63-70,167-174`；g5a:176,272,277；g120:26-31 | **1** |
| P2-6 | 1782052 转授映射对 MENU_MASTER 父码也漏 CUSTOMER/SUPPLIER 等原子分支 | RBAC | `1782052...ts:103-108` | **1** |
| P2-7 | dead duplicate：permissions/permission-sets.controller 从未注册（死码） | 后端 | `permissions/permission-sets.controller.ts:9` vs `permission-sets/...:12` | **5** |
| P2-8 | procurement v1（api/procurement）与 v2（api/v2/procurement）共存、资源重叠 | 后端 | `procurement.controller.ts:6`；`app.module.ts:118,128` | **8** |
| P2-9 | 无统一版本规约：/api/* /v2/* /v3/* per-module 随意 | 后端 | farm v3 / finance v2 / quality 无版本 | **8** |
| P2-10 | DTO 用法不一致：仅 7/33 模块用 DTO，其余 `@Body() body: any` | 后端 | procurement-v2 59 DTO；多数 0 | **8** |
| P2-11 | 个人中心双页 /profile vs /settings/profile（后者孤儿） | 路由 | `profile/page.tsx`；`settings/profile/page.tsx`；`Sidebar.tsx:554` | **4** |
| P2-12 | 真孤儿页 /terminal/packaging/qc-inspection（无任何入口） | 路由 | `qc-inspection/page.tsx`；`TerminalNavRail.tsx` | **4** |
| P2-13 | 已声明下线但页面仍在：/master-data/user-orgs（死页+死链） | 路由 | `Sidebar.tsx:247`；`governance/page.tsx:241`；`layout.tsx:110` | **4** |
| P2-14 | 工作流任务双轨 /workflow/tasks/* vs /workflow/{todos,history} | 路由 | `Sidebar.tsx:195-196`；旧 tasks 三 page 仍在 | **4** |
| P2-15 | workflow 子模块大量页仅 hub 可达且 hub 不在侧边栏 | 路由 | `workflow/page.tsx`；`middleware.ts` | **4** |
| P2-16 | 三套右抽屉，两个同名 RightDrawer 开关 prop 相反（isOpen vs open） | 组件 | `RightDrawer.tsx:7`；`ui/RightDrawer.tsx:8`；`DrawerV2.tsx:9` | **9** |
| P2-17 | 两套 ConfirmDialog（31 vs 12 引用）+ PhoenixDialog/ui/dialog 死码 | 组件 | `ui/ConfirmDialog.tsx`；`ConfirmDialogV2.tsx`；`PhoenixDialog.tsx`(0) | **9** |
| P2-18 | LegacyFreezeBanner/ReferenceGraph/WorkflowTimeline/FormRenderer 各 2 份 | 组件 | 见组件审计 finding#7 | **9** |
| P2-19 | reimbursements 单页混 3 套样式 + 违禁 py-1.5 | 样式 | `reimbursements/page.tsx:175,213,284,315` | **7** |
| P2-20 | finance2 整体用 Tailwind 数字色阶（text-amber-800 等）绕过 token | 样式 | reimbursements/fund-transfers/expenses/cash-accounts/ap/ar | **7** |
| P2-21 | 采购订单/请购用第三套样式（admin-ui s.* + 本地 inlineInput） | 样式 | `procurement2/orders/page.tsx:206-217,869`；`requests/page.tsx` | **7** |
| P2-22 | 26 个 admin 页缺 PageHeader | 样式 | home/store-pos/procurement2 入口/master-data 表单页 | **7** |

### P3（卫生 — 死码 / 命名规约 / inline 债 / 门控盲点）

| # | 问题 | 域 | 证据锚点 | 批次 |
|---|------|----|----------|------|
| P3-1 | MENU_MD_RUNTIME / MENU_MD_HISTORY 死码（仅 fallback 快照） | RBAC | `menu-registry.service.ts:65` | **1** |
| P3-2 | STORE_PAYMENT_CONFIRM/VOID/ACCOUNT 后端有子码守卫，前端仅粗码门控 | menu一致 | `store-payment.controller.ts`；`store-payment/page.tsx` | **2** |
| P3-3 | store-payment.controller 丢 api/ 前缀；bff 单文件塞 7 个 controller | 后端 | `store-payment.controller.ts:27`；`bff.controller.ts:14-971` | **8** |
| P3-4 | 多 controller 共裸前缀（api/v2/procurement 4 个类），路由归属隐式 | 后端 | `payments/shipments/orders/receipts.controller.ts` | **8** |
| P3-5 | 路由命名风格三套（master vs master-data、egg vs egglog、v2 后缀混用、单复数） | 路由 | `mobile/home/page.tsx`；finance2/sales2 带2 | **4** |
| P3-6 | 侧边栏 vs hub 子项不一致（egg-ledger 一处废弃一处暴露） | 路由 | `Sidebar.tsx:90`；`breeding/page.tsx` | **4** |
| P3-7 | 组件命名风格三套（无后缀/V2/V3）+ barrel 大量 `X as Y` 别名 | 组件 | `design-system/index.ts:15,29,34` | **9** |
| P3-8 | inline style 热点（store-pos 171/sales2-returns 143/shareholder-funds 125） | 样式 | grep -c style 计数 | **7** |
| P3-9 | 门户页硬编码 accent 调色板（home/daily-work） | 样式 | `home/page.tsx:40-47`；`daily-work/page.tsx:44-59` | **7** |

---

## 三、批次整改计划

> 标注约定：**触碰** = 前端 / 后端 / 迁移；**回归风险** = 🔴高 / 🟡中 / 🟢低；**部署** = 是否需重新部署（迁移类需在生产跑迁移，按 CLAUDE.md 红线需用户拍板）。
> **高回归批次（Batch 1/2/3）置于最前，要求先 code-review + 冒烟，方可合并。**

---

### 🔴 Batch 1 — RBAC 原子码授权缺口批量补全（最痛，先做）

**范围**：补齐持 MENU_MASTER_DATA 角色（CEO/MASTER_DATA_ADMIN/APPROVER）缺失的约 15 个 MENU_MD_* 原子授权；统一 MENU_MD_DICT 命名；收敛 MENU_MASTER_DATA 粗父码决策；补齐 MENU_MASTER/MENU_MASTER_* 命名分叉；清死码。

**含**：P1-1、P2-3、P2-4、P2-5、P2-6、P3-1

**触碰**：迁移（新 TS 迁移授权补全）+ 后端（可选：assertMasterDataPermission 加超级码兜底、product-master 4 controller @RequireMenu 迁码）+ 前端（无强制）

**回归风险**：🔴 高 — 直接改授权矩阵。补授过宽 → 越权；补授遗漏 → 仍 403。命名迁码（MENU_MASTER_*→MENU_MD_*）若漏迁存量授权 → 整片实体不可达。

**前置 / 冒烟**：
1. 先确认 controller 实际要求的全部原子码清单（references/code/operations 三映射表 + QUALITY + AUDIT 共约 16 实体）。
2. **决策点**：MENU_MASTER_DATA 是「正式超级码 + controller 兜底」还是「转原子+删父」二选一——这决定 finding P2-5 与 P1-1 的修法，必须用户拍板。
3. 迁移走 `apps/api/src/database/migrations/<ts>-G6xRbacGrantGap.ts`，含 `down()`，授权 DML 用 `@allow-data-dml` 标记（g198 豁免）或走 `scripts/` 运维脚本（业务 seed 不走迁移链，按 CLAUDE.md g197-H）——**优先 scripts/ 脚本**，避免触 CI 门禁。
4. 冒烟：以 CEO/MASTER_DATA_ADMIN/APPROVER 三角色逐一登录，遍历主数据中心 16 实体的 references/code/operations 端点，确认无 403 且无越权。
5. 部署：**是**（生产跑授权脚本需用户确认，红线#3）。

---

### 🔴 Batch 2 — menu_code 前后端漂移 + 父/子码对称收口

**范围**：修复「看得见按钮但 403」类漂移。统一 dashboard 码、饲喂码；按 fin-cash 已落地的对称模式收口 AR/AP/EXPENSE 父/子码；store-payment 子码门控。

**含**：P1-2（MENU_FIN_AUDIT）、P1-3（MENU_FARM_FEED）、P2-1、P2-2、P3-2

**触碰**：前端（Sidebar/page usePermission 改码）+ 后端（@RequireMenu 细化 + altMenus 兼容存量授权）+ 迁移（可选：补 fallback 快照 / seed 子码已由 g23/g74 完成）

**回归风险**：🔴 高 — 改 @RequireMenu 守卫粒度。若细化子码但存量角色只持父码且无继承 → 原本能用的用户 403。必须用 `altMenus` 兼容父码。

**前置 / 冒烟**：
1. 每处统一前先查存量授权：哪些角色持父码、哪些持子码（防止单向破坏对齐）。
2. 后端守卫细化必须带 `altMenus:['<父码>']` 兼容层，不可裸切。
3. 冒烟：dashboard（持 MENU_DASHBOARD 用户能见能拉数）、饲喂保存（持 MENU_FARM_FEED 或 FARM_DATA 均能存）、AR/AP/EXPENSE 新建按钮（持 _MASTER 或父码均放行）。
4. 部署：**是**（前后端同发，避免窗口期不一致）。

---

### 🔴 Batch 3 — 主数据选择器收口 + ACTIVE 铁律修复（动全局组件）

**范围**：消除选择器同名异源；mobile 改用 shared-selectors；后端把 `api/master-data/runtime/:type/active` 定为 canonical 读层、deprecate `api/lookup/*`。

**含**：P0-1、P0-2、P1-6

**触碰**：前端（移除 design-system barrel 再导出 + 重命名/删裸选择器 + mobile 页改造 + 可能加 variant='mobile'）+ 后端（lookup 标 @deprecated 或改为转 runtime）

**回归风险**：🔴 高 — 动 barrel 导出 + 全局选择器。任何页面若实际依赖 design-system 那套裸选择器的「全量（含非 ACTIVE）」语义，切到 ACTIVE-only 后会丢选项。mobile 改造涉及多页表单提交链路。

**前置 / 冒烟**：
1. 先全量 grep 谁从 `@/components/design-system` import 了 CompanySelector/ProjectSelector/UserSelector/StatusSelector（确认误用面）。
2. design-system 那套裸选择器：重命名为 SimpleXxxSelect 或删除，**不可静默改语义**。
3. mobile：SupplierSelector/MaterialSelector 替换 `fetch('/api/lookup/*')`+裸 select；若样式需轻量，给 MasterDataSelectors 加 `variant='mobile'`，**不要各页重造**。
4. 冒烟：mobile prc-order / prc-request 走通选择 → 提交；确认被禁用主数据不再出现在下拉。
5. 部署：**是**（前端为主，lookup deprecate 可分期，保留旧端点一个 release 窗口）。

---

### 🟡 Batch 4 — 路由去重 / 孤儿页下线 / 双入口收敛

**范围**：下线遗留 `/master/*` 树；收敛组织/字典/个人中心双入口；删孤儿页（qc-inspection、user-orgs、settings/profile）；workflow tasks 双轨重定向；命名风格规约（增量执行，旧 URL 用重定向不硬改）。

**含**：P1-8、P1-9、P1-10、P2-11、P2-12、P2-13、P2-14、P2-15、P3-5、P3-6

**触碰**：前端（删页 + 改跳转 + 308 重定向 + 清 middleware.ts/layout.tsx 残留映射 + hub 卡片同步）

**回归风险**：🟡 中 — 纯前端路由，但删页/重定向可能打断书签或 hub 内部互链。breeding/page.tsx:582 跳 `/master/farms` 改指 `/master-data` 需确认目标实体页存在。

**前置 / 冒烟**：
1. 每个「下线」页先确认无运行时引用（grep href/router.push），死链清理与删页同 PR。
2. 双入口收敛遵循 CLAUDE.md「主数据下沉至主数据中心」：settings hub 卡片改链到 /master-data，不保留第二份页面。
3. 旧 URL 一律 308 重定向到权威路由，**不直接 404**（保书签）。
4. 冒烟：点击 settings hub / dashboard / breeding hub 各卡片，确认无 404、无双份页面、重定向生效。
5. 部署：**是**（纯前端）。

---

### 🟡 Batch 5 — 后端路由硬冲突 + 死 controller 清理

**范围**：消除两处硬路由冲突（iot/devices、stocktake）；删未注册的 permissions/permission-sets 死 controller+service。

**含**：P1-4、P1-5、P2-7

**触碰**：后端（合并/重命名 controller + 改 module 注册 + 删死文件）

**回归风险**：🟡 中 — 路由冲突现状下已有一个 handler 被静默覆盖，修复会改变实际命中的 handler。需确认前端调用方依赖的是哪个响应契约。stocktake 拆分（wms 改 api/inventory/daily-close）会变 URL，需同步前端调用。

**前置 / 冒烟**：
1. 先确认当前注册顺序下 `all-summary` / stocktake 实际命中哪个 handler，对比前端期望响应。
2. iot 两 controller 共享 IotSyncService+MonDeviceService，合并自然；或拆前缀 device-monitor。
3. 删 permission-sets 死码前确认 permissions.module 未引用其 service。
4. 冒烟：iot 设备汇总页、库存盘点页、权限集页跑通。
5. 部署：**是**（后端；若改 stocktake URL 需前后端同发）。

---

### 🟢 Batch 6 — 样式基线决策（.phx-* vs cockpit-styles 收敛）

**范围**：定标杆——把 cockpit-styles 正式确立为唯一基线、废弃 globals.css 未被消费的 .phx-* 表单/按钮类（或反向推迁移）；写进 registry/CLAUDE.md。**这是决策批，不大改页面，只定方向。**

**含**：P0-3

**触碰**：前端（globals.css 清理或保留 + 文档）+ 文档（registry / master-data-style-guide.md / CLAUDE.md）

**回归风险**：🟢 低（仅删未被消费的 CSS 类 + 改文档）。前提是确认 .phx-* 真 0 页面消费（审计已证 admin=0，全 web 仅 6 个非页面文件）。

**前置**：确认 error.tsx/not-found.tsx/ErrorBoundary/DataTable 这 4 个 .phx-* 消费方的去留（它们是非 admin 文件，可保留 .phx- 或一并迁 cockpit）。部署：**是**（前端）。此批是 Batch 7 的前置——先定基线再批量改页。

---

### 🟢 Batch 7 — finance2 + 采购页样式统一（最大样式债，分页迁移）

**范围**：finance2 硬编码 hex → var(--*) token；裸 select/table → cockpit inputField/CompanySelector/s.table；Tailwind 数字色阶 → 语义 token；reimbursements 去 py-1.5；采购页 admin-ui s.* → cockpit；补 26 页 PageHeader；inline 热点页分批收编。

**含**：P1-13、P1-14、P2-19、P2-20、P2-21、P2-22、P3-8、P3-9

**触碰**：前端（多页样式改造，纯视觉）

**回归风险**：🟢 低（视觉层），但量大。建议**按页分多个小 PR**（ar-reconciliation+chanjet-sync 一组同模式可一起；reimbursements 一组；采购 orders+requests 一组；门户 home+daily-work 一组）。

**前置**：依赖 Batch 6 定基线。冒烟：暗色模式逐页目检（finance2 白底硬编码是暗色失效重灾区）。部署：**是**（前端，可分批渐进发）。

---

### 🟢 Batch 8 — 后端 API 规约统一（版本/DTO/projects 收口）

**范围**：定版本规约写入 CLAUDE.md；projects 选 canonical 表+端点（biz_projects per MDM-1）其余转读视图；procurement v1 标 @deprecated；推 DTO+class-validator（加 CI 禁 `@Body() x:any`）；store-payment 补 api/ 前缀；拆 bff 单文件；裸前缀加子前缀。

**含**：P1-7、P2-8、P2-9、P2-10、P3-3、P3-4

**触碰**：后端（规约文档 + 渐进改造）+ 迁移（projects 表收口若涉及数据合并需迁移）

**回归风险**：🟡 中（projects 收口涉及多表权威源切换，可能影响采购/股东/主数据三处消费方）；其余（DTO/前缀/拆文件/版本规约）🟢 低。**projects 收口单独拆出做，其余作卫生批。**

**前置**：projects 需先确认 biz_/prc2_/shr_ 三表当前数据与消费方，制定迁移状态文档后再切。部署：**是**（projects 收口可能含迁移需用户确认；规约类纯后端重构）。

---

### 🟢 Batch 9 — 前端组件去重收口（DataTable/KpiCard/Drawer/Dialog 合并）

**范围**：三套 DataTable 收口（根 DataTable→DataTableV3，data-table 改名 CrudTable）；两 KpiCardV2 改名（顶层→CockpitKpiCard）；统一 DrawerV2、ConfirmDialogV2；删死码（PhoenixDialog/ui/dialog）；合并 LegacyFreezeBanner/ReferenceGraph/WorkflowTimeline/FormRenderer 各 2 份；收敛 barrel `as` 别名 + 命名规约。

**含**：P1-11、P1-12、P2-16、P2-17、P2-18、P3-7

**触碰**：前端（全局组件合并 + 大量 import 迁移）

**回归风险**：🟡 中 — 动多个被广泛引用的全局组件（DataTable 30+ 页、ConfirmDialog 31 处、KpiCard 多页）。同名异 API 合并时 prop 不兼容（isOpen vs open、tone vs accentColor）易静默出错。

**前置 / 冒烟**：
1. 每组件合并前 grep 全引用面，逐个迁 prop（不可批量 sed）。
2. 先删 0 引用死码（PhoenixDialog/ui/dialog）——零风险先行。
3. KpiCardV2 同名冲突先改名（解 import 歧义）再合并。
4. 冒烟：DataTable/Drawer/Dialog/KpiCard 各取代表页目检渲染与交互。
5. 部署：**是**（前端，建议组件逐个 PR）。

---

## 四、建议执行顺序

```
阶段一（高回归，逐批强制 code-review + 冒烟，串行）
  1. Batch 1  RBAC 授权缺口          ← 最痛，先做；需用户拍板 MENU_MASTER_DATA 决策
  2. Batch 2  menu_code 漂移收口      ← 紧随，前后端同发 + altMenus 兼容
  3. Batch 3  选择器/ACTIVE 铁律      ← 动全局组件 + mobile，独立窗口

阶段二（中回归，可并行）
  4. Batch 5  后端路由硬冲突清理      ← 与样式/路由批无依赖
  5. Batch 4  路由去重/孤儿下线        ← 纯前端，重定向收敛

阶段三（决策 → 批量样式，串行依赖）
  6. Batch 6  样式基线决策            ← Batch 7 前置
  7. Batch 7  finance2+采购样式统一    ← 依赖 6，按页分小 PR

阶段四（卫生，低优先，可穿插）
  8. Batch 8  后端 API 规约统一        ← projects 收口单拆，余作卫生
  9. Batch 9  前端组件去重            ← 死码先删，组件逐个 PR
```

**关键依赖与红线提示**：
- **Batch 1 是阻塞性决策点**：MENU_MASTER_DATA「超级码兜底」vs「转原子+删父」二选一，决定 P1-1/P2-5 修法，必须先拍板。授权 DML 优先走 `scripts/` 运维脚本（CLAUDE.md g197-H：业务 seed 不走迁移链）。
- **Batch 1/2 生产授权变更触红线#3**（生产 DB 写入需用户确认）。
- **Batch 2 守卫细化必须带 altMenus 父码兼容**，否则存量角色回归 403。
- **Batch 6 必须先于 Batch 7**（基线未定则样式迁移无目标）。
- **Batch 3/9 动全局组件，禁批量 sed**，逐引用迁 prop。
- 全程遵守 CLAUDE.md：commit 用 `feat: g6x <主题>` / `fix:`；阶段产出物打 tag；staging 只 add 当批相关文件（勿 `git add -A`，防中文 docx 误入）；ugrep 限制下 scope-audit 用窄正则 + 计数验证。
