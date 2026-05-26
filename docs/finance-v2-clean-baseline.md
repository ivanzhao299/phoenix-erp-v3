# Finance V2 Phase 0 — Clean Baseline

> 版本：Phase 0 Clean Baseline  
> 创建日期：2026-05-26  
> 状态：🟢 已完成，等待 Phase 1 AP Runtime 启动

---

## 一、当前前提

| 条件 | 说明 |
|------|------|
| **无生产数据** | 系统尚未正式生产运行，当前无真实业务数据 |
| **旧数据视为测试数据** | `fin_transactions`、`fin_payments`、`biz_cash_flow` 均为测试阶段遗留 |
| **不做兼容迁移** | 不围绕旧表保守改造，直接建立 Finance V2 正式基线 |
| **不迁移旧测试数据** | `fin_*` 表当前为空，数据通过 Phase 1+ Workflow Runtime 产生 |
| **Procurement V2 不受影响** | `prc2_*` 表和接口保持不变，仅作为设计样板参考 |

---

## 二、Finance V2 正式边界

### 领域边界

```
Finance V2 Domain (fin_*)
├── AP Runtime        — fin_ap_invoices, fin_ap_payment_allocations
├── AR Runtime        — fin_ar_invoices, fin_ar_receipts
├── Cash Runtime      — fin_cash_accounts, fin_cash_transactions
├── Shareholder       — fin_shareholder_contributions, fin_shareholder_settlements
└── Exchange Rates    — fin_exchange_rates

依赖底座（只读引用，不写入）：
├── Workflow 2.0      — wf_approval_instances, wf_form_submissions（Phase A-I）
├── DataScope         — OrgModule @Global，自动 company_code 范围过滤
└── ApprovalEngine    — @Global，Phase 1+ 直接接入，无需额外 import
```

### 禁止事项

| 禁止 | 原因 |
|------|------|
| 写入 `fin_transactions` | 旧表，已废弃 |
| 写入 `fin_payments` | 旧表，已废弃 |
| 写入 `biz_cash_flow` | 旧表，已废弃 |
| 修改 `prc2_*` 表 | Procurement V2 已生产验证，不干扰 |
| 手写审批链 | 所有审批必须通过 ApprovalEngine |
| 重命名 prc2 表 | 历史数据依赖，不动 |

---

## 三、旧 Finance 废弃范围

### 废弃表（只读，禁止新增写入）

| 表名 | 废弃日期 | 替代 |
|------|---------|------|
| `fin_transactions` | 2026-05-26 | `fin_cash_transactions`（Phase 3） |
| `fin_payments` | 2026-05-26 | `fin_ap_payment_allocations`（Phase 1） |
| `biz_cash_flow` | 2026-05-26 | `fin_cash_transactions`（Phase 3） |

### 废弃页面（入口关闭，代码保留）

| 页面路径 | 废弃方式 | V2 替代 |
|---------|---------|---------|
| `/finance` | Sidebar 隐藏 + 顶部废弃提示 | `/finance2` |
| `/finance/receivables` | 同上 | `/finance2/ar` |
| `/finance/payables` | 同上 | `/finance2/ap` |
| `/finance/payments` | 同上 | `/finance2/ap` |
| `/finance/aging` | 同上 | `/finance2/ap` |
| `/finance/cashflow` | 同上 | `/finance2/cash-accounts` |
| `/finance/cost` | 同上 | `/finance2/reports` |

**废弃方式**：页面顶部注入 `LegacyFreezeBanner` 组件，显示废弃提示，新增按钮禁用/隐藏，不删除代码避免路由报错。

---

## 四、prc2 财务逻辑复用原则

Procurement V2 已完成并经过生产验证，以下设计样板直接复用到 Finance V2：

### 字段规范（完全对齐 prc2 样板）

