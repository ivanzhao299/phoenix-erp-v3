# Chanjet Product / SKU / UOM Policy Closure Report

Date: 2026-08-03

## Decision

`GO_WITH_CONDITIONS`

Chanjet remains the authoritative source. The active synchronization direction is
`CHANJET_TO_ERP`. ERP-to-Chanjet contracts may be prepared, but reverse execution
remains `READY_BUT_LOCKED` and no Chanjet data was written in this Gate.

## Scope

This Gate converted evidence-complete Chanjet product identities into ERP product
masters and mapping records. It did not import financial balances, inventory
facts, stock transactions or business documents. It did not execute a migration.

## Initial Failure And Recovery

The first production apply was rejected transactionally because generated SKU
grade/specification codes exceeded the target `varchar(16)` schema. The database
transaction rolled back cleanly:

- Generated SKUs after rollback: 0
- Generated materials after rollback: 0
- Residual business rows: 0

The generator was corrected to use compact stable codes (`CJ_G0..CJ_G5`,
`CJ_GX`, and bounded `CJ_*` specification codes). A regression test covers the
previously failing unclassified broken-egg identity.

## Validation And Deployment

- Target Jest suite: 9/9 PASS
- API typecheck: PASS
- W5 closeout gate: PASS with the recorded freeze/security review flags
- Code revision: `b6e7fd09`
- Push CI/CD run: `30807767448` PASS
- Explicit production API deployment run: `30808189992` PASS
- Production backup:
  `/opt/phoenix-erp-backups/chanjet-product-sku-uom-20260803-191429`
- Backup artifact: `backup.dump` (219,299 bytes; 62 TOC entries)

## Production Apply

Initial plan hash:
`c3bfd0ecc268746a92a923f792170bc104eeffbedd8ceaf34d4cb4222c27e910`

The first successful transaction produced:

- New ERP SKU masters: 19
- New ERP material masters: 28
- New source mappings in the first transaction: 67
- Shared same-target mappings: 20
- Material classification: 23 `VET_DRUG`, 3 `FEED_RAW`, 2 `PACKAGING`

After the created targets became visible, a second deterministic convergence pass
mapped 11 additional cross-book identities to those exact targets. It created no
new master rows.

Convergence plan hash:
`f1ac33eeb4a354c3685c9244beb3afcb60f98213e6255fdb1a914c49e50501b1`

Final plan hash:
`14b9decfa711a45afaeb8789662785ca50b67e6208d7c66777ed5937030fbc48`

## Final Readback

- New source mappings in this Gate: 78
- Total mapped product identities: 88
- Generated SKU masters: 19
- Generated material masters: 28
- Target missing: 0
- Target name mismatch: 0
- Remaining actionable rows: 0
- Audit records: present for both apply transactions

Both audit records explicitly confirm:

- Chanjet write: false
- Finance fact import: false
- Inventory fact import: false

## Remaining HOLD

There are 107 evidence-incomplete rows. They were not guessed, fuzzily matched or
silently promoted:

| Type | HOLD |
| --- | ---: |
| CASH_ACCOUNT | 2 |
| DEPARTMENT | 17 |
| PRODUCT | 50 |
| UOM | 22 |
| WAREHOUSE | 16 |

The 22 UOM identities require product-specific conversion policy. Remaining
products include identities whose unit, livestock, grade or specification
semantics cannot be safely inferred. Department, warehouse and cash-account rows
remain separate policy Gates.

## Synchronization Contract

| Capability | State |
| --- | --- |
| Authority source | CHANJET |
| Active synchronization | CHANJET_TO_ERP |
| ERP master-data write | Enabled for reviewed deterministic candidates |
| ERP-to-Chanjet contract model | Ready |
| ERP-to-Chanjet execution | READY_BUT_LOCKED |
| Chanjet write/delete/modify | Disabled |
| Finance balance import | Disabled |
| Inventory fact import | Disabled |

## Next Gate

`CHANJET_UOM_CONVERSION_POLICY_CLOSURE`

The next Gate must define auditable unit conversion rules before resolving the 22
UOM rows and related product HOLDs. External Chanjet write remains locked.
