# Production Readiness Remediation Batch - Mobile Expense Attachments and Audit Cards

Date: 2026-06-25

## Objective

Fix two production usability and audit reliability issues:

1. Mobile expense request creation had no voucher attachment upload entry.
2. The global audit page lacked reliable aggregate cards and risk summaries.

## Changes

### Mobile Expense Request

- Added the shared `AttachmentUploader` to the mobile expense request creation form.
- Supports multiple PDF/image vouchers.
- Sends uploaded controlled attachment refs through existing `attachmentUrls`.
- Resets attachments after successful draft creation.
- Displays saved expense vouchers in read-only mode on the mobile detail page.
- Does not expose raw upload URLs from the mobile UI.

### Audit Log Page

- Added aggregate cards for:
  - matching audit records
  - approved actions
  - rejected actions
  - high-risk actions
- Fixed aggregation logic so cards do not treat the current 50-row page as the global count.
- Uses backend `total` for the total matching count.
- Uses a separate 1000-row filtered sample for action breakdowns and marks sampled metrics clearly.

## Validation

| Check | Result |
| --- | --- |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |

## Safety

- API changed: no.
- Frontend changed: yes.
- Migration executed: no.
- Database write executed locally: no.
- Deploy status: pending CI/CD after push.

## Follow-up

1. Consider adding a dedicated backend audit summary endpoint when audit volume grows beyond the 1000-row UI sample.
2. Continue frontend high-risk button permission alignment.
3. Continue protected attachment convergence for historical upload links.
