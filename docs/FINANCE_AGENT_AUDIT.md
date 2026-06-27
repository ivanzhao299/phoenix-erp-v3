# Finance Agent Audit — AP / AR / Cash / Expense / Shareholder Funds

> 范围：apps/api/src/modules/finance-v2、apps/api/src/modules/shareholder、apps/web/src/app/(admin)/finance2、apps/web/src/app/(admin)/shareholders、apps/web/src/lib/shareholder-api.ts
> 输出时间：2026-06-20（feature/agent-finance）
> 目的：第一阶段只做**审计**，列出五大财务子域对公司 / 项目 / 客户 / 供应商 / 资金账户 / 收付款 / 股东资金的依赖，不做改造。

---

## 0. 顶层结论

1. **五大子域共用同一套外部主数据**：公司（org）、项目（biz_projects）、客户（sal_customers）、供应商（prc2_suppliers）、股东（shr_shareholders）、资金账户（fin_cash_accounts）；前端统一通过 `shared-selectors/MasterDataSelectors.tsx` 与 `DictSelect` 接入，没有发现绕过主数据的裸 input。
2. **后端 service 没有直接 JOIN 主数据表**（grep `biz_projects | sal_customers | prc2_suppliers | sys_organizations | mst_` 在 finance-v2/shareholder 服务里 0 命中）。所有主数据都是"选时取 code+name 快照写入"的冗余模式（company_code/company_name、supplier_code/supplier_name、customer_code/customer_name、project_code/project_name），所以**当上游主数据改名、停用、合并时，已有单据上的 name 会过时**——这是当前最大的隐形耦合。
3. **AP 有两套实现并存**：`prc2_ap_ledger`（采购侧权威，只读 adapter）与 `fin_ap_invoices`（财务正式台账，含手工/期初/导入）。两者通过 `import-from-prc2` 幂等导入桥接，**未做实时同步**。
4. **AR 有三层结构**：`fin_ar_invoices`（发票级，权威）+ `fin_ar_receipts/allocations`（收款核销）+ `fin_ar_ledger`（往来余额台账，集团应收快照）。`fin_ar_invoices` 与 `chanjet_ar_snapshot` 永禁连接（CLAUDE.md §0.6 铁律）。
5. **现金账户 = 全财务的中央"账户表"**：AP 付款 / AR 收款 / 报销 / 股东出资 / 股东偿还 / 账户转账 都必须经 `fin_cash_accounts.id` + `fin_cash_transactions`（Append-only 流水）。`writeTransaction` 是唯一写流水的入口，封装在 `CashTransactionsService`。
6. **股东资金是双轨**：
   - `finance-v2/fin_shareholder_contributions + settlements`：**财务侧**资金到账/还款，含现金账户、汇率、审批、流水联动。
   - `shareholder/shr_capital_contributions`：**股权侧**资本流台账，驱动实缴比例与股权状态，**不直接动现金账户**，仅 `finance_bridge_status` 标记是否已映射到财务侧。
   两者通过 `GET /api/shareholders/finance-bridge` 做对账，但没有强制单向流向；这是治理欠债。
7. **DataScope 在 finance-v2 命名错位**：CLS 写入字段是 `dataScope.isGlobal + allowedCompanyCodes`（org/data-scope.service.ts 写），但 finance-v2 service 读的是 `dataScope.scopeAll + companyCodes`——controller 层做了**逐次手工映射**（10 处 controller 都重复了"scope→user.dataScope"的拼装代码）。这是 finance-v2 自己的小框架，没用 CLS 直读。

---

## 1. 模块清单

### 1.1 后端 (apps/api/src/modules)

| 模块路径 | 实体 | Service | Controller | 备注 |
|---|---|---|---|---|
| finance-v2/entities | 13 张 fin_* 实体 | — | — | 见 §2 |
| finance-v2/services | — | 14 个 | — | 见 §3 |
| finance-v2/controllers | — | — | 10 个 | 路由前缀 `/api/v2/finance/*` + 兼容 `/api/finance/income`、`/api/finance/ar-aging/customer/:code` |
| shareholder/entities | shr_shareholders、shr_projects、shr_project_equity、shr_capital_contributions、shr_shareholder_scopes、shr_beneficial_equity | — | — | 6 张 shr_* |
| shareholder/services | — | shareholder.service.ts、capital-aggregation.service.ts | — | — |
| shareholder/controllers | — | — | shareholder.controller.ts | 路由前缀 `/api/shareholders/*`，全部走 `@RequireMenu` |

