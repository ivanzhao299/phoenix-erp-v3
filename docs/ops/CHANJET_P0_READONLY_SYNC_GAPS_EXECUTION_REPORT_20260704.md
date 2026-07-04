# Chanjet P0 Readonly Sync Gaps Execution Report

Date: 2026-07-04

## Summary

The production readonly Chanjet mirror sync was executed through the GitHub `AI Delivery CI Smoke` workflow with target `chanjet-readonly-production`.

Decision: GO_WITH_CONDITIONS

Workflow run: 28702850632

Commit used: 6e2072de

Artifact files:

- `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
- `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`

## What Was Fixed First

The previous smoke run executed the remote readonly sync successfully, but the artifact upload still contained stale runner-side files. The CI collector has been hardened to read the latest production files through SSH and write them into the runner artifact directory before upload.

Collector fix commits:

- `934e94e1` fixed initial artifact collection wiring.
- `6e2072de` replaced fragile `scp` collection with `ssh cat > local file` collection and non-empty file checks.

## P0 Readonly Coverage

The latest production readonly sync covered all 16 P0 domains.

| Scope | Rows | Entities | Status |
| --- | ---: | ---: | --- |
| ACCOUNT_BOOKS / 账套列表 | 3 | 6 | SUCCESS |
| DEPARTMENT / 部门列表 | 27 | 3 | SUCCESS |
| CUSTOMER_SUPPLIER / 往来单位 | 1440 | 292 | SUCCESS |
| SUBJECT / 科目列表 | 27 | 3 | SUCCESS |
| PROJECT / 项目列表 | 54 | 6 | SUCCESS |
| FIN_ACCOUNT / 资金账号 | 47 | 47 | SUCCESS |
| PAYABLE_STATISTICS / 应付统计 | 86 | 43 | SUCCESS |
| RECEIVABLE_STATISTICS / 应收统计 | 142 | 71 | SUCCESS |
| PAYMENT_AP / 付款单列表 | 900 | 109 | SUCCESS |
| PAYMENT_AR / 收款单列表 | 900 | 171 | SUCCESS |
| PURCHASE_ORDER / 采购订单列表 | 378 | 42 | SUCCESS |
| VOUCHER_SEARCH / 凭证列表 | 1242 | 1242 | SUCCESS |
| GL_BALANCE / 科目余额表 | 27 | 3 | SUCCESS |
| BALANCE_SHEET / 资产负债表 | 27 | 3 | SUCCESS |
| INCOME_STATEMENT / 利润表 | 27 | 3 | SUCCESS |
| CASH_FLOW / 现金流量表 | 27 | 3 | SUCCESS |

Endpoint coverage: 16 / 16, 100%.

## Field Coverage

- Total field mappings: 1684
- Covered field mappings: 1684
- Coverage rate: 100%
- Matched: 183
- Pending mapping review: 1501
- Missing fields: 0
- Transform required: 0

Interpretation: P0 readonly data acquisition is no longer the blocker. The next blocker is semantic alignment: the remaining pending mappings must be reviewed so ERP financial cards and reports use the same Chanjet口径.

## Boundaries

- Write to Chanjet: No
- Delete from Chanjet: No
- Modify Chanjet data: No
- Push voucher to Chanjet: No
- ERP business table write: No
- Migration: No
- Manual production DB write: No

The sync wrote only the approved ERP readonly mirror / snapshot layer through the protected production API path.

## CI / Deploy Notes

The workflow collector fixes were pushed to `main`. Because workflow files changed, the normal CI/CD pipeline was triggered. The Chanjet readonly production smoke run itself completed successfully after the collector fix.

## Current Conclusion

GO_WITH_CONDITIONS

The P0 readonly mirror is ready for the next stage:

1. Replace ERP finance dashboard/card figures with Chanjet-backed口径 where Chanjet is the authority.
2. Show ERP business detail as辅助明细, not as the financial authority.
3. Surface differences instead of silently overwriting or mixing口径.
4. Convert the 1501 pending field mappings into reviewed matched / transformed / not-applicable states.

## Next Gate

CHANJET_P1_FINANCE_CARD_ALIGNMENT

