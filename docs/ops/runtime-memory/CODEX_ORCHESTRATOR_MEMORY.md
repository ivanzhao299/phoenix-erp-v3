# Codex-Orchestrator Runtime Memory

Last updated: 2026-06-23

## Active Context

- Active module: Store Payment
- Current stage: STORE_PAYMENT_STAGING_TARGET_BOOTSTRAP_READY
- Active decision: WAITING_STAGING_TARGET_INPUTS
- Next gate: USER_PROVIDES_STAGING_TARGET
- Page entry: `/store-payment`
- Menu entry: 销售管理 / 统一收款

## Operating Rules

1. Codex-Orchestrator must read this runtime memory before continuing Store Payment work.
2. Do not rely on long-lived chat context for project state.
3. Do not ask the user to manually run Terminal commands for routine sync, rebase, merge, docs/ops/runs cleanup, W5 gate, or baseline lifecycle.
4. Baseline Autopilot remains responsible for auto-commit, rebase, safe merge, and W5 gate.
5. Push, production deployment, production DB writes, and destructive operations still require explicit user approval.
6. Attachment preview/download remains disabled until a dedicated A3 protected streaming Gate and A2 security review are approved.
7. Raw URL exposure is forbidden.

## Latest Store Payment Decision

Store Payment is ready for controlled pilot with conditions:

- Frontend page exists at `/store-payment`.
- Store Payment menu exists under 销售管理 / 统一收款.
- Permission buttons are controlled by `MENU_STORE_PAYMENT*` and V/E/X action bits.
- proof / QR preview and download use protected Store Payment endpoints when approved metadata, ownership, RBAC, and DataScope checks pass.
- The page does not show raw URLs or build `/uploads` links.
- Store code canonical display is `STORE-VTE-001 / 万象直营店`; `ST-VTE-001` is legacy alias only.
- Account QR protected attachment UAT passed.
- Record proof protected attachment UAT passed.
- A6 staging deploy runbook is complete.
- A7 final QA Gate is complete.
- Controlled pilot decision is GO WITH CONDITIONS.
- Staging deploy approval package is complete.
- Approval matrix is complete.
- Business UAT scope is complete.
- The non-main branch `w5-codex-orchestrator` was pushed to origin at `0e71753c`.
- Staging deploy was not executed because no staging target, staging DB, staging file storage, or staging workflow was discoverable.
- `push main` was not executed because the repository production workflow deploys on `push main`.
- A staging-only workflow skeleton now exists at `.github/workflows/staging-deploy.yml`.
- Staging env and compose skeletons now exist.
- Real staging execution still requires staging target inputs and GitHub `staging` environment secrets.

## Current Hard Stops

- No production deploy.
- No push.
- No remote production DB write.
- No migration unless a dedicated Gate is approved.
- No staging deploy until a staging-only target is provided.
- No raw URL exposure.
