# Chanjet Mapping Identity And WMS Runtime Acceptance Report

Date: 2026-07-28

Decision: **GO WITH CONDITIONS**

## Scope

This Gate deployed and accepted the Chanjet mapping source-identity migration and
the evidence-only WMS bridge. It did not write, modify or delete Chanjet data and
did not promote any Chanjet document into ERP inventory.

## Release Evidence

- Production revision: `37399002`
- CI/CD run: `30369742061` - PASS
- Security run: `30369741328` - PASS
- AI Delivery build run: `30369741611` - PASS
- Web unit-test run: `30369742350` - PASS
- API, Web and PostgreSQL containers: healthy
- API and Web TypeScript: PASS
- System, breeding, packaging, WMS and finance regressions: PASS
- W5 closeout gate: PASS
- i18n key gate: PASS, 13,911 keys in each of `zh`, `en` and `lo`

## Migration Acceptance

Applied migrations:

- `CompleteChanjetWmsBridge1785400000000`
- `EnforceChanjetMappingSourceIdentity1785410000000`

The migration:

1. archived 37 deterministic stale `CASH_ACCOUNT` pending duplicates;
2. removed only those archived pending candidates;
3. created the partial unique source-identity index on
   `(mapping_type, book_id, chanjet_id)` where `chanjet_id <> ''`;
4. preserved all approved mappings.

Runtime result:

- archive rows: 37
- duplicate source-identity groups after migration: 0
- approved cash-account mappings: 49
  - `MATCHED`: 37
  - `SOURCE_ONLY`: 12

## WMS Mapping Refresh

The production refresh scanned 187 book-scoped source identities:

- exact mappings: 14
- source-only mappings: 173
- conflicts: 0
- approved exact mappings preserved: 14
- ERP business tables mutated: no
- Chanjet external write executed: no

Current mapping inventory:

| Domain | Match state | Count |
|---|---|---:|
| PRODUCT | MATCHED | 10 |
| PRODUCT | SOURCE_ONLY | 124 |
| UOM | MATCHED | 4 |
| UOM | SOURCE_ONLY | 24 |
| WAREHOUSE | SOURCE_ONLY | 25 |

`SOURCE_ONLY` is intentional evidence. No warehouse, product or unit was guessed
from a similar name.

## WMS Promotion Candidate Refresh

- source documents scanned: 2,625
- `NEED_MAPPING`: 2,623
- `HOLD`: 2
- `APPROVED`: 0
- `PROMOTED`: 0
- writeback Outbox rows: 0
- automatic ERP inventory promotion: disabled
- external Chanjet execution endpoint: absent

The two HOLD rows are source documents that are not effective:

1. one `MATERIAL_STOCK_OUT`;
2. one `OTHER_STOCK_OUT`.

Both also retain explicit warehouse/product/UOM mapping conditions. They were not
silently discarded or promoted.

## Source Evidence

The ERP middle layer retains 3,999 WMS snapshots:

| Entity type | Rows |
|---|---:|
| FINISHED_GOODS_STOCK_IN | 698 |
| INVENTORY_ON_HAND | 851 |
| INVENTORY_ON_HAND_LOT | 523 |
| MATERIAL_STOCK_OUT | 854 |
| OTHER_STOCK_OUT | 1,058 |
| STOCK_COUNT | 6 |
| STOCK_TRANSFER | 9 |

Provider permissions still block `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`.

## No-Overwrite Verification

Before and after runtime refresh:

- `fin_cash_accounts`: 62 rows; `current_balance` sum
  `2,415,170,587.98`
- `inv_batches`: 257 rows; total and available quantity
  `806,794.950`
- `inv_ledger`: 111 rows; net quantity change `2,011.400`

The fingerprints and latest business-row timestamps did not change. The refresh
wrote only middle-layer mapping and promotion-candidate evidence.

## Guardrails

- Chanjet write/delete/modify: disabled
- automatic WMS promotion: disabled
- automatic mapping approval: disabled
- ERP inventory fact overwrite: no
- ERP finance transaction overwrite: no
- writeback Outbox execution: disabled
- manual review required before any promotion

## Conditions And Next Gate

Next Gate:
`CHANJET_WMS_MANUAL_MAPPING_CLOSURE_AND_PROVIDER_PERMISSION`

Required work:

1. resolve the 25 warehouse, 124 product and 24 UOM source-only mappings using
   explicit source-to-ERP evidence;
2. obtain provider access for `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`;
3. rerun only the blocked readonly scopes;
4. regenerate promotion candidates;
5. run A2, A1 and A7 acceptance before approving a single-document ERP
   promotion canary.

No Chanjet writeback is approved by this report.
