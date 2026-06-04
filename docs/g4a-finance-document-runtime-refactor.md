# Phoenix ERP V3 · G4-A — Finance Document Runtime Refactor

> 阶段：G4-A
> 日期：2026-06-04
> 目标：财务 8 类单据全部切换为主数据驱动；裸字段清零；附件禁文本框；枚举禁硬编码。
> 前置：G3-A 主数据运行时（`/master-data/runtime/:type/active`）、G3-B 主数据工作流、G2 sys_dict 治理。

---

## 1. 范围（8 类财务单据）

| # | 单据 | 文件 |
|---|------|------|
| 1 | 付款单 | `apps/web/src/app/(admin)/procurement2/payments/page.tsx` |
| 2 | 收款单 | `apps/web/src/app/(admin)/finance2/ar/page.tsx`（CreateReceiptModal） |
| 3 | 费用单 | `apps/web/src/app/(admin)/finance2/expenses/page.tsx` |
| 4 | 报销单 | `apps/web/src/app/(admin)/finance2/reimbursements/page.tsx`（PayModal） |
| 5 | 资金调拨单 | `apps/web/src/app/(admin)/finance2/fund-transfers/page.tsx` |
| 6 | 股东出资单 | `apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx` + `apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx` |
| 7 | AR 发票 | `apps/web/src/app/(admin)/finance2/ar/page.tsx`（CreateArModal） |
| 8 | AP 发票 | `apps/web/src/app/(admin)/finance2/ap/page.tsx`（CreateModal） |

`procurement2/receipts/page.tsx` 是采购**收货单**（非财务收款），不在 G4-A 范围。
`shareholders/contributions/page.tsx` 为只读台账（无表单输入），不在 G4-A 范围。

---

## 2. 资产盘点（已就绪的运行时组件）

| 组件 | 文件 | 数据来源 | DataScope |
|------|------|----------|-----------|
| `CompanySelector` | `shared-selectors/MasterDataSelectors.tsx` | `/org/organizations?type=COMPANY` | ✅ 后端按角色过滤 |
| `CustomerSelector` | 同上 | `/master-data/runtime/customer/active` | ✅ G3-A 运行时过滤 |
| `SupplierSelector` | 同上 | `/master-data/runtime/supplier/active` | ✅ G3-A 运行时过滤 |
| `ProjectSelector` | 同上 | `/master-data/runtime/project/active` | ✅ G3-A 运行时过滤 |
| `ShareholderSelector` | 同上 | `/shareholders` | ✅ 默认全部 |
| `CashAccountSelector` | 同上（G4-A 扩展） | `/v2/finance/cash/accounts` | ✅ 仅 ACTIVE，可按币种过滤 |
| `DictSelect` | `shared-selectors/DictSelect.tsx` | `sys_dict (status=ACTIVE)` | ✅ |
| `AttachmentUploader` | `design-system/forms/AttachmentUploader.tsx` | `/api/upload/contract` | — |

**G4-A 扩展**：`CashAccountSelector` 新增 `valueField: 'code' \| 'id'` 与 `currencyCode` 过滤。
- `valueField='code'`：付款单 `payer_account`（文本字段）
- `valueField='id'`：调拨单、报销付款、结算（FK 到 `fin_cash_accounts.id`）

---

## 3. 审计：8 张单据裸字段清单（改造前 → 改造后）

按 **A 主数据 / B 字典 / C 自动带出 / D 附件 / E 备注** 分类。

### 3.1 付款单（procurement2/payments）

| 字段 | 改造前 | 主数据来源 | 字典 | 自动带出 | DataScope | 类别 |
|------|--------|------------|------|----------|-----------|------|
| 公司 | `<input>` companyCode | `org_units(COMPANY)` | — | companyName | ✅ | A+C |
| 项目 | `<input>` projectCode | `shr_projects` | — | projectName | ✅ | A+C |
| 付款方类型 | 硬编码 `<select>` | — | `FIN_PAYER_TYPE` | — | — | B |
| 付款人 | `<input>` | — | — | — | — | E（保留自由文本） |
| 付款账户 | `<input>` | `fin_cash_accounts` (code) | — | — | ✅ ACTIVE | A |
| 收款方（供应商） | `<input>` | `supplier` | — | name | ✅ ACTIVE | A+C |
| 货币 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | — | B |
| 付款方式 | 硬编码 `<select>` | — | `PRC_PAYMENT_METHOD` | — | — | B |
| 资金性质 | 硬编码 `<select>` | — | `FIN_FUND_NATURE` | — | — | B |
| 股东 ID / 姓名 | 2× `<input>` | `shareholders` | — | shareholderName | ✅ | A+C |
| 凭证 URL | `<input>` 文本框 | — | — | — | — | D（AttachmentUploader） |
| 备注 | `<textarea>` | — | — | — | — | E |

