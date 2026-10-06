# Phoenix ERP V3 — Full Business Reset R3 Production Closeout

## Result

R3 controlled execution completed successfully on the confirmed Phoenix production target. The execution used the merged R3 contract and the same transaction body that passed the R2 rollback rehearsal. No application image or schema deployment was performed.

| Item | Result |
|---|---|
| R3 execution main | `d4dcfe85bb83ad59f2a76a24a0bf9b3d35bc4b0d` |
| Database | `phoenix_erp` |
| PostgreSQL | `16.14` |
| System identifier | `7641898445435437089` |
| Reset epoch | `2026-10-06T13:33:09+08:00` |
| Production reset | **COMMITTED** |
| Deleted rows reported by contract | `263174` |
| Target cleanup tables | `150/150` at zero after commit |

## Protection checks

- AR ledger, invoices, receipts, allocations and outstanding balance: **zero**.
- Inventory batches, ledger and transaction-derived facts: **zero**.
- Workflow runtime instances, tasks, actions and variables: **zero**.
- Cash account master rows were retained; every `current_balance` equals `opening_balance`.
- KEEP_MASTER stable-key baseline before and after reset was identical.
- ARCHIVE policy checks passed; retained archive evidence was not cleared.
- Foreign-key, logical-orphan and trigger-restore checks passed.
- Sequence reset: **NO**.
- Physical file deletion: **NO**.
- Chanjet remote write: **NO**.

## Backups and evidence

Evidence is retained in the restricted production directory:

`/home/phoenix-codex-deploy/full-business-reset-evidence/r3-20261006T052604Z/`

| Artifact | Size | TOC | SHA-256 |
|---|---:|---:|---|
| Pre-reset backup | 201047100 | 2941 | `61494f608d800a318987cd13247552b557be7ce06ef070ca22f3a7687fc99425` |
| Clean baseline backup | 194417524 | 2941 | `a53a614726d508be066b142e9412f1bbbf8734517810a86248c71a2282cbbf31` |

The R2 pre-reset backup remains retained separately. Raw production rows, dumps, `.env` contents and credentials are not committed to Git.

## Service and Chanjet state

The API was restored with the previously captured pinned image. DB, API health/readiness and Web reachability passed. Chanjet remains isolated:

- `CHANJET_READONLY_SYNC_ENABLED=false`
- `CHANJET_ERP_INBOUND_SYNC_ENABLED=false`
- durable running jobs: `0`
- pending writeback and WMS writeback: `0`
- three post-reset stability rounds: **3/3 PASS**
- remote Chanjet cleanup: `DEFERRED_EXTERNAL_MAINTENANCE`

The environment is ready for Product Acceptance against the clean transaction baseline. No UAT fixtures were seeded after reset.

## Production mutation record

The R3 transaction committed the approved full transaction/runtime reset and approved derived-state rebuild. No schema change, sequence reset, physical attachment deletion, or Chanjet remote write was performed. The only non-business maintenance control was the previously approved Chanjet durable-job hold used to prevent scheduler recovery.
