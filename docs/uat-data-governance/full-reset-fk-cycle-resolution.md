# FULL RESET FK CYCLE RESOLUTION

本报告根据生产实时 `pg_constraint` 重新核对 R0 计算结果。原 R0 图算法把 6 个残留节点报告为 cycle；实时约束显示其中 4 个是普通 child-before-parent DAG 节点，真正与交易清理有关的是两个自引用约束。`sys_organizations.parent_id` 是 KEEP 主数据自引用，绝不触碰。

## Cycle inventory

| cycle_id | table | constraint | action | current rows | nullable | plan |
|---|---|---|---|---:|---|---|
| C1 | `sal_store_sale_tenders` | `sal_store_sale_tenders_reversal_of_tender_id_fkey` | RESTRICT self-reference | 4 | YES | delete settlement reconciliation children; in one transaction set only DELETE rows' `reversal_of_tender_id` to NULL; delete tenders; then sales |
| C2 | `pkg_packing_events` | `pkg_packing_events_session_id_fkey` | NO ACTION self-reference | 0 | YES | no data action required; if non-zero at T0, set only DELETE rows' `session_id` NULL inside the same transaction, then delete events |
| M1 | `sys_organizations` | `sys_organizations_parent_id_fkey` | NO ACTION self-reference | master | YES | KEEP; no update or delete allowed |

`pkg_packing_boxes → pkg_packing_records`, `pkg_packing_operations → pkg_packing_records`, and `pkg_packing_events → pkg_packing_records` are ordinary DAG edges, not cycles. Their current rows are handled in child-before-parent order. `sal_store_sale_tenders → sal_store_sales` and `sal_store_settlement_reconciliations → sal_store_sale_tenders` remain RESTRICT edges and must precede parent deletion.

## Allowed strategy

Strategy B is allowed only for the two nullable self-reference columns, only for rows already classified `DELETE_TRANSACTION`, and only inside the same guarded transaction. The precondition must assert the target table is entirely in the delete set, the column is nullable, and the expected row count has not drifted.

## Forbidden strategy

```text
DROP CONSTRAINT
DISABLE TRIGGER ALL
session_replication_role=replica
TRUNCATE ... CASCADE
UPDATE KEEP_MASTER rows
```

## Gate

```text
FK_CYCLE_PLAN=DESIGNED_NOT_EXECUTED
FK_CYCLE_DDL_REQUIRED=NO
FK_CYCLE_CURRENT_ROWS=4 transaction self-reference rows
R2_ALLOWED=NO (waiting for trigger, opening-balance, and Chanjet gates)
```