### 1.2 前端 (apps/web/src/app/(admin))

| 页面 | 后端 API | 引用的 Selector | 引用的 Dict |
|---|---|---|---|
| finance2/ap/page.tsx | `/api/v2/finance/ap/*` | CompanySelector、SupplierSelector | SYS_CURRENCY |
| finance2/ar/page.tsx | `/api/v2/finance/ar/*` | CompanySelector、CustomerSelector、CashAccountSelector | SYS_CURRENCY、FIN_RECEIPT_METHOD |
| finance2/cash-accounts/page.tsx | `/api/v2/finance/cash` | CompanySelector | — |
| finance2/fund-transfers/page.tsx | `/api/v2/finance/cash` | CashAccountSelector ×2（valueField='id'） | — |
| finance2/expenses/page.tsx | `/api/v2/finance/expenses` | CompanySelector | FIN_EXPENSE_TYPE、SYS_CURRENCY |
| finance2/reimbursements/page.tsx | `/api/v2/finance/expenses/reimbursements` | CashAccountSelector（pay 现金账户） | — |
| finance2/shareholder-funds/page.tsx | `/api/v2/finance/shareholders` | CompanySelector、ShareholderSelector、CashAccountSelector | FIN_CONTRIBUTION_TYPE、SYS_CURRENCY，AttachmentUploader |
| finance2/ar-ledger/page.tsx | `/api/v2/finance/ar-ledger` | — | — |
| finance2/ar-reconciliation/page.tsx | `/api/v2/finance/ar-reconciliation` | — | — |
| finance2/chanjet-sync/page.tsx | `/api/chanjet/*`（Audit Agent 责任域） | — | — |
| finance2/reports/page.tsx | `/api/v2/finance/reports/*` | — | — |
| shareholders/projects、equity、capital、contributions、scopes、equity、dashboard | `/api/shareholders/*`（见 lib/shareholder-api.ts） | DataTableV3、AttachmentUploader、SelectField；scopes 直接 `fetch /api/generic-crud/sys_user?limit=200` 取用户列表 | — |

> ⚠️ `apps/web/src/components/finance/` 目录里只有 `LegacyFreezeBanner.tsx`——业务页面都在 `app/(admin)/finance2/` 下；finance UI 没有共享组件层，复用全部依赖 `design-system` 与 `shared-selectors`。

---

## 2. 实体依赖矩阵

> 列含义：**公司**=`company_code/company_name`，**项目**=`project_code/project_name`，**客户**=`customer_code/customer_name/customer_id`，**供应商**=`supplier_code/supplier_name/supplier_id`，**资金账户**=`cash_account_id/cash_account_code` 或 `account_id/account_code`，**股东**=`shareholder_code/shareholder_id/shareholder_name`，**收/付款**=对 fin_cash_transactions 的写入，**审批**=`wf_instance_id`，**附件**=`attachment_urls`。

