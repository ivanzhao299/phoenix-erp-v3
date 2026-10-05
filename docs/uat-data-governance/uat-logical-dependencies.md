# UAT Logical Dependencies

The database inventory found 98 foreign-key constraints. Code review confirms additional logical links that are not guaranteed to be represented by foreign keys:

- sales order → delivery, receipt/signoff, return, AR and workflow runtime;
- sales order item → batch allocation → allocation action → inventory batch/ledger;
- procurement request/PO → receipt → AP/payment/allocation;
- workflow business document reference → `wf_instance`/tasks/variables/actions;
- `file_metadata.owner_type/owner_id` → business document owners;
- Chanjet mapping/snapshot/reconciliation/sync runtime → local finance integration state.

The live metadata graph is retained in the controlled evidence directory. No logical dependency was used to authorize deletion in U0.
