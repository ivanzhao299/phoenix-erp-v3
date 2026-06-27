# State Machine: Unified Store Payment Code 001

> Draft only. No implementation is approved by this document.

## Status Recommendation

| Status | Meaning |
| --- | --- |
| DRAFT | Optional local/editing state if frontend saves incomplete records. Recommended to defer unless business requires save-as-draft. |
| PENDING | Submitted by clerk and waiting for manager/finance review. Equivalent to prior `PENDING_CONFIRM` wording. |
| CONFIRMED | Confirmed by store manager or finance; still not auto-posted to formal finance in MVP-1. |
| REJECTED | Rejected by manager/finance with reason; may be corrected/resubmitted only if approved. |
| VOIDED | Invalidated record retained for audit; used instead of deletion. |

Recommended MVP-1 minimum: `PENDING`, `CONFIRMED`, `REJECTED`, `VOIDED`.

## Event Recommendation

| Event | From | To | Actor | Reason required | Audit required |
| --- | --- | --- | --- | --- | --- |
| create | none | PENDING | Store clerk | No | Yes |
| edit | PENDING | PENDING | Owner clerk, manager if approved | Required for sensitive fields after submit | Yes |
| submit | DRAFT | PENDING | Store clerk | No | Yes |
| confirm | PENDING | CONFIRMED | Store manager / finance | Optional | Yes |
| reject | PENDING | REJECTED | Store manager / finance | Yes | Yes |
| void | PENDING / REJECTED / CONFIRMED | VOIDED | Finance/admin or high-risk permission | Yes | Yes |
| attach_proof | none/PENDING | PENDING | Store clerk | No | Yes |
| replace_proof | PENDING | PENDING | Owner clerk, manager if approved | Recommended | Yes |

## Actor Rules

### Store Clerk

1. Can create PENDING records for assigned pilot store.
2. Must upload payment screenshot.
3. Can edit own PENDING record only if not confirmed/rejected/voided.
4. Cannot confirm, reject, void, export, or maintain account/code records.
5. Cannot set status directly in request body.

### Store Manager

1. Can view own-store records.
2. Can confirm/reject own-store PENDING records.
3. Can view payment screenshot for own-store records.
4. Cannot maintain collection accounts/codes.
5. Void permission is not granted by default.

### Finance

1. Can view and confirm/reject records in approved finance scope.
2. Can view screenshots in approved finance scope.
3. May void records only if high-risk permission is approved.
4. Confirmed records still do not auto-post to finance in MVP-1.

### Admin

1. Can maintain collection accounts/codes.
2. Can view all records.
3. Should not silently alter operational records without audit.
4. Any override/correction must be audited and reasoned.

## Reason Requirements

Reason is required for:

1. reject
2. void
3. sensitive edit after submission, if allowed
4. proof replacement after submission, if allowed
5. account/code disable

## Mandatory Audit Operations

1. create
2. edit
3. submit, if DRAFT is implemented
4. attach_proof
5. replace_proof
6. confirm
7. reject
8. void
9. account/code enable/disable
10. permission denial
11. export

## Irreversible Or Restricted States

1. `CONFIRMED` must not be silently edited.
2. `VOIDED` is terminal.
3. `REJECTED -> PENDING` resubmit is optional and must be explicitly approved.
4. Delete is not allowed; use reject/void for audit preservation.

## Reverse Confirmation

Reverse confirmation is **not recommended** for MVP-1.

If business later requires it, model it as `CONFIRMED -> VOIDED` or a correction flow with:

1. high-risk permission,
2. non-empty reason,
3. audit log,
4. no automatic finance posting reversal because MVP-1 does not post to finance.
