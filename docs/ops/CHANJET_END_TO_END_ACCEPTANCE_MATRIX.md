# Chanjet End-to-End Acceptance Matrix

Program: `CHANJET-E2E-20260720`

This matrix is the release truth. A task report, commit or successful HTTP response does not complete a Gate unless the corresponding acceptance evidence below exists.

## Program scorecard

| Dimension | Current evidence | Completion target | Blocking rule |
| --- | --- | --- | --- |
| Authorized readonly endpoint coverage | 46/46 current targets | 100% of the newly discovered, versioned catalog for every enabled book | Any unexplained missing/stale P0 endpoint is HOLD |
| Required field capture | Latest adapter evidence above 90% | 100% capture; at least 95% semantic coverage | Missing required identity/date/status/amount field is HOLD |
| Finance semantic lock | Five real differences retained | AR/AP/cash/receipt/payment have explicit dimensions and zero unexplained P0 difference | Cross-book/currency/date comparison is HOLD |
| Master-data mapping | 90/90 deterministic; conflicts 0 | Required P0 mappings conflict 0, ambiguity 0, deterministic automation at least 90% | Fuzzy auto-confirmation is HOLD |
| Ordinary ERP finance fusion | Partial authority/fallback contract | All P0 cards and reports expose source, freshness, difference and drill-down | Unlabeled/fabricated value is HOLD |
| Security and DataScope | PASS WITH CONDITIONS | Book/company/account/role access matrix passes; write credential separate | Cross-company/book leakage is FAIL |
| Reliability | Four-hour scheduler and retry exist | 24-hour soak, induced failure recovery, alert-to-human, idempotent replay | Silent stale data or unbounded retry is HOLD |
| Internal writeback preparation | Drafts and compensated ERP canary exist | State machine, validation, outbox, receipts, dual control and provider stub all pass | External network write in Waves 0-6 is FAIL |
| External canary | Not approved | One explicit, reversible, read-back and duplicate-safe canary | No explicit approval means HOLD |
| Production rollout | Not approved | Controlled pilot and 30-day stabilization pass | Production GO cannot be inherited |

## Wave acceptance

### Wave 0 - Baseline

| Check | Evidence | Owner | Required result |
| --- | --- | --- | --- |
| Current revision and deployment identity | Git SHA, CI run and runtime revision | Orchestrator/A1 | Exact match |
| Enabled account books | Authenticated readonly response | A5 | Complete and book-scoped |
| Endpoint catalog | Local catalog plus authenticated capability evidence | A5 | Every endpoint classified |
| Token/security boundary | Redacted config and code review | A2 | Readonly/write separation PASS |
| Business response envelope | Failure fixtures and runtime evidence | A1/A3 | HTTP 200 failure rejected |

### Wave 1 - Finance semantics

Each metric must publish the following contract:

- authority source;
- book and ERP company;
- currency and original/base amount policy;
- accounting date, business date and period;
- included and excluded statuses;
- document or counterparty grain;
- reversal/cancellation policy;
- aggregation formula;
- freshness threshold;
- fallback behavior;
- difference status and reason.

| Metric | Required equality grain | Required disposition |
| --- | --- | --- |
| AR open | Book + company + currency + period + counterparty | `OK`, accepted explained difference, or HOLD |
| AP open | Book + company + currency + period + supplier | `OK`, accepted explained difference, or HOLD |
| Cash balance | Book + company + cash account + currency + balance date | `OK` or HOLD; no cross-currency collapse |
| Today receipt | Book + company + currency + effective business/accounting date + document identity | `OK` or HOLD |
| Today payment | Book + company + currency + effective business/accounting date + document identity | `OK` or HOLD |

### Wave 2 - Readonly completeness

| Domain | Minimum coverage |
| --- | --- |
| Organization/master | Books, subjects, counterparties, departments, projects, cash accounts, currencies and other authorized references |
| Receivable/payable | Open balance/statistics and available document-level sources |
| Cash | Accounts, balances, receipts and payments |
| Voucher | Header, lines, status, period, dates, subject and auxiliary dimensions |
| Statements | Subject balance, balance sheet, income statement and cash flow |
| Business documents | Authorized purchase, sales and stock movement scopes |

For every domain, tests must cover pagination, zero rows, malformed envelope, 401/403, 429, 5xx, timeout and additive unknown fields.

### Wave 3 - Identity mapping

