# Production 95 Cleanup Batch - Product Page Quality Contracts

## Goal

Prevent high-frequency pages from regressing into unclear, empty, unsafe, or non-actionable screens.

## Added

- `docs/ops/PRODUCT_PAGE_QUALITY_CONTRACTS.json`
- `scripts/ci/check-product-page-quality-contracts.mjs`
- `docs/ops/runs/product-page-quality-contracts-latest.json`
- `docs/ops/runs/product-page-quality-contracts-latest.md`

## Covered Pages

1. System health
2. System alerts
3. UAT readiness
4. Inventory turnover
5. Device monitor
6. Procurement payment creation
7. Procurement order creation
8. Approval todo
9. Shareholder capital
10. Mobile reimbursement

## Gate Rules

Each page contract checks:

- business value signals,
- operational or workflow quality signals,
- error/empty-state clues,
- no raw `/uploads` usage,
- no `storage_path` exposure,
- no known runtime failure strings.

## Validation

- `node --check scripts/ci/check-product-page-quality-contracts.mjs`: PASS
- `node scripts/ci/check-product-page-quality-contracts.mjs --write-report`: PASS
- `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## Score Impact

| Dimension | Before | After | Why |
|---|---:|---:|---|
| Frontend / UX / i18n | 83 | 85 candidate | High-frequency pages now have explicit quality contracts. |
| Testing / CI/CD | 88 | 89 candidate | Page quality regressions are now CI/W5 visible. |

## Remaining Gap

This is a source-level contract. The next lift is real browser screenshot smoke with authenticated role fixtures.
