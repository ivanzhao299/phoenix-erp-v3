# Chanjet Readonly Completion And Minimal Write Precheck Report

Date: 2026-07-20

Decision: `GO_WITH_CONDITIONS`

## 1. Scope And Conclusion

The previously requested Chanjet command was not fully closed. The implementation had transport coverage, but several runtime contracts still produced misleading readiness: HTTP 200 business failures could enter evidence, report rows were collapsed into fake scalar zeroes, voucher adapters remained marked manual despite complete samples, the generic proxy was too broad, the current-state endpoint could exhaust the connection pool, and daily reconciliation used stale cumulative semantics.

This delivery closes those defects for the **agreed finance readonly scope**. It does not claim that every Chanjet product module is integrated. The default scope covers 16 domains and 46 book-scoped targets: account books, departments, counterparties, subjects, projects, cash accounts, AR/AP statistics, receipt/payment documents, purchase-order list, vouchers, GL balance, balance sheet, income statement, and cash flow.

Production evidence now passes 15/15 authenticated checks and 46/46 mirror targets. External Chanjet write, delete, modify, and voucher push remain disabled.

## 2. Root Causes Closed

1. **Transport success was confused with business success.** Chanjet error envelopes returned with HTTP 200 were persisted as valid rows. The response contract now fails closed and six historical invalid envelopes are excluded without deleting source evidence.
2. **Incorrect endpoint and parameter contracts.** Department and subject reads were aligned with the verified provider endpoints and parameters.
3. **Reference data was misclassified as an actionable mapping backlog.** The 919 subject chart rows are now classified as `SOURCE_REFERENCE`, not fake ERP mapping candidates.
4. **Generic proxy permissions were broader than the readonly contract.** `/api/chanjet/call` now permits exact allowlisted readonly calls only and rejects non-read methods.
5. **Daily finance values used inconsistent semantics.** Finance read model and reconciliation now share `bizDate + EFFECTIVE + totalAmount + entity-type direction`.
6. **Current-state aggregation exhausted the database pool.** Expensive evidence queries now use bounded staged concurrency.
7. **Financial statements were reduced to a fake scalar zero.** Subject balance, balance sheet, income statement, and cash flow remain row-level readonly models with `displayValue=null` when ERP has no equivalent statutory ledger fact.
8. **Voucher readiness was stale.** Voucher header and line adapters must both be `READY`; production evidence covers 60 header rows and 160 line rows. Readiness does not authorize voucher writeback.

## 3. Production Verification

| Check | Result |
| --- | --- |
| CI/CD run | `29739998083` PASS |
| Deployed API revision | `29be6c325ff284c80e9ee35833df527a34072935` |
| API container | healthy |
| Focused Jest | 53/53 PASS |
| API typecheck | PASS |
| W5 closeout | 20/20 PASS with explicit reviewed Chanjet freeze/security scope |
| Authenticated endpoint audit | 15/15 PASS |
| Mirror sync | 46/46 `SUCCESS`, one attempt, zero unresolved failures |
| Read model | 10/10 ready: 5 `AUTHORITY_READY`, 5 `READONLY_READY` |
| Read model blockers/manual/HOLD | 0 / 0 / 0 |
| Reconciliation | 5 `MISMATCH`, 5 row-level `WARN`, 0 mapping/manual/HOLD |
| Semantic locks | 8 locked, 2 partial, 0 pending |
| Recent sync jobs | 100 sampled, 0 failed |
| Unsafe voucher drafts | 0 |

The refreshed target-date evidence is not a random total. For 2026-07-20, the source rows belong to book `3533914511118750` (`COMP-LAO-AGRI`) and currency `RMB`:

- receipt: 43 `EFFECTIVE` rows, total `65,518,000`;
- payment: 6 `EFFECTIVE` rows, total `799,540,700`;
- 43 non-effective target-date rows are excluded by status.

## 4. Remaining Conditions

### 4.1 Master-data mapping

- Valid provider rows: 1,005.
- Historical invalid envelopes excluded: 6.
- Source references: 919.
- Deterministic exact candidates: 41.
- Non-exact candidates requiring mapping/review: 49.
- Conflicts: 0.

The 49 candidates are real data-quality work, not missing API implementation. They include 31 departments, 6 projects, and 12 cash accounts. They must not be guessed or fuzzy-approved.

### 4.2 Real ERP versus Chanjet differences

Five comparisons remain `MISMATCH`: AR open, AP open, cash/bank balance, today's receipts, and today's payments. Chanjet is displayed as the approved finance-source evidence; ERP remains visible as auxiliary business detail. The system does not silently overwrite either side.

### 4.3 Scope boundary

The default 46-target scope is finance-readonly plus purchase-order list. `SALES_ORDER`, `PURCHASE_APPLY`, `STOCK_IN`, and `SALES_STOCK_OUT` are non-default business-module scopes and require separate readonly contracts before anyone can claim complete Chanjet product coverage.

## 5. Recommendations In Order

1. Approve exactly one deterministic ERP middle-layer mapping candidate as the first minimal-write canary.
2. Read the row back, verify the audit event, rerun idempotently, and exercise a compensating rollback.
3. Resolve the remaining exact candidates in bounded batches; keep all 49 non-exact rows under explicit review rules.
4. Reconcile the five finance differences by company, book, currency, business date, status, and document identity. Do not force values to match.
5. Add separate readonly Gates for sales orders, purchase applications, stock-in, and sales stock-out only when those modules enter the integration scope.
6. Prepare an external Chanjet write canary only after the ERP middle-layer canary passes and a separate approval names the endpoint, account book, payload, idempotency key, rollback/void method, and operator.

## 6. Minimal Write Gate Design

### Gate A - ERP middle-layer canary

This is the recommended next Gate. It does **not** write Chanjet.

- Scope: one deterministic candidate from the 41 exact matches.
- Allowed table: approved Chanjet ERP mapping/audit tables only.
- Idempotency: rerunning the same candidate must not create another active mapping.
- Evidence: before snapshot, write result, after read-back, audit actor/time/reason, second-run no-op.
- Rollback: restore the prior review state with a compensating audited action.
- Failure rule: any ambiguity, cross-company mismatch, inactive ERP record, or source drift is `HOLD`.

### Gate B - external Chanjet canary

This remains unapproved and unexecuted. It must be a separate Gate after Gate A and finance reconciliation evidence are accepted.

- one document only;
- one account book only;
- exact write endpoint and schema locked;
- idempotency key and duplicate lookup required;
- preflight validation and balanced accounting required;
- response receipt and provider document ID stored;
- provider-supported void/red-flush strategy documented;
- no batch or automatic write mode.

## 7. Guardrails And Actions Executed

- Chanjet external write/delete/modify: **NO**.
- Voucher push: **NO**.
- Chanjet data deletion: **NO**.
- ERP business-table overwrite: **NO**.
- Migration: **NO**.
- Production DB manual write: **NO**.
- ERP readonly middle-layer mirror refresh: **YES**, through the approved protected sync endpoint.
- Code push and production deploy: **YES**, revision `29be6c32`, CI/CD PASS.

## 8. Final Decision

`GO_WITH_CONDITIONS` for the agreed finance readonly scope.

The implementation is ready to request `CHANJET_MINIMAL_WRITE_PRECHECK`, beginning with a one-record ERP middle-layer canary. External Chanjet write remains disabled until a later explicit approval Gate.
