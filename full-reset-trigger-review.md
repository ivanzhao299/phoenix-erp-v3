# Full Business Reset — Trigger Review

R0 实时盘点发现 21 个 user-defined triggers。正式清理不得使用 `session_replication_role=replica` 或 `DISABLE TRIGGER ALL`；必须在 R1 逐个确认 deletion order 和触发器副作用。

|table|trigger|enabled|function|table_classification|risk|
|---|---|---|---|---|---|
|`biz_projects`|`trg_biz_projects_check_company`|O|`fn_biz_projects_check_company`|KEEP_MASTER|DERIVED/BUSINESS_GUARD|
|`biz_site_aliases`|`trg_biz_site_alias_check_site`|O|`fn_biz_site_alias_check_site`|DELETE_TRANSACTION|DERIVED/BUSINESS_GUARD|
|`prc2_suppliers`|`trg_prc2_supplier_rename_audit`|O|`fn_prc2_supplier_rename_audit`|KEEP_MASTER|AUDIT/HISTORY|
|`store_aliases`|`trg_store_site_alias`|O|`enforce_store_site_alias`|KEEP_MASTER|DERIVED/BUSINESS_GUARD|
|`wms_warehouses`|`trg_warehouse_owner_store`|O|`enforce_warehouse_owner_store`|KEEP_MASTER|DERIVED/BUSINESS_GUARD|
|`sal_store_settlements`|`trg_guard_posted_store_settlement`|O|`fn_guard_posted_store_settlement`|DELETE_TRANSACTION|DERIVED/BUSINESS_GUARD|
|`sal_order_lifecycle_events`|`trg_sal_order_lifecycle_events_append_only`|O|`prevent_sal_order_lifecycle_event_mutation`|DELETE_TRANSACTION|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`pkg_packing_code_registry`|`ck_namespace_pkg_packing_code_registry`|O|`check_packing_namespace`|DELETE_RUNTIME|DERIVED/BUSINESS_GUARD|
|`pkg_packing_code_claims`|`ck_namespace_pkg_packing_code_claims`|O|`check_packing_namespace`|DELETE_RUNTIME|DERIVED/BUSINESS_GUARD|
|`pkg_packing_code_registry`|`preserve_pkg_packing_code_registry`|O|`preserve_packing_claim_history`|DELETE_RUNTIME|AUDIT/HISTORY|
|`pkg_packing_code_claims`|`preserve_pkg_packing_code_claims`|O|`preserve_packing_claim_history`|DELETE_RUNTIME|AUDIT/HISTORY|
|`pkg_packing_events`|`packing_event_references`|O|`check_packing_event_references`|DELETE_RUNTIME|DERIVED/BUSINESS_GUARD|
|`pkg_packing_operations`|`packing_operation_result`|O|`check_packing_operation_result`|DELETE_RUNTIME|DERIVED/BUSINESS_GUARD|
|`pkg_packing_events`|`packing_event_immutable`|O|`reject_packing_event_mutation`|DELETE_RUNTIME|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`store_warehouse_bindings`|`trg_store_operational_warehouse`|O|`enforce_store_operational_warehouse`|KEEP_MASTER|DERIVED/BUSINESS_GUARD|
|`sys_user_role`|`trg_bump_perms_user_role`|O|`fn_bump_user_perms_version`|KEEP_MASTER|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`sys_user_permission_set`|`trg_bump_perms_user_pset`|O|`fn_bump_user_perms_version`|KEEP_MASTER|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`sys_role_menu_permission`|`trg_bump_perms_role_menu_perm`|O|`fn_bump_user_perms_version`|KEEP_MASTER|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`sys_role_permission_set`|`trg_bump_perms_role_pset`|O|`fn_bump_user_perms_version`|KEEP_MASTER|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`sys_permission_set_item`|`trg_bump_perms_pset_item`|O|`fn_bump_user_perms_version`|KEEP_MASTER|BUSINESS_SIDE_EFFECT/UNKNOWN|
|`inv_batches`|`inv_batches_sync_available_trg`|O|`inv_batches_sync_available`|DELETE_TRANSACTION|BUSINESS_SIDE_EFFECT/UNKNOWN|

## Gate

```text
TRIGGER_REVIEW_COMPLETE=NO
FULL_RESET_EXECUTION_ALLOWED=NO
REASON=R1 must resolve trigger side effects and six FK cycles
```
