# Finance V2 — Workflow Native 财务平台架构文档

> 版本：Phase 0 基线  
> 创建日期：2026-05-26  
> 状态：🚀 Phase 0 已完成，Phase 1 规划中

---

## 一、总体目标

Finance V2 是 Phoenix ERP V3 财务模块的全面重构。核心原则：

| 原则 | 说明 |
|------|------|
| **Workflow Native** | 所有财务单据（发票、付款、收款）均通过 Workflow 2.0 ApprovalEngine 驱动，无绕过路径 |
| **领域隔离** | 独立 `fin_*` 表空间，不与历史 `prc2_*` 表耦合 |
| **增量迁移** | 旧 Finance 页面冻结（只读 Banner），新 V2 路径并行上线，分 Phase 逐步替换 |
| **多币种** | 所有金额字段支持 currency_code + exchange_rate，汇率集中于 fin_exchange_rates |
| **DataScope** | 所有列表接口强制 DataScope 过滤，基于 ClsService 注入的 user.companyCodes |

---

## 二、Phase 路线图

```
Phase 0  ██████████  已完成（2026-05-26）
  - Legacy Freeze（旧 Finance 页面冻结只读 Banner）
  - Finance V2 API 骨架（/api/v2/finance/*）
  - AP Adapter 过渡层（读取 prc2_ap_ledger）
  - 领域表 DDL 基线（fin_ap_*, fin_ar_*, fin_cash_*, fin_shareholder_*）
  - RBAC MENU_FIN2_* 权限矩阵
  - Finance V2 前端：Dashboard / AP / CashAccounts / ShareholderFunds

Phase 1  ░░░░░░░░░░  待启动
  - fin_ap_invoices 原生 AP Runtime
  - fin_ap_payments 付款核销
  - AP Workflow（发票创建 → 审批 → 付款）
  - AP Adapter 下线

Phase 2  ░░░░░░░░░░  规划中
  - fin_ar_invoices + fin_ar_receipts AR Runtime
  - fin_cash_accounts + fin_cash_transactions 资金账户
  - fin_shareholder_contributions + fin_shareholder_settlements 股东资金

Phase 3  ░░░░░░░░░░  规划中
  - fin_expense_requests 费用报销（Workflow Form Runtime 驱动）
  - 费用类别 + 预算占用

Phase 4  ░░░░░░░░░░  规划中
  - fin_budgets 预算编制
  - 预算执行追踪 + 超预算审批

Phase 5  ░░░░░░░░░░  规划中
  - 财务报表（资产负债表 / 利润表 / 现金流量表）
  - 多公司合并报表
```

---

## 三、目录结构

```
apps/
├── api/src/modules/finance-v2/
│   ├── finance-v2.module.ts          # NestJS 模块
│   ├── controllers/
│   │   └── finance-v2.controller.ts  # /api/v2/finance/* 路由
│   └── services/
│       └── ap-adapter.service.ts     # Phase 0 AP 适配层服务
│
└── web/src/app/(admin)/finance2/
    ├── page.tsx                      # Dashboard
    ├── ap/page.tsx                   # AP 应付账款列表
    ├── cash-accounts/page.tsx        # 资金账户（Phase 2 规划）
    └── shareholder-funds/page.tsx    # 股东资金（适配层链接）

migrations/
└── 20260526_finance_v2_baseline.sql  # 领域表 DDL

docs/
└── finance-v2-architecture.md        # 本文档
```

---

## 四、API 接口清单（Phase 0）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v2/finance/dashboard` | MENU_FIN2 V | Dashboard 汇总：模块状态 + AP 统计 |
| GET | `/api/v2/finance/ap/legacy-source` | MENU_FIN2_AP V | AP 列表（prc2_ap_ledger 适配） |
| GET | `/api/v2/finance/ap/summary` | MENU_FIN2_AP V | AP 统计汇总 |

### 请求/响应示例

#### GET /api/v2/finance/dashboard

```json
{
  "modules": {
    "ap":          { "status": "ADAPTER", "source": "prc2_ap_ledger", "summary": { ... } },
    "ar":          { "status": "PLANNED" },
    "cash":        { "status": "PLANNED" },
    "shareholder": { "status": "ADAPTER", "source": "prc2_shareholder_funds" },
    "expense":     { "status": "PLANNED" },
    "budget":      { "status": "PLANNED" }
  },
  "workflowPlatform": {
    "status":         "READY",
    "formRuntime":    "READY",
    "approvalEngine": "READY",
    "sla":            "READY"
  },
  "legacyFreeze": {
    "frozenAt": "2026-05-26",
    "tables":   ["fin_transactions", "fin_payments", "biz_cash_flow"],
    "pages":    ["/finance", "/finance/payments", ...]
  }
}
```

#### GET /api/v2/finance/ap/legacy-source

查询参数：`status`, `companyCode`, `supplierCode`, `keyword`, `page`, `pageSize`

```json
{
  "data": [{
    "id": 1,
    "ap_no": "AP-2026-0001",
    "supplier_code": "SUP001",
    "supplier_name": "示例供应商",
    "company_code": "HK01",
    "invoice_date": "2026-05-01",
    "due_date": "2026-06-01",
    "amount": "100000.00",
    "paid_amount": "0.00",
    "balance": "100000.00",
    "currency_code": "CNY",
    "status": "OPEN"
  }],
  "total": 128,
  "page": 1,
  "pageSize": 20
}
```

---

## 五、RBAC 权限矩阵

