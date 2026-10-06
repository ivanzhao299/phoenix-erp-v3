# FULL RESET OPENING BALANCE REVIEW

本文件是 R1 的只读决策输入，不是财务确认，也不是执行授权。

## Observed production state

```text
fin_cash_accounts=77 rows
fin_cash_accounts has non-zero opening/current values=YES
fin_ar_ledger=119 rows
fin_ar_ledger has CHANJET_VERIFIED and OCR_PENDING_VERIFY sources=YES
wms_stock_balance=0 rows
inv_batches=314 rows with non-zero quantity=YES
```

## Required business decisions

财务负责人必须确认每个保留现金账户、客户信用、应收应付和总账事实属于以下哪一类：

```text
APPROVED_OPENING_BALANCE
CURRENT_TEST_TRANSACTION
FORMAL_IMPORTED_FACT
UNRESOLVED
```

库存负责人必须对 `inv_batches` 的来源类型形成 opening manifest，至少区分：

```text
APPROVED_OPENING_INVENTORY
CURRENT_TEST_TRANSACTION
FORMAL_IMPORTED_FACT
UNRESOLVED
```

在确认前不得：

```text
UPDATE fin_cash_accounts.current_balance
UPDATE customer credit_used
DELETE or zero fin_ar_ledger
DELETE inv_batches
RESET inventory derived balances
```

## Required output before R2

```text
finance-opening-manifest=<approved restricted evidence>
inventory-opening-manifest=<approved restricted evidence>
derived-recompute-formula=<approved>
reconciliation-owner=<named business owner>
FINANCE_RESET_PLAN=PASS
INVENTORY_RESET_PLAN=PASS
```

任何未识别项都保持 `UNRESOLVED`，并阻止 R2/R3。
