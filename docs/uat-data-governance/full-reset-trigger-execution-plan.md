# FULL RESET TRIGGER EXECUTION PLAN

本文件只定义 R2 需要验证的精确触发器动作。R1.5 没有禁用、删除或修改任何触发器。

## Non-empty protected trigger

| table | trigger | current rows | behavior | R2 plan |
|---|---|---:|---|---|
| `sal_order_lifecycle_events` | `trg_sal_order_lifecycle_events_append_only` | 133 | BEFORE DELETE/UPDATE raises append-only exception | exact trigger may be disabled only in the approved maintenance transaction, after archive/hash and delete-set assertion; re-enable and assert enabled before commit |
| `sal_store_settlements` | `trg_guard_posted_store_settlement` | 0 | protects POSTED rows | no current action; still assert enabled |
| `inv_batches` | `inv_batches_sync_available_trg` | 314 | INSERT/UPDATE only; no DELETE firing | leave enabled; postcheck available quantity/derived state |

## Empty protected runtime tables

`pkg_packing_events`, `pkg_packing_operations`, `pkg_packing_code_registry` and `pkg_packing_code_claims` currently have zero rows. Their immutable/history triggers remain installed and enabled; R2 must not infer that empty today permits a future unguarded delete.

## Required exact bypass contract

If the business approves removal of the 133 lifecycle facts, R2 must use the exact trigger name and table only, record pre-state, perform the delete, restore the trigger in the same maintenance window, and assert:

```text
trigger exists=YES
trigger enabled=YES
expected deleted rows=133 (rechecked at T0)
audit/archive evidence retained=YES
```

If any assertion fails, rollback. `DISABLE TRIGGER ALL` and `session_replication_role` remain prohibited.

## Gate

```text
IMMUTABLE_TRIGGER_PLAN=DESIGNED_NOT_EXECUTED
TRIGGER_DDL_REQUIRED=YES_FOR_sal_order_lifecycle_events_ONLY
TRIGGER_RESTORE_ASSERTION=REQUIRED
R2_ALLOWED=NO
```
