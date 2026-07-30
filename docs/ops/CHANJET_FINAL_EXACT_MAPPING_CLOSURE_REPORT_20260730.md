# Chanjet Final Exact Mapping Closure Report

Date: 2026-07-30

Decision: **GO WITH CONDITIONS**

## 1. Repository And Deployment

- Authoritative branch: `main`
- Application commit: `1acbcd87d6b6c7885ba517543cb4229a1377725d`
- CI/CD run: `30516721208`
- CI result: PASS
- Production deploy result: PASS
- Production repository revision: `1acbcd87d6b6c7885ba517543cb4229a1377725d`
- Production API, Web and PostgreSQL: healthy

The repository audit found many historical A1-A7, Bug Intake, task-generation
and quarantine branches/worktrees. They are not merge candidates. Their
baselines predate current `main`, and merging them would replay old conflicts or
obsolete implementations. Current `main` is the only release authority.

## 2. Implemented Closure Contract

The following authenticated endpoints are deployed:

- `GET /api/chanjet/integration/exact-mapping-closure`
- `POST /api/chanjet/integration/exact-mapping-closure/run`

The closure engine enforces:

1. Exact identity only.
2. Same-company matching.
3. Same-currency matching for cash accounts.
4. One Chanjet source identity to one ERP target.
5. Multiple source identities colliding on one ERP target become `CONFLICT`.
6. Fuzzy-name auto-mapping is disabled.
7. Missing ERP masters remain explicit structural gaps.
8. Chanjet external write is disabled.
9. ERP inventory, finance and other business tables are not written.

## 3. Production Execution Result

The production closure run completed successfully.

| Metric | Result |
|---|---:|
| Decision | GO_WITH_CONDITIONS |
| Exact auto-confirmable identities | 41 |
| Structural gaps | 225 |
| Conflicts | 0 |
| Cash-account exact matches | 37 / 49 |
| WMS mapped identities | 16 / 191 |
| WMS mapping coverage | 8.38% |
| Provider permission holds | 6 |
| Chanjet external writes | 0 |
| ERP business-table writes | 0 |

All 41 exact identities had already been approved by deterministic rules. The
run therefore preserved them instead of creating duplicate mappings:

- Master-data reviewed: 91
- Newly exact-approved: 0
- Unchanged: 91
- Errors: 0
- WMS exact matched: 16
- WMS approved mappings preserved: 16
- WMS conflicts: 0

The WMS source identity total changed from 187 to 191 during the production
refresh. Four additional product identities were observed. This is a real source
change, not a regression; the open-gap count increased accordingly.

## 4. Mapping Coverage

### Finance And Master Data

| Domain | Source rows | Exact | Structural/reference state |
|---|---:|---:|---|
| CASH_ACCOUNT | 49 | 37 | 12 ERP-master gaps |
| CURRENCY | 4 | 4 | 0 |
| DEPARTMENT | 32 | 0 | readonly references |
| PROJECT | 6 | 0 | readonly references |
| SUBJECT | 923 | 0 | readonly accounting references |

Unified master-data closure states:

- `EXACT_AUTO_CONFIRMABLE`: 41
- `ERP_MASTER_MISSING`: 50
- `READONLY_REFERENCE`: 923

`READONLY_REFERENCE` is intentionally not counted as an ERP master mapping.
Accounting subjects remain Chanjet-authoritative references unless a reviewed
ERP accounting use case requires a dedicated mapping.

### WMS

| Type | Total | Mapped | Open |
|---|---:|---:|---:|
| WAREHOUSE | 25 | 0 | 25 |
| PRODUCT | 138 | 10 | 128 |
| UOM | 28 | 6 | 22 |

Open WMS gap classes:

- Product/SKU model required: 49
- Product master review required: 37
- Material master candidate: 33
- SKU/UOM conversion required: 18
- House/inventory bridge required: 14
- Warehouse master candidate: 11
- Livestock master required: 9
- Contextual UOM required: 2
- UOM definition candidate: 2

These are genuine model or master-data gaps. They must not be converted to fake
matches merely to raise a percentage.

## 5. Validation

- API TypeScript: PASS
- Web TypeScript: PASS
- Chanjet integration tests: PASS
- Chanjet controller tests: PASS
- 102 tests: PASS
- Nullable unique gate: PASS
- API/Web build: PASS
- System, breeding, packaging, WMS and finance regressions: PASS
- W5 closeout with reviewed freeze/security flags: PASS
- Production health: PASS
- Production revision equality: PASS
- Exact closure production run: PASS

## 6. Remaining Conditions

1. Add or review the 50 missing ERP finance/master identities instead of fuzzy
   mapping them.
2. Stage the 128 open product identities by semantic entity type:
   product, SKU, material, livestock, packaging, feed, drug or vaccine.
3. Build real warehouse/location policies for 25 warehouse-shaped identities;
   chicken houses must not be directly reclassified as warehouses.
4. Define 22 product-specific or contextual UOM conversions.
5. Obtain Chanjet readonly provider permission for the six blocked
   `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT` targets.
6. Keep Chanjet writeback and ERP business-ledger promotion blocked until a
   separately approved, readback-verified canary.

## 7. Next Gate

`CHANJET_ERP_MASTER_DATA_GAP_CLOSURE`

The next Gate should create a reviewed staging candidate list for the 50
finance/master gaps and 175 WMS gaps. It may create ERP master-data proposals,
but it must not mutate Chanjet and must not promote historical WMS documents into
ERP inventory.
