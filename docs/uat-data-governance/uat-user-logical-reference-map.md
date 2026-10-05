# U2A 用户逻辑引用关系图

本报告只针对业务确认 `DELETE` 的六个账号：`pilot_cashier`、`pilot_driver`、`pilot_finance`、`pilot_manager`、`pilot_sales`、`pilot_wms`。`wang_ceo` 明确 KEEP，未进入目标集合。每个 segment 使用独立只读事务、10 秒 statement timeout 和 2 秒 lock timeout；结果见 `scripts/uat/evidence/u2-user-reference-segments.tsv`。

## 结论

- 数据库实际入站 FK 共 8 条：CASCADE 2、SET NULL 2、NO ACTION 4、RESTRICT 0。
- 目标账号命中的 FK 行共 5 行，全部是 `sys_user_role.user_id` 的授权连接记录；其余 FK 命中为 0。
- 逻辑扫描共 81 个 segment：78 PASS、3 NOT_PRESENT、0 TIMEOUT、0 ERROR。
- 唯一非零逻辑业务引用为 `sal_price_books.created_by` 1 行，归属于 `pilot_manager`；它阻止该账号硬删除。
- `pkg_packing_operations.actor_id`、`pkg_packing_events.actor_id`、审计/操作日志、工作流、采购、销售、库存、财务和 Chanjet 引用均为 0。

## FK 拓扑

|子表|列|约束|删除动作|风险|目标行数|
|---|---|---|---|---|---:|
|`pkg_packing_events`|`actor_id`|`pkg_packing_events_actor_id_fkey`|`NO ACTION`|historical fact|0|
|`pkg_packing_operations`|`actor_id`|`pkg_packing_operations_actor_id_fkey`|`NO ACTION`|historical fact|0|
|`store_memberships`|`user_id`|`store_memberships_user_id_fkey`|`NO ACTION`|access/history|0|
|`sys_permission_set`|`created_by`|`sys_permission_set_created_by_fkey`|`SET NULL`|master-data provenance|0|
|`sys_user_permission_set`|`granted_by`|`sys_user_permission_set_granted_by_fkey`|`SET NULL`|authorization provenance|0|
|`sys_user_permission_set`|`user_id`|`sys_user_permission_set_user_id_fkey`|`CASCADE`|authorization junction|0|
|`sys_user_role`|`granted_by`|`sys_user_role_granted_by_fkey`|`NO ACTION`|authorization provenance|0|
|`sys_user_role`|`user_id`|`sys_user_role_user_id_fkey`|`CASCADE`|authorization junction|5|

## 逻辑引用 segment