| 实体 | 公司 | 项目 | 客户 | 供应商 | 资金账户 | 股东 | 写流水 | 审批 | 附件 |
|---|---|---|---|---|---|---|---|---|---|
| fin_ap_invoices | ✔ 必填 | ✔ 可空 | — | ✔ 三件套（id/code/name），supplier_name 必填 | — | — | — (付款由 prc2 侧处理 / Expense 路径) | ✔ wf_instance_id | — |
| fin_ar_invoices | ✔ 必填 | ✔ 可空 | ✔ 三件套，customer_name 必填 | — | — | — | — | ✔ | — |
| fin_ar_receipts | ✔ 必填 | ✔ 可空 | ✔ 三件套 | — | ✔ `received_account_code`（resolve→fin_cash_accounts） | — | ✔ confirm() 写 IN 流水 | ✔ | — |
| fin_ar_receipt_allocations | — | — | — | — | — | — | — | — | — |
| fin_cash_accounts | ✔ 必填 | — | — | — | 主表 | — | — | — | — |
| fin_cash_transactions | ✔ 必填 | — | — | — | ✔ account_id/code/name 三件套 | — | 主表（Append-only） | — | — |
| fin_fund_transfers | ✔ 必填 | — | — | — | ✔ from + to 各三件套，DDL CHECK `from<>to` | — | ✔ execute() 写 OUT+IN 两条 | ✔ DRAFT→PENDING_APPROVAL→APPROVED→EXECUTED | — |
| fin_expense_requests | ✔ 必填 | ✔ 可空 | — | — | — | — | — | ✔ Workflow Native，从 form_submission 起 | ✔ attachment_urls jsonb |
| fin_reimbursements | ✔ 必填 | — | — | — | ✔ cash_account_id（pay() 时） | — | ✔ pay() 写 OUT 流水 | ✔ | — |
| fin_shareholder_contributions | ✔ 必填 | ✔ 可空 | — | — | ✔ cash_account_id（资金来源） | ✔ 三件套，shareholder_name 必填 | 联动 cash（DRAFT→CONFIRMED 时由 service 决定是否写流水） | ✔ | 通过 FIN_CONTRIBUTION_TYPE+前端 AttachmentUploader（voucherUrl 单 string） |
| fin_shareholder_settlements | ✔ 必填 | ✔ 可空 | — | — | ✔ cash_account_id（RETURN 必填） | ✔ 三件套 | ✔ execute() 时 applyBalance + writeTransaction | ✔ DRAFT→PENDING_APPROVAL→APPROVED→SETTLED | — |
| fin_ar_ledger | farm_code+company_code | — | counterparty_code/name | — | — | — | — | — | — |
| fin_exchange_rates | 可空（NULL=全局） | — | — | — | — | — | — | — | — |
| shr_shareholders | — | — | — | — | — | 主表 | — | — | — |
| shr_projects | ✔ 可空 + site_code | 主表（project_code） | — | — | — | — | — | — | — |
| shr_project_equity | — | ✔ project_code | — | — | — | ✔ shareholder_code | — | — | — |
| shr_capital_contributions | — | ✔ project_code 必填 | — | — | 仅 `bank_account` varchar128（非 fin_cash_accounts 引用） | ✔ shareholder_code | — | ✔ wf_instance_id | ✔ attachment_urls jsonb |
| shr_shareholder_scopes | scope_type=COMPANY 时 scope_code=companyCode | scope_type=PROJECT 时 project_code | — | — | — | shareholder_code | — | — | — |
| shr_beneficial_equity | — | ✔ project_code | — | — | — | nominee + beneficial 两个 shareholder_code | — | — | — |

> 三件套 = `*_id + *_code + *_name` 三列并存（id/code 选填、name 必填或冗余）。

---

## 3. 子域级依赖分析

### 3.1 AP（应付）

**实体**：`fin_ap_invoices` + 只读引用 `prc2_ap_ledger`
**Service**：`ApInvoicesService`（finance 自有 fin_ap_invoices）、`ApAdapterService`（只读 prc2_ap_ledger）
**Controller**：`fin-ap.controller.ts` → `/api/v2/finance/ap/*` + `finance-v2.controller.ts` 的 `/api/v2/finance/ap/legacy-source`、`/api/v2/finance/ap/summary`

| 依赖 | 形式 | 解释 |
|---|---|---|
| 公司 | company_code + company_name 冗余 | Selector 取 `/api/org/organizations?type=COMPANY`，DataScope 自动过滤 |
| 项目 | project_code + project_name 冗余 | 可空；目前 AP 表单未引入 ProjectSelector ⚠️ |
| 供应商 | supplier_id + supplier_code + supplier_name | Selector 取 `/api/master-data/runtime/supplier/active` |
| 客户 | — | AP 不涉及客户 |
| 资金账户 | — | AP 本身不直接写现金账户；付款实操目前**走 procurement-v2 的支付链 + prc2_payment**（CLAUDE.md G83~G85 阶段产物），财务侧只在 import-from-prc2 时同步 `paid_amount_original/balance_amount_original/payment_status` |
| 收付款 | 由 prc2 侧驱动，财务侧只追踪状态 | sourceType=PO 的 AP 由 `import-from-prc2` 同步；MANUAL 的 AP 目前**没有付款回写路径** ⚠️ |
| 股东资金 | 间接：股东代付货款会在 procurement-v2 创建 PO 后映射到 fin_ap_invoices | 参考 project_g139_g147_payment_chain.md：股东代付编码 vs bigint id 错位曾导致 22P02 |
| 审批 | wf_instance_id | 当前 AP 没看到 startApproval 调用（PO 侧已审过） |

