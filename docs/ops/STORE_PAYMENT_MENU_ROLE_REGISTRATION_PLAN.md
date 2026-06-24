# Store Payment Menu and Role Registration Plan

Task ID: `STORE_PAYMENT_PILOT_GATE_S1`

Status: `READY_FOR_APPROVAL`

This is a registration plan only. It does not insert menu rows or grant roles.

## Menu Code Plan

| Menu code | Menu name | Permission bits | Purpose | Audit requirement |
| --- | --- | --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | Store Payment account maintenance / 门店收款账户维护 | `V`, `E`, `X` | View and maintain company payment accounts / QR references | account view/create/update/disable/export attempts |
| `MENU_STORE_PAYMENT` | Store Payment records / 门店收款记录 | `V`, `E`, `X` | View, create, edit pending records, export if approved | record view/create/edit/export attempts |
| `MENU_STORE_PAYMENT_CONFIRM` | Store Payment confirmation / 收款确认 | `V`, `E` | Confirm or reject pending records | confirm/reject with reason and actor |
| `MENU_STORE_PAYMENT_VOID` | Store Payment void / 收款作废 | `V`, `E` | Void records under approved status rules | void with reason and actor |
| `MENU_STORE_PAYMENT_EXPORT` | Store Payment export / 收款导出 | `V`, `X` | Export after explicit approval | export request, filters, actor, row count |

Note: existing controller design uses action bits such as `C` and `A` in decorators. Before DB registration, A2/A3 must align the DB permission bits with the runtime authorization convention. If `C/A` are required by runtime, they must be explicitly included in the approved seed/register plan; this document records the requested `V/E/X` business policy plus the need for runtime alignment.

## Role Matrix

| Role | Account menu | Record menu | Confirm menu | Void menu | Export menu | Boundary |
| --- | --- | --- | --- | --- | --- | --- |
| 店员 | `V` select enabled accounts only | `V`, create/edit own pending if runtime supports create bit | None | None | None |本人/本店 only |
| 店长 | `V` select enabled accounts only | `V` for own store | `V`, `E` confirm/reject own-store records | `V`, `E` if approved | None by default | 本店 |
| 财务 | `V` all accounts | `V` all stores | `V`, `E` all stores | `V`, `E` if approved | `V`, `X` if export approved | 全部门店 |
| 管理员 | `V`, `E`, optional `X` | `V` all stores | `V`, `E` | `V`, `E` | `V`, `X` if export approved | 全部门店 |
| 超管 | `V`, `E`, `X` | `V`, `E`, `X` | `V`, `E` | `V`, `E` | `V`, `X` | 全局 |

## Access Boundaries

1. 店员 cannot create, update, disable, or export payment accounts.
2. 店员 can only create Store Payment records for enabled accounts in their authorized store scope.
3. 店长 can confirm/reject records only within their store scope.
4. 财务 and 管理员 can confirm/reject across stores according to DataScope.
5. Void must require a reason and audit record.
6. Export is deferred unless explicitly approved.

## Seed/Register Requirement

Menu registration and role grants require a separate user-approved gate. The plan may be implemented by a seed/register script or admin operation, but not in this round.

## A2 Review Requirement

A2 must verify:

1. Least privilege by role.
2. Permission bit compatibility with runtime decorators.
3. DataScope enforcement on every permission.
4. Export risk.
5. Audit coverage for denied attempts.

## A1 Validation Requirement

A1 must verify:

1. Registration artifacts exist after approved implementation.
2. Read-only DB proof shows menu rows and role grants.
3. W5/static gates pass.
4. No unauthorized code or migration changes occurred.

