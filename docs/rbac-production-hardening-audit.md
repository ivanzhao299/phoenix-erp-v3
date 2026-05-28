# Phoenix ERP V3 — RBAC 生产治理强化审计报告

**审计日期**：2026-05-28  
**审计范围**：RBAC + DataScope + Workflow 权限治理体系  
**审计人**：自动化代码审计（Claude Sonnet 4.6）  
**代码库状态**：tag `v3-runtime-cutover-phase-2d-20260528`

---

## 一、执行摘要

系统当前已完成全部 Runtime 化阶段，处于正式生产治理窗口。RBAC 整体架构完整度较高，MenuGuard + DENY BY DEFAULT 机制运转正常，审批引擎越权校验严密。但存在 **3 项 CRITICAL 风险** 和 **7 项 HIGH 风险**，其中最严重的问题是 **DataScope 跨公司数据泄漏**：Finance V2 和 Sales V2 服务均存在 DataScope 空值未过滤漏洞，当前任意持有菜单权限的用户均可读取所有公司数据。

**当前治理成熟度评分：6.5 / 10**  
主要扣分：DataScope 实施不一致、Sidebar 前端权限敞开、部分旧模块 API 无 MenuGuard。

---

## 二、扫描范围

| 扫描目标 | 文件/路径 |
|---|---|
| RBAC 矩阵 | `apps/api/src/common/guards/rbac.matrix.ts` |
| MenuGuard | `apps/api/src/common/guards/menu.guard.ts` |
| DataScopeGuard | `apps/api/src/modules/org/guards/data-scope.guard.ts` |
| DataScopeHelper | `apps/api/src/modules/org/helpers/data-scope.helper.ts` |
| DataScopeService | `apps/api/src/modules/org/services/data-scope.service.ts` |
| 审批引擎 | `apps/api/src/modules/approval-engine/` |
| Workflow 注册表 | `workflow-biz-registry.service.ts` |
| JWT 策略 | `apps/api/src/auth/jwt.strategy.ts` |
| Finance V2 | `apps/api/src/modules/finance-v2/controllers/` |
| Sales V2 | `apps/api/src/modules/sales-v2/controllers/` |
| Procurement V2 | `apps/api/src/modules/procurement-v2/controllers/` |
| WMS / Inventory | `apps/api/src/modules/wms/` |
| Sidebar | `apps/web/src/components/layout/Sidebar.tsx` |

---

## 三、RBAC 权限树

### 3.1 MENU_* 全量清单（按模块）

#### 养殖模块
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_BREEDING | ROLE_ADMIN, ROLE_FARM_MGR, ROLE_FARMER, ROLE_VET, ROLE_CEO, ROLE_REGION_MGR | ✅ |
| MENU_FARM_DATA | ROLE_ADMIN, ROLE_FARM_MGR, ROLE_FARMER, ROLE_VET, ROLE_CEO, ROLE_REGION_MGR | ✅ |
| MENU_FARM_VET | *(Sidebar引用)* | ❌ 未注册 |
| MENU_DEVICE_MONITOR | *(Sidebar引用)* | ❌ 未注册 |
| MENU_IOT | ROLE_ADMIN, ROLE_FARM_MGR, ROLE_FARMER, ROLE_SYSOPS | ✅ |

#### 仓储物流
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_INVENTORY | ROLE_ADMIN, ROLE_WMS_MGR, ROLE_FARM_MGR, ROLE_FIN_ACCT, ROLE_CEO, ROLE_REGION_MGR | ✅ |
| MENU_WMS | ROLE_ADMIN, ROLE_WMS_MGR, ROLE_FARM_MGR, ROLE_REGION_MGR | ✅ |
| MENU_WMS_INBOUND | ROLE_ADMIN, ROLE_WMS_MGR, ROLE_FARM_MGR, ROLE_REGION_MGR | ✅ |
| MENU_WMS_OUTBOUND | ROLE_ADMIN, ROLE_WMS_MGR, ROLE_FARM_MGR, ROLE_REGION_MGR | ✅ |
| MENU_WMS_VIEW | *(Sidebar引用)* | ❌ 未注册 |
| MENU_WMS_INOUT | *(Sidebar引用)* | ❌ 未注册 |
| MENU_WMS_MASTER | *(Sidebar引用)* | ❌ 未注册 |
| MENU_PDA | ROLE_ADMIN, ROLE_WMS_MGR, ROLE_FARM_MGR, ROLE_FARMER, ROLE_CASHIER | ✅ |

