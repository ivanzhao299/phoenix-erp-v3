# Store Payment Controlled UAT Smoke Report

Date: 2026-06-23

## 1. UAT Smoke 是否通过

PASS WITH CONDITIONS.

The controlled smoke validated the frontend route, menu entry, permission control wiring, attachment disabled state, canonical store display, status labels, and static safety boundaries.

## 2. 页面入口

- `/store-payment`

Result: PASS.

## 3. 菜单入口

- 销售管理 / 统一收款
- Sidebar item id: `s2-store-payment`
- Permission: `MENU_STORE_PAYMENT`

Result: PASS.

## 4. UI 功能验证

| Function | Result |
| --- | --- |
| 收款账户列表 | PASS |
| 收款记录列表 | PASS |
| 新增收款记录 | PASS |
| 详情抽屉 | PASS |
| 确认 | PASS |
| 驳回 | PASS |
| 作废 | PASS |
| 筛选 | PASS |
| 状态标签 | PASS |
| UAT 路径说明 | PASS |

Static smoke artifact:

- `docs/ops/runs/store-payment-controlled-uat-smoke-static.json`

## 5. 权限按钮验证

| Menu Code | Expected | Result |
| --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | account list / account maintain placeholder | PASS |
| `MENU_STORE_PAYMENT` | record list / create record | PASS |
| `MENU_STORE_PAYMENT_CONFIRM` | confirm / reject | PASS |
| `MENU_STORE_PAYMENT_VOID` | void | PASS |
| `MENU_STORE_PAYMENT_EXPORT` | export reserved and disabled | PASS |

## 6. 附件禁用态验证

- proof preview disabled: PASS.
- QR preview disabled: PASS.
- download disabled: PASS.
- no raw URL rendering: PASS.
- no `/uploads` path construction for actual preview/download: PASS.
- no `http(s)` naked link opening: PASS.

## 7. 是否展示裸 URL

No.

`rawUrl` is only represented as a controlled status field. If any non-null value appears unexpectedly, the frontend shows `BLOCKED` and does not render a link.

## 8. Store Code 显示验证

- Main display: `STORE-VTE-001 / 万象直营店`.
- Legacy alias: `ST-VTE-001` display-only.
- New records use `STORE-VTE-001`.
- The frontend does not write `ST-VTE-001` for new Store Payment records.

Result: PASS.

## 9. 状态流转 Smoke

The frontend exposes the following status labels and guarded actions:

- `PENDING`
- `CONFIRMED`
- `REJECTED`
- `VOIDED`
- `DISABLED`
- `PENDING_CONFIG`
- `ACCESS_PENDING`

Result: PASS.

## 10. A2 复核结论

PASS WITH CONDITIONS.

- Permission button visibility is wired to `MENU_STORE_PAYMENT*`.
- Attachment preview/download stays disabled.
- No raw URL exposure path was found.
- Store code canonical / alias display boundary is preserved.
- Condition: real protected preview/download still requires a later A3/A2 Gate.

## 11. A1 验证结论

PASS WITH CONDITIONS.

Executed:

- `apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`: PASS.
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS.
- Static route/menu/UI/security smoke: PASS, 18 / 18 checks.

Condition:

- Runtime browser smoke was not executed against a running dev server in this step.

## 12. Runtime Memory 是否更新

Yes.

Updated / created:

- `docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runtime-memory/GUARDRAILS.md`

## 13. 是否改业务代码

No.

This round only updates `docs/ops/**` and `docs/ops/runs/**`.

## 14. 是否写 DB

No.

## 15. 是否部署

No.

## 16. 是否 Push

No.

## 17. W5 Gate 结果

PASS.

## 18. 当前结论

GO WITH CONDITIONS.

## 19. 下一步建议

1. Use `/store-payment` for controlled UAT smoke.
2. Fix frontend details if UAT finds usability gaps.
3. Keep preview/download disabled until a dedicated A3 protected streaming Gate and A2 review.
4. Prepare A6 staging deploy runbook as a separate Gate.
5. Prepare A7 final QA Gate as a separate Gate.
