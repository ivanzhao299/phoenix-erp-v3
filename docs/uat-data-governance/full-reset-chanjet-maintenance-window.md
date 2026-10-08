# FULL RESET CHANJET MAINTENANCE WINDOW

## Current production read-only state

```text
CHANJET_READONLY_SYNC_ENABLED=NOT_SET_EFFECTIVE_DEFAULT_TRUE
CHANJET_ERP_INBOUND_SYNC_ENABLED=NOT_SET_EFFECTIVE_DEFAULT_FALSE
CHANJET_READONLY_RECOVERY_COOLDOWN_MS=NOT_SET_EFFECTIVE_DEFAULT_900000
CHANJET_SYNC_JOBS_RUNNING=100
  durable_scheduler_job=1
  legacy_running_rows_without_orchestration_id=99
CHANJET_WRITEBACK_OUTBOX_PENDING=0
CHANJET_WMS_WRITEBACK_OUTBOX_PENDING=0
```

99 个旧 `RUNNING` 行没有 scheduler orchestration id，另有 1 个最近的 durable scheduler job。API bootstrap 会执行 `recoverInterruptedRun()`；因此不能在 API 在线时开始 reset，也不能把当前读数当作已经清理。

## Pre-window sequence (R2/R3 only)

1. 记录当前 `.env` 的权限受控备份、精确 diff 和 rollback 内容；R1.6 不执行。
2. 停止 API、worker、scheduler、notification/background writer 和独立 Chanjet listener；DB 保持运行。
3. 在 API 停止后确认没有新的 job 写入，且 `chanjet_writeback_outbox` 与 `chanjet_wms_writeback_outbox` pending 均为 0。
4. 将维护窗口 flags 设为：

   ```text
   CHANJET_READONLY_SYNC_ENABLED=false
   CHANJET_ERP_INBOUND_SYNC_ENABLED=false
   ```

5. 对 durable/legacy `RUNNING` runtime 先保存受限证据，再按批准的 runtime retention 动作处理；不得在 R1.6 直接删除或 UPDATE。
6. 只有 `NO_DURABLE_RUNNING_CHANJET_JOB_AT_RESET=YES` 后才开始本地 reset transaction。

## Local table policy

```text
KEEP: chanjet_account_books, chanjet_book_company_map, chanjet_master_mapping,
      chanjet_erp_field_mapping, policies, credentials/config references
ARCHIVE: chanjet_read_snapshots, chanjet_entity_snapshots, chanjet_ar_snapshot,
         chanjet_reconciliation_results (unless retention contract says runtime purge)
DELETE_RUNTIME/EXTERNAL_GATE: chanjet_sync_jobs, inbound sync runs,
         shareholder accounting runtime, promotion candidates, writeback runtime
```

本地删除/归档不代表远端 Chanjet 删除。远端清理保持：

```text
CHANJET_REMOTE_CLEANUP=DEFERRED_EXTERNAL_MAINTENANCE
```

## Post-reset start sequence

1. 启动 API 时保持两个 Chanjet flags 为 `false`；不要自动恢复 readonly scheduler。
2. 运行 [full-reset-chanjet-reimport-postcheck.sql](../../scripts/uat/full-reset-chanjet-reimport-postcheck.sql)，传入 reset epoch。
3. 多轮确认无新 sync job、mirror row、inbound run、reconciliation notification 和 pending writeback。
4. 只有完成独立 `CHANJET_REMOTE_BASELINE_REVIEW` 后，才可另行批准开启 readonly sync。


## Configuration hardening follow-up (repository implementation, no production action)

The canonical execution policy now requires explicit true; missing/false/ambiguous inputs hold scheduler, manual queue, bootstrap recovery and direct mirror service entrypoints before mutation. Status reads remain available. Readonly mirror enablement does not enable the independent ERP inbound gate; non-dry-run AR ledger import is also held by that gate. Existing financial approval/RBAC and external writeback boundaries remain.

No reset/HOLD data update, remote cleanup or reenablement is authorized here. Version 1 production admission requires explicit false/false and approved /data configuration. A future reenablement must receive separate operational/contract approval; ordinary code deployment cannot enable it.

Pre-floor images such as the current P lack verified bootstrap/manual isolation and are not automatic rollback candidates. A historical zero-job report is not a fresh certificate. The repository's first transition is forward-only under explicit one-time/full/C3-proof gates; failure retains safe configuration and enters operator recovery HOLD. Optional Nginx marker alone does not prove Web/loopback/bridge isolation or waive this restriction.

Production remains unchanged until separately authorized C3/C4. Implementation/test evidence: `docs/product-acceptance/production-config-hardening-implementation.md`.