**风险点**：
- AP 没有自己的"付款"端点；手工录入的 AP（MANUAL/EXPENSE/OPENING）目前缺少配套的"AP→现金账户写流水"路径。
- AP 与 prc2_ap_ledger 双轨；`ApAdapterService`（只读）与 `ApInvoicesService`（财务正式）的边界容易让前端误用。

### 3.2 AR（应收）

**实体**：`fin_ar_invoices`、`fin_ar_receipts`、`fin_ar_receipt_allocations`、`fin_ar_ledger`
**Service**：`ArInvoicesService`、`ArReceiptsService`、`ArLedgerService`、`ArReconciliationService`
**Controller**：`fin-ar.controller.ts`、`fin-ar-ledger.controller.ts`、`fin-ar-reconciliation.controller.ts`

| 依赖 | 形式 | 解释 |
|---|---|---|
| 公司 | company_code/name | 必填 |
| 项目 | project_code/name | 可空，**当前 AR 前端表单未暴露 ProjectSelector** ⚠️ |
| 客户 | customer_id + customer_code + customer_name | Selector 取 `/api/master-data/runtime/customer/active` |
| 资金账户 | `fin_ar_receipts.received_account_code` 引用 `fin_cash_accounts.account_code` | 前端 `CashAccountSelector` valueField 默认 'code' |
| 收款 | `confirm(receiptId)` → 写 fin_ar_receipt_allocations + 更新 fin_ar_invoices.received_amount/status + `CashTransactionsService.writeTransaction(direction='IN', source_type='AR_RECEIPT', source_id=receiptId)` | 单事务 |
| 销售订单联动 | 来源 `source_type=SALES_ORDER + source_id + source_no`；entity 注释提及 `sal_customer_id` DB 漂移列 | fin_ar_invoices 不直接 JOIN sal_orders；销售自动开票路径在 sales-v2 触发 |
| 好业财 | `fin_ar_ledger.source='CHANJET_VERIFIED_*'` | `fin_ar_invoices` 与 `chanjet_ar_snapshot` 永禁连接（CLAUDE.md §0.6） |
| 审批 | wf_instance_id（目前 AR 收款 confirm 直发，未走 Workflow） | — |

**风险点**：
- `fin_ar_invoices` entity 注释明确标注：DB 列 `sal_customer_id` 存在但 entity 缺，索引 `idx_fin_ar_inv_sal_cust` 已跳过——这是 g197 已知漂移之一。
- 受 G198 影响：fin_ar_ledger 唯一键 `(farm_code, counterparty_name, period_date)` 全 NOT NULL，安全；fin_ar_receipts 没有多列 unique，customer_id/code 可空也只是普通索引，无 NULL-unique 风险。

### 3.3 Cash（资金账户与流水）

**实体**：`fin_cash_accounts`、`fin_cash_transactions`、`fin_fund_transfers`、`fin_exchange_rates`
**Service**：`CashAccountsService`、`CashTransactionsService`、`FundTransfersService`
**Controller**：`fin-cash.controller.ts` → `/api/v2/finance/cash/*`

| 依赖 | 形式 | 解释 |
|---|---|---|
| 公司 | company_code/name；account_type=SHAREHOLDER 时不绑公司也可（业务约定） | DataScope 过滤 |
| 项目 | — | 资金账户与流水不挂项目（财务最高层抽象） |
| 客户 / 供应商 | — | 直接无；source_type 标记业务来源（AR_RECEIPT/AP_PAYMENT/TRANSFER/REIMBURSEMENT/SHAREHOLDER/MANUAL/OPENING）+ source_id 反查 |
| 资金账户 | 主表 | account_type 5 态：BANK / CASH / VIRTUAL / SHAREHOLDER / INTERNAL |
| 收付款 | 唯一写入：`CashTransactionsService.writeTransaction()` + `CashAccountsService.applyBalance()`（必须同事务） | append-only |
| 股东资金 | account_type=SHAREHOLDER 是合法资金账户类型 | 股东出资/还款可以把资金停在 SHAREHOLDER 账户上 |
| 审批 | 仅 `fin_fund_transfers.wf_instance_id`；账户增删改没有审批 | execute() 走 SERIALIZABLE 事务 + `from_account_id <> to_account_id` CHECK |
| 汇率 | `fin_exchange_rates` 全局或公司级 | AP/AR/Cash/Expense/Shareholder 三段式金额都依赖此表换算 amount_base |

