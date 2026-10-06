# R4.2 Authenticated Product Acceptance Report

## Account and authentication

| Check | Result |
|---|---|
| Account tested | `admin` |
| Authentication | **PASS** |
| Identity read-back | **PASS** |
| Menu visibility | **PASS** (22 menu entries returned) |
| Role/permission metadata | **PASS** (2 roles, 1 effective permission entry including wildcard access) |
| Company/organization scope | **PASS** (authorized organization scope returned) |
| Store scope | **PASS** (scope endpoint and store selector returned successfully) |
| Warehouse scope | **PASS** (scope endpoint returned successfully; no unauthorized warehouse was created) |

Passwords, tokens and cookies were held only in process memory and were not written to the repository, report or logs.

## Read-only module smoke

Authenticated GET checks returned successfully:

- procurement orders: empty (`items=0`);
- sales orders, delivery orders and returns: empty;
- WMS inbound, outbound and transfer: empty;
- AR ledger: empty (`rows=0`);
- AP invoices, procurement payments and cash transactions: empty;
- workflow definitions: available (`10`); workflow runtime remains empty;
- customer, supplier and project selectors: HTTP 200 JSON responses;
- SKU selector: `57` active items;
- warehouse/location/store selectors: `21/34/10` items;
- cash-account selector: HTTP 200 with `20` items.

No POST, PUT, PATCH or DELETE business endpoint was called. No PO, SO, WMS, POS, AR/AP, payment, approval, packaging or farm transaction was created.

## Baseline protection after authentication

- 148 ZERO_REQUIRED business/runtime tables remain zero.
- Business notification rows remain zero; only the approved `SYSTEM_ALERT/SYS_ALERT` system-runtime subset exists.
- AR, inventory, finance and workflow baseline checks remain PASS.
- Chanjet flags remain disabled and the R3 epoch reimport guard remains PASS: no new sync jobs, mirror rows, inbound runs, reconciliation runtime or pending writeback.
- DB and API remain healthy; API health/readiness are 200 and Web is reachable.
- The 24 current system notifications are `IOT_DEVICE_ALERT` warnings linked to existing `sys_alerts` rows. No alert was resolved, deleted or modified.

## Status

```text
AUTHENTICATED_ACCEPTANCE=PASS
AUTHENTICATED_LOGIN_MENU_DATASCOPE=PASS
MASTER_SELECTORS=PASS
EMPTY_TRANSACTION_BASELINE=PASS
UNEXPECTED_BUSINESS_MUTATION=NO
CHANJET_REIMPORT_GUARD=PASS
IOT_DEVICE_ALERTS=24
IOT_ALERT_BUSINESS_REVIEW=PENDING
TRANSACTIONAL_HUMAN_UAT=PENDING
NEXT_ACTION=BUSINESS_TRANSACTIONAL_UAT
```

This report confirms technical authenticated access and the clean read-only baseline. It does not assert business correctness of future purchase, sales, payment or inventory workflows, which remains for the controlled human transaction UAT stage.
