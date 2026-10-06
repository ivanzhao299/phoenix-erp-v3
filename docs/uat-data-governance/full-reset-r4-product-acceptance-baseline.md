# R4 Product Acceptance Baseline Report

## Result

R3 identity and infrastructure protections remain healthy, but the strict R4 zero-runtime gate is not satisfied. After API recovery, the platform regenerated a small amount of normal system runtime data:

| Table | Rows | Evidence |
|---|---:|---|
| `sys_cron_heartbeat` | 3 | `workflow_sla`, `iot_sync`, `notification_tick`; successful heartbeat state |
| `sys_notifications` | 12 | `SYSTEM_ALERT` device notifications created after the R3 reset epoch |

These rows are system runtime output, not business transactions. They were not modified during R4. Under the frozen R4 rule (`NONZERO_TRANSACTION_TARGET_TABLES=0`), they are recorded as post-reset drift and require a separate runtime-baseline decision.

## Production identity and service state

| Item | Result |
|---|---|
| R4 base main | `1446c87425d0d62c5aeb3da6604d32db42848f84` |
| Host | `iZt4nj11ry11ofv03yi35vZ` |
| Deploy path | `/data/phoenix-erp` |
| Database | `phoenix_erp` |
| PostgreSQL | `16.14` |
| System identifier | `7641898445435437089` |
| Production deploy checkout | `017633c5fb0a090d7b8cda375125d1832668f304` |
| API image | `phoenix-m2-api:baseline-017633c5fb0a090d7b8cda375125d1832668f304` |
| Web image | `phoenix-m2-web:baseline-5425089bcb51338d4780d6f37782440bade8b90c` |
| DB/API/Web container health | healthy |
| API health/readiness | 200 / 200 |
| Web root reachability | HTTP 307 redirect |
| Container restarts during R4 | 0 |

No service was restarted or deployed during R4.

## Clean transaction baseline checks

- Target tables checked: `150`.
- Nonzero target tables: `2` (the system-runtime rows listed above).
- AR ledger, invoices, receipts and allocations: `0`.
- Inventory batches, ledger and allocations: `0`.
- Cash transactions and payments: `0`.
- Cash accounts: `77`; all `current_balance = opening_balance`.
- Workflow definitions/versions/rules remain available (`10/10/17`).
- Workflow instances, tasks, actions and variables: `0`.
- Chanjet durable running jobs and writeback queues: `0`.

## Master, RBAC and scope availability

The retained baseline remains populated:

- organizations `60`, farms `2`, customers `87`, stores `10`;
- SKUs `85`, warehouses `31`, zones `30`, locations `34`;
- users `44`, roles `56`, menus `191`, permission sets `2`, permission-set items `10`;
- user-role bindings `98`, organization scopes `34`, warehouse scopes `44`, farm scopes `1`.

The retained pilot identity state is unchanged: `pilot_wms` is absent; `pilot_sales`, `pilot_cashier`, `pilot_driver`, `pilot_finance`, and `pilot_manager` remain disabled; `wang_ceo` remains unchanged. The `pilot_manager` price-book attribution remains preserved.

Unauthenticated module GET requests returned `401`, confirming the authentication guard is active. No approved authenticated session was available for this read-only run, so interactive login, menu rendering and DataScope resolution are recorded as **human UAT pending**, rather than inferred from an unauthenticated request.

## Archive and attachment preservation

- Audit log rows remain available (`sys_audit_log=141649`, `sys_operation_logs=339`).
- File metadata remains available (`file_metadata=56`).
- Upload storage is mounted at `/app/uploads`; the production upload root contains `127` physical files.
- Chanjet archive snapshots remain available (`chanjet_read_snapshots=17717`).
- No physical file deletion or database mutation was performed in R4.

## Chanjet hold and reimport guard

The running API container still carries both flags disabled:

```text
CHANJET_READONLY_SYNC_ENABLED=false
CHANJET_ERP_INBOUND_SYNC_ENABLED=false
```

The R3 reset epoch reimport guard passed: no new sync jobs, mirror rows, inbound runs, reconciliation runtime or pending writeback were observed. Remote Chanjet cleanup remains deferred external maintenance.

## Log review and status

Post-reset log scanning found no `QueryFailedError`, foreign-key violation, missing-relation error, unhandled exception or fatal error. Route-registration messages containing the word “error” were excluded from the critical count.

```text
POST_RESET_DATA_DRIFT=YES
R4_PRODUCT_ACCEPTANCE_BASELINE=FAIL
AUTOMATED_STATUS=FAIL_RUNTIME_BASELINE_DRIFT
HUMAN_UAT_STATUS=PENDING
NEXT_ACTION=OPEN_RUNTIME_BASELINE_DEFECT_TRACK
```

The clean business transaction baseline remains intact. Before human UAT starts, the runtime policy must decide whether these system heartbeat and notification rows are excluded from the zero-runtime contract or whether the corresponding schedulers/notification retention need a separately approved control. No production cleanup is initiated by this report.