```sql
-- 金额三段式（来自 prc2_payments / prc2_ap_ledger）
currency_code   VARCHAR(8)     -- 原币种（ISO 4217）
amount_original NUMERIC(18,2)  -- 原币金额
exchange_rate   NUMERIC(18,8)  -- 汇率（对 base_currency）
amount_base     NUMERIC(18,2)  -- 本位币金额（CNY）
base_currency   VARCHAR(8)     -- 本位币（默认 CNY）

-- 公司 + 项目二维（来自 prc2 所有核心表）
company_code   VARCHAR(64)    -- 财务主体
company_name   VARCHAR(256)
project_code   VARCHAR(64)    -- 成本归集项目（有项目语义的表）
project_name   VARCHAR(256)
```

### 设计原则复用

| prc2 原则 | Finance V2 应用 |
|----------|----------------|
| AP 台账独立（prc2_ap_ledger） | `fin_ap_invoices` 独立存储，不挂在 PO 下 |
| 付款记录独立（prc2_payments） | `fin_ap_payment_allocations` 独立核销 |
| 股东代付三维（company/project/payer） | `fin_shareholder_contributions` 同样三维 |
| DataScope 强制过滤 | 所有 Finance V2 列表接口继承 DataScope |
| Workflow Native 审批 | 所有付款/收款单通过 ApprovalEngine |

---

## 五、fin_* 表结构说明

### 完整表清单

| 表名 | 启用 Phase | 说明 |
|------|-----------|------|
| `fin_exchange_rates` | Phase 1 | 汇率表，各 Phase 通用 |
| `fin_ap_invoices` | Phase 1 | AP 应付发票台账 |
| `fin_ap_payment_allocations` | Phase 1 | AP 付款核销记录 |
| `fin_ar_invoices` | Phase 2 | AR 应收发票台账 |
| `fin_ar_receipts` | Phase 2 | AR 收款核销记录 |
| `fin_cash_accounts` | Phase 3 | 资金账户（银行/现金/虚拟） |
| `fin_cash_transactions` | Phase 3 | 资金流水（Append-only） |
| `fin_shareholder_contributions` | Phase 4 | 股东出资/借款台账 |
| `fin_shareholder_settlements` | Phase 4 | 股东资金结算单 |

### 关键约束

- 所有金额表使用**金额三段式**：`amount_original / exchange_rate / amount_base / base_currency`
- `fin_cash_transactions` 为 **Append-only**，不支持修改，错误使用反向冲销条目
- `balance_amount_original` 等余额字段使用 **GENERATED ALWAYS AS STORED** 计算列
- 所有状态字段有 **CHECK 约束**

---

## 六、Phase 1 AP Runtime 升格计划

### 目标

将 AP 数据来源从 `prc2_ap_ledger`（适配层）切换到 `fin_ap_invoices`（原生 Runtime）。

### 任务列表

```
Phase 1 AP Runtime 任务：

1. 设计 AP Workflow Form（wf_form_definition）
   - 字段：supplier_code, invoice_no, invoice_date, due_date,
           currency_code, amount_original, po_no, description
   - 审批规则：按金额分级（10万以内财务经理，10万以上 CFO）

2. 实现 FinApInvoiceService
   - createFromWorkflow(submissionId)：从 Form Runtime 创建 fin_ap_invoices
   - listInvoices(query)：分页列表，DataScope 过滤
   - getApSummary()：AP KPI 统计

3. 实现 FinApPaymentService
   - createAllocation(dto)：创建付款核销，更新 invoice.paid_amount
   - 联动 fin_cash_transactions（Phase 3 后）

4. Controller 路由扩展
   - POST /api/v2/finance/ap/invoices    — 发起 AP Workflow
   - GET  /api/v2/finance/ap/invoices    — fin_ap_invoices 列表（替换适配层）
   - POST /api/v2/finance/ap/payments    — 创建付款核销

5. 前端 /finance2/ap 页面升级
   - 从 prc2_ap_ledger 适配层切换到 fin_ap_invoices
   - 增加"发起 AP 申请"按钮（打开 WorkflowFormRenderer）

6. 适配层下线
   - ApAdapterService.listLegacyApSource 废弃
   - GET /api/v2/finance/ap/legacy-source 废弃
```

### 切换策略

