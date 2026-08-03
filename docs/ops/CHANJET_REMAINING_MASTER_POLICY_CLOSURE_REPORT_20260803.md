# Chanjet Remaining Master Policy Closure Report

Date: 2026-08-03

## Decision

`GO_WITH_CONDITIONS`

The deterministic department subset has been mapped to existing ERP masters in
production. The remaining 185 rows stay `HOLD`; none is eligible for automatic
creation or fuzzy matching.

## Scope And Boundaries

- Source: Chanjet readonly middle-layer evidence.
- Target write: ERP mapping metadata only.
- ERP master creation: none in this Gate.
- Chanjet write, update or delete: none.
- ERP finance balance, cash transaction or inventory fact import: none.
- Migration, seed and destructive cleanup: none.

## Implementation And Deployment

- Revision: `461a7559ea34af4adad2a348e16a89205fac0eb1`.
- Commit: `feat(chanjet): classify remaining department mappings`.
- Production deployment run: `30801206556` (`SUCCESS`).
- Production API, Web and database health checks passed.

The review service now resolves only these deterministic department identities:

1. Headquarters and company aliases to the same-company `sys_organizations` row.
2. Exact same-company stores to `mst_stores`.
3. Exact same-company breeding houses to `brd_houses`.

Workshops, accounting-only dimensions, group nodes, missing sites and ambiguous
store aliases remain fail-closed.

## Production Apply Evidence

- Pre-apply review hash:
  `04f0af8a1e7521108cf3f73037dab91911487092f410ddb26e4fe81df91bfce0`.
- Pre-apply decision: `READY_TO_APPLY`.
- Pre-apply rows: 200 total, 15 `MAP_EXISTING`, 0 `CREATE_MASTER`, 185 `HOLD`.
- Applied at: `2026-08-03T09:38:21.174Z`.
- Apply result: 15 existing mappings, 0 created, 0 skipped, 185 held.
- Target integrity: 15 checked, 15 exact, 0 missing or mismatched.

## Applied Existing Mappings

| Company | Chanjet identity | ERP target |
| --- | --- | --- |
| `COMP-LAO-AGRI` | 总部 | `sys_organizations/COMP-LAO-AGRI` |
| `COMP-LAO-AGRI` | 孟赛直营店 | `mst_stores/STORE-MX-001` |
| `COMP-LAO-AGRI` | 琅勃拉邦直营店 | `mst_stores/STORE-LPB-001` |
| `COMP-LAO-AGRI` | 2号鸡舍 | `brd_houses/HOUSE_MS_02` |
| `COMP-LAO-AGRI` | 3号鸡舍 | `brd_houses/HOUSE_MS_03` |
| `COMP-LAO-AGRI` | 4号鸡舍 | `brd_houses/HOUSE_MS_04` |
| `COMP-LAO-AGRI` | 5号鸡舍 | `brd_houses/HOUSE_MS_05` |
| `COMP-LAO-AGRI` | 6号鸡舍 | `brd_houses/HOUSE_MS_06` |
| `COMP-LAO-AGRI` | 总公司 | `sys_organizations/COMP-LAO-AGRI` |
| `COMP-LAO-XINGCHI` | 总部 | `sys_organizations/COMP-LAO-XINGCHI` |
| `COMP-LAO-XINGCHI` | 公司总部 | `sys_organizations/COMP-LAO-XINGCHI` |
| `COMP-LAO-XINGCHI` | 会晒直营店 | `mst_stores/STORE-HS-001` |
| `COMP-LAO-XINGCHI` | 沙耶武里直营店 | `mst_stores/STORE-XB-001` |
| `COMP-LAO-FOOD` | 总部 | `sys_organizations/COMP-LAO-FOOD` |
| `COMP-LAO-FOOD` | 总 部 | `sys_organizations/COMP-LAO-FOOD` |

## Business Table Safety Verification

The following row-count and deterministic content fingerprints were identical
before and after apply:

- `fin_cash_accounts`: 72 rows.
- `biz_projects`: 13 rows.
- `wms_warehouses`: 16 rows.
- `brd_houses`: 11 rows.
- `mst_stores`: 10 rows.
- `sys_organizations`: 50 rows.
- `fin_cash_transactions`: 429 rows.
- `inv_batches`: 257 rows.
- `inv_ledger`: 111 rows.

This confirms that the Gate recorded relationships only and did not mutate ERP
business masters or facts.

## Post-Apply Idempotency And Remaining Holds

- Post-apply review hash:
  `192d2f6696ae56a17db084e55ca3f155412bed13d926f7d226100aa30273bec0`.
- Decision: `HOLD`.
- Actionable: 0.
- Remaining: 185 `HOLD`.

| Domain | HOLD | Reason |
| --- | ---: | --- |
| Cash account | 2 | Missing actual bank/account evidence; payment method is not an account |
| Department | 17 | Missing site, ambiguous store alias, workshop ownership, group or accounting-only dimension |
| Product | 128 | Product/SKU/material/livestock identity lacks grade, specification or UOM context |
| UOM | 22 | Product-specific conversion or contextual definition required |
| Warehouse | 16 | House inventory bridge or unambiguous warehouse master required |

## Verification

- Targeted business-review tests: 5/5 passed.
- Chanjet API suite: 12 suites, 195 tests passed.
- API TypeScript check: passed.
- W5 closeout Gate: 20/20 passed with recorded freeze/security authorization.
- `git diff --check`: passed before release.

## Next Gate

Enter `CHANJET_PRODUCT_SKU_UOM_POLICY_CLOSURE` first. It must define product,
grade, specification, package UOM and conversion evidence before any of the 128
product or 22 UOM rows can be mapped. Site/workshop and house-inventory bridge
policies remain separate. Chanjet writeback and ERP fact import stay disabled.