#### 采购
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_PRC2 | ROLE_ADMIN, ROLE_PRC_BUYER, ROLE_FARM_MGR, ROLE_FIN_ACCT, ROLE_FIN_CFO, ROLE_CEO, ROLE_REGION_MGR, ROLE_LOG_MGR | ✅ |
| MENU_PRC2_MASTER | ROLE_ADMIN, ROLE_PRC_BUYER, ROLE_FARM_MGR, ROLE_FIN_CFO, ROLE_CEO, ROLE_REGION_MGR, ROLE_PROJECT_MGR, ROLE_FACTORY_ACCT | ✅ |
| MENU_PRC2_ORDER | 同上 + 扩展 | ✅ |
| MENU_PRC2_PAYMENT | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_FIN_ACCT, ROLE_PRC_BUYER, ROLE_CEO | ✅ |
| MENU_PRC2_FUND | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_CEO, ROLE_SHAREHOLDER_VIEW | ✅ |
| MENU_PRC2_SHIPMENT, MENU_PRC2_RECEIPT, MENU_PRC2_INIT, MENU_PRC2_DASHBOARD | ✅ 全部注册 | ✅ |

#### 财务 V2
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_FIN2 | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_FACTORY_ACCT, ROLE_CEO, ROLE_AUDITOR | ✅ |
| MENU_FIN2_AP | 同上 + ROLE_PRC_BUYER | ✅ |
| MENU_FIN2_AR | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_FACTORY_ACCT, ROLE_CEO, ROLE_AUDITOR | ✅ |
| MENU_FIN2_CASH | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_FACTORY_ACCT, ROLE_CEO, ROLE_AUDITOR | ✅ |
| MENU_FIN2_SHAREHOLDER | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_CEO, ROLE_SHAREHOLDER_VIEW, ROLE_AUDITOR | ✅ |
| MENU_FIN2_EXPENSE | + ROLE_FARM_MGR, ROLE_STORE_MGR | ✅ |
| MENU_FIN2_REPORT | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_CEO, ROLE_AUDITOR | ✅ |
| MENU_FIN2_BUDGET | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_HQ_FINANCE, ROLE_CEO, ROLE_AUDITOR | ✅ |

#### 销售 V2
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_SALES2 | ROLE_ADMIN, ROLE_CEO, ROLE_HQ_FINANCE, ROLE_SALES_MGR, ROLE_SALES_REP, ROLE_STORE_MGR, ROLE_REGION_MGR, ROLE_AUDITOR | ✅ |
| MENU_SALES2_CUSTOMER | 同上 | ✅ |
| MENU_SALES2_PRICE | + ROLE_FIN_CFO，ROLE_SALES_REP 只读 | ✅ |
| MENU_SALES2_CHANNEL | 同 MENU_SALES2 | ✅ |
| MENU_SALES2_ORDER | + ROLE_FIN_CFO, ROLE_LOG_MGR | ✅ |
| MENU_SALES2_DELIVERY | + ROLE_LOG_MGR, ROLE_DRIVER | ✅ |
| MENU_SALES2_CREDIT | + ROLE_FIN_CFO | ✅ |
| MENU_SALES2_RETURN | + ROLE_FIN_CFO | ✅ |
| MENU_SALES2_INVENTORY | + ROLE_FARM_MGR | ✅ |
| MENU_SALES2_REPORT | + ROLE_FARM_MGR（只读） | ✅ |

#### 工作流
| MENU 代码 | 覆盖角色 | 矩阵注册 |
|---|---|---|
| MENU_WORKFLOW | 12 角色全覆盖，含 ROLE_CEO, ROLE_FIN_CFO, ROLE_SALES_MGR, ROLE_HQ_FINANCE | ✅ |

#### 系统 / 设置
| MENU 代码 | 矩阵注册 |
|---|---|
| MENU_SYSTEM, MENU_USERS, MENU_MASTER, MENU_SYS_ORG, MENU_SETTINGS_DATA, MENU_SETTINGS_IT | ✅ |
| MENU_SETTINGS_USER | ❌ 未注册 |
| MENU_STORE_MGR | ❌ 未注册 |
| MENU_B2B_SALE | ❌ 未注册 |
| MENU_DASHBOARD | ❌ 未注册 |

---

## 四、MenuGuard 审计

### 4.1 DENY BY DEFAULT 验证

```typescript
// menu.guard.ts 关键逻辑
if (!isMenuRegistered(requirement.menu)) {
  throw new ForbiddenException('MENU_PERMISSION_NOT_REGISTERED');
}
const allowed = hasMenuPermission(userRoles, requirement.menu, requirement.perm);
if (!allowed) {
  throw new ForbiddenException('MENU_PERMISSION_DENIED');
}
```

**结论：DENY BY DEFAULT 已实现** ✅  
未注册 MENU 一律 403（`MENU_PERMISSION_NOT_REGISTERED`），不存在默认放行路径。

### 4.2 Controller MenuGuard 覆盖情况

