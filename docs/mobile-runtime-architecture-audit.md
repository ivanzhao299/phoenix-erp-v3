# Phoenix ERP V3 — Mobile Runtime Architecture Audit

**审计时间：** 2026-05-29  
**审计版本：** v3-mobile-runtime-phase1-delivery-20260529  
**审计人：** Claude Agent（代码扫描 + 静态分析）  
**审计方法：** 完整读取所有 `(mobile)` 路由文件、lib 工具库、PWA 配置、RBAC 矩阵

---

## Executive Summary

现有移动端架构**整体健康，无根性问题**。  
- 22 个页面中 **18 个完全可用**（A 类），**3 个需要局部修复**（B 类），**0 个需要删除**（C 类），**1 个局部逻辑冲突**（D 类）。  
- 唯一高优先级问题：`/mobile/dashboard` 中的配送波次区块仍调用旧 `log_dispatch` 表，应替换为 `/api/v2/mobile/delivery/dashboard`。  
- Mobile Delivery Runtime Phase 1 已完成，**可直接开工下一阶段**。  
- PWA / Service Worker 版本正确，不存在旧页面缓存风险。

---

## 一、现有移动端页面清单（全量）

| # | 路径 | 页面名称 | 主要功能 | 主要 API | 仍可用 | 调用旧 API | 符合 V2 |
|---|------|---------|---------|---------|-------|-----------|--------|
| 1 | `/mobile/login` | 登录 | JWT 登录，记住上次账号 | `/api/auth/login` | ✅ | ✗ | ✅ |
| 2 | `/mobile/home` | 首页导航 | 按角色过滤导航卡片，审批/通知角标 | `/api/workflow/my-tasks`<br>`/api/notifications/unread-count` | ✅ | ✗ | ✅ |
| 3 | `/mobile/dashboard` | 每日数据看板 | 生产/包装/品质/蛋品库存/销售情况/配送波次 | `/api/dashboard/kpi`<br>`/api/packaging/daily-report`<br>`/api/quality/inspections`<br>`/api/crud/brd_daily_logs`<br>`/api/crud/brd_flocks`<br>`/api/farm/egg/stock`<br>`/api/farm-device/alerts`<br>**`crudApi.list('log_dispatch')`** ⚠️ | ⚠️ 部分 | ✅（配送区块） | ⚠️ 部分 |
| 4 | `/mobile/feed` | 饲料台账 | 饲料出入库登记，库存预警 | `/api/farm/feed/ledger`<br>`/api/farm/feed/houses` | ✅ | ✗ | ✅（农场模块在用） |
| 5 | `/mobile/mortality` | 死淘快录 | 各栋死淘数量快速录入 | `/api/crud/brd_daily_logs` | ✅ | ✗ | ✅ |
| 6 | `/mobile/egglog` | 产蛋录入 | 各栋产蛋数量班次录入 | `/api/v3/farm/daily-logs`<br>`/api/crud/brd_flocks` | ✅ | ✗ | ✅（v3 API） |
| 7 | `/mobile/henreport` | 存栏日报 | 母鸡存栏/产蛋率/死淘日报 | `/api/v3/farm/daily-hen-report` | ✅ | ✗ | ✅（v3 API） |
| 8 | `/mobile/analytics` | 生产趋势 | 7/14/30天产蛋/死淘/饲料趋势图 | `/api/v3/farm/trend` | ✅ | ✗ | ✅（v3 API） |
| 9 | `/mobile/packaging` | 包装统计 | 班次产出、等级分布、7日趋势 | `/api/packaging/daily-report`<br>`/api/packaging/daily-report-range` | ✅ | ✗ | ✅ |
| 10 | `/mobile/quality` | 品质检测 | 首检/过程检/出库检，合格率统计 | `/api/quality/inspections` | ✅ | ✗ | ✅ |
| 11 | `/mobile/egg` | 鸡蛋台账 | 出入库登记、分级库存快照 | `/api/farm/egg/stock`<br>`/api/farm/egg/ledger`<br>`/api/farm/egg/inbound`<br>`/api/farm/egg/outbound` | ✅ | ✗ | ✅（农场模块在用） |
| 12 | `/mobile/medicine` | 药品台账 | 药品库存、出入库登记 | `/api/farm/medicine/stock`<br>`/api/farm/medicine/ledger`<br>`/api/farm/medicine/inbound`<br>`/api/farm/medicine/outbound` | ✅ | ✗ | ✅（农场模块在用） |
| 13 | `/mobile/sales` | 销售出库 | 农场直销开单、出库历史（含 V2 动态定价） | `/api/farm/sales/customers`<br>`/api/farm/sales`<br>**`/api/v2/sales/pricing/current`** ✅ | ✅ | ✗ | ⚠️ 混合（销售 V2 价格引擎已接入，农场直销 API 仍旧） |
| 14 | `/mobile/delivery` | 配送签收 | 配送订单全状态机、司机签收、拍照、异常退货 | `/api/v2/mobile/delivery/*` | ✅ | ✗ | ✅（Phase 1 已完成） |
| 15 | `/mobile/delivery/orders/[id]` | 配送订单详情 | 订单状态 timeline、按状态操作按钮 | `/api/v2/mobile/delivery/orders/:id` | ✅ | ✗ | ✅ |
| 16 | `/mobile/delivery/orders/[id]/sign` | 正常签收 | 签收人/收货数量/备注 | `/api/v2/mobile/delivery/orders/:id/sign` | ✅ | ✗ | ✅ |
| 17 | `/mobile/delivery/orders/[id]/exception` | 异常签收 | 异常类型/数量/自动创建退货单 | `/api/v2/mobile/delivery/orders/:id/sign-exception` | ✅ | ✗ | ✅ |
| 18 | `/mobile/delivery/orders/[id]/photos` | 拍照上传 | 相机拍照/canvas压缩/base64上传 | `/api/v2/mobile/delivery/orders/:id/photos` | ✅ | ✗ | ✅ |
| 19 | `/mobile/prc-request` | 发起采购 | 采购申请填报、提交审批、申请记录查看 | `/api/v2/procurement/requests` | ✅ | ✗ | ✅（V2 采购） |
| 20 | `/mobile/workflow` | 审批中心 | 待办审批、审批历史、通过/拒绝、表单渲染 | `/api/workflow/my-tasks`<br>`/api/approval/history`<br>`/api/approval/instances/*` | ✅ | ✗ | ✅（Workflow 2.0） |
| 21 | `/mobile/notifications` | 通知中心 | 通知列表、未读标记、全部已读、Push 订阅管理 | `/api/notifications/*`<br>`/api/notifications/push/*` | ✅ | ✗ | ✅ |
| 22 | `/mobile/expenses` | 费用申请 | 费用申请列表、新建草稿、提交审批 | `/api/v2/finance/expenses` | ✅ | ✗ | ✅（Finance V2） |

