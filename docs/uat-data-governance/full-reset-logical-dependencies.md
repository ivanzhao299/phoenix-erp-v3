# Full Business Reset — Logical Dependencies

R0 对 `apps/api/src`、`scripts` 中 TypeScript/SQL/TSX 执行了业务编号、引用字段和 raw SQL 扫描，共命中约 1,849 个候选引用位置。数据库 FK 只覆盖其中一部分，因此 R1 必须按业务链确认删除顺序。

## 已确认的主要业务链

```text
procurement request
→ purchase order
→ receipt / receipt item
→ AP / payment / allocation

sales order
→ order item
→ batch allocation / allocation action
→ delivery / receipt / return
→ AR

inbound / outbound / transfer
→ inventory batches
→ inventory ledger / stock balance

packaging source batch
→ grading / packing / handover / QC
→ packing events / operations / code claims / labels

workflow definition/version/rule
→ workflow instance
→ tasks / actions / cc / variables

approval definition/rule
→ approval instance
→ approval steps / runtime logs
```

## Logical reference categories

| category | examples | R0 treatment |
|---|---|---|
| Business document references | `order_no`, `po_no`, `ref_no`, `batch_no`, `transfer_no` | R1 must map owner and child rows before delete |
| Workflow references | `wf_instance_id`, `approval_instance_id` | Preserve definitions; delete runtime after children |
| Finance references | `ar_invoice_id`, `ap_no`, `payment_id` | Delete transaction facts; recompute derived state |
| Inventory provenance | allocation, batch, ledger, source/reference fields | Must resolve six FK cycles and RESTRICT edges |
| Actor/audit fields | `created_by`, `updated_by`, `approved_by`, `actor_id`, `operator_id` | Transaction rows may delete; audit evidence remains retained |
| Integration references | Chanjet sync/writeback/snapshot IDs | Local runtime requires external-side-effect gate |

## R0 gate

```text
LOGICAL_DEPENDENCY_SCAN=COMPLETE_FOR_INVENTORY_INPUT
LOGICAL_DEPENDENCY_RECONCILIATION=REQUIRED_IN_R1
UNKNOWN_LOGICAL_DEPENDENCY_RISK=OPEN
FULL_RESET_EXECUTION_ALLOWED=NO
```

No cleanup SQL is generated from this document. The R1 design must reconcile this map with the live FK graph, trigger review, and exact table counts before any writer stop or destructive transaction.