| 模块 | MenuGuard | 备注 |
|---|---|---|
| Finance V2（全部 controller） | ✅ `@UseGuards(MenuGuard)` + `@RequireMenu` | 100% 覆盖 |
| Procurement V2（全部子 controller） | ✅ `@UseGuards(MenuGuard, DataScopeGuard)` | 100% 覆盖 |
| Sales V2（全部子 controller） | ✅ `@UseGuards(AuthGuard('jwt'), MenuGuard)` | 100% 覆盖 |
| Approval Engine | ✅ `@UseGuards(MenuGuard)` | 100% 覆盖 |
| Approval Rules | ✅ `@UseGuards(MenuGuard)` | 100% 覆盖 |
| Workflow Runtime/Task/Metrics | ✅ `@UseGuards(MenuGuard, DataScopeGuard)` | 100% 覆盖 |
| WMS Inbound/Outbound/Inventory | ✅ `@UseGuards(MenuGuard)` | 100% 覆盖 |
| **Finance V2 health** | ⚠️ 无 `@RequireMenu`，仅 JWT 验证 | 合理：探活端点 |
| **Sales V2 health** | ❌ 无任何 Guard | 无鉴权，匿名可访问 |
| **Procurement V2 health** | ❌ 无任何 Guard | 无鉴权，匿名可访问 |
| **旧版 farm/order/store 模块** | ❌ 仅 `AuthGuard('jwt')`，无 MenuGuard | 高风险：旧接口任意登录用户可调用 |
| **Generic CRUD** | ⚠️ 仅 `AuthGuard('jwt')` + 白名单 + TABLE_PERM_MAP | 无 MenuGuard，依赖自定义权限检查 |

### 4.3 Sidebar perm=null 清单（前端无权限控制）

以下 Sidebar 菜单项 `perm: null`，前端向所有登录用户显示，后端依赖 MenuGuard：

| 菜单路径 | perm | 风险 |
|---|---|---|
| `/sales2`（整个销售系统组及所有子项） | `null` | **HIGH** — 销售数据对所有登录用户可见 |
| `/sales2/customers` | `null` | HIGH |
| `/sales2/pricing` | `null` | HIGH — 价格敏感 |
| `/sales2/orders` | `null` | HIGH |
| `/dashboard` | `null` | LOW |
| `/pos`, `/pos/sales` | `null` | MEDIUM |
| `/settings`（含多个子项） | `null` | MEDIUM |

**说明**：后端 API 均受 MenuGuard 保护，前端 perm=null 不会造成数据泄漏，但会导致无权限用户看到菜单后点击返回 403，体验较差。销售系统全组应补充 `perm: "MENU_SALES2"` 控制前端显示。

---

## 五、DataScope 审计

### 5.1 DataScope 架构说明

```
DataScopeGuard → cls.set('dataScope', scope)    ← 全局 CLS key
DataScopeHelper → cls.get('dataScope')            ← 读取同一 key
MenuGuard       → cls.set('user', req.user)       ← 用户基础信息

DataScopeContext:
  isGlobal: boolean
  scopeLevel: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP'
  allowedCompanyCodes: string[]
  allowedProjectCodes: string[]
```

### 5.2 各模块 DataScope 实施对比

| 模块 | DataScopeGuard | DataScope 读取方式 | 评估 |
|---|---|---|---|
| **Procurement V2** | ✅ `@UseGuards(MenuGuard, DataScopeGuard)` | `DataScopeHelper.buildRawCondition()` / `applyToQb()` | ✅ 正确实现 |
| **Workflow Runtime** | ✅ `@UseGuards(MenuGuard, DataScopeGuard)` | DataScopeGuard 解析 + CLS | ✅ 正确实现 |
| **Finance V2** | ❌ 无 DataScopeGuard | `cls.get('user').dataScope` — **此字段永不存在** | 🔴 CRITICAL |
| **Sales V2** | ❌ 无 DataScopeGuard | `cls.get('user').companyCodes` — **此字段永不存在** | 🔴 CRITICAL |
| **Generic CRUD** | ❌ 无 DataScopeGuard | `req.user.storeCode` Token 强制隔离 | ⚠️ 部分覆盖 |

### 5.3 CRITICAL — Finance V2 DataScope 空值行为分析

**根因**：Finance V2 服务读取 `user?.dataScope?.companyCodes`，但：
- `DataScopeGuard` 写入 `cls.set('dataScope', scope)`（独立 CLS key）
- Finance V2 controllers 未挂载 `DataScopeGuard`
- `cls.get('user')` 对象不含 `dataScope` 字段（JWT strategy 未注入）

**实际行为**：  
`user?.dataScope` = `undefined` → `companyCodes = []` → `scopeAll = false`

大多数 Finance V2 服务存在如下逻辑：
```typescript
// financial-reports.service.ts
buildScopeFilter(all, codes, ...) {
  if (all || codes.length === 0) return { sf: '', params: [] }; // ← 无过滤！
  ...
}
```

当 `codes.length === 0` 时，无 WHERE 过滤，**返回所有公司数据**。

**受影响接口**：
- `GET /api/v2/finance/reports/overview` — 全集团财务汇总
- `GET /api/v2/finance/reports/ap-aging` — 应付账龄（所有公司）
- `GET /api/v2/finance/reports/ar-aging` — 应收账龄（所有公司）
- `GET /api/v2/finance/reports/cash-flow` — 现金流（所有公司）
- `GET /api/v2/finance/reports/expense-*` — 费用报表（所有公司）
- `GET /api/v2/finance/cash/accounts` — 资金账户列表
- `GET /api/v2/finance/shareholder/contributions` — 股东出资（所有公司）