> **说明：** "仍可用"指当前生产环境可正常访问；"旧 API"指已废弃的 `/api/order/*`、`/api/procurement/*`（V1）等被移除端点。

---

## 二、页面保留 / 删除 / 重构分类

### A 类 — 保留并继续使用（18 页）

完全健康，无需任何干预：

| 页面 | 理由 |
|------|------|
| `/mobile/login` | 标准登录，AuthContext 正确 |
| `/mobile/home` | 核心导航，canAccess() 角色过滤正确 |
| `/mobile/feed` | 农场模块，饲料 API 完整 |
| `/mobile/mortality` | 死淘快录，brd_daily_logs 正常 |
| `/mobile/egglog` | 产蛋录入，v3 API 正确 |
| `/mobile/henreport` | 存栏日报，v3 API 正确 |
| `/mobile/analytics` | 生产趋势，v3 API 正确 |
| `/mobile/packaging` | 包装统计，packaging 模块正常 |
| `/mobile/quality` | 品质检测，quality 模块正常 |
| `/mobile/egg` | 鸡蛋台账，farm/egg API 完整 |
| `/mobile/medicine` | 药品台账，farm/medicine API 完整 |
| `/mobile/prc-request` | 采购申请，V2 API 正确 |
| `/mobile/workflow` | 审批中心，Workflow 2.0 完整 |
| `/mobile/notifications` | 通知中心，Push 订阅完整 |
| `/mobile/expenses` | 费用申请，Finance V2 正确 |
| `/mobile/delivery`（Phase 1）| Sales V2 Delivery，已完成 |
| `/mobile/delivery/orders/[id]`（含子页面）| Phase 1 已完成 |

### B 类 — 需要局部修复后保留（2 页）

**B1 — `/mobile/dashboard`**  
**问题：** 配送波次区块调用 `crudApi.list('log_dispatch', ...)` — 旧的 `log_dispatch` 通用表，而新的配送数据在 `sal_delivery_orders`（`/api/v2/mobile/delivery/dashboard`）。  
**修复方案：** 将 `showDelivery` 区块的数据源从 `crudApi.list('log_dispatch')` 替换为调用 `/api/v2/mobile/delivery/dashboard`，展示今日配送统计摘要而不是旧的波次列表。  
**优先级：** HIGH（进入 Mobile Runtime Phase 2 前必须完成）。

