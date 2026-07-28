# 好业财 WMS 生产只读基线摘要

- Decision: `HOLD`
- Enabled books: 3
- Inventory contracts: 11
- Expected targets: 33
- Successful targets: 27
- Failed targets: 6
- Latest successful API batch rows: 3,490
- Middle-layer entity rows: 3,659
- Canonical documents: 2,625
- Canonical lines: 9,655
- Lossless raw-mirror coverage: 100%
- ERP business-column coverage: 98.1%
- Chanjet write: false
- ERP inventory-fact write: false

## Failed targets

`OTHER_STOCK_IN` and `RETAIL_STOCK_OUT` failed for each enabled book with provider code `50111` (`openToken无调用该接口的权限`).

## Missing ERP business columns

- `wms_outbound.department`
- `wms_outbound.currency_code`

## Evidence

- Detailed target results: `docs/ops/runs/chanjet-wms-batches/final-scope-results.tsv`
- Alignment JSON: `docs/ops/runs/chanjet-wms-readonly-alignment-latest.json`
- Alignment Markdown: `docs/ops/runs/chanjet-wms-readonly-alignment-latest.md`
- Baseline report: `docs/ops/CHANJET_WMS_FULL_READONLY_BASELINE_REPORT_20260728.md`
