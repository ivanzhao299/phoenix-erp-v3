# Decision Log

## 2026-06-23 - Store Payment File Metadata / ACL Gate

Decision: GO WITH CONDITIONS.

Rationale:

- `file_metadata` table was created in local `phoenix_erp`.
- No seed was executed; current table row count is 0.
- `FileAccessService` implements controlled metadata lookup, RBAC, DataScope, ownership checks, MIME whitelist, path traversal protection, upload-root path confinement, and structured denied logs.
- Store Payment protected attachment routes now use file metadata and can stream only after metadata exists and checks pass.
- Existing upload module still returns `/uploads/contracts/...`; that path remains forbidden for frontend preview/download.

Conditions:

- A4 preview/download UI remains disabled until a separate A4 Gate and A2 review.
- A protected upload / metadata population workflow is still needed for real proof / QR files.
- No production deploy, push, or remote production DB write was performed.

## 2026-06-23 - Store Payment A3 Protected Streaming Gate

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment ownership, RBAC, and DataScope checks were added for protected attachment status / preview / download routes.
- The existing upload module only stores files under `/uploads/contracts` and returns a raw URL; it has no metadata table, ACL, owner/module reference, or protected streaming capability.
- To avoid raw URL exposure and ACL bypass, real preview/download streaming remains disabled.
- Preview/download routes now fail closed with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE` after ownership and scope checks.

Conditions:

- A4 must not enable preview/download UI yet.
- A follow-up file metadata / ACL Gate is required before streaming can be enabled.
- Denied access currently uses structured logging; DB audit can be added after metadata/ACL design is approved.

## 2026-06-23 - Store Payment Controlled UAT Ready

Decision: GO WITH CONDITIONS.

Rationale:

- Store Payment backend and frontend gates have completed with conditions.
- Store Payment page exists at `/store-payment`.
- Menu entry exists under 销售管理 / 统一收款.
- Permission buttons are aligned with `MENU_STORE_PAYMENT*` and V/E/X action bits.
- Attachment preview/download remains disabled.
- Raw URL exposure remains forbidden.
- Web typecheck passes.
- W5 closeout gate passes.

Conditions:

- Real attachment preview/download requires A3 protected streaming Gate and A2 review.
- Staging deployment requires A6 runbook Gate.
- Final production decision requires A7 final QA Gate.
- No push or production deployment has been executed.

## 2026-06-23 - Store Payment A4 Frontend Gate

Decision: GO WITH CONDITIONS.

Artifacts:

- `docs/ops/A4_STORE_PAYMENT_FRONTEND_GATE_UIUX_UAT_REPORT.md`
- `apps/web/src/app/(admin)/store-payment/page.tsx`
- `apps/web/src/app/(admin)/store-payment/store-payment.module.css`
- `apps/web/src/components/layout/Sidebar.tsx`