**B2 — `/mobile/sales`**  
**问题：** 农场直销 API（`/api/farm/sales/*`）仍在工作，但 Sales V2 已建立统一价格引擎（`/api/v2/sales/pricing/current` 已接入，价格部分已升级）。后续 Sales V2 全面上线后，农场直销出库应通过 `sal_orders` 而不是旧农场直销表。  
**修复方案：** Phase 3（Sales Order Runtime 完善后）再迁移，当前可继续使用。  
**优先级：** LOW（不阻断现有功能）。

### C 类 — 应删除（0 页）

经扫描，**没有页面调用已删除的 V1 端点**（`/api/order/*`、`/api/procurement/*` V1 等），也没有页面功能完全被新页面替代的情况。  
结论：**本阶段不需要删除任何页面。**

> 注：`/mobile/prc-request` 调用的是 `/api/v2/procurement/requests`（V2 采购），不是旧 V1，保留正确。

### D 类 — 考虑合并（1 对）

`/mobile/egg`（鸡蛋台账）与 `/mobile/egglog`（产蛋录入）功能相近，首页有两个单独入口。  
**建议：** 可在未来整合为"鸡蛋中心"（出入库 + 产蛋录入 + 库存 tab），但**不影响当前功能**，本阶段不操作。

---

## 三、移动端 API 调用审计

### 3.1 旧 API 调用清单（需替换）

| 文件 | 旧 API | 问题 | 修复方式 |
|------|--------|------|---------|
| `dashboard/page.tsx:211` | `crudApi.list('log_dispatch', { limit: 30 })` | `log_dispatch` 是旧配送波次表，Sales V2 已迁移到 `sal_delivery_orders` | 替换为 `GET /api/v2/mobile/delivery/dashboard`，展示今日统计摘要 |

**其余页面均无旧 API 调用。**

### 3.2 V2 API 调用清单（已正确接入）

| 文件 | V2 API | 状态 |
|------|--------|------|
| `expenses/page.tsx` | `/api/v2/finance/expenses` | ✅ Finance V2 |
| `prc-request/page.tsx` | `/api/v2/procurement/requests` | ✅ Procurement V2 |
| `sales/page.tsx` | `/api/v2/sales/pricing/current` | ✅ Sales V2 Price Runtime |
| `delivery/page.tsx` | `/api/v2/mobile/delivery/*` | ✅ Sales V2 Delivery Mobile |
| `workflow/page.tsx` | `/api/workflow/my-tasks`<br>`/api/approval/*` | ✅ Workflow 2.0 |
| `notifications/page.tsx` | `/api/notifications/*`<br>`/api/notifications/push/*` | ✅ Push Runtime |

### 3.3 农场/基础模块 API（仍有效，后端未废弃）

| 模块 | API 路径 | 对应后端模块 | 状态 |
|------|---------|------------|------|
| 农场日报 | `/api/v3/farm/daily-logs`<br>`/api/v3/farm/daily-hen-report`<br>`/api/v3/farm/trend` | `farm/` 模块（V3 路由） | ✅ 有效 |
| 农场基础 | `/api/farm/feed/*`<br>`/api/farm/egg/*`<br>`/api/farm/medicine/*`<br>`/api/farm/sales/*` | `farm/` 模块 | ✅ 有效 |
| 通用 CRUD | `/api/crud/brd_daily_logs`<br>`/api/crud/brd_flocks` | generic-crud 自动路由 | ✅ 有效 |
| 包装 | `/api/packaging/daily-report*` | `packaging/` 模块 | ✅ 有效 |
| 品质 | `/api/quality/inspections` | `quality/` 模块 | ✅ 有效 |
| 设备告警 | `/api/farm-device/alerts` | IoT 模块 | ✅ 有效 |
| KPI 看板 | `/api/dashboard/kpi` | `dashboard/` 模块 | ✅ 有效 |

### 3.4 需要后续替换的 API（非紧急）

| 当前 API | 替换目标 | 时机 |
|---------|---------|------|
| `/api/farm/sales/*` | `/api/v2/sales/orders/*`（Sales V2 Order Runtime） | Sales V2 全面切换后 |
| `crudApi.list('log_dispatch')` | `/api/v2/mobile/delivery/dashboard` | **Phase 2 前必须完成** |

