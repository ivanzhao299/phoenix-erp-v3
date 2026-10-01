# BATCH3_ACCEPTANCE_CLOSURE_REPORT

## Git and deployment

```text
MAIN_COMMIT=2ec1ff30b20ac48cc7665a9e7acebff43f3b5885
PRODUCTION_COMMIT=2ec1ff30b20ac48cc7665a9e7acebff43f3b5885
PR=https://github.com/ivanzhao299/phoenix-erp-v3/pull/308 (MERGED)
CI=PASS (required checks; remote Chromium 30/30)
DEPLOY_RUN=36759554719
DEPLOY_SOURCE_COMMIT=2ec1ff30b20ac48cc7665a9e7acebff43f3b5885
```

## U1 — permission runtime matrix

```text
U1_RESULT=PASS FOR EXECUTED DISPOSABLE PG16 PROBES
CROSS_COMPANY_MATRIX=DENIALS AND SCOPED READS PASS; POPULATED TRANSACTION FIXTURE GAP
CROSS_ORGANIZATION_MATRIX=NO BYPASS REPRODUCED; USER-SCOPE DISCLOSURE POLICY GAP RETAINED
IDOR_MATRIX=NO BYPASS REPRODUCED IN EXECUTED GENERIC/WMS/ATTACHMENT PROBES
DATASCOPE_REGRESSION=PASS
ACCOUNT_STATUS=PASS (USER_DISABLED)
PERMISSION_VERSION=PASS (PERMS_CHANGED)
BIGINT_BOUNDARY=UNVERIFIED RISK
```

U1 used disposable PostgreSQL 16.14 and API `:33102`. No production data, credentials, or code writes were used. No new confirmed vulnerability was found.

## U2 — business acceptance

```text
U2_RESULT=PARTIAL_READONLY
BUSINESS_JOURNEYS=READ-ONLY PROCUREMENT/SALES/INVENTORY/AP/AR/MASTER-DATA PROBES PASS; WRITE JOURNEYS NOT RUN
AUTOMATED_UAT=PARTIAL_READONLY_DATASCOPE_VERIFIED
HUMAN_UAT=NOT_CONFIRMED
```

The UAT fixture contains inventory and master-data rows. E2E_ADMIN can read them. E2E_REPLENISH_MANAGER is correctly filtered from `company_code='ALL'` rows because its scope is `E2E-COMPANY`; procurement 403 is the expected missing-menu boundary for that identity. The missing aligned transaction fixture prevents valid before/after assertions for procurement, sales, store collection, and attachment workflows.

## E2E and full verification

```text
E2E=30/30 PASS
E2E_INFRA_FAILURES=0
E2E_FIXTURE_FAILURES=0
E2E_PRODUCT_FAILURES=0
FULL_VERIFY=PASS ON MERGED MAIN EVIDENCE
UNIT=PASS
TYPECHECK=PASS
BUILD=PASS
INTEGRATION=PASS
REGRESSION=PASS (247 checks)
LINT_RATCHET=PASS
SECURITY=PASS
LOCAL_SMOKE=PASS
```

## Vulnerabilities and remaining risks

```text
NEW_VULNERABILITIES=0
FIXES=JWT account-state lookup fail-closed (already merged/deployed)
REMAINING_RISKS=BIGINT ID boundary; explicit user-scope disclosure policy; aligned transaction fixtures; human UAT
```

## Closure decision

```text
BATCH3_ENGINEERING_COMPLETE=YES
BATCH3_ACCEPTANCE_COMPLETE=NO
BATCH3_COMPLETE=NO
```

`BATCH3_COMPLETE` remains `NO` because formal human business acceptance has not been provided and the complete write-journey matrix lacks an approved transaction fixture. The deployed production source remains the merged main SHA above. This round added evidence and reports only; no production restart or migration was performed.

Additional automated business evidence: `sales-order-approval.pg.integration.spec.ts` passed 6/6 on disposable PG16 with transaction rollback and database-state assertions. The WMS/packaging PG18-gated suites were explicitly skipped and are not counted as PG16 passes.