|segment|表.列|类型|DB FK|历史/业务性质|状态|命中行数|风险|
|---|---|---|---|---|---|---:|---|
|`AUDIT_USERNAME`|`sys_audit_log.user_name`|LOGICAL_USERNAME|NO|operational record|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`AUDIT_USER_ID`|`sys_audit_log.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`BIZ_PO_CREATED_BY`|`biz_purchase_order.created_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`BIZ_SO_CREATED_BY`|`biz_sales_order.created_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`BIZ_SO_UPDATED_BY`|`biz_sales_order.updated_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`BRD_DAILY_OPERATOR`|`brd_daily_logs.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`BRD_MEDICATION_OPERATOR`|`brd_medications.operator`|LOGICAL_USERNAME|NO|operational record|NOT_PRESENT|0|字段不存在；不构成当前引用|
|`BUG_ASSIGNEE`|`bug_reports.assignee_username`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`BUG_REPORT_REPORTER_ID`|`bug_reports.reporter_user_id`|LOGICAL_USER_ID|NO|business or audit fact|NOT_PRESENT|0|字段不存在；不构成当前引用|
|`BUG_REPORT_REPORTER_NAME`|`bug_reports.reporter_username`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`BUG_UPDATED_BY`|`bug_reports.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`CHANJET_VOUCHER_APPROVED_BY`|`chanjet_voucher_drafts.approved_by`|LOGICAL_USERNAME|NO|integration runtime|PASS|0|无当前命中；未来变更需重新盘点|
|`CHANJET_VOUCHER_CREATED_BY`|`chanjet_voucher_drafts.created_by`|LOGICAL_USERNAME|NO|integration runtime|PASS|0|无当前命中；未来变更需重新盘点|
|`CHANJET_WB_APPROVED_BY`|`chanjet_writeback_outbox.approved_by`|LOGICAL_USERNAME|NO|integration runtime|PASS|0|无当前命中；未来变更需重新盘点|
|`CHANJET_WB_CREATED_BY`|`chanjet_writeback_outbox.created_by`|LOGICAL_USERNAME|NO|integration runtime|PASS|0|无当前命中；未来变更需重新盘点|
|`DAILY_CLOSE_OPERATOR`|`daily_close.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`FIN_APPROVAL_APPROVER`|`fin_approvals.approver`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_APPROVAL_APPROVER_ID`|`fin_approvals.approver_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AP_CREATED_BY`|`fin_ap_invoices.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AP_UPDATED_BY`|`fin_ap_invoices.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AR_CREATED_BY`|`fin_ar_invoices.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AR_RECEIPT_CREATED_BY`|`fin_ar_receipts.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AR_RECEIPT_UPDATED_BY`|`fin_ar_receipts.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_AR_UPDATED_BY`|`fin_ar_invoices.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_CASH_ACCOUNT_CREATED_BY`|`fin_cash_accounts.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_CASH_TX_CREATED_BY`|`fin_cash_transactions.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_FUND_TRANSFER_CREATED_BY`|`fin_fund_transfers.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_FUND_TRANSFER_UPDATED_BY`|`fin_fund_transfers.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_SETTLEMENT_CREATED_BY`|`fin_shareholder_settlements.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_SHAREHOLDER_CONTRIB_CREATED_BY`|`fin_shareholder_contributions.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_TX_CREATED_BY`|`fin_transactions.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FIN_TX_OPERATOR`|`fin_transactions.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`FK_PKG_PACKING_EVENTS`|`pkg_packing_events.actor_id`|FK_USER_ID|YES|business or audit fact|PASS|0|NO ACTION/RESTRICT 会阻止删除并保护历史事实|
|`FK_PKG_PACKING_OPERATIONS`|`pkg_packing_operations.actor_id`|FK_USER_ID|YES|business or audit fact|PASS|0|NO ACTION/RESTRICT 会阻止删除并保护历史事实|
|`FK_STORE_MEMBERSHIPS`|`store_memberships.user_id`|FK_USER_ID|YES|operational record|PASS|0|NO ACTION/RESTRICT 会阻止删除并保护历史事实|
|`FK_SYS_PERMISSION_SET_CREATED_BY`|`sys_permission_set.created_by`|FK_USER_ID|YES|master/provenance|PASS|0|删除会丢失历史归因，需阻止自动删除|
|`FK_SYS_USER_PERMISSION_SET_GRANTED_BY`|`sys_user_permission_set.granted_by`|FK_USER_ID|YES|operational record|PASS|0|删除会丢失历史归因，需阻止自动删除|
|`FK_SYS_USER_PERMISSION_SET_USER_ID`|`sys_user_permission_set.user_id`|FK_USER_ID|YES|operational record|PASS|0|级联只允许授权连接表；仍需记录行数|
|`FK_SYS_USER_ROLE_GRANTED_BY`|`sys_user_role.granted_by`|FK_USER_ID|YES|operational record|PASS|0|NO ACTION/RESTRICT 会阻止删除并保护历史事实|
|`FK_SYS_USER_ROLE_USER_ID`|`sys_user_role.user_id`|FK_USER_ID|YES|operational record|PASS|5|级联只允许授权连接表；仍需记录行数|
|`INV_LEDGER_OPERATOR`|`inv_ledger.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`INV_SOURCE_AUDIT_OPERATOR`|`inv_source_mode_audit.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`INV_SOURCE_MODE_UPDATED_BY`|`inv_source_mode.updated_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`MST_AUDIT_OPERATOR`|`mst_audit_trail.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`NOTIFICATION_USER_ID`|`sys_notifications.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`OPERATION_USERNAME`|`sys_operation_logs.username`|LOGICAL_USERNAME|NO|operational record|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`OPERATION_USER_ID`|`sys_operation_logs.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`ORD_APPROVAL_OPERATOR`|`ord_approval_log.operator`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`ORD_ORDERS_CREATED_BY`|`ord_orders.created_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`ORG_MANAGER_USER`|`sys_organizations.manager_user_id`|LOGICAL_USER_ID|NO|master/provenance|PASS|0|无当前命中；未来变更需重新盘点|
|`PKG_AUDIT_OPERATOR_ID`|`pkg_audit_logs.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_HANDOVER_RECEIVER`|`pkg_handover_records.receiver`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_LABEL_PRINTED_BY`|`pkg_label_print_logs.printed_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_QC_INSPECTOR_ID`|`pkg_qc_inspections.inspector_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_QC_INSPECTOR_NAME`|`pkg_qc_inspections.inspector_name`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_SHIFTS_CREATED_BY`|`pkg_shifts.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_SHIFTS_OPERATOR`|`pkg_shifts.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_SHIFTS_UPDATED_BY`|`pkg_shifts.updated_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_TASKS_CREATED_BY`|`pkg_tasks.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_WORK_SHIFT_OPERATOR_ID`|`pkg_work_shifts.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PKG_WORK_SHIFT_OPERATOR_NAME`|`pkg_work_shifts.operator_name`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_APPROVAL_APPROVER`|`prc2_approvals.approver_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_AP_LEDGER_CREATED_BY`|`prc2_ap_ledger.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_EXCHANGE_RATE_CREATED_BY`|`sys_exchange_rates.created_by`|LOGICAL_REFERENCE|NO|master/provenance|PASS|0|无当前命中；未来变更需重新盘点|
|`PRC_INIT_BATCH_CREATED_BY`|`prc2_init_batches.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_PAYMENT_CREATED_BY`|`prc2_payments.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_PO_APPROVED_BY`|`prc2_purchase_orders.approved_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_PO_CREATED_BY`|`prc2_purchase_orders.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_PROJECT_MANAGER`|`prc2_projects.project_manager_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_RECEIPT_CREATED_BY`|`prc2_receipts.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_REQUEST_CREATED_BY`|`prc2_purchase_requests.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_SHAREHOLDER_FUND_CREATED_BY`|`prc2_shareholder_funds.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_SHIPMENT_CREATED_BY`|`prc2_shipments.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`PRC_SUPPLIER_CREATED_BY`|`prc2_suppliers.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`QA_INSPECTION_INSPECTOR`|`qa_inspections.inspector`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`QA_NONCONFORMANCE_ASSIGNEE`|`qa_non_conformance.assignee`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`QA_PRODUCT_INSPECTION_INSPECTOR`|`qa_product_inspections.inspector`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SAL_ALLOC_ACTION_CREATED_BY`|`sal_order_item_batch_allocation_actions.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_ALLOC_CREATED_BY`|`sal_order_item_batch_allocations.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_DELIVERY_CREATED_BY`|`sal_delivery_orders.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_ORDER_CREATED_BY`|`sal_sales_orders.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_PRICEBOOK_CREATED_BY`|`sal_price_books.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|1|存在逻辑引用；删除会破坏对象归因|
|`SAL_RECEIPT_CREATED_BY`|`sal_receipts.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_RETURN_CREATED_BY`|`sal_return_orders.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_STORE_SALES_CREATED_BY`|`sal_store_sales.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SAL_STORE_SHIFT_OPERATOR_ID`|`sal_store_shift_closings.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`SHAREHOLDER_SCOPE`|`shr_shareholder_scopes.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SHR_LINKED_USER`|`shr_shareholders.linked_user_id`|LOGICAL_USER_ID|NO|master/provenance|PASS|0|无当前命中；未来变更需重新盘点|
|`STORE_ACCOUNT_CREATED_BY`|`store_payment_accounts.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`STORE_ACCOUNT_UPDATED_BY`|`store_payment_accounts.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`STORE_PAYMENT_CREATED_BY`|`store_payment_records.created_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`STORE_PAYMENT_UPDATED_BY`|`store_payment_records.updated_by`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_APPROVAL_FLOWS_CHAIN`|`sys_approval_flows.approver_chain`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_APPROVAL_LOG_APPROVER_ID`|`sys_approval_log.approver_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_APPROVAL_RULE_CHAIN`|`sys_approval_rule.approver_chain`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_CONFIG_CREATED_BY`|`sys_configs.created_by`|LOGICAL_REFERENCE|NO|master/provenance|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_CONFIG_UPDATED_BY`|`sys_configs.updated_by`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_ERROR_USERNAME`|`sys_error_logs.username`|LOGICAL_USERNAME|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`SYS_ERROR_USER_ID`|`sys_error_logs.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`UAT_FEEDBACK_ASSIGNEE`|`uat_feedbacks.assignee_id`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`UAT_FEEDBACK_ASSIGNEE_NAME`|`uat_feedbacks.assignee_name`|LOGICAL_REFERENCE|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`USER_FARM_SCOPE`|`sys_user_farm_scopes.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`USER_NOTIFICATION_PREFS`|`sys_user_notification_prefs.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`USER_ORG_SCOPE`|`sys_user_orgs.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`USER_PROJECT_SCOPE`|`sys_user_project_scopes.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`USER_WAREHOUSE_SCOPE`|`sys_user_warehouse_scopes.user_id`|LOGICAL_USER_ID|NO|operational record|PASS|0|无当前命中；未来变更需重新盘点|
|`WF_APPROVAL_INSTANCE_STARTER`|`wf_approval_instances.started_by`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_APPROVAL_STEP_ACTOR`|`wf_approval_instance_steps.actor_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_APPROVAL_STEP_APPROVER`|`wf_approval_instance_steps.approver_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_CC_RECEIVER`|`wf_cc_task.receiver_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_DEFINITION_CREATED_BY`|`wf_definition.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_FORM_DEFINITION_CREATED_BY`|`wf_form_definition.created_by`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_INSTANCE_STARTER`|`wf_instance.starter_id`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_RULE_STEP_APPROVER`|`wf_approval_rule_steps.approver_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_TASK_ACTION_ACTOR`|`wf_task_action.actor_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WF_TASK_ASSIGNEE`|`wf_task.assignee_user_id`|LOGICAL_USER_ID|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_INBOUND_OPERATOR`|`wms_inbound.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_INBOUND_OPERATOR_ID`|`wms_inbound.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|NOT_PRESENT|0|字段不存在；不构成当前引用|
|`WMS_OUTBOUND_OPERATOR`|`wms_outbound.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_OUTBOUND_OPERATOR_ID`|`wms_outbound.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|NOT_PRESENT|0|字段不存在；不构成当前引用|
|`WMS_STOCKTAKE_OPERATOR`|`wms_stocktake.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_STOCK_LEDGER_OPERATOR`|`wms_stock_ledger.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_TRANSFER_OPERATOR`|`wms_transfer.operator`|LOGICAL_USERNAME|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|
|`WMS_TRANSFER_OPERATOR_ID`|`wms_transfer.operator_id`|LOGICAL_REFERENCE|NO|business or audit fact|PASS|0|历史/业务事实字段，即使无当前行也需保留语义|

## 代码级证据

|证据|结论|
|---|---|
|`apps/api/src/auth/entities/sys-user.entity.ts`|`sys_user` 生命周期包含 `status`、`archived_at`、`archived_by`、`archive_reason`；账号归档语义已存在。|
|`apps/api/src/modules/master/system-users.controller.ts`|提供 `PUT /api/system/users/:id/archive` 和 restore 路径；U2A 不调用写接口。|
|`apps/api/src/modules/shareholder/entities/shr-shareholder.entity.ts`|`linked_user_id` 是显式用户逻辑关系，已按 `SHR_LINKED_USER` 分段核查。|
|`docs/schema-snapshot.sql`|确认 8 条实际入站 FK、用户 scope 表、审计/通知/工作流用户列；schema 快照仅作代码核对，生产计数以只读 segment 为准。|
|`apps/api/src/modules/packaging/**`、`apps/api/src/modules/wms/**`、`apps/api/src/modules/finance-v2/**`、`apps/api/src/modules/procurement-v2/**`|扫描 `actor_id`、`operator`、`created_by`、`updated_by`、`approved_by` 等引用；已纳入对应分段或标记 NOT_PRESENT。|

## 未形成引用的字段

`bug_reports.reporter_user_id`、`wms_inbound.operator_id`、`wms_outbound.operator_id` 在当前生产 schema 中不存在，状态为 `NOT_PRESENT`，不是未完成查询。未发现剩余 TIMEOUT/ERROR segment；若后续 schema 增加新的用户引用列，必须重新生成本图和 U2 目标集哈希。