---

## 四、mobile-roles.ts 权限审计

### 4.1 当前角色矩阵概览

```
已定义角色（25 个）：
  ADMIN, CEO, FARM_MGR, VET, QA_MGR, WMS_MGR, PKG_MGR, PKG_OP,
  LOG_MGR, STORE_MGR, FIN_CFO, FIN_ACCT, FIN_COST, AUDITOR,
  BREEDER, SALES_REP, SALES_MGR, REGION_MGR, PRC_BUYER, DRIVER,
  CASHIER, GROUP_FINANCE, FACTORY_ACCOUNTANT, PROJECT_MGR, SHAREHOLDER_VIEW

已定义页面权限（16 个）：
  dashboard, feed, mortality, egglog, henreport, analytics,
  packaging, quality, egg, sales, medicine, delivery, terminal,
  prc_request, workflow, notifications
```

### 4.2 已删除页面的权限残留

经扫描，**mobile-roles.ts 中无已删除页面的残留条目**：
- `prc-review` — 已删除页面，mobile-roles.ts 中无对应条目 ✅
- `procurement` — 已删除页面，mobile-roles.ts 中无对应条目 ✅

### 4.3 ROLE_DRIVER 分析

**现状：**
- `R.DRIVER` 已定义（第 40 行）✅
- `delivery.read` 包含 `R.DRIVER` ✅
- `delivery.write` 仅有 `ADMIN, LOG_MGR` ❌

**问题：** `delivery.write` 缺少 `ROLE_DRIVER`。

司机需要执行的操作（装车/出发/到达/签收）在后端由 `MENU_MOBILE_DELIVERY: ROLE_DRIVER: ['V','C','E']` 控制，但前端 `useMobilePermission('delivery')` 返回的 `readonly` 标志对司机为 `true`（只读模式），可能在页面内触发只读提示。

**修复方案：**
```typescript
delivery: {
  write: [R.ADMIN, R.LOG_MGR, R.DRIVER],  // 新增 DRIVER
  read:  [R.CEO, R.WMS_MGR, R.FARM_MGR, R.STORE_MGR, R.SALES_MGR,
          R.REGION_MGR, R.AUDITOR, R.SALES_REP, R.QA_MGR],
},
```

> **注意：** 新版 `/mobile/delivery/page.tsx`（Phase 1）未使用 `useMobilePermission`，由后端 MENU_MOBILE_DELIVERY 直接控制，此问题主要影响若未来补充 `useMobilePermission('delivery')` 检查的情况。建议同步修复保持一致性。

### 4.4 MENU_MOBILE_DELIVERY 缺失分析

`mobile-roles.ts` 的设计是 pageKey → write/read 角色数组，没有 `MENU_*` 概念（这是 `rbac.matrix.ts` 的概念）。两个系统并行：
- **前端权限矩阵（mobile-roles.ts）：** 控制首页卡片显示、`useMobilePermission` hook
- **后端 RBAC 矩阵（rbac.matrix.ts）：** 控制 API 端点访问

`MENU_MOBILE_DELIVERY` 已在后端 `rbac.matrix.ts` 定义，后端保护正确。前端首页通过 `canAccess('delivery', role)` 控制入口显示，`ROLE_DRIVER` 在 `delivery.read` 中，首页会显示配送入口 ✅。

### 4.5 与 rbac.matrix.ts 一致性对比

| 后端 MENU_MOBILE_DELIVERY 角色 | mobile-roles.ts delivery | 状态 |
|-------------------------------|--------------------------|------|
| ROLE_ADMIN: V,C,E,D,A,X | write ✅ | 一致 |
| ROLE_DRIVER: V,C,E | read only ⚠️ | **不一致，应为 write** |
| ROLE_SALES_MGR: V,C,E,D,A,X | read only | 差异可接受（管理员查看为主） |
| ROLE_LOG_MGR: V,C,E,D,X | write ✅ | 一致 |
| ROLE_HQ_OPS: V,X | 未在 mobile-roles delivery 中 | 差异可接受 |

---

## 五、PWA / Service Worker 审计

### 5.1 manifest.json

```json
{
  "name": "金凤凰 ERP — Phoenix ERP V3",
  "short_name": "凤凰 ERP",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#f59e0b",
  "background_color": "#0f172a"
}
```

| 检查项 | 结果 |
|-------|------|
| 适合当前移动端 | ✅ 品牌/颜色正确，start_url 合理 |
| icons 配置 | ✅ ico + 32px + 256px，含 maskable |
| 语言设置 | ✅ lang: zh-CN |
| 是否需要更新 | 不需要 |