| Status | Meaning | Write eligibility |
| --- | --- | --- |
| `EXACT_CONFIRMED` | Book-scoped deterministic identity | Eligible only after write Gate |
| `SOURCE_ONLY` | Valid Chanjet identity with no approved ERP peer | Readonly only |
| `NEED_REVIEW` | Candidate lacks deterministic evidence | Not eligible |
| `CONFLICT` | Multiple or contradictory identities | HOLD |
| `INACTIVE` | Source or ERP identity inactive | Not eligible |

Required invariants:

1. `book_id` is part of external identity.
2. Customer and supplier roles are not conflated.
3. Currency and cash account identity are exact.
4. Mapping actor, reason, before and after values are audited.
5. A reversal restores the prior mapping state.

### Wave 4 - User experience

| Surface | Acceptance |
| --- | --- |
| Finance cards | Source, freshness and difference visible; no unexplained total |
| Ledgers and drill-down | ERP operational details are linked but not presented as Chanjet statutory rows |
| Statements | Book/period/currency filters and source-only label present |
| Reconciliation | `OK/WARN/MISMATCH/HOLD/NEED_MAPPING/NEED_MANUAL_REVIEW` visible with reason |
| Admin console | Protected by `MENU_SETTINGS_CHANJET`; secrets/raw tokens absent |
| Ordinary user | Does not see middleware internals; receives role/DataScope-correct data |
| i18n/responsive | Chinese, English and Lao; desktop and mobile smoke pass |

### Wave 5 - Reliability

| Test | Required result |
| --- | --- |
| 24-hour soak | No stuck job, duplicate snapshot or unexplained stale P0 target |
| Token expiry | Refreshes before expiry or enters actionable HOLD |
| 429/5xx | Bounded backoff and eventual success/HOLD |
| Malformed business envelope | Rejected and alerted |
| Lock contention | No duplicate same-book execution |
| Manual replay | Idempotent and scoped |
| Field drift | Additive field captured; breaking field creates HOLD |
| Alert delivery | P0 alert reaches a named operator with evidence and runbook |

### Wave 6 - Writeback preparation

Required internal states:

`DRAFT -> VALIDATED -> REVIEWED -> APPROVED -> PUSH_READY`

Transport states are modeled but disabled:

`SENDING -> ACKNOWLEDGED | FAILED | RETRYABLE -> REVERSED | CANCELLED`

Required validation:

- debit equals credit;
- period is open and allowed;
- exact book/company/currency/subject/auxiliary mapping;
- source business identity and idempotency key are unique;
- maker and approver are different;
- provider request/response hashes and receipt are auditable;
- no real Chanjet network write occurs.

### Wave 7 - External canary

The approval must name:

1. environment and account book;
2. ERP company and business source;
3. document type and exact payload;
4. amount/currency and accounting period;
5. maker, reviewer and operator;
6. idempotency key;
7. readback query;
8. reversal/compensation method;
9. execution window and approval expiry;
10. stop and escalation rules.

No complete approval means no canary.

### Waves 8-9 - Pilot and production

| Gate | Required evidence |
| --- | --- |
| Controlled pilot | Approved scope, per-write review, receipts, daily reconciliation, security and UAT |
| Production GO | A7 GO, user approval, verified deploy/rollback, no P0/P1 open issue |
| 7-day review | Reliability and reconciliation SLO met |
| 14-day review | No uncontrolled retry, duplicate or mapping drift |
| 30-day closeout | Source-of-truth matrix final; support and incident runbooks verified |

## Required validation commands

The exact focused tests may grow with implementation, but every implementation wave must at least run:

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && pnpm test -- chanjet-integration.service.spec.ts
cd apps/api && pnpm test -- chanjet-readonly-sync.scheduler.spec.ts
node scripts/ci/check-security-regression.mjs
node scripts/ci/check-w5-closeout-gate.mjs
git diff --check
```

Authenticated production or provider tests must redact secrets and must remain readonly until the Wave 7 approval Gate.

## Final decision rule

- `GO`: all required evidence passes and no condition remains for the requested scope.
- `GO_WITH_CONDITIONS`: no P0 blocker; named conditions have owner, deadline and fail-closed behavior.
- `HOLD`: missing evidence, stale target, unresolved financial semantics, mapping ambiguity, security concern or absent approval.
- `FAIL`: unauthorized write, data leakage, duplicate financial effect, destructive action or unrecoverable integrity violation.
