# FULL RESET AR OPENING DECISION

## Search scope

已检索仓库中的 go-live 初始化报告、AR 初始化迁移、财务 opening 文档、历史导入脚本、Chanjet 对账文档和生产初始化证据。未发现同时满足以下条件的独立批准来源：

```text
independent of current transaction tables
explicit formal opening state
company/customer/amount identity
provenance and approved period
```

关键证据显示：

- `docs/g41-ar-ledger-import.md` 明确标记 OCR 数据为 `OCR_PENDING_VERIFY`，并要求财务核对后才能作为正式账；
- `docs/liujie-ar-ledger-dataset.md` 明确说明图片 OCR 金额“非权威账”；
- `docs/glp1-go-live-preparation.md` 把应收期初列为业务方待提供事项，Opening Balance Readiness 仅为 20%；
- `fin_ar_ledger` 和 `chanjet_ar_snapshot` 都是当前业务/同步事实表，不能互相反推正式 opening。

## Decision

```text
FORMAL_OPENING_AR=NONE
FIN_AR_LEDGER_CURRENT_ROWS=119
FIN_AR_LEDGER_SOURCE_GROUPS=CHANJET=69; OCR=50
POST_RESET_AR_LEDGER_ROWS=0
POST_RESET_AR_INVOICES=0
POST_RESET_AR_RECEIPTS=0
POST_RESET_AR_ALLOCATIONS=0
POST_RESET_AR_OUTSTANDING=0
DECISION=RESET_TO_ZERO
```

本决定遵循“当前所有交易事实均为测试数据”的授权规则，不因 Chanjet/OCR 来源而保留事实。远端 Chanjet 仍可能存在外部 AR 状态，但它不属于本地 opening baseline；只要 reimport 被关闭，本地可独立归零。

脱敏清单见 [full-reset-ar-opening-manifest.csv](../../full-reset-ar-opening-manifest.csv)。金额和客户识别信息不进入 Git。