**影响**：持有 `MENU_FIN2_REPORT: V` 权限的 `ROLE_FACTORY_ACCT`（应仅能看本公司）可查看全集团财务数据。

### 5.4 CRITICAL — Sales V2 DataScope 空值行为分析

**同上根因**：`cls.get('user').companyCodes` 永为 `undefined → []`

**实际行为**：
```typescript
// sales-orders.service.ts
if (!user.scopeAll && user.companyCodes.length > 0) {
  where.push(`company_code = ANY($${params.length})`);
}
// companyCodes.length === 0 → 条件不成立 → 无过滤 → 全量数据
```

**受影响接口**：
- 销售订单列表、配送单列表、退货单列表
- 客户档案列表、价格手册列表、渠道列表
- 经营分析报表（11 个维度）

### 5.5 DataScope 正确的集成路径（参考 Procurement V2）

```typescript
// 正确示例：
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PRC2', 'V')
async list(@Query() dto: QueryDto) {
  const { sql, params } = this.dataScopeHelper.buildRawCondition({}, 0);
  // sql = '1=1' (全局) 或 'company_code = ANY($1)' (受限)
  // 当无 scope 配置时返回 '1=0'（拒绝访问，不泄漏）
}
```

DataScopeHelper 对空 companyCodes 的处理是 **返回 `1=0`**（零结果），而非 Finance V2 / Sales V2 的返回全量。

---

## 六、scopeAll 风险审计

### 6.1 scopeAll=true 触发条件

| 条件 | 角色/场景 | 来源 |
|---|---|---|
| `roles.includes('ROLE_ADMIN')` | ROLE_ADMIN | DataScopeService.resolve() 硬编码 |
| `scopeLevel === 'GROUP'` | 数据库 sys_data_scopes 配置了 GROUP 级别 | 数据库驱动 |

**注意**：JWT 负载中无 `scopeAll` 字段。Sales V2 / Finance V2 通过 `u?.scopeAll` 读取的 scopeAll 永为 `false`（见上节）。

### 6.2 各高权限角色评估

| 角色 | 当前矩阵权限范围 | scopeAll 获取方式 | 风险评估 |
|---|---|---|---|
| `ROLE_ADMIN` | 所有 MENU 全权限 (V,C,E,D,A,X) | DataScopeService 硬编码 isGlobal | ⚠️ 合理但应限制真人持有，建议仅系统账号 |
| `ROLE_CEO` | 主要业务模块 V+A+X | 需 DB 配置 GROUP scope | ✅ 合理，看报表不可写 |
| `ROLE_HQ_FINANCE` | 财务全模块 V,C,E,A | 需 DB 配置 | ✅ 合理，总部财务跨公司职责 |
| `ROLE_AUDITOR` | 所有模块只读 V+X | 需 DB 配置 | ✅ 合理，审计需全量视图 |
| `ROLE_FIN_CFO` | 财务全权限 + 采购审批 + 工作流管理 | 需 DB 配置 | ⚠️ 权限略宽：`MENU_WORKFLOW C,E,D,A` — 可删改审批规则 |
| `ROLE_FACTORY_ACCT` | Finance V2 全部 V,C,E,X | 应受公司范围限制 | 🔴 DataScope 空值漏洞导致可看全集团 |

### 6.3 过度授权风险

**ROLE_FIN_CFO** 在 MENU_WORKFLOW 中有 `['V','C','E','D','A','X']` 权限，意味着 CFO 可以：
- 新增、删除审批规则
- 修改任意业务的审批流程

建议：CFO 在 Workflow 模块仅需 `['V', 'A', 'X']`（查看、审批、导出），不应有规则管理权限（C/E/D）。

**ROLE_CEO** 同样有 `['V','C','E','D','A','X']` 在 MENU_WORKFLOW，存在同样问题。

---

## 七、Workflow 审批安全审计

### 7.1 已注册 bizType 清单

| bizType | moduleCode | 表名 | 审批通过状态 |
|---|---|---|---|
| PR | MENU_PRC2_ORDER | prc2_purchase_requests | APPROVED |
| PO | MENU_PRC2_ORDER | prc2_purchase_orders | APPROVED |
| PAYMENT | MENU_PRC2_PAYMENT | prc2_payments | APPROVED |
| FUND | MENU_PRC2_FUND | prc2_shareholder_funds | CONFIRMED |
| SHAREHOLDER_CONTRIBUTION | MENU_FIN2_SHAREHOLDER | fin_shareholder_contributions | CONFIRMED |
| SHAREHOLDER_SETTLEMENT | MENU_FIN2_SHAREHOLDER | fin_shareholder_settlements | APPROVED |
| EXPENSE_REQUEST | MENU_FIN2_EXPENSE | fin_expense_requests | APPROVED |
| REIMBURSEMENT | MENU_FIN2_EXPENSE | fin_reimbursements | APPROVED |
| PRICE_BOOK_APPROVAL | MENU_SALES2_PRICE | sal_price_books | APPROVED |
| SALES_ORDER | MENU_SALES2_ORDER | sal_sales_orders | APPROVED |
| SALES_RETURN | MENU_SALES2_RETURN | sal_return_orders | INSPECTING |