```
切换前：/api/v2/finance/ap/legacy-source → prc2_ap_ledger（适配层）
切换后：/api/v2/finance/ap/invoices      → fin_ap_invoices（原生）
```

由于无生产历史数据，不需要数据迁移。

---

## 七、Phase 2 AR Runtime 计划

### 目标

建立应收账款原生 Runtime，打通销售订单 → AR 发票 → 收款核销完整链路。

### 核心任务

```
1. AR Workflow Form（客户发票 → 审批 → 确认）
2. FinArInvoiceService + FinArReceiptService
3. 路由：GET/POST /api/v2/finance/ar/*
4. 前端 /finance2/ar 页面完整实现
5. AR 账龄报表（30/60/90/120 天分级）
```

### 前提

Phase 1 AP Runtime 完成并稳定后启动。

---

## 八、Phase 3 Cash Runtime 计划

### 目标

建立多账户资金管理，打通 AP 付款 / AR 收款与资金账户的双向联动。

### 核心任务

```
1. FinCashAccountService（账户 CRUD）
2. FinCashTransactionService（Append-only 流水引擎）
3. AP 付款 → 自动生成 fin_cash_transactions OUT 记录
4. AR 收款 → 自动生成 fin_cash_transactions IN 记录
5. 资金日报（当日余额快照 + 收支汇总）
6. 银行流水导入（CSV/Excel → fin_cash_transactions 批量匹配）
7. 前端 /finance2/cash-accounts 完整实现
```

### 前提

Phase 2 AR Runtime 完成后启动。

---

## 九、RBAC 权限矩阵

| Menu Key | 权限角色 |
|----------|---------|
| `MENU_FIN2` | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_FACTORY_ACCOUNTANT, ROLE_CEO, ROLE_AUDITOR |
| `MENU_FIN2_AP` | 同上 + ROLE_PRC_BUYER ['V'] |
| `MENU_FIN2_AR` | 同 MENU_FIN2 |
| `MENU_FIN2_CASH` | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_FACTORY_ACCOUNTANT, ROLE_CEO, ROLE_AUDITOR |
| `MENU_FIN2_EXPENSE` | 同上 + ROLE_FARM_MGR ['V','C'], ROLE_STORE_MGR ['V','C'] |
| `MENU_FIN2_BUDGET` | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_CEO, ROLE_AUDITOR |
| `MENU_FIN2_SHAREHOLDER` | 同 MENU_FIN2_BUDGET + ROLE_SHAREHOLDER_VIEW ['V'] |
| `MENU_FIN2_REPORT` | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_CEO, ROLE_AUDITOR |

---

## 十、关联文档

- [Finance V2 架构文档](./finance-v2-architecture.md) — Phase 路线图 + API 清单
- [Workflow 2.0 Phase A 架构](./workflow-2-phase-a.md)
- [RBAC 权限矩阵](./rbac-matrix.md)
- [采购 V2 审计报告](./procurement_audit_report.md)

---

## 附：Phase 0 完成验收清单

- [x] API TypeScript 零错误
- [x] Web TypeScript 零错误
- [x] `GET /api/v2/finance/health` 返回 `{ status: "ok" }`
- [x] MENU_FIN2_* 8 个条目已注册 rbac.matrix.ts
- [x] `/finance2` Dashboard 可打开，显示 Phase 状态矩阵
- [x] `/finance2/ap` 可打开，适配层 AP 列表
- [x] `/finance2/ar` 可打开，Phase 2 规划占位
- [x] `/finance2/cash-accounts` 可打开，Phase 3 规划占位
- [x] `/finance2/shareholder-funds` 可打开，链接至 prc2 适配层
- [x] `/finance2/reports` 可打开，报表规划清单
- [x] 旧 `/finance/*` 页面显示废弃提示 Banner
- [x] 旧 Finance 菜单组从 Sidebar 隐藏
- [x] Procurement V2 未修改
- [x] Workflow Phase A-I 未回归
- [x] fin_* 9 张表 DDL 已创建
- [x] 6 个 TypeORM Entity 已注册