### 5.2 sw.js（Service Worker）

```
VERSION = 'phoenix-v3-sw-v4'
```

| 检查项 | 结果 |
|-------|------|
| 是否支持 Push | ✅ 完整实现 push 事件监听器 |
| 是否支持 notificationclick | ✅ 点击后导航到 `payload.url`（默认 `/mobile/workflow`） |
| 旧版缓存清理 | ✅ activate 阶段通过 VERSION prefix 过滤并删除旧缓存 |
| 旧 mobile/procurement 缓存风险 | ✅ 无风险（HTML 做 network-first，不持久缓存；API 完全不缓存） |
| API 缓存策略 | ✅ `/api/*` 全部 network-first，不写缓存（含敏感鉴权数据） |
| 静态缓存策略 | ✅ stale-while-revalidate，仅白名单后缀 |
| /_next/ 路径 | ✅ 明确排除，不缓存（避免 Turbopack chunk hash 变化导致崩溃） |
| 是否需要更新版本号 | ⚠️ 可选，建议在 Phase 2 完成后升至 `phoenix-v3-sw-v5` |
| Push 通知默认跳转 | ⚠️ 默认 `/mobile/workflow`，配送相关推送无法直接跳转配送订单页，建议 Phase 2 后端推送时设置 url 字段 |

---

## 六、可复用组件清单

以下组件已经过验证，新页面可以直接复用：

### 6.1 UI 组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `MobilePageSkeleton` | `components/mobile/MobileSkeleton.tsx` | 完整页面骨架屏，含 header/tab/card |
| `SkeletonCard` | 同上 | 列表项骨架卡片 |
| `SkeletonStatGrid` | 同上 | 2×2 统计格子骨架 |
| `MobileEmptyState` | 同上 | 空状态组件，带 icon/title/desc/action |
| `MobilePermissionGate` | `components/mobile/MobilePermissionGate.tsx` | 权限门卫组件 |

### 6.2 工具库

| 工具 | 路径 | 说明 |
|------|------|------|
| `getMobileToken()` | `lib/mobile-auth-token.ts` | 统一 Token 读取（sessionStorage → localStorage → auth_user） |
| `authHeader()` | 同上 | 返回 `{Content-Type, Authorization}` Header |
| `mobileApi.*` | `lib/mobile-api.ts` | 农场/包装/品质 API 客户端，含 SWR 内存缓存 |
| `approvalApi.*` | 同上 | 审批引擎 API，含 getMyTasks/getInstance/approve/reject |
| `notificationApi.*` | 同上 | 通知 API，含 list/unreadCount/markRead/readAll |
| `canAccess()` | `lib/mobile-roles.ts` | 前端角色权限检查 |
| `getVisiblePages()` | 同上 | 获取某角色可见页面列表 |

### 6.3 Hooks / Context

| 工具 | 说明 |
|------|------|
| `useMobilePermission(pageKey)` | 返回 `{allowed, loading, readonly}`，用于权限加载骨架屏 |
| `useMobileTheme()` | 深色/浅色主题，返回 `{t, isDark, toggle}`，`t.*` 包含所有颜色 token |
| `useToast()` | 全局 Toast 通知（success/error/info） |
| `haptic(type)` | 触感反馈（light/medium/success/error） |

### 6.4 布局约定

```typescript
// 移动端页面标准结构
<div style={{ minHeight: '100svh', background: t.pageBg, display: 'flex', flexDirection: 'column' }}>
  {/* AppBar — sticky top, env(safe-area-inset-top) padding */}
  {/* 内容区 — flex:1, padding-bottom: env(safe-area-inset-bottom) */}
  {/* 底部固定栏 — position:fixed, bottom:0, padding-bottom: env(safe-area-inset-bottom) */}
</div>
```

---

## 七、Mobile Delivery 建设建议

### 7.1 Phase 1（已完成）

```
✅ /mobile/delivery                  — 配送仪表盘（今日统计 + 订单列表 + Tab 筛选）
✅ /mobile/delivery/orders/[id]      — 订单详情 + 状态机操作按钮
✅ /mobile/delivery/orders/[id]/sign — 正常签收表单
✅ /mobile/delivery/orders/[id]/exception — 异常签收 + 自动退货单
✅ /mobile/delivery/orders/[id]/photos   — 拍照上传（canvas 压缩）
✅ 后端 MobileDeliveryController (10 endpoints)
✅ ROLE_DRIVER + MENU_MOBILE_DELIVERY RBAC
✅ DDL: sal_delivery_orders.photo_urls + 10 UAT checklist
```

