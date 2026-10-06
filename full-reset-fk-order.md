# Full Business Reset — FK Deletion Topology

R0 实时读取生产 `pg_constraint`，共 98 条 FK。删除顺序按 child-before-parent 计算；KEEP 主数据不会进入删除集合。

- FK_COUNT=98
- DELETE_TOPOLOGY_NODES=164
- TOPOLOGY_ORDERED_NODES=158
- CYCLES=6
- KEEP_CHILD_TO_DELETE_PARENT_CONFLICTS=0
- UNKNOWN_BOUNDARY_TABLES=8 (R1 review required before execution)

## 计算出的删除顺序

1. `acc_ledger` (DELETE_TRANSACTION)
2. `b2b_order_items` (DELETE_TRANSACTION)
3. `b2b_orders` (DELETE_TRANSACTION)
4. `biz_cash_flow` (DELETE_TRANSACTION)
5. `biz_purchase_order` (DELETE_TRANSACTION)
6. `biz_sales_order` (DELETE_TRANSACTION)
7. `biz_site_aliases` (KEEP_MASTER)
8. `brd_daily_logs` (DELETE_TRANSACTION)
9. `brd_medication_records` (DELETE_TRANSACTION)
10. `brd_medications` (UNKNOWN)
11. `brd_vaccinations` (DELETE_TRANSACTION)
12. `brd_withdrawal_alerts` (DELETE_TRANSACTION)
13. `bug_reports` (ARCHIVE)
14. `chanjet_reconciliation_results` (EXTERNAL_GATE)
15. `chanjet_shareholder_accounting_balances` (EXTERNAL_GATE)
16. `chanjet_erp_inbound_sync_runs` (EXTERNAL_GATE)
17. `chanjet_shareholder_close_periods` (EXTERNAL_GATE)
18. `chanjet_shareholder_voucher_links` (EXTERNAL_GATE)
19. `chanjet_sync_jobs` (EXTERNAL_GATE)
20. `chanjet_wms_promotion_candidates` (EXTERNAL_GATE)
21. `chanjet_wms_writeback_outbox` (DELETE_TRANSACTION)
22. `chanjet_writeback_outbox` (EXTERNAL_GATE)
23. `chanjet_voucher_drafts` (DELETE_RUNTIME)
24. `chn_distributor_grading` (UNKNOWN)
25. `crm_activities` (UNKNOWN)
26. `crm_coupons` (UNKNOWN)
27. `crm_levels` (KEEP_MASTER)
28. `crm_members` (KEEP_MASTER)
29. `crm_points_ledger` (DELETE_TRANSACTION)
30. `crm_points_log` (DELETE_TRANSACTION)
31. `crm_points_rules` (KEEP_MASTER)
32. `cst_credit_warnings` (DELETE_RUNTIME)
33. `daily_close` (DELETE_TRANSACTION)
34. `farm_feed_ledger` (DELETE_TRANSACTION)
35. `fin_ap_invoices` (DELETE_TRANSACTION)
36. `fin_approvals` (DELETE_TRANSACTION)
37. `fin_ar_invoices` (DELETE_TRANSACTION)
38. `fin_ar_ledger` (UNKNOWN)
39. `fin_ar_receipt_allocations` (DELETE_TRANSACTION)
40. `fin_ar_receipts` (DELETE_TRANSACTION)
41. `fin_cash_accounts` (KEEP_MASTER)
42. `fin_cash_transactions` (DELETE_TRANSACTION)
43. `fin_expense_requests` (DELETE_TRANSACTION)
44. `fin_fund_transfers` (DELETE_TRANSACTION)
45. `fin_invoices` (DELETE_TRANSACTION)
46. `fin_pay_records` (DELETE_TRANSACTION)
47. `fin_payments` (DELETE_TRANSACTION)
48. `fin_reimbursements` (DELETE_TRANSACTION)
49. `fin_shareholder_contributions` (DELETE_TRANSACTION)
50. `fin_shareholder_settlements` (DELETE_TRANSACTION)
51. `fin_store_settlements` (DELETE_TRANSACTION)
52. `fin_transactions` (DELETE_TRANSACTION)
53. `inv_source_mode` (KEEP_MASTER)
54. `inv_source_mode_audit` (ARCHIVE)
55. `lbl_records` (DELETE_RUNTIME)
56. `log_dispatch` (DELETE_TRANSACTION)
57. `log_drivers` (UNKNOWN)
58. `log_exceptions` (DELETE_TRANSACTION)
59. `log_receipts` (DELETE_TRANSACTION)
60. `log_routes` (UNKNOWN)
61. `log_vehicles` (UNKNOWN)
62. `md_change_requests` (ARCHIVE)
63. `mon_house_device_mapping` (KEEP_MASTER)
64. `ord_approval_log` (DELETE_TRANSACTION)
65. `ord_credit_usage` (RESET_DERIVED)
66. `ord_order_items` (DELETE_TRANSACTION)
67. `ord_orders` (DELETE_TRANSACTION)
68. `ord_prices` (KEEP_MASTER)
69. `pkg_exceptions` (DELETE_TRANSACTION)
70. `pkg_grading_source_links` (DELETE_TRANSACTION)
71. `pkg_grading_records` (DELETE_TRANSACTION)
72. `pkg_handover_records` (DELETE_TRANSACTION)
73. `pkg_label_print_logs` (DELETE_RUNTIME)
74. `pkg_packing_code_claims` (DELETE_RUNTIME)
75. `pkg_packing_code_registry` (DELETE_RUNTIME)
76. `pkg_shifts` (DELETE_RUNTIME)
77. `pkg_source_batches` (DELETE_TRANSACTION)
78. `pkg_tasks` (DELETE_RUNTIME)
79. `pkg_work_shifts` (DELETE_RUNTIME)
80. `pos_refunds` (DELETE_TRANSACTION)
81. `pos_sale_items` (DELETE_TRANSACTION)
82. `pos_sales` (DELETE_TRANSACTION)
83. `pos_sessions` (DELETE_TRANSACTION)
84. `prc2_ap_ledger` (DELETE_TRANSACTION)
85. `prc2_approvals` (DELETE_TRANSACTION)
86. `prc2_init_batch_rows` (DELETE_TRANSACTION)
87. `prc2_init_batches` (DELETE_TRANSACTION)
88. `prc2_order_items` (DELETE_TRANSACTION)
89. `prc2_payment_allocations` (DELETE_TRANSACTION)
90. `prc2_payments` (DELETE_TRANSACTION)
91. `prc2_purchase_orders` (DELETE_TRANSACTION)
92. `prc2_purchase_requests` (DELETE_TRANSACTION)
93. `prc2_receipt_items` (DELETE_TRANSACTION)
94. `prc2_receipts` (DELETE_TRANSACTION)
95. `prc2_request_items` (DELETE_TRANSACTION)
96. `prc2_shareholder_funds` (DELETE_TRANSACTION)
97. `prc2_shipments` (DELETE_TRANSACTION)
98. `prc_purchase_items` (DELETE_TRANSACTION)
99. `prc_purchase_orders` (DELETE_TRANSACTION)
100. `prc_purchase_payments` (DELETE_TRANSACTION)
101. `prc_purchase_requests` (DELETE_TRANSACTION)
102. `prc_receipts` (DELETE_TRANSACTION)
103. `prc_returns` (DELETE_TRANSACTION)
104. `prc_supplier_returns` (DELETE_TRANSACTION)
105. `qa_inspection_items` (DELETE_TRANSACTION)
106. `qa_non_conformance` (DELETE_TRANSACTION)
107. `qa_standards` (KEEP_MASTER)
108. `sal_delivery_exceptions` (DELETE_TRANSACTION)
109. `sal_order_item_batch_allocation_actions` (DELETE_TRANSACTION)
110. `sal_order_item_batch_allocations` (DELETE_TRANSACTION)
111. `inv_ledger` (DELETE_TRANSACTION)
112. `sal_order_items` (DELETE_TRANSACTION)
113. `sal_order_lifecycle_events` (DELETE_TRANSACTION)
114. `sal_receipts` (DELETE_TRANSACTION)
115. `sal_delivery_order_items` (DELETE_TRANSACTION)
116. `sal_delivery_orders` (DELETE_TRANSACTION)
117. `sal_return_items` (DELETE_TRANSACTION)
118. `sal_return_orders` (DELETE_TRANSACTION)
119. `sal_sales_orders` (DELETE_TRANSACTION)
120. `sal_store_price_drift_events` (DELETE_TRANSACTION)
121. `sal_store_settlement_reconciliations` (DELETE_TRANSACTION)
122. `sal_store_settlement_shifts` (DELETE_TRANSACTION)
123. `sal_store_settlements` (DELETE_TRANSACTION)
124. `shr_capital_contributions` (DELETE_TRANSACTION)
125. `store_inventory` (RESET_DERIVED)
126. `store_payment_records` (DELETE_TRANSACTION)
127. `store_receiving_items` (DELETE_TRANSACTION)
128. `store_replenishment_request_lines` (DELETE_TRANSACTION)
129. `store_replenishment_requests` (DELETE_TRANSACTION)
130. `store_sale_adjustments` (DELETE_TRANSACTION)
131. `store_sale_allocations` (DELETE_TRANSACTION)
132. `sal_store_sale_items` (DELETE_TRANSACTION)
133. `sys_cron_heartbeat` (DELETE_RUNTIME)
134. `sys_data_scopes` (KEEP_MASTER)
135. `sys_doc_state_lock` (DELETE_RUNTIME)
136. `sys_notification_log` (DELETE_RUNTIME)
137. `sys_notifications` (DELETE_RUNTIME)
138. `wf_approval_instance_steps` (DELETE_RUNTIME)
139. `wf_approval_instances` (DELETE_RUNTIME)
140. `wf_cc_task` (DELETE_RUNTIME)
141. `wf_instance_variable` (DELETE_RUNTIME)
142. `wf_task_action` (DELETE_RUNTIME)
143. `wf_task` (DELETE_RUNTIME)
144. `wf_instance` (DELETE_RUNTIME)
145. `wms_inbound` (DELETE_TRANSACTION)
146. `wms_inbound_items` (DELETE_TRANSACTION)
147. `wms_outbound` (DELETE_TRANSACTION)
148. `wms_outbound_items` (DELETE_TRANSACTION)
149. `wms_stock_balance` (RESET_DERIVED)
150. `wms_stock_ledger` (DELETE_TRANSACTION)
151. `wms_stock_transfers` (DELETE_TRANSACTION)
152. `wms_stocktake` (DELETE_TRANSACTION)
153. `wms_transfer_discrepancies` (DELETE_TRANSACTION)
154. `wms_transfer_items` (DELETE_TRANSACTION)
155. `inv_batches` (DELETE_TRANSACTION)
156. `wms_transfer` (DELETE_TRANSACTION)
157. `ws_contracts` (DELETE_TRANSACTION)
158. `ws_shipments` (DELETE_TRANSACTION)