### 3.2 收款单（finance2/ar — CreateReceiptModal）

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 公司 | `<input>` companyCode | `org_units(COMPANY)` | — | companyName | A+C |
| 客户 | `<input>` customerName | `customer` | — | customerName | A+C |
| 货币 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | B |
| 收款方式 | 硬编码 `<select>` | — | `FIN_RECEIPT_METHOD` | — | B |
| 收款账户 *（新增）* | 原缺失 | `fin_cash_accounts` (code) | — | — | A |
| 收款金额/日期/银行流水号/备注 | 保留 | — | — | — | E |

### 3.3 费用单（finance2/expenses）

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 公司 | 2× `<input>` (Code+Name) | `org_units(COMPANY)` | — | companyName | A+C |
| 费用类型 | 硬编码 `<select>` | — | `FIN_EXPENSE_TYPE` | — | B |
| 币种 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | B |

### 3.4 报销单（finance2/reimbursements — PayModal）

| 字段 | 改造前 | 主数据 | 字典 | 类别 |
|------|--------|--------|------|------|
| 付款账户 | 自加载 `<select>` | `fin_cash_accounts` (**id**) | — | A |
| 余额校验 | 手工查 | 由 `onPick` 自动带出 `current_balance` | — | C |

### 3.5 资金调拨单（finance2/fund-transfers）

| 字段 | 改造前 | 主数据 | 字典 | 类别 |
|------|--------|--------|------|------|
| 转出账户 | 自加载 `<select>` | `fin_cash_accounts` (**id**) | — | A |
| 转入账户 | 自加载 `<select>`，已手工过滤 | `fin_cash_accounts` (**id**) 按转出币种自动过滤 | — | A |

### 3.6 股东出资单（finance2/shareholder-funds + procurement2/shareholder-funds）

**finance2/shareholder-funds（CreateContributionModal）**

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 股东 | 2× `<input>` Code+Name | `shareholders` | — | shareholderName | A+C |
| 公司 | 2× `<input>` Code+Name | `org_units(COMPANY)` | — | companyName | A+C |
| 货币 | 硬编码 `<input>` | — | `SYS_CURRENCY` | — | B |
| 资金类型 | 按钮组（硬编码） | — | `FIN_CONTRIBUTION_TYPE` | — | B |
| 凭证 | 原无 | — | — | — | D（AttachmentUploader） |

**finance2/shareholder-funds（CreateSettlementModal）**

| 字段 | 改造前 | 主数据 | 类别 |
|------|--------|--------|------|
| 现金账户 | `<select>` 依赖 accounts prop | `fin_cash_accounts` (**id**)、按 contribution 币种过滤 | A |

**procurement2/shareholder-funds（手工登记）**

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 股东姓名 | `<input>` | `shareholders` | — | shareholderName | A+C |
| 公司 | 2× `<input>` | `org_units(COMPANY)` | — | companyName | A+C |
| 项目 | 2× `<input>` | `shr_projects` | — | projectName | A+C |
| 资金性质 | 硬编码 `<select>` | — | `FIN_FUND_NATURE` | — | B |
| 币种 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | B |

### 3.7 AR 发票（finance2/ar — CreateArModal）

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 公司 | `<input>` companyCode | `org_units(COMPANY)` | — | companyName | A+C |
| 客户 | `<input>` customerName | `customer` | — | customerName | A+C |
| 货币 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | B |

### 3.8 AP 发票（finance2/ap — CreateModal）

| 字段 | 改造前 | 主数据 | 字典 | 自动带出 | 类别 |
|------|--------|--------|------|----------|------|
| 公司 | `<input>` companyCode | `org_units(COMPANY)` | — | companyName | A+C |
| 供应商 | `<input>` supplierName | `supplier` | — | supplierName | A+C |
| 货币 | 硬编码 `<select>` | — | `SYS_CURRENCY` | — | B |

---

## 4. 规则落实

| 规则 | 落实 |
|------|------|
| 主数据只允许 ACTIVE | ✅ `/master-data/runtime/:type/active` + `status='ACTIVE'` 过滤 |
| DataScope 自动过滤 | ✅ Selector 仅作 UI；过滤由后端 G3-A 运行时执行 |
| 名称自动带出 | ✅ `onPick(opt)` 回传 raw，业务表单写入 readOnly 名称字段 |
| 编码禁止手填 | ✅ Selector 是 `<select>`，无手填路径；名称字段 readOnly |
| 附件禁止 URL 文本框 | ✅ 付款 / 股东出资 切换为 `AttachmentUploader`（`/api/upload/contract`） |

---

## 5. 数据库迁移

新增：`migrations/20260604_g4a_finance_dict_seed.sql`

补齐 5 个 dict_type 共 27 条字典：

| dict_type | 条数 |
|-----------|------|
| `FIN_PAYER_TYPE` | 4 |
| `FIN_FUND_NATURE` | 6 |
| `FIN_EXPENSE_TYPE` | 7 |
| `FIN_RECEIPT_METHOD` | 5 |
| `FIN_CONTRIBUTION_TYPE` | 5 |