**共 11 个 bizType，覆盖全部核心审批场景。**

### 7.2 审批越权防护

**`validateApprover()` 逻辑**（`approval-engine.service.ts` line 264）：
```typescript
// USER / MANAGER / DELEGATED 类型：严格比对 approverUserId
if (step.approverUserId && String(step.approverUserId) !== String(userId)) {
  throw new ForbiddenException('APPROVER_USER_MISMATCH: 当前步骤指定审批人...');
}
// ROLE 类型：先查 approverUserId（AssignmentResolver已解析），fallback 到角色
if (step.approverUserId) {
  if (String(step.approverUserId) !== String(userId)) throw ForbiddenException;
} else if (step.approverRole) {
  if (!roles.includes(step.approverRole)) throw ForbiddenException;
}
```

**结论**：审批越权防护严密 ✅  
- 用户指定类型：严格 `approverUserId` 匹配  
- 角色类型：既检查已解析的用户 ID，又检查角色  
- 审批接口需要 `MENU_WORKFLOW 'A'` 权限  
- 自审防护：`step.actorUserId === userId` 时拒绝（防止提交人自审）

### 7.3 Workflow 接口权限覆盖

| 接口 | Guard | 权限 | 评估 |
|---|---|---|---|
| `POST /api/approval/instances/:id/approve` | MenuGuard | MENU_WORKFLOW 'A' | ✅ |
| `POST /api/approval/instances/:id/reject` | MenuGuard | MENU_WORKFLOW 'A' | ✅ |
| `GET /api/approval/todos` | MenuGuard | MENU_WORKFLOW 'V' | ✅ |
| `POST /api/workflow/instances/:id/approve` | MenuGuard+DataScopeGuard | MENU_WORKFLOW 'A' | ✅ |
| `POST /workflow/instances/:id/transfer` | MenuGuard+DataScopeGuard | MENU_WORKFLOW 'E' | ✅ |
| `POST /api/approval-rules` | MenuGuard | MENU_WORKFLOW 'C' | ⚠️ CFO/CEO 可建 |
| `DELETE /api/approval-rules/:id` | MenuGuard | MENU_WORKFLOW 'D' | ⚠️ CFO/CEO 可删 |

### 7.4 发现的 Workflow 风险

**风险 W1（MEDIUM）**：`approval-engine.controller.ts` 的 `getMyTodos()` 未注入当前 `userId` 过滤，返回的"我的待办"实际调用 `this.engine.getMyTodos()` — 需确认 ApprovalEngineService 内部是否通过 CLS userId 过滤，否则会返回所有 PENDING 步骤。

**风险 W2（MEDIUM）**：未注册 bizType 仍可调用 `POST /workflow/start`（MENU_WORKFLOW 'C'），若攻击者传入非法 bizType，服务层会报错而不是静默拒绝。建议在 Controller 层增加 bizType 白名单校验。

---

## 八、Inventory / Finance 高危接口审计

### 8.1 库存写入接口

| 接口 | Guard | 权限 | 风险 |
|---|---|---|---|
| `POST /api/stocktake/daily-close` | MenuGuard | MENU_INVENTORY 'E' | ✅ |
| `POST /api/inventory/receiving/orders/:no/confirm` | MenuGuard | MENU_INVENTORY 'E' | ✅ |
| `POST /api/inventory/stocktake/approve` | MenuGuard | MENU_INVENTORY 'E' | ⚠️ 应为 'A' |
| `POST /api/inventory/loss/approve` | MenuGuard | MENU_INVENTORY 'E' | ⚠️ 应为 'A' |
| `POST /api/outbound/orders/:no/advance` | MenuGuard | MENU_WMS_OUTBOUND 'E' | ⚠️ MENU_WMS_OUTBOUND 未在矩阵注册 → 任意调用返回 403 |
| `POST /api/v2/sales/inventory/batches` | MenuGuard | MENU_SALES2_INVENTORY 'C' | ✅ |
| `POST /api/v2/sales/inventory/mark-expired` | MenuGuard | MENU_SALES2_INVENTORY 'A' | ✅ |

**WMS_OUTBOUND/WMS_INBOUND 未注册风险**：这两个 MENU 在 rbac.matrix.ts 中有定义（MENU_WMS_INBOUND, MENU_WMS_OUTBOUND），但 Sidebar 引用的是 `MENU_WMS_INOUT`（**未注册**）。意味着：
- 仓库入出库 Sidebar 菜单显示后，点击会显示页面（前端无 perm），但所有 API 调用返回 `MENU_PERMISSION_NOT_REGISTERED (403)`。
- **现象**：仓库功能实际上对所有非 ADMIN 用户均无法使用。