**风险点**：
- DataScope 命名错位（见 §0 第 7 点）；finance-v2 controller 全部要做"`scope.isGlobal → user.dataScope.scopeAll`"手工映射，写错就漏过滤。
- Phase 5 `reimbursements.service.ts:pay()` 直接 `INSERT INTO fin_cash_transactions`（line 270）+ `UPDATE fin_cash_accounts`（line 259），**绕开了 `CashTransactionsService.writeTransaction()` 单入口约束**——这是事实上的旁路写，与 CLAUDE.md §6 库存唯一台账精神相违（但财务侧未明文禁止）。建议后续统一收口。

### 3.4 Expense（费用申请与报销）

**实体**：`fin_expense_requests`、`fin_reimbursements`
**Service**：`ExpenseRequestsService`、`ReimbursementsService`
**Controller**：`fin-expense.controller.ts` → `/api/v2/finance/expenses/*` + `/api/v2/finance/expenses/reimbursements/*`

| 依赖 | 形式 | 解释 |
|---|---|---|
| 公司 | company_code/name 必填 | DataScope 过滤 |
| 项目 | project_code/name 可空 | 前端 expenses/page.tsx 目前未集成 ProjectSelector ⚠️ |
| 客户 / 供应商 | — | 费用是公司内部支出，不直接关联 |
| 资金账户 | `fin_reimbursements.cash_account_id`（pay() 时填） | CashAccountSelector valueField='id' |
| 收付款 | pay() 路径：FOR UPDATE 锁 fin_cash_accounts + UPDATE current_balance + INSERT fin_cash_transactions (OUT, source_type=REIMBURSEMENT) | 见 §3.3 风险点 |
| 股东资金 | — | — |
| 审批 | **Workflow Native**：`ApprovalEngine.startApproval()` 强制走，从 `wf_form_submissions` 起，onApproved 回调自动生成 fin_reimbursements (status=PENDING) | 见 reimbursements.service.ts:24~34 注释 |
| 附件 | `fin_expense_requests.attachment_urls` jsonb（多附件） | 前端 expenses/page.tsx 目前**没看到 AttachmentUploader 集成** ⚠️——但 entity 已支持 |
| 字典 | FIN_EXPENSE_TYPE（费用类型）、SYS_CURRENCY | DictSelect |

**风险点**：
- 报销支付直接旁路 CashTransactionsService（同 §3.3）。
- 费用申请前端没用 AttachmentUploader 上传发票（CLAUDE.md §4 凭证禁 URL 文本框）——entity 字段已有，前端待补。
- 申请人 `requester_id/requester_name` 可空，没有 UserSelector 绑定校验（service 通常从 ctx 取）。

### 3.5 Shareholder Funds（股东资金 + 股权资本流）

**双轨**：
- **财务侧** `finance-v2`：`fin_shareholder_contributions`、`fin_shareholder_settlements`（含现金账户、汇率、审批、流水联动）
- **股权侧** `shareholder`：`shr_capital_contributions`（资本流，驱动 shr_project_equity 实缴比例）+ `shr_projects` + `shr_project_equity` + `shr_beneficial_equity` + `shr_shareholder_scopes` + `shr_shareholders`

| 依赖 | 财务侧 (fin_shareholder_*) | 股权侧 (shr_capital_*) |
|---|---|---|
| 公司 | company_code/name 必填 | shr_projects.company_code 可空（项目挂公司） |
| 项目 | project_code/name 可空 | shr_capital_contributions.project_code **必填** |
| 客户 / 供应商 | — | — |
| 资金账户 | cash_account_id（fin_cash_accounts.id） | 仅 bank_account varchar128（**自由文本，未绑定 fin_cash_accounts**） ⚠️ |
| 股东 | shareholder_id + shareholder_code + shareholder_name | shareholder_code |
| 收付款 | settlement.execute() 写 OUT 流水 + applyBalance；contribution PAYMENT 路径目前在 service 内 source_type=PAYMENT 标记 | 不写流水，仅 status 状态机 + finance_bridge_status=READ_ONLY/MAPPED |
| 审批 | wf_instance_id；contributions/submit-confirm + settlements/submit | wf_instance_id；capital/{id}/submit + capital/{id}/confirm + capital/{id}/reverse |
| 附件 | shareholder-funds/page.tsx 用 AttachmentUploader 单 string（voucherUrl） | shr_capital_contributions.attachment_urls jsonb（多附件），capital/[id]/page.tsx 用 AttachmentUploader |
| 字典 | FIN_CONTRIBUTION_TYPE（INVESTMENT/LOAN/ADVANCE/GUARANTEE/PAYMENT_ON_BEHALF）+ SYS_CURRENCY | 前端 SOURCE_TYPE_LABEL 是 lib 端硬编码字典 ⚠️（CLAUDE.md §3 禁硬编码 select，但 shareholders/capital 仍在用） |
| Bridge | — | `GET /api/shareholders/finance-bridge` 对账：shrTotal vs finTotal vs diff，结果在 capital/page.tsx 展示 |

