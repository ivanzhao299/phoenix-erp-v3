# Store Payment Protected Attachment Plan

Task ID: `STORE_PAYMENT_PILOT_GATE_S1`

Status: `READY_FOR_APPROVAL`

This is a protected access design plan only. It does not implement backend endpoints or frontend preview.

## Attachment Fields

| Field | Boundary |
| --- | --- |
| `store_payment_accounts.qr_attachment_id` | Optional QR reference for enabled company payment account |
| `store_payment_records.proof_attachment_id` | Required payment proof reference for payment record |

## Existing Evidence

The DB evidence package did not find attachment/upload table candidates by name and did not prove protected preview/download readiness. Store Payment tables are also missing, so the attachment fields cannot be queried in target DB.

## Naked URL Risk

Raw URLs or raw storage paths create these risks:

1. Users can share payment proof/QR links outside RBAC scope.
2. Store-scoped users can access another store's proof if URLs are public.
3. Logs can leak storage identifiers.
4. Revocation is difficult.

## Protected Preview Proposal

Preview must go through an authenticated backend route that:

1. Authenticates the user.
2. Loads the Store Payment account or record by ID.
3. Enforces `MENU_STORE_PAYMENT_ACCOUNT:V` for QR preview or `MENU_STORE_PAYMENT:V` for proof preview.
4. Applies the same store/company DataScope as the parent Store Payment object.
5. Resolves attachment content server-side.
6. Streams only safe preview content or returns a short-lived internal response.
7. Audits denied attempts without leaking raw storage path.

## Protected Download Proposal

Download must use the same ACL as preview, plus:

1. Audit actor, record/account ID, attachment ID, store code, and decision.
2. Include denied audit for out-of-scope access.
3. Avoid returning permanent public URLs.
4. Avoid logging raw storage keys.

## ACL Rules

| Actor | QR access | Proof access |
| --- | --- | --- |
| 店员 | Enabled account QR for own store only | Own or authorized own-store records only |
| 店长 | Own-store accounts | Own-store records |
| 财务 | All stores by finance scope | All stores by finance scope |
| 管理员 | All stores | All stores |
| 超管 | Global | Global |

## Denied Audit Rules

Denied access must record:

- actor user id / username
- requested object type
- requested object id
- requested store code
- denial reason
- timestamp

Do not log:

- raw URL
- storage key
- signed URL
- bearer token
- full attachment payload

## Frontend Boundary

Before protected preview/download is implemented and A2-reviewed:

1. Frontend must not show clickable raw QR/proof URLs.
2. Frontend may show attachment presence status only.
3. Frontend may disable preview/download buttons with a clear state.

## A2 Review Requirements

A2 must approve:

1. RBAC menu mapping.
2. DataScope checks.
3. Audit behavior.
4. Redaction behavior.
5. Failure behavior for missing attachment, missing record, disabled account, voided/rejected record, and out-of-scope user.

