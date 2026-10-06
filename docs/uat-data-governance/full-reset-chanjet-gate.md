# FULL RESET CHANJET EXTERNAL GATE

本文件只记录本地只读事实。PostgreSQL 清理不能撤销已经写入 Chanjet 的远端事实。

## Local runtime inventory

```text
chanjet_sync_jobs=35433
  SUCCESS=30399
  FAIL=4934
  RUNNING=100
chanjet_erp_inbound_sync_runs=5
chanjet_reconciliation_results=1630
  HOLD unresolved=72
  WARN unresolved=1030
  WARN resolved=528
chanjet_writeback_outbox=0
chanjet_wms_writeback_outbox=0
```

保留：配置、凭据、账套映射、策略和连接信息。同步运行、对账结果、快照和 writeback runtime 是否归档或删除，必须根据远端影响核对决定。`chanjet_shareholder_accounting_balances`、`chanjet_shareholder_voucher_links` 和 `chanjet_shareholder_close_periods` 保持 `EXTERNAL_GATE`。

## Gate

```text
REMOTE_CHANJET_SIDE_EFFECTS=UNKNOWN
CHANJET_REMOTE_CLEANUP_REQUIRED=UNKNOWN
CHANJET_WRITE_API_CALLED=NO
LOCAL_RUNTIME_DELETE_ALLOWED=NO
```

需要 Chanjet 管理侧提供远端影响核对或书面确认；本轮不调用写 API，不把本地清理解释为远端清理。