| Menu Key | 权限角色 |
|----------|---------|
| MENU_FIN2 | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_FACTORY_ACCOUNTANT, ROLE_CEO, ROLE_AUDITOR |
| MENU_FIN2_AP | 同上 + ROLE_PRC_BUYER ['V'] |
| MENU_FIN2_AR | 同 MENU_FIN2 |
| MENU_FIN2_CASH | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_FACTORY_ACCOUNTANT, ROLE_CEO, ROLE_AUDITOR |
| MENU_FIN2_EXPENSE | 同上 + ROLE_FARM_MGR ['V','C'], ROLE_STORE_MGR ['V','C'] |
| MENU_FIN2_BUDGET | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_CEO, ROLE_AUDITOR |
| MENU_FIN2_SHAREHOLDER | 同 MENU_FIN2_BUDGET + ROLE_SHAREHOLDER_VIEW ['V'] |
| MENU_FIN2_REPORT | ROLE_ADMIN, ROLE_FIN_CFO, ROLE_GROUP_FINANCE, ROLE_CEO, ROLE_AUDITOR |

---

## 六、数据库表概览

### Phase 0 基线（已创建，Phase 0 为空表）

| 表名 | 说明 | 启用 Phase |
|------|------|-----------|
| `fin_exchange_rates` | 汇率表（多币种基础） | Phase 1 |
| `fin_ap_invoices` | AP 应付发票台账 | Phase 1 |
| `fin_ap_payments` | AP 付款记录 | Phase 1 |
| `fin_ar_invoices` | AR 应收发票台账 | Phase 2 |
| `fin_ar_receipts` | AR 收款记录 | Phase 2 |
| `fin_cash_accounts` | 资金账户 | Phase 3 |
| `fin_cash_transactions` | 资金流水 | Phase 3 |
| `fin_shareholder_contributions` | 股东出资/贷款 | Phase 4 |
| `fin_shareholder_settlements` | 股东资金结算单 | Phase 4 |

### 遗留表（只读，Phase 0 冻结）

| 表名 | 说明 |
|------|------|
| `fin_transactions` | 旧财务流水（已冻结） |
| `fin_payments` | 旧付款单（已冻结） |
| `biz_cash_flow` | 旧现金流（已冻结） |
| `prc2_ap_ledger` | 采购 V2 AP 台账（Phase 0 适配层来源） |
| `prc2_shareholder_funds` | 采购 V2 股东资金（Phase 0 适配层来源） |

---

## 七、AP Adapter 适配层设计

Phase 0 通过 `ApAdapterService` 读取 `prc2_ap_ledger` 实现过渡：

```typescript
// ap-adapter.service.ts 核心逻辑
async listLegacyApSource(query: ListApQuery) {
  const companyCodes = await this.getDataScopeCompanies();
  // raw SQL：SELECT * FROM prc2_ap_ledger WHERE company_code = ANY($1) ...
  // 支持 status / supplierCode / keyword 过滤 + 分页
}

async getApSummary(companyCodes?: string[]) {
  // GROUP BY 聚合：open_count, partial_count, paid_count, total_balance, overdue_balance
}
```

**Phase 1 切换计划**：
1. 建立 AP Workflow（表单 → 审批 → fin_ap_invoices 写入）
2. 历史数据迁移脚本：`prc2_ap_ledger` → `fin_ap_invoices`
3. `finance-v2.controller.ts` 中替换 `apAdapter.listLegacyApSource` → `apService.listInvoices`
4. `ApAdapterService` 下线，模块中移除

---

## 八、旧模块冻结清单

| 冻结日期 | 2026-05-26 |
|---------|-----------|
| **冻结表** | fin_transactions, fin_payments, biz_cash_flow |
| **冻结页面** | /finance, /finance/payments, /finance/receivables, /finance/payables, /finance/aging, /finance/cashflow, /finance/cost |
| **冻结方式** | 页面顶部注入 `LegacyFreezeBanner`，提示重定向到 V2，不删除页面 |
| **旧接口** | 保留但不新增，Finance V1 API (FinanceModule) 不再维护 |

---

## 九、前端路由映射

| V1 路径 | 冻结提示 | V2 跳转 |
|---------|---------|---------|
| `/finance` | ✅ 已冻结 | → `/finance2` |
| `/finance/payables` | ✅ 已冻结 | → `/procurement2/payments` |
| `/finance/receivables` | ✅ 已冻结 | → `/finance2/ap` |
| `/finance/payments` | ✅ 已冻结 | → `/procurement2/payments` |
| `/finance/aging` | ✅ 已冻结 | → `/finance2/ap` |
| `/finance/cashflow` | ✅ 已冻结 | → `/finance2/cash-accounts` |
| `/finance/cost` | ✅ 已冻结 | 无跳转（Phase 5 规划） |

| V2 路径 | 状态 | 说明 |
|---------|------|------|
| `/finance2` | ✅ Phase 0 | Dashboard |
| `/finance2/ap` | ✅ Phase 0 | AP 适配层列表 |
| `/finance2/cash-accounts` | 📋 Phase 3 | 规划占位页 |
| `/finance2/shareholder-funds` | ✅ Phase 0 | 适配层链接到 Procurement V2 |

---

## 十、相关文档

- [Workflow 2.0 Phase A 架构](./workflow-2-phase-a.md)
- [RBAC 权限矩阵](./rbac-matrix.md)
- [采购审计报告](./procurement_audit_report.md)