## Cycles requiring explicit handling

- `pkg_packing_boxes`
- `pkg_packing_events`
- `pkg_packing_operations`
- `pkg_packing_records`
- `sal_store_sale_tenders`
- `sal_store_sales`

## FK edges

|child|parent|constraint|on_delete|
|---|---|---|---|
|`wf_form_version`|`wf_form_definition`|`wf_form_version_form_id_fkey`|c|
|`wf_definition_version`|`wf_definition`|`wf_definition_version_definition_id_fkey`|c|
|`wf_definition_version`|`wf_form_version`|`wf_definition_version_form_version_id_fkey`|a|
|`wf_instance`|`wf_definition`|`wf_instance_definition_id_fkey`|a|
|`wf_instance`|`wf_definition_version`|`wf_instance_definition_version_id_fkey`|a|
|`wf_instance`|`wf_form_version`|`wf_instance_form_version_id_fkey`|a|
|`wf_task`|`wf_instance`|`wf_task_instance_id_fkey`|c|
|`wf_task_action`|`wf_task`|`wf_task_action_task_id_fkey`|n|
|`wf_task_action`|`wf_instance`|`wf_task_action_instance_id_fkey`|c|
|`wf_instance_variable`|`wf_instance`|`wf_instance_variable_instance_id_fkey`|c|
|`wf_cc_task`|`wf_instance`|`wf_cc_task_instance_id_fkey`|c|
|`sys_user_role`|`sys_user`|`sys_user_role_user_id_fkey`|c|
|`sys_user_role`|`sys_role`|`sys_user_role_role_id_fkey`|c|
|`sys_user_role`|`sys_user`|`sys_user_role_granted_by_fkey`|a|
|`sys_role_menu_permission`|`sys_role`|`sys_role_menu_permission_role_id_fkey`|c|
|`sys_role_menu_permission`|`sys_menu`|`sys_role_menu_permission_menu_id_fkey`|c|
|`sys_permission_set`|`sys_user`|`sys_permission_set_created_by_fkey`|n|
|`sys_permission_set_item`|`sys_permission_set`|`sys_permission_set_item_set_id_fkey`|c|
|`sys_permission_set_item`|`sys_menu`|`sys_permission_set_item_menu_id_fkey`|c|
|`sys_role_permission_set`|`sys_role`|`sys_role_permission_set_role_id_fkey`|c|
|`sys_role_permission_set`|`sys_permission_set`|`sys_role_permission_set_set_id_fkey`|c|
|`sys_user_permission_set`|`sys_user`|`sys_user_permission_set_user_id_fkey`|c|
|`sys_user_permission_set`|`sys_permission_set`|`sys_user_permission_set_set_id_fkey`|c|
|`sys_user_permission_set`|`sys_user`|`sys_user_permission_set_granted_by_fkey`|n|
|`mon_device_realtime_snapshot`|`mon_house_device_mapping`|`mon_device_realtime_snapshot_erp_house_code_fkey`|a|
|`sal_price_items`|`sal_price_books`|`sal_price_items_price_book_id_fkey`|c|
|`sal_order_items`|`sal_sales_orders`|`sal_order_items_sales_order_id_fkey`|c|
|`sal_delivery_orders`|`sal_vehicles`|`sal_delivery_orders_vehicle_id_fkey`|n|
|`sal_delivery_orders`|`sal_drivers`|`sal_delivery_orders_driver_id_fkey`|n|
|`sal_delivery_order_items`|`sal_delivery_orders`|`sal_delivery_order_items_delivery_order_id_fkey`|c|
|`sal_receipts`|`sal_delivery_orders`|`sal_receipts_delivery_order_id_fkey`|a|
|`sal_receipts`|`sal_delivery_order_items`|`sal_receipts_delivery_item_id_fkey`|a|
|`sal_return_items`|`sal_return_orders`|`sal_return_items_return_order_id_fkey`|a|
|`pilot_daily_reports`|`uat_pilot_runs`|`pilot_daily_reports_pilot_run_id_fkey`|a|
|`uat_feedbacks`|`uat_pilot_runs`|`uat_feedbacks_pilot_run_id_fkey`|a|
|`sys_organizations`|`sys_organizations`|`sys_organizations_parent_id_fkey`|a|
|`sys_user_orgs`|`sys_organizations`|`sys_user_orgs_org_id_fkey`|c|
|`biz_bu_membership`|`biz_business_units`|`biz_bu_membership_bu_code_fkey`|a|
|`chanjet_writeback_outbox`|`chanjet_voucher_drafts`|`FK_chanjet_writeback_outbox_draft`|r|
|`chanjet_shareholder_accounting_balances`|`chanjet_erp_inbound_sync_runs`|`FK_chanjet_shareholder_balance_run`|r|
|`store_aliases`|`store_master`|`store_aliases_store_id_fkey`|a|
|`store_memberships`|`sys_user`|`store_memberships_user_id_fkey`|a|
|`store_memberships`|`store_master`|`store_memberships_store_id_fkey`|a|
|`store_warehouse_bindings`|`store_master`|`store_warehouse_bindings_store_id_fkey`|a|
|`store_sale_allocations`|`sal_store_sales`|`store_sale_allocations_sale_id_fkey`|a|
|`store_sale_allocations`|`sal_store_sale_items`|`store_sale_allocations_sale_item_id_fkey`|a|
|`store_sale_allocations`|`inv_batches`|`store_sale_allocations_batch_no_fkey`|a|
|`store_sale_adjustments`|`sal_store_sales`|`store_sale_adjustments_sale_id_fkey`|a|
|`store_sale_adjustments`|`sal_store_shift_closings`|`store_sale_adjustments_shift_closing_id_fkey`|a|
|`wms_warehouses`|`store_master`|`fk_wms_warehouse_owner_store`|r|
|`wms_transfer_items`|`wms_transfer`|`wms_transfer_items_transfer_no_fkey`|r|
|`wms_transfer_items`|`inv_batches`|`wms_transfer_items_source_batch_no_fkey`|r|
|`wms_transfer_discrepancies`|`wms_transfer`|`wms_transfer_discrepancies_transfer_no_fkey`|r|
|`wms_transfer_discrepancies`|`wms_transfer_items`|`wms_transfer_discrepancies_transfer_item_id_fkey`|r|
|`store_replenishment_requests`|`store_master`|`store_replenishment_requests_store_id_fkey`|a|
|`store_replenishment_requests`|`wms_transfer`|`store_replenishment_requests_transfer_no_fkey`|a|
|`store_replenishment_request_lines`|`store_replenishment_requests`|`store_replenishment_request_lines_request_id_fkey`|c|
|`sal_store_sale_tenders`|`sal_store_sales`|`sal_store_sale_tenders_sale_id_fkey`|r|
|`sal_store_sale_tenders`|`sal_store_sale_tenders`|`sal_store_sale_tenders_reversal_of_tender_id_fkey`|r|
|`sal_store_price_drift_events`|`sal_store_sales`|`sal_store_price_drift_events_sale_id_fkey`|r|
|`sal_store_price_drift_events`|`sal_store_sale_items`|`sal_store_price_drift_events_sale_item_id_fkey`|r|
|`sal_store_settlement_shifts`|`sal_store_settlements`|`sal_store_settlement_shifts_settlement_id_fkey`|r|
|`sal_store_settlement_shifts`|`sal_store_shift_closings`|`sal_store_settlement_shifts_shift_id_fkey`|r|
|`sal_store_settlement_reconciliations`|`sal_store_settlements`|`sal_store_settlement_reconciliations_settlement_id_fkey`|r|
|`sal_store_settlement_reconciliations`|`sal_store_sale_tenders`|`sal_store_settlement_reconciliations_tender_id_fkey`|r|
|`sal_order_lifecycle_events`|`sal_sales_orders`|`sal_order_lifecycle_events_sales_order_id_fkey`|a|
|`sal_order_item_batch_allocations`|`sal_order_items`|`sal_order_item_batch_allocations_sales_order_item_id_fkey`|c|
|`sal_order_item_batch_allocations`|`inv_batches`|`sal_order_item_batch_allocations_batch_no_fkey`|r|
|`sal_order_item_batch_allocations`|`inv_ledger`|`sal_order_item_batch_allocations_reservation_ledger_id_fkey`|r|
|`sal_order_item_batch_allocation_actions`|`sal_order_item_batch_allocations`|`sal_order_item_batch_allocation_actions_allocation_id_fkey`|r|
|`sal_order_item_batch_allocation_actions`|`sal_sales_orders`|`sal_order_item_batch_allocation_actions_sales_order_id_fkey`|r|
|`sal_order_item_batch_allocation_actions`|`sal_delivery_orders`|`sal_order_item_batch_allocation_actions_delivery_order_id_fkey`|r|
|`sal_order_item_batch_allocation_actions`|`inv_ledger`|`sal_order_item_batch_allocation_actions_ledger_id_fkey`|r|
|`sal_delivery_exceptions`|`sal_receipts`|`sal_delivery_exceptions_receipt_id_fkey`|a|
|`sal_delivery_exceptions`|`sal_delivery_orders`|`sal_delivery_exceptions_delivery_order_id_fkey`|a|
|`sal_delivery_exceptions`|`sal_delivery_order_items`|`sal_delivery_exceptions_delivery_item_id_fkey`|a|
|`sal_delivery_exceptions`|`sal_sales_orders`|`sal_delivery_exceptions_sales_order_id_fkey`|a|
|`sal_delivery_exceptions`|`sal_return_orders`|`sal_delivery_exceptions_return_order_id_fkey`|a|
|`pkg_grading_source_links`|`pkg_grading_records`|`pkg_grading_source_links_grading_id_fkey`|r|
|`pkg_grading_source_links`|`pkg_source_batches`|`pkg_grading_source_links_source_batch_id_fkey`|r|
|`pkg_packing_boxes`|`pkg_packing_records`|`pkg_packing_boxes_packing_id_fkey`|a|
|`pkg_packing_code_registry`|`pkg_packing_boxes`|`pkg_packing_code_registry_owner_box_id_fkey`|a|
|`pkg_packing_operations`|`sys_user`|`pkg_packing_operations_actor_id_fkey`|a|
|`pkg_packing_operations`|`pkg_packing_records`|`pkg_packing_operations_packing_id_fkey`|a|
|`pkg_packing_events`|`pkg_packing_records`|`pkg_packing_events_packing_id_fkey`|a|
|`pkg_packing_events`|`sys_user`|`pkg_packing_events_actor_id_fkey`|a|
|`pkg_packing_events`|`pkg_packing_operations`|`pkg_packing_events_operation_id_fkey`|a|
|`pkg_packing_events`|`pkg_packing_boxes`|`pkg_packing_events_box_id_fkey`|a|
|`pkg_packing_events`|`pkg_packing_events`|`pkg_packing_events_session_id_fkey`|a|
|`pkg_packing_code_claims`|`pkg_packing_code_registry`|`pkg_packing_code_claims_normalized_code_fkey`|a|
|`pkg_packing_code_claims`|`pkg_packing_boxes`|`pkg_packing_code_claims_box_id_fkey`|a|
|`pkg_packing_code_claims`|`pkg_packing_events`|`pkg_packing_code_claims_evidence_event_id_fkey`|a|
|`store_warehouse_bindings`|`wms_warehouses`|`store_warehouse_bindings_warehouse_code_fkey`|a|
|`store_replenishment_requests`|`wms_warehouses`|`store_replenishment_requests_source_warehouse_code_fkey`|a|
|`store_replenishment_requests`|`wms_warehouses`|`store_replenishment_requests_target_warehouse_code_fkey`|a|
|`sal_sales_orders`|`wms_warehouses`|`sal_sales_orders_fulfillment_warehouse_code_fkey`|a|
|`sal_delivery_orders`|`wms_warehouses`|`sal_delivery_orders_fulfillment_warehouse_code_fkey`|a|
|`sal_return_orders`|`wms_warehouses`|`sal_return_orders_target_warehouse_code_fkey`|a|
