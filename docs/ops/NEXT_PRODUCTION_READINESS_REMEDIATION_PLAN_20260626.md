# Next Production Readiness Remediation Plan - 2026-06-26

## Current Status

The latest remediation batches have addressed:

- Workflow menu atomization.
- Settings role and permission-set atomization.
- Settings operational leaf atomization.
- User management API/menu alignment.
- Notification config API/menu alignment.
- Brand settings API/menu alignment.
- Global error page and form-control baseline styling.

## Priority P0

1. **Role Matrix Pilot Audit**
   - Target users: Wang Lejin and other high-frequency procurement/finance users.
   - Verify visible sidebar items against granted menu permissions.
   - Verify no unauthorized submenu appears.
   - Verify authorized submenu is usable end-to-end.

2. **Procurement / Inventory DataScope**
   - Audit list endpoints for procurement requests, orders, receipts, inventory batches, and warehouse flows.
   - Confirm company/project/warehouse/store filters are enforced server-side.
   - Add regression checks for cross-company visibility.

3. **Approval Action Flow**
   - Confirm "同意 / 不同意 / 转交审批" is consistently available on PC and mobile.
   - Confirm assignee selection is DataScope and role constrained.
   - Confirm completed approvals do not crash.

## Priority P1

4. **Attachment Endpoint Convergence**
   - Find remaining frontend upload/download surfaces.
   - Replace naked `/uploads` or raw URL patterns with protected endpoints.
   - Ensure multi-attachment uploader is reused across reimbursement, shareholder funds, procurement, and store payment.

5. **UI/UX Page Polish**
   - Audit pages with excessive vertical height, inconsistent inputs, or cramped mobile dialogs.
   - Prioritize procurement order/request, finance reimbursement, shareholder funds, approval center, and settings pages.
   - Apply the global `.phx-*` control baseline where page-specific styles are missing.

6. **External Interface Security**
   - Chanjet callback signature verification.
   - Chanjet proxy write operations require edit-level permission and audit logs.

## Priority P2

7. **Ops Security**
   - Remove default administrator passwords from scripts.
   - Review deploy workflow secret handling.
   - Separate SSH deploy keys by environment.
   - Improve rollback scripts and operator runbooks.

8. **Production Data Readiness**
   - Supplier, project, cash account, product, bank account, warehouse readiness.
   - Pilot data import checklist.
   - Operator preflight checklist.

## Execution Recommendation

Next batch should start with P0-1 and P0-2:

- They directly affect user-visible permission correctness and cross-data leakage risk.
- They are prerequisites before broader role/function rollout.

Recommended next commit scope:

- `fix(rbac): audit pilot role menu visibility`
- `fix(datascope): enforce procurement inventory list scopes`