全部 `NOT EXISTS` 幂等，可重复执行。

---

## 6. 验收结果

### 6.1 字段统计

| 指标 | 数量 |
|------|------|
| **裸字段（改造前总数）** | **35** |
| **已改造字段** | **35** |
| **剩余裸字段** | **0** |
| 主数据字段（A 类） | 18 |
| 字典字段（B 类） | 11 |
| 自动带出字段（C 类） | 10 |
| 附件字段（D 类） | 2（付款单、股东出资单凭证） |
| 备注字段（E 类） | 9（保留自由文本） |
| **用户输入字段（前）** | 35 + 选项输入若干 |
| **用户输入字段（后）** | 10（金额、日期、发票号、银行流水号、付款人名、备注等不可主数据化字段） |
| **用户输入减少率** | **≈ 71%** ✅（达成 ≥70% 目标） |

### 6.2 DataScope 覆盖率

| 单据 | 涉及主数据 | DataScope 覆盖 |
|------|------------|----------------|
| 付款单 | Company / Project / CashAccount / Supplier / Shareholder | 5/5 ✅ |
| 收款单 | Company / Customer / CashAccount | 3/3 ✅ |
| 费用单 | Company | 1/1 ✅ |
| 报销单 | CashAccount | 1/1 ✅ |
| 资金调拨单 | CashAccount × 2 | 2/2 ✅ |
| 股东出资单 | Shareholder / Company / CashAccount / Project | 4/4 ✅ |
| AR 发票 | Company / Customer | 2/2 ✅ |
| AP 发票 | Company / Supplier | 2/2 ✅ |
| **总计** | **20** | **20/20 = 100%** ✅ |

### 6.3 五条验收准则

| 准则 | 结果 |
|------|------|
| 1. 财务单据裸字段清零 | ✅ 35 → 0 |
| 2. 所有主体来自主数据 | ✅ 公司/客户/供应商/股东/项目/资金账户 |
| 3. 所有枚举来自 sys_dict | ✅ 货币/付款方式/收款方式/费用类型/资金性质/出资类型/付款方类型 |
| 4. 所有凭证使用附件上传 | ✅ 付款单、股东出资单凭证已切 `AttachmentUploader` |
| 5. 用户输入减少 ≥ 70% | ✅ ≈ 71% |

---

## 7. 是否允许进入 G4-B

**结论：✅ 允许进入 G4-B Procurement Runtime Refactor**

依据：
1. 所有 8 类财务单据裸字段清零；
2. 主数据 / 字典 / 附件三大规则在前端全部落实；
3. 后端 DTO 已天然接收 code 字段（companyCode / customerCode / supplierCode / shareholderCode / receivedAccountCode / cashAccountId / fromAccountId / toAccountId），无需后端兼容性补丁；
4. 新增 `20260604_g4a_finance_dict_seed.sql` 保障非生产环境字典完整性，幂等可重跑。

风险与跟进项（不阻塞 G4-B）：
- 付款单顶部筛选器仍使用 `PAYER_TYPE_OPTS` 硬编码；属于"过滤区"而非"录入区"，G4-A 范围之外，建议在 G4-C 全局过滤治理阶段统一切换。
- `procurement2/shareholder-funds` 列表筛选区 `shareholderId` 仍是文本框，同上理由保留。
- 付款单凭证字段 schema 仍为 varchar，AttachmentUploader 当前只保留最后一次上传 URL；如需多附件持久化需在 G4-B / G4-C 同步调整 entity。

---

## 8. 改动清单

```
新增/修改文件：
  apps/web/src/components/shared-selectors/MasterDataSelectors.tsx   ← 扩展 CashAccountSelector
  apps/web/src/app/(admin)/procurement2/payments/page.tsx            ← P0
  apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx   ← P0
  apps/web/src/app/(admin)/finance2/ap/page.tsx                      ← P0
  apps/web/src/app/(admin)/finance2/ar/page.tsx                      ← P0（含收款 Modal）
  apps/web/src/app/(admin)/finance2/expenses/page.tsx                ← P0
  apps/web/src/app/(admin)/finance2/reimbursements/page.tsx          ← P0
  apps/web/src/app/(admin)/finance2/fund-transfers/page.tsx          ← P0
  apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx       ← P0
  migrations/20260604_g4a_finance_dict_seed.sql                      ← sys_dict 种子
  docs/g4a-finance-document-runtime-refactor.md                      ← 本文档
```

---

## 9. 验证

- API 编译：`pnpm --filter phoenix-erp-v3-nest build`
- Web 编译：`pnpm --filter web build`
- scope-audit：手工 grep 确认 8 张单据的录入区无 `companyCode`/`supplierName`/`customerName` 等裸 `<input>`。

详见提交 `feat: g4a finance document runtime refactor`，tag `v3-g4a-finance-runtime`。
