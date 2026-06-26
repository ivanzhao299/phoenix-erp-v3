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
- Procurement high-frequency write DataScope enforcement.
- Procurement DataScope write regression gate in W5 closeout.
- Frontend menu gate alignment for sidebar, home CTA, and business-center shortcuts.
- Frontend menu gate regression check in W5 closeout.
- App/PWA logo simplified by removing the white circular badge wrapper.
- Inventory/WMS write DataScope enforcement for inbound, transfer, stocktake, loss, and atomic stock operations.
- WMS DataScope write regression check in W5 closeout.
- PC approval action panel aligned to "同意 / 不同意 / 转交审批" with approve selected by default.
- Approval history and legacy done pages now show explicit errors and tolerate missing fields.

## Priority P0

1. **Role Matrix Pilot Audit - Frontend Gate Complete**
   - Sidebar, operations workbench CTA, and business-center shortcuts now share the same menu resolver.
   - Known menu route access redirects when the current user lacks the leaf permission.
   - Remaining work: production user-by-user permission matrix evidence for Wang Lejin and other pilot roles.

2. **Inventory / WMS DataScope - Server Write Gate Complete**
   - Procurement request/order/receipt/payment/shipment/project/supplier/shareholder-fund write paths now enforce server-side ownership.
   - WMS inbound, purchase receipt posting, outbound batch deduction, receiving confirmation, transfer, stocktake, loss, and atomic inventory increment/decrement now enforce warehouse write ownership when `allowedWarehouseCodes` is configured.
   - Remaining work: production user-by-user warehouse scope evidence and store/order stock view checks.

3. **Approval Action Flow - Frontend Handling Complete**
   - Confirm "同意 / 不同意 / 转交审批" is consistently available on PC and mobile.
   - Confirm assignee selection is DataScope and role constrained.
   - Confirm completed approvals do not crash.
   - Remaining work: procurement submit-to-next-approver selection and backend route-specific review for high-frequency purchase flows.

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

Next batch should continue from procurement approval submit-to-assignee selection and protected attachment convergence:

- Procurement submission is a high-frequency workflow and must let users know who receives the next approval step.
- Attachment convergence prevents raw upload/download leakage across finance, shareholder funds, procurement, and store payment.
- Both remain prerequisites before broader role/function rollout.

Recommended next commit scope:

- `fix(procurement): expose approval assignee selection`
- `fix(attachments): converge remaining upload surfaces`