### 8.2 Finance 资金写入接口

| 接口 | Guard | 权限 | 评估 |
|---|---|---|---|
| `POST /api/v2/finance/cash/accounts` | MenuGuard | MENU_FIN2_CASH 'E' | ✅ |
| `POST /api/v2/finance/cash/transfers` | MenuGuard | MENU_FIN2_CASH 'E' | ✅（但无 DataScope，见第五节）|
| `POST /api/v2/finance/shareholder/contributions` | MenuGuard | MENU_FIN2_SHAREHOLDER 'E' | ✅ |
| `POST /api/v2/finance/shareholder/settlements/:id/approve` | MenuGuard | MENU_FIN2_SHAREHOLDER 'E' | ⚠️ 应为 'A' |
| `POST /api/v2/finance/ar/receipts/:id/confirm` | MenuGuard | MENU_FIN2_AR 'E' | ⚠️ 应为 'A' |
| `POST /api/v2/finance/expenses` | MenuGuard | MENU_FIN2_EXPENSE 'E' | ✅ |

**高危接口共性问题**：资金确认（AR 收款确认、股东结算审批）使用 `'E'`（编辑）权限而非 `'A'`（审批）权限，导致持有编辑权限的普通财务人员可以执行应由 CFO 审批的资金操作。

---

## 九、DENY BY DEFAULT 审计

### 9.1 评估结果

| 项目 | 状态 |
|---|---|
| 未注册 MENU → 403 `MENU_PERMISSION_NOT_REGISTERED` | ✅ 已实现 |
| 注册 MENU 但角色无权 → 403 `MENU_PERMISSION_DENIED` | ✅ 已实现 |
| 无 `@RequireMenu` 注解的端点 → 仅需 JWT 登录 | ⚠️ 仅需登录即可访问 |
| ROLE_ADMIN 走矩阵校验（非无条件超管旁路） | ✅ 已实现 |
| username='admin' 在 Generic CRUD 仍有旁路 | ⚠️ 存在历史旁路 |

### 9.2 Generic CRUD admin 旁路

```typescript
// generic-crud.controller.ts 第 70 行
if (perms.includes('*') || req.user?.username === 'admin') {
  return; // 直接通过
}
```

`username=admin` 的账号可绕过 `TABLE_PERM_MAP` 的所有权限检查，直接对任意白名单表进行 CRUD。此旁路存在于非 MenuGuard 保护的 Generic CRUD 层。

---

## 十、Sidebar 与后端权限一致性

### 10.1 "菜单可见但 API 不可用"

| 菜单 | Sidebar perm | 后端 MENU | 一致性 |
|---|---|---|---|
| 仓库看板 `/warehouse` | `MENU_WMS_VIEW` | 后端 WMS inventory 使用 `MENU_INVENTORY` | ❌ 不一致，Sidebar 未注册 MENU 会显示但 403 |
| 入库管理 `/warehouse/inbound` | `MENU_WMS_INOUT` | 后端使用 `MENU_WMS_INBOUND` | ❌ 不一致 |
| 出库管理 `/warehouse/outbound` | `MENU_WMS_INOUT` | 后端使用 `MENU_WMS_OUTBOUND` | ❌ 不一致 |
| 质检 `/quality/farm` | `MENU_QA_OP` | 后端 quality.controller 使用 `MENU_QA` | ❌ 不一致 |
| 包装 `/packaging` | `MENU_PKG_OP` | 后端 packaging 使用 `MENU_PACKAGING` | ❌ 不一致 |
| 销售系统全组 | `perm: null` | 后端 Sales V2 使用 `MENU_SALES2_*` | ⚠️ 前端无控制 |

### 10.2 "API 可调用但菜单隐藏"

| 接口 | 状态 |
|---|---|
| 旧 procurement, transport, order, b2b 接口 | 菜单已隐藏，API 仍可调用（有 JWT，无 MenuGuard） |
| `/api/v3/approval/*` 旧审批接口 | 模块已删除，接口已不存在 |

---

## 十一、正式角色体系建议

### 11.1 推荐角色矩阵

#### 销售体系
| 角色代码 | 描述 | 关键权限 |
|---|---|---|
| `ROLE_SALES_REP` | 业务员 | 新增订单、查看客户档案、查看价格 |
| `ROLE_SALES_MGR` | 销售主管 | 审批订单、审批低价、管理渠道 |
| `ROLE_CHANNEL_MGR` | 渠道经理 | 管理经销商渠道、渠道价格配置 |
| `ROLE_CREDIT_MGR` | 信用专员 | 信用评估、解冻客户（建议新增） |

当前 `ROLE_SALES_REP` 和 `ROLE_SALES_MGR` 已在矩阵定义 ✅，`ROLE_CHANNEL_MGR` 缺失。