**风险点 / 治理欠债**：
1. 两表数据**没有强制单向 / 主从关系**，靠 finance_bridge_status 软标记和 `financeBridge` 端点对账。
2. shr_capital_contributions 的 `bank_account` 是自由文本，没接 CashAccountSelector——和 fin_shareholder_contributions.cash_account_id 模型分歧。
3. shareholders/capital 前端 SOURCE_TYPE / CONTRIB_STATUS 是 lib 内 const map，未走 sys_dict——违反 CLAUDE.md §3，需要后续治理（不在第一阶段范围）。
4. shr_shareholders 状态字段没有 unique 约束含 nullable 列；shr_beneficial_equity 的唯一键 `(projectCode, nomineeShareholderCode, beneficialShareholderCode)` 三列都 varchar，需要确认 NOT NULL（entity 未声明 nullable=true，默认 NOT NULL ✓）。
5. shr_capital_contributions 是 `shareholder` 模块责任域，按 finance-agent.md "禁止事项" 不属于 Finance Agent 直接修改范围；但 finance_bridge_status 与 fin_shareholder_contributions 的契约属于 Finance Agent 域。

---

## 4. 共用主数据与字典覆盖率

### 4.1 主数据 Selector 使用

| Selector | 使用页面 | 是否仅 ACTIVE |
|---|---|---|
| CompanySelector | ap、ar、cash-accounts、expenses、shareholder-funds | ✔（DataScope 自动过滤） |
| CustomerSelector | ar | ✔ |
| SupplierSelector | ap | ✔ |
| ProjectSelector | **未在 finance2 任何页面引用** ⚠️ | — |
| ShareholderSelector | shareholder-funds | — |
| CashAccountSelector | ar（valueField='code'）、fund-transfers ×2（valueField='id'）、reimbursements（valueField='id'）、shareholder-funds（valueField='id'） | ✔ status=ACTIVE |
| UserSelector | finance2 内未引用；shareholders/scopes 直接 fetch /api/generic-crud/sys_user ⚠️ | — |
| WarehouseSelector / SkuSelector / Driver / Vehicle / Channel | — | 财务子域不引用 |

### 4.2 字典 (DictSelect)

| dict_type | 使用方 |
|---|---|
| SYS_CURRENCY | ap、ar、expenses、shareholder-funds、（fund-transfers 未配，依赖 CashAccount 自身币种） |
| FIN_RECEIPT_METHOD | ar 收款表单 |
| FIN_EXPENSE_TYPE | expenses |
| FIN_CONTRIBUTION_TYPE | shareholder-funds |
| FIN_TRANSFER_METHOD / FIN_AP_STATUS / FIN_AR_STATUS | **状态/方式枚举仍在前后端 const map 中**（前端常量、entity 注释枚举值），未走 sys_dict ⚠️ |

### 4.3 附件 AttachmentUploader

| 表 / 字段 | 使用 | 备注 |
|---|---|---|
| fin_shareholder_contributions（voucherUrl 单字段，后端为单 string 提取） | ✔ shareholder-funds/page.tsx | 用 `urls[urls.length-1]` 提取最后一个 |
| shr_capital_contributions.attachment_urls (jsonb) | ✔ shareholders/capital/[id] | 多附件 |
| fin_expense_requests.attachment_urls (jsonb) | ⚠️ entity 已有，**前端 expenses/page.tsx 未集成 AttachmentUploader** | 需要补 |
| fin_ap_invoices / fin_ar_invoices / fin_ar_receipts | entity **无附件字段** | 业务上发票应付应收凭证通常需附件，治理欠债 |