### 7.2 Phase 2 建议（待开工）

在 Phase 1 基础上需补充：

1. **修复 dashboard 配送区块**（高优先级）
   - 文件：`apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
   - 将 `crudApi.list('log_dispatch')` 替换为 `fetch('/api/v2/mobile/delivery/dashboard')`

2. **修复 mobile-roles.ts delivery.write**
   - 将 `ROLE_DRIVER` 加入 `delivery.write` 数组

3. **SW Push 通知 URL 定制**
   - 配送状态变更推送时，后端设置 `url = /mobile/delivery/orders/{id}`，实现点击直达

4. **离线支持增强（可选）**
   - 配送签收表单支持离线保存（IndexedDB），网络恢复后自动同步

5. **司机身份信息显示**
   - `/mobile/delivery` 仪表盘展示当前司机姓名、今日分配车辆

---

## 八、下一步执行方案

### 立即执行（Phase 2 前置工作）

| 优先级 | 任务 | 文件 | 预计工作量 |
|-------|------|------|----------|
| 🔴 HIGH | 替换 dashboard 配送区块数据源 | `mobile/dashboard/page.tsx` | 30 分钟 |
| 🟡 MED | 修复 mobile-roles delivery.write 缺少 DRIVER | `lib/mobile-roles.ts` | 5 分钟 |
| 🟡 MED | SW 版本号升级至 v5 | `public/sw.js` | 5 分钟 |

### Phase 2（Mobile Inventory Runtime）

```
目标：实现库存盘点移动端
/mobile/inventory           — 库存仪表盘（当前库存 + 今日出入库）
/mobile/inventory/scan      — 条码/二维码扫描入库
/mobile/inventory/adjust    — 库存调整录入
后端：MENU_MOBILE_INVENTORY + WMS V2 接口
```

### Phase 3（Mobile Sales Runtime）

```
目标：Sales V2 销售订单移动端
/mobile/sales2              — 销售订单（替代旧 /mobile/sales 的直销出库）
/mobile/sales2/orders/[id]  — 订单详情
后端：销售 V2 sal_orders
注意：旧 /mobile/sales 可继续保留直至农场直销迁移完成
```

### Phase 4（Mobile Store POS 增强，可选）

```
/mobile/store-pos           — 简化版 POS（门店收银场景）
后端：MENU_MOBILE_POS
```

---

## 九、风险矩阵

| 风险 | 级别 | 影响范围 | 当前状态 |
|------|------|---------|---------|
| dashboard 调用旧 log_dispatch | 🔴 HIGH | 配送波次显示不正确 | 未修复，列入 Phase 2 前置 |
| delivery.write 缺少 DRIVER | 🟡 MED | 若未来补充 useMobilePermission 检查会误判只读 | 未修复，建议同步 |
| 农场直销 API 与 Sales V2 并存 | 🟡 MED | 两套销售数据不一致 | 可接受，等 Sales V2 完整切换 |
| SW 版本未升级 | 🟢 LOW | 不影响功能，仅跳过缓存清理机会 | 建议 Phase 2 后升级 |
| Push 默认跳转 workflow | 🟢 LOW | 配送通知点击落到审批中心而非配送订单 | 建议 Phase 2 后端设置 url 字段 |

---

## 十、结论

| 审计维度 | 结论 |
|---------|------|
| **页面数量** | 22 个（含子页面），18 个 A 类健康，2 个 B 类需局部修复，0 个 C 类删除 |
| **旧 API 残留** | 仅 1 处：`dashboard.tsx` 的 `log_dispatch` 查询 |
| **V2 接入覆盖** | Finance V2 ✅，Procurement V2 ✅，Sales V2 Price ✅，Delivery V2 ✅，Workflow 2.0 ✅，Push ✅ |
| **RBAC 一致性** | mobile-roles.ts 与 rbac.matrix.ts 基本一致，1 处差异（DRIVER write 缺失） |
| **PWA 健康度** | SW v4 正确，Push/notificationclick 完整，旧缓存风险为零 |
| **Mobile Delivery Phase 1** | ✅ 已完成，可以直接开工 Phase 2 |
| **需清理旧代码** | 无需大规模清理 |
| **可直接新增页面** | ✅ 可以，infrastructure 完整，复用组件充分 |

**最终结论：Mobile Runtime 架构整洁，技术债极低，可安全继续堆叠新功能。**
