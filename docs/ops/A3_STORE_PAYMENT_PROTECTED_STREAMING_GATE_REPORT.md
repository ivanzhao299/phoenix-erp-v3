# A3 Store Payment Protected Streaming Gate Report

Date: 2026-06-23

## 1. 修改文件清单

- `apps/api/src/modules/store-payment/store-payment.controller.ts`
- `apps/api/src/modules/store-payment/store-payment.service.ts`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runs/store-payment-protected-streaming-static-check.json`

## 2. 现有附件系统扫描结果

| Item | Result |
| --- | --- |
| attachment module / file module | No dedicated attachment module found |
| upload module | Exists: `apps/api/src/modules/upload/*` |
| protected download / preview endpoint | Not found |
| audit log | `sys_operation_logs` exists; upload module does not use attachment access audit |
| file metadata table | Not found |
| ACL / owner / module reference | Not found |
| current upload response | Returns `/uploads/contracts/<filename>` raw path |
| Store Payment proof reference | `store_payment_records.proof_attachment_id` |
| Store Payment QR reference | `store_payment_accounts.qr_attachment_id` |

Conclusion: existing upload capability is not sufficient for safe Store Payment streaming.

## 3. 新增 / 调整端点

Added Store Payment-controlled endpoints:

- `GET /store-payment/attachments/:attachmentId/status`
- `GET /store-payment/attachments/:attachmentId/preview`
- `GET /store-payment/attachments/:attachmentId/download`

Current behavior:

- `status`: validates attachment ID, Store Payment ownership, RBAC, and DataScope, then returns controlled access-pending state.
- `preview`: validates attachment ID, Store Payment ownership, RBAC, and DataScope, then fails closed with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE`.
- `download`: validates attachment ID, Store Payment ownership, RBAC, and DataScope, then fails closed with `STORE_PAYMENT_ATTACHMENT_STREAMING_NOT_AVAILABLE`.

## 4. RBAC 校验结果

PASS WITH CONDITIONS.

- New routes use `@RequireMenu('MENU_STORE_PAYMENT', 'V')`.
- Existing `MenuGuard` still performs JWT authentication and menu permission check.
- `ROLE_ADMIN` behavior remains unchanged, but this Gate does not add an audit bypass.

Condition:

- If future account QR streaming needs stricter account-specific permission, add `MENU_STORE_PAYMENT_ACCOUNT:V` specific route or alternate route guard.

## 5. DataScope 校验结果

PASS.

- Record proof attachment ownership is resolved through `store_payment_records.proof_attachment_id`.
- QR attachment ownership is resolved through `store_payment_accounts.qr_attachment_id`.
- Record proof access calls `assertRecordScope`.
- Account QR access calls `assertAccountScope`.
- `STORE-VTE-001` / `ST-VTE-001` alias behavior remains in existing Store Payment service scope logic.

## 6. Attachment Ownership 校验结果

PASS.

Ownership lookup:

- `proof_attachment_id` -> `STORE_PAYMENT_RECORD_PROOF`
- `qr_attachment_id` -> `STORE_PAYMENT_ACCOUNT_QR`

If no owner is found:

- endpoint returns `STORE_PAYMENT_ATTACHMENT_NOT_FOUND`.

Unsafe ID handling:

- Rejects empty ID.
- Rejects `..`.
- Rejects `/`.
- Rejects `\`.
- Rejects null byte.
- Rejects `http://`.
- Rejects `https://`.
- Rejects `uploads`.
- Rejects `/uploads`.

## 7. 是否返回裸 URL

No.

- Status response keeps `rawUrl: null`.
- Preview/download fail closed and do not return a file path or raw URL.
- No external URL passthrough is implemented.

## 8. 是否使用 `/uploads`

No for Store Payment protected endpoints.

The existing upload module still returns `/uploads/contracts/<filename>` for generic uploads. This Gate does not expose that path through Store Payment and rejects `/uploads` as an unsafe attachment ID.

## 9. Denied Audit 状态

PASS WITH CONDITIONS.

- Preview/download denied access writes a structured NestJS log event:
  - `STORE_PAYMENT_ATTACHMENT_ACCESS_DENIED`
  - mode: `preview` / `download`
  - object type / object id / object no
  - company code / store code
  - username / user id
  - `rawUrl: null`

Condition:

- DB-backed denied audit should be added after file metadata / ACL ownership design is approved. This task did not introduce DB writes or a new audit table.

## 10. A2 复核结论

PASS WITH CONDITIONS.

Findings:

- No raw URL exposure was introduced.
- No `/uploads` passthrough was introduced.
- RBAC guard remains in place.
- DataScope checks remain in Store Payment service.
- Path traversal input is rejected.
- Existing upload module is not safe for direct streaming.
- A4 must not enable preview/download yet.

Condition:

- Before enabling frontend preview/download, complete a file metadata / ACL Gate and re-run A2.

## 11. A1 验证结论

PASS WITH CONDITIONS.

Executed:

- `apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`: PASS.
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS.
- `docs/ops/runs/store-payment-protected-streaming-static-check.json`: PASS.

Condition:

- No runtime HTTP smoke was executed against a running API server.

## 12. Runtime Memory 更新结果

Updated:

- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

State:

- `attachment_preview` remains `disabled`.
- `protected_attachment_gate` is `GO_WITH_CONDITIONS_STATUS_ONLY`.
- next gate is `STORE_PAYMENT_FILE_METADATA_ACL_GATE`.

## 13. 是否执行 Migration

No.

## 14. 是否写 DB

No.

## 15. 是否部署

No.

## 16. 是否 Push

No.

## 17. 是否允许 A4 解除 Preview / Download Disabled

No.

A4 must keep preview/download disabled until:

1. file metadata / ACL ownership is designed and approved;
2. A3 implements real protected streaming;
3. A2 passes a security review;
4. A1 validates API and W5 gates.

## 18. 当前结论

GO WITH CONDITIONS.

The Gate improved backend control by adding Store Payment-specific status, ownership, RBAC, DataScope, unsafe ID rejection, and denied-safe preview/download routes. It did not enable real streaming because existing file metadata and ACL capability is insufficient.
