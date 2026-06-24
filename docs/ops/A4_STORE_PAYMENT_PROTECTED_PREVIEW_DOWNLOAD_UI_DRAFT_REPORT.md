# A4 Store Payment Protected Preview / Download UI Draft Report

Date: 2026-06-23

## 1. Scope

Gate: `A4_ENABLE_PROTECTED_PREVIEW_DOWNLOAD_UI_DRAFT`

Goal: wire Store Payment frontend attachment UI to protected backend status / preview / download endpoints while keeping fail-closed behavior and avoiding raw URL exposure.

## 2. Modified Files

- `apps/web/src/app/(admin)/store-payment/page.tsx`
- `apps/web/src/app/(admin)/store-payment/store-payment.module.css`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runtime-memory/GUARDRAILS.md`
- `docs/ops/runs/a4-store-payment-protected-preview-download-ui-static-check.json`
- `docs/ops/A4_STORE_PAYMENT_PROTECTED_PREVIEW_DOWNLOAD_UI_DRAFT_REPORT.md`

## 3. Page Entry

- `/store-payment`
- Menu: 销售管理 / 统一收款

## 4. Protected Endpoints

Frontend draft uses only Store Payment protected endpoints:

- `GET /store-payment/attachments/:fileId/status`
- `GET /store-payment/attachments/:fileId/preview`
- `GET /store-payment/attachments/:fileId/download`

The UI does not call the legacy upload raw URL and does not construct file paths.

## 5. Proof Attachment UI

Implemented:

- proof attachment controlled status panel in the detail drawer.
- loading state while status is queried.
- fail-closed preview button.
- fail-closed download button.
- disabled / access_pending / denied / missing / unsafe raw URL messages.
- blob object URL is created only after a protected endpoint returns a successful response.

Current behavior with `file_metadata` row count 0:

- proof attachment displays metadata missing / pending states.
- preview/download remain disabled.
- no page crash.

## 6. QR Attachment UI

Implemented:

- account list shows QR metadata missing / pending status.
- preview/download remain disabled when no QR `file_id` / metadata exists.
- no raw URL or `/uploads` path is shown.

Condition:

- A full QR detail/preview flow still depends on account `qrAttachmentId` being returned and metadata UAT data setup.

## 7. Button State Rules

Preview is enabled only when all are true:

- controlled attachment id exists.
- backend protected status is `accessStatus = allowed`.
- backend returns `previewAvailable = true`.
- backend returns `rawUrl = null`.
- endpoint path is the protected Store Payment endpoint.

Download is enabled only when all are true:

- controlled attachment id exists.
- backend protected status is `accessStatus = allowed`.
- backend returns `downloadAvailable = true`.
- backend returns `rawUrl = null`.
- endpoint path is the protected Store Payment endpoint.

Disabled states:

- `access_pending`
- `disabled`
- `denied`
- `missing`
- no `file_metadata`
- no proof attachment id
- no QR attachment id
- `previewAvailable = false`
- `downloadAvailable = false`
- `rawUrl` is present

## 8. User-Facing Status Text

Implemented messages include:

- 附件预览待安全授权开通
- 文件元数据未配置
- 当前文件不可预览
- 当前文件不可下载
- 权限不足，无法访问附件
- 文件不存在或已失效
- 安全策略禁止裸链接访问
- 当前仅显示受控附件状态

## 9. Security Result

| Check | Result |
| --- | --- |
| Shows raw URL | No |
| Builds `/uploads` link | No |
| Opens naked `http(s)` link | No |
| Bypasses backend ACL | No |
| Frontend hard-codes allow | No |
| Denied treated as pending | No |
| Missing treated as allowed | No |
| Buttons driven by backend status | Yes |
| Fail-closed when metadata is absent | Yes |

## 10. A2 Review

Conclusion: PASS WITH CONDITIONS.

A2 review notes:

- Raw URL exposure is blocked in UI.
- `/uploads` construction is blocked in UI.
- Preview/download controls are gated by protected status and `rawUrl = null`.
- Because `file_metadata` currently has 0 rows, real attachment UAT still requires a separate metadata setup Gate.
- A2 should review again after real metadata is populated.

## 11. A1 Validation

Conclusion: PASS WITH CONDITIONS.

Validation:

- Web typecheck: PASS.
- Frontend static safety check: PASS.
- W5 closeout gate: to be run again by Baseline Autopilot after commit/merge.
- No backend files changed.
- No migration executed.
- No DB write executed.
- No deploy.
- No push.

## 12. Runtime Memory

Updated:

- `PROJECT_STATE.json`
- `STORE_PAYMENT_STATE.md`
- `NEXT_ACTIONS.md`
- `DECISION_LOG.md`
- `GUARDRAILS.md`

New state:

- `current_stage`: `STORE_PAYMENT_ATTACHMENT_UI_CONDITIONAL`
- `attachment_preview`: `controlled_ui_ready_but_requires_metadata_uat`
- `next_gate`: `STORE_PAYMENT_ATTACHMENT_METADATA_UAT_DATA_SETUP`

## 13. Explicit Non-Actions

- Backend code changed: No.
- DB write: No.
- Migration execution: No.
- Deployment: No.
- Push: No.
- Seed / cleanup / reset: No.

## 14. Controlled Attachment UAT

Allowed with conditions:

- The UI is ready for controlled attachment UAT once safe local `file_metadata` rows exist.
- Until metadata exists and backend status returns allowed, preview/download remain disabled.
- A2 must review after metadata-backed UAT before considering production enablement.

## 15. Current Conclusion

GO WITH CONDITIONS.

The A4 UI draft is wired to protected Store Payment attachment endpoints and remains fail-closed. The next Gate should prepare safe Store Payment attachment metadata UAT data and verify real protected preview/download behavior end to end.