#### 配送体系
| 角色代码 | 描述 | 关键权限 |
|---|---|---|
| `ROLE_LOG_MGR` | 物流主管 | 配送管理全权 | ✅ 已存在 |
| `ROLE_DRIVER` | 司机 | 配送执行（出发/到达/完成） | ✅ 已存在 |
| `ROLE_DELIVERY_DISPATCH` | 调度员 | 分配配送单（建议新增） | ❌ 缺失 |

#### 库存体系
| 角色代码 | 描述 | 矩阵状态 |
|---|---|---|
| `ROLE_WMS_MGR` | 仓库主管 | ✅ 已存在 |
| `ROLE_WMS_OPERATOR` | 仓库操作员（建议新增） | ❌ 缺失，当前用 ROLE_FARMER 代替 |

#### 财务体系
| 角色代码 | 描述 | 矩阵状态 |
|---|---|---|
| `ROLE_FIN_CFO` | 财务总监 | ✅ |
| `ROLE_HQ_FINANCE` | 总部财务 | ✅ |
| `ROLE_FIN_ACCT` | 财务专员 | ✅ |
| `ROLE_FIN_AR` | 应收专员 | ✅ |
| `ROLE_FACTORY_ACCT` | 工厂会计 | ✅ |
| `ROLE_AUDITOR` | 审计专员 | ✅ |

#### 鸡场体系
| 角色代码 | 矩阵状态 |
|---|---|
| `ROLE_FARM_MGR` | ✅ |
| `ROLE_FARMER` | ✅ |
| `ROLE_VET` | ✅ |
| `ROLE_FARM_QC`（建议新增，当前用 ROLE_VET） | ❌ 缺失 |

#### 系统管理
| 角色代码 | 矩阵状态 |
|---|---|
| `ROLE_ADMIN` | ✅ |
| `ROLE_SYSOPS` | ✅ |
| `ROLE_HR_ADMIN` | ✅ |
| `ROLE_APPROVAL_ADMIN`（建议新增，专管审批规则） | ❌ 缺失 |

---

## 十二、CRITICAL / HIGH 风险清单

### 🔴 CRITICAL（必须立即处理）

| 编号 | 风险 | 位置 | 影响 |
|---|---|---|---|
| C1 | **Finance V2 DataScope 全集团数据泄漏** | `finance-v2/services/*.service.ts` | ROLE_FACTORY_ACCT 可查看全集团财务报表、资金账户、股东数据 |
| C2 | **Sales V2 DataScope 全集团数据泄漏** | `sales-v2/services/*.service.ts` | ROLE_SALES_REP 可查看所有公司销售订单、客户、价格数据 |
| C3 | **WMS 仓库功能实际全面不可用** | `Sidebar.tsx` + `rbac.matrix.ts` | Sidebar 使用 MENU_WMS_VIEW/MENU_WMS_INOUT/MENU_WMS_MASTER，后端 controller 使用 MENU_WMS/MENU_WMS_INBOUND/MENU_WMS_OUTBOUND/MENU_INVENTORY，MENU 不匹配导致所有 WMS 接口对非 ADMIN 用户 403 |

### 🟠 HIGH（应在下一次部署前处理）

| 编号 | 风险 | 位置 | 建议 |
|---|---|---|---|
| H1 | **Finance V2 / Sales V2 未挂载 DataScopeGuard** | 各 controller | 补加 `@UseGuards(MenuGuard, DataScopeGuard)` |
| H2 | **资金确认用 'E' 权限而非 'A'** | `fin-ar.controller.ts`, `fin-shareholder.controller.ts` | `POST receipts/:id/confirm` 改为 `'A'`；`settlements/:id/approve` 改为 `'A'` |
| H3 | **ROLE_CEO / ROLE_FIN_CFO 可增删审批规则** | `rbac.matrix.ts` MENU_WORKFLOW | 将二者 MENU_WORKFLOW 权限从 `['V','C','E','D','A','X']` 降为 `['V','A','X']` |
| H4 | **Sales V2 Sidebar 全组 perm=null** | `Sidebar.tsx` sales2 children | 将 Sales V2 所有子项补充 `perm: "MENU_SALES2"` 或对应子菜单 MENU |
| H5 | **12 个 MENU 代码在 Sidebar 引用但未在矩阵注册** | `Sidebar.tsx` → `rbac.matrix.ts` | 注册 MENU_WMS_VIEW, MENU_WMS_INOUT, MENU_WMS_MASTER, MENU_QA_OP, MENU_QA_MGR, MENU_PKG_OP, MENU_PKG_MGR, MENU_FARM_VET, MENU_STORE_MGR, MENU_B2B_SALE, MENU_DASHBOARD, MENU_SETTINGS_USER |
| H6 | **customer-credit unfreeze 仅需 'V' 权限** | `customer-credit.controller.ts` | `POST /credit/customers/:id/unfreeze` 应要求 `'A'`（审批）权限 |
| H7 | **旧版 farm/order/store API 无 MenuGuard** | legacy controllers | 对仍暴露业务数据的接口加 MenuGuard，或在 Generic CRUD 层完全拦截 |

### 🟡 MEDIUM

