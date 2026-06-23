# Codex-Orchestrator Runtime Memory

Last updated: 2026-06-23

## Active Context

- Active module: Store Payment
- Current stage: CONTROLLED_UAT_READY
- Active decision: GO_WITH_CONDITIONS
- Next gate: STORE_PAYMENT_UAT_SMOKE
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

Store Payment is ready for controlled UAT smoke with conditions:

- Frontend page exists at `/store-payment`.
- Store Payment menu exists under 销售管理 / 统一收款.
- Permission buttons are controlled by `MENU_STORE_PAYMENT*` and V/E/X action bits.
- proof / QR preview and download remain disabled.
- The page does not show raw URLs or build `/uploads` links.
- Store code canonical display is `STORE-VTE-001 / 万象直营店`; `ST-VTE-001` is legacy alias only.

## Current Hard Stops

- No production deploy.
- No push.
- No remote production DB write.
- No migration unless a dedicated Gate is approved.
- No real attachment preview/download.
- No raw URL exposure.
