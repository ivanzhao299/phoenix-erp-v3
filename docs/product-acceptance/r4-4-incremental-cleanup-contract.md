# R4.4 Post-R3 Incremental Test Data Cleanup Contract

This contract is derived from the production-verified R3 FK order and R4.1 runtime policy. It is a maintenance contract only; this PR performs no production mutation.

- Base main: `0aad59f560da52efc489d22b2f23d6bd2c60fbb8`
- R3 reset epoch: `2026-10-06T13:33:09+08:00`
- Scope: 148 zero-required rows/domains, represented by the frozen R3 transaction/runtime/derived set plus the five approved local Chanjet runtime domains.
- `sys_cron_heartbeat` is preserved byte-for-byte.
- Only non-system-alert rows in `sys_notifications` are cleanup targets; the `SYSTEM_ALERT/SYS_ALERT/SYSTEM_ALERT` subset and `sys_alerts` are preserved.
- AR opening/ledger and shareholder Chanjet external-gate tables remain untouched. Remote Chanjet cleanup remains deferred.
- The actual PR root uses `prc2_request_items` as its child table.

The SQL defaults to dry-run rollback. A formal commit requires both `-v PRODUCTION_INCREMENTAL_CLEANUP_AUTHORIZED=true` and `-v PRODUCTION_INCREMENTAL_CLEANUP_DRY_RUN=false`.

The `reviewed-frozen-boundary` PR label is required by the repository gate for this intentional maintenance contract.