---

## 5. DataScope 与权限

### 5.1 DataScope

| 维度 | finance-v2 是否过滤 |
|---|---|
| company | ✔ 所有 service 都通过 user.dataScope.companyCodes IN (...) 过滤 |
| project | ✘ finance-v2 service **未读 user.dataScope.allowedProjectCodes**——尽管 fin_* 表上多有 project_code 字段（grep 仅命中 companyCodes / scopeAll / isGlobal） |
| warehouse | n/a |

> ⚠️ 项目维度过滤是当前 finance-v2 的明确缺口。CLAUDE.md §8 三层 DataScope 中 `allowedProjectCodes` 是规范的一部分，但 finance-v2 service **未使用**。这意味着只有公司隔离，没有项目隔离——按项目隔离能看见数据是不被强制的。

### 5.2 命名错位（再次强调）

- CLS 写入字段：`dataScope.{ isGlobal, allowedCompanyCodes, allowedProjectCodes, allowedWarehouseCodes }`（org/services/data-scope.service.ts）
- finance-v2 controller 全部做映射：`{ scopeAll: scope.isGlobal, companyCodes: scope.allowedCompanyCodes }` 再塞到 user 上传给 service
- finance-v2 service 全部读 `user.dataScope.scopeAll` / `user.dataScope.companyCodes`
- **没有 service 调用 `ClsService.get('dataScope')`** 直接读 CLS。

这套包装能跑，但脆弱：每个新 controller 都要重复 10 行映射代码（finance-order-bridge.controller / fin-ap / fin-ar / fin-cash / fin-shareholder / fin-expense / financial-reports 都重复）。

### 5.3 权限菜单

- shareholder 控制器全用 `@RequireMenu(MENU_*, 'V|C|E|D|A')`（V 看 / C 建 / E 改 / D 删 / A 审批）
- finance-v2 控制器 grep 未见 `@RequireMenu` 装饰器——permission 校验大概率在外层 Guard 全局开启（待 Audit Agent 核实）
- 对接好业财权限：`MENU_FIN2_AR / MENU_FIN2_AR_LEDGER`（CLAUDE.md §0.6）

---

## 6. 子域间显式联动 (调用图)

```
[Sales V2] ──(SALES_ORDER source)──▶ ArInvoicesService.create
[Procurement V2 prc2_ap_ledger] ──(PO source / import)──▶ ApInvoicesService.importFromPrc2 / createFromPo
                                              │
                                              ▼
[fin_ap_invoices]   [fin_ar_invoices] ──confirm receipt──▶ ArReceiptsService.confirm
                                                        ├── 写 fin_ar_receipt_allocations
                                                        ├── 更新 fin_ar_invoices.received_amount/status
                                                        └── CashTransactionsService.writeTransaction(IN, AR_RECEIPT)
                                                                                   │
[Workflow Native]                                                                 ▼
ExpenseRequestsService.createFromSubmission ──onApproved──▶ ReimbursementsService.create(PENDING)
                                                            └─pay()──▶ 直接 INSERT fin_cash_transactions ⚠️旁路
                                                                                   │
ShareholderContributionsService.create / confirm ────────────────────────▶ writeTransaction(IN/OUT, SHAREHOLDER)
ShareholderSettlementsService.execute ──applyBalance + writeTransaction(OUT)──▶ fin_cash_accounts.current_balance
                                                                                   │
FundTransfersService.execute (SERIALIZABLE) ──writeTransaction × 2──▶ from/to 双账户
                                                                                   │
[shareholder/shr_capital_contributions] ──finance_bridge_status──▶ /api/shareholders/finance-bridge 对账
[chanjet] ──ar-sync (Audit Agent)──▶ chanjet_ar_snapshot ──importToArLedger──▶ fin_ar_ledger（永不写 fin_ar_invoices）
```

外部模块依赖（finance-v2 import 路径）：
- `../../org/helpers/data-scope.helper`（ap-adapter.service.ts）
- `../../org/guards/data-scope.guard`（多 controller）
- `../../notification/notification.service`（ar-reconciliation.service.ts）
- ApprovalEngine（@Global，通过 module.ts 注释可知；expense/reimbursement/shareholder 都用 `this.approvalEngine.startApproval`）
- `nestjs-cls` 的 ClsService（controller 直读 dataScope CLS）

