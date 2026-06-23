# Decision Log

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
