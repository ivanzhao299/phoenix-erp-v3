# Workflow Approval Action UX Remediation - 2026-06-26

## Scope

This remediation improves the workflow approval handling experience for PC and mobile users without changing database schema, migrations, or production configuration.

## Changes

- PC unified approval center `/workflow/todos`
  - Replaced split approve/reject/reassign controls with one decision panel.
  - Default decision is `approve`.
  - Supported decisions: approve, reject, transfer approval.
  - Transfer candidates remain loaded from the backend authority endpoint, filtered by role permission, DataScope, and self-approval separation.
  - Reject still requires a comment.

- PC approval history `/workflow/history`
  - Added explicit error state instead of silently returning an empty table on backend error.
  - Added response normalization for `list`, `items`, nested `data`, and array-style responses.
  - Added defensive date and missing-field handling.

- Legacy PC done page `/workflow/tasks/done`
  - Added loading and error state.
  - Added missing-field fallbacks for title, node, instance link, and task number.

## Guardrails

- Business code changed: frontend only.
- Database write: no.
- Migration: no.
- Deployment config: no.
- Push: pending normal CI/CD flow.

## Verification

- API typecheck: PASS.
- Web typecheck: PASS.
- W5 closeout gate: PASS with `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true`.
  - Reason: the static boundary scripts inspect a broad branch diff that includes previously approved web/API/security changes; this commit itself only changes workflow frontend pages and ops docs.

## Next Plan

1. Continue approval-flow backend review for submit-to-user selection on procurement and high-frequency purchase flows.
2. Continue protected attachment endpoint convergence for historical upload entry points.
3. Continue global UI polish for error, empty, and form states.