---

## 7. 主要风险与治理欠债（按优先级）

| # | 风险 | 影响 | 子域 | 建议方向 |
|---|---|---|---|---|
| 1 | **DataScope 项目维度未生效** | 多项目混置时违规越权可读 | 全部 finance-v2 service | 在 service 层加 `allowedProjectCodes` 过滤（与 §8 三层规范对齐） |
| 2 | **DataScope 命名错位** | controller 各自映射，新人易写错 | 全部 finance-v2 controller | 收口为 `ClsService.get('dataScope')` 直读，统一字段名 |
| 3 | **报销付款 / 部分 service 旁路 writeTransaction** | 双入口写流水，对账偏差风险 | reimbursements.service.ts | 收口到 CashTransactionsService.writeTransaction |
| 4 | **AP MANUAL/OPENING 路径无付款写流水** | 财务手工录入的应付付完款无法反映到资金账户 | fin_ap_invoices | 设计 `POST /api/v2/finance/ap/invoices/:id/pay`（参考 ar/receipts/confirm） |
| 5 | **股东资金双轨缺主从** | shr_capital_contributions 与 fin_shareholder_contributions 长期会发散 | shareholder × finance-v2 | 治理目标：股权侧 → 财务侧单向投影，or 反过来 |
| 6 | **shr_capital_contributions.bank_account 自由文本** | 与 cash 账户不挂钩 | shareholder | 切 CashAccountSelector |
| 7 | **AP/AR 发票无附件字段** | 凭证只能挂 remark，违反 §4 | fin_ap_invoices / fin_ar_invoices / fin_ar_receipts | 加 attachment_urls jsonb 字段（需 Architect Agent 出迁移） |
| 8 | **shareholders/capital 前端硬编码字典** | CONTRIB_STATUS、SOURCE_TYPE 等没走 sys_dict | shareholders（非 Finance Agent 责任域，但联动） | 改 DictSelect + sys_dict |
| 9 | **AR/AP/Expense 前端缺 ProjectSelector** | 项目维度的应收应付费用录入时无法选 | finance2/ap、ar、expenses | 加 ProjectSelector，配合 §1 |
| 10 | **AP entity ↔ DB 漂移** | fin_ar_invoices 缺 sal_customer_id 字段（entity 注释自承） | finance-v2 | g197 已知，遵守"装饰式 entity 禁加新字段"铁律 |
| 11 | **AR receipts 没走 Workflow** | 收款 confirm 直发，与 expense/transfer 不一致 | ar-receipts | 视业务需要决定是否加审批 |
| 12 | **shareholders/scopes 直接 fetch /api/generic-crud/sys_user** | 绕过 UserSelector，全量 200 条无 DataScope | shareholders 模块 | 切 UserSelector |

---

## 8. 第一阶段交付摘要

- 完成对 13 张 fin_* + 6 张 shr_* entity 的依赖矩阵（§2）
- 完成 5 大子域（AP / AR / Cash / Expense / Shareholder Funds）的细化依赖说明（§3）
- 完成共用主数据 Selector / Dict / Attachment 覆盖率盘点（§4）
- 完成 DataScope 三层规范在 finance-v2 内的实施差距分析（§5）
- 完成跨子域调用图与跨模块导入清单（§6）
- 输出 12 项风险与治理欠债（§7）

**未做**（按 finance-agent.md "禁止事项"）：
- 没修改任何代码
- 没新增任何迁移
- 没改主数据底层定义
- 没改采购销售主流程

下一阶段方向（需 Architect Agent / Audit Agent 协商优先级）：
1. **P0**：DataScope 项目维度补齐 + 命名收口（§7-1、§7-2）——纯 service/controller 改造，无 DDL。
2. **P0**：AP 手工付款端点（§7-4）——需要新增 service 方法 + Cash 联动，无 DDL。
3. **P1**：报销付款收口 CashTransactionsService（§7-3）——纯 service 重构。
4. **P1**：AP/AR/Receipt 附件字段（§7-7）——需要 Architect Agent 走迁移。
5. **P2**：股东资金双轨治理（§7-5、§7-6）——跨 agent（finance × shareholder）方案。
6. **P2**：前端 ProjectSelector / AttachmentUploader 补齐（§7-9 + Expense 附件）——纯前端，配合 §1。