| 编号 | 风险 | 建议 |
|---|---|---|
| M1 | Generic CRUD `username=admin` 旁路 | 删除 username 旁路，只保留 `permissions=['*']` |
| M2 | Workflow `getMyTodos()` 未确认 userId 过滤 | 验证 ApprovalEngineService.getMyTodos() 是否通过 CLS 过滤当前用户 |
| M3 | stocktake/approve 和 loss/approve 用 'E' 而非 'A' | 改为审批权限 |
| M4 | DataScopeService 缓存 30 秒 TTL | 权限变更后最多 30 秒才生效，考虑降低 TTL 或增加主动失效 |
| M5 | Sales V2 health / Procurement V2 health 无鉴权 | 低风险（返回非敏感 schema 信息），可接受 |
| M6 | ROLE_APPROVAL_ADMIN 角色未定义 | 建议新增，专门管理审批规则，避免业务角色管理工作流配置 |

---

## 十三、加固建议（按优先级）

### 立即加固（本次部署前完成）

1. **修复 C3 — WMS MENU 不匹配**  
   方案一（推荐）：在 `rbac.matrix.ts` 添加：
   ```typescript
   MENU_WMS_VIEW:   { ROLE_ADMIN: [...], ROLE_WMS_MGR: ['V','X'], ROLE_FARM_MGR: ['V'], ... },
   MENU_WMS_INOUT:  { ROLE_ADMIN: [...], ROLE_WMS_MGR: ['V','C','E','D','A','X'], ... },
   MENU_WMS_MASTER: { ROLE_ADMIN: [...], ROLE_WMS_MGR: ['V','C','E','D'], ... },
   ```
   方案二：修改 Sidebar 使用已存在的 MENU_WMS / MENU_WMS_INBOUND / MENU_WMS_OUTBOUND。

2. **修复 H2 — 资金确认权限**  
   ```typescript
   // fin-ar.controller.ts
   @Post('receipts/:id/confirm')
   @RequireMenu('MENU_FIN2_AR', 'A')  // 'E' → 'A'
   
   // fin-shareholder.controller.ts  
   @Post('settlements/:id/approve')
   @RequireMenu('MENU_FIN2_SHAREHOLDER', 'A')  // 'E' → 'A'
   ```

3. **修复 H3 — CFO/CEO Workflow 权限降级**  
   ```typescript
   // rbac.matrix.ts MENU_WORKFLOW
   ROLE_FIN_CFO: ['V', 'A', 'X'],     // 去掉 C,E,D
   ROLE_CEO:     ['V', 'C', 'E', 'D', 'A', 'X'],  // CEO 保留规则管理
   ```

### 计划加固（下一迭代）

4. **修复 C1+C2 — DataScope 全集团泄漏**  
   Finance V2 和 Sales V2 需统一迁移至 DataScopeGuard + DataScopeHelper 模式：
   ```typescript
   // 每个需要 DataScope 的 controller：
   @UseGuards(MenuGuard, DataScopeGuard)
   
   // service 层改为读取 cls.get('dataScope') 而非 user.dataScope：
   private getScope() {
     const scope = this.dataScopeHelper.buildRawCondition({}, 0);
     return scope;  // 空 companyCodes → '1=0'，而非无过滤
   }
   ```

5. **修复 H5 — 注册缺失 MENU 代码**（12个）

6. **修复 H4 — Sales V2 Sidebar perm 补全**

7. **新增角色**：ROLE_DELIVERY_DISPATCH, ROLE_WMS_OPERATOR, ROLE_APPROVAL_ADMIN, ROLE_FARM_QC, ROLE_CHANNEL_MGR

---

## 十四、测试验证结果

```
TypeScript 编译（API）:  0 errors  ✅
TypeScript 编译（Web）:  0 errors  ✅
scope-audit.sh:          31/31 PASS ✅
```

> 注：scope-audit.sh 覆盖的是 Finance V2 + Procurement V2 + RBAC 基础场景，尚未包含 DataScope 空值泄漏的专项测试用例。建议针对 C1/C2 风险补充集成测试。

---

## 十五、总结

| 维度 | 评分 | 说明 |
|---|---|---|
| MenuGuard DENY BY DEFAULT | 9/10 | 机制完整，仅 legacy 接口无覆盖 |
| 审批越权防护 | 9/10 | validateApprover 完整，仅 Workflow 规则管理权限偏宽 |
| DataScope 实施 | 4/10 | Procurement V2 正确，Finance V2 / Sales V2 均存在全集团泄漏 |
| 角色体系完整度 | 7/10 | 主要角色已定义，缺少 5-6 个专项角色 |
| Sidebar 权限一致性 | 5/10 | 多处 MENU 不匹配，Sales V2 全组 perm=null |
| 高危写操作保护 | 6/10 | 资金确认/盘点审批用 'E' 而非 'A' 权限 |
| **综合评分** | **6.5/10** | |

**最高优先修复**：C3（WMS 完全不可用）> C1/C2（DataScope 全集团泄漏）> H2（资金确认权限）
