# API Draft: Unified Store Payment Code 001

> Draft only. Do not implement backend code from this document without explicit user approval.

## Controller Path Recommendation

Base path: `/api/v2/store-payments`

Account/code path: `/api/v2/store-payment-accounts`

## API List

| Feature | Method | Path | Permission | DataScope | Audit |
| --- | --- | --- | --- | --- | --- |
| 收款账户列表 | GET | `/api/v2/store-payment-accounts` | `MENU_STORE_PAYMENT_ACCOUNT:V` or filtered selector access | company/store filter | list audit not required by default |
| 收款账户维护 | POST/PATCH | `/api/v2/store-payment-accounts` / `/:accountCode` | `MENU_STORE_PAYMENT_ACCOUNT:E` | finance/admin scope | create/update/enable/disable |
| 收款记录新增 | POST | `/api/v2/store-payments` | `MENU_STORE_PAYMENT:C` | clerk pilot store only | create |
| 收款记录查询 | GET | `/api/v2/store-payments` | `MENU_STORE_PAYMENT:V` | record-level store scope | export/bulk only |
| 收款记录详情 | GET | `/api/v2/store-payments/:recordNo` | `MENU_STORE_PAYMENT:V` | record-level store scope | denied access audited |
| 收款记录确认 | POST | `/api/v2/store-payments/:recordNo/confirm` | `MENU_STORE_PAYMENT_CONFIRM:A` | manager own-store / finance scope | confirm |
| 收款记录驳回 | POST | `/api/v2/store-payments/:recordNo/reject` | `MENU_STORE_PAYMENT_CONFIRM:A` | manager own-store / finance scope | reject |
| 收款记录作废 | POST | `/api/v2/store-payments/:recordNo/void` | `MENU_STORE_PAYMENT_VOID:A` | finance/admin high-risk scope | void |
| 附件上传/绑定 | POST | `/api/v2/store-payments/:recordNo/proof` or pre-create token flow | `MENU_STORE_PAYMENT:C/E` | owner/store scope | upload/replace |
| 附件受保护查看 | GET | `/api/v2/store-payments/:recordNo/proof/:attachmentId` | `MENU_STORE_PAYMENT:V` | record-level store scope | denied access audited |
| 导出 | GET | `/api/v2/store-payments/export` | `MENU_STORE_PAYMENT_EXPORT:X` | same as query plus export limit | export |

Export may be deferred from MVP-1. If deferred, keep route unimplemented and document future permission.

## Request DTO Drafts

### CreatePaymentAccountDto

| Field | Required | Notes |
| --- | --- | --- |
| accountCode | yes | Business code. |
| accountName | yes | Display name. |
| companyCode | yes | Company. |
| storeCode | conditional | Empty/group code only if approved. |
| cashAccountCode | no | Optional `fin_cash_accounts` reference. |
| paymentMethod | yes | Existing dict preferred. |
| currencyCode | yes | Active currency. |
| qrAttachmentRef | no | Protected reference. |
| maskedAccountNo | no | Masked only. |
| status | no | Defaults ACTIVE. |

### CreateStorePaymentDto

| Field | Required | Notes |
| --- | --- | --- |
| storeCode | yes | Server must verify/derive allowed store. |
| accountCode | yes | ACTIVE account only. |
| paymentMethod | yes | Dict-backed. |
| currencyCode | yes | Active currency. |
| amount | yes | Positive. |
| paymentTime | yes | ISO datetime. |
| proofAttachmentRef | yes | Protected payment screenshot reference. |
| orderNo | no | Optional. |
| saleNo | no | Optional. |
| remarks | no | Redacted in logs. |

### ConfirmPaymentDto

| Field | Required | Notes |
| --- | --- | --- |
| comment | no | Optional confirmation note. |

### RejectPaymentDto / VoidPaymentDto

| Field | Required | Notes |
| --- | --- | --- |
| reason | yes | Non-empty. |

## Response DTO Draft

### StorePaymentRecordDto

| Field | Notes |
| --- | --- |
| recordNo | Business record number. |
| companyCode | Company. |
| storeCode / storeName | Store identity. |
| accountCode / accountName | Selected account/code. |
| receiverUsername / receiverName | Recorder. |
| currencyCode | Currency. |
| paymentMethod | Method. |
| amount | Amount. |
| paymentTime | Customer payment time. |
| status | PENDING / CONFIRMED / REJECTED / VOIDED. |
| orderNo / saleNo | Optional references. |
| proofPreviewAllowed | Boolean. |
| createdAt / confirmedAt / rejectedAt / voidedAt | Timestamps. |

## Error Codes

| Code | Meaning |
| --- | --- |
| STORE_PAYMENT_FORBIDDEN | RBAC/DataScope denied. |
| STORE_PAYMENT_INVALID_STATUS | Transition not allowed. |
| STORE_PAYMENT_PROOF_REQUIRED | Screenshot required. |
| STORE_PAYMENT_ACCOUNT_DISABLED | Account/code disabled or not allowed for store. |
| STORE_PAYMENT_AMOUNT_INVALID | Amount must be positive. |
| STORE_PAYMENT_REASON_REQUIRED | Reject/void reason required. |
| STORE_PAYMENT_ATTACHMENT_FORBIDDEN | Proof preview/download denied. |
| STORE_PAYMENT_EXPORT_FORBIDDEN | Export permission missing. |

## Security / DataScope Requirements

1. Never trust `storeCode` from request body alone.
2. Clerk create must be limited to assigned pilot store.
3. Manager confirm/reject must be limited to own-store scope.
4. Finance all-store access must be explicit.
5. Admin override must be audited.
6. Attachment access must call the same record-level scope check as detail.

## Audit Requirements

1. create account/code
2. update/enable/disable account/code
3. create payment record
4. upload/replace proof
5. confirm/reject/void
6. export
7. access denied

Audit payload must redact screenshot URLs, QR payloads, full account numbers, and long remarks.

## Non-Goals

1. No third-party payment callback.
2. No bank auto-arrival.
3. No auto finance posting or AR settlement.
4. No POS completion or inventory mutation.
5. No Chanjet/Yonyou sync.
6. No implementation code in this planning stage.
