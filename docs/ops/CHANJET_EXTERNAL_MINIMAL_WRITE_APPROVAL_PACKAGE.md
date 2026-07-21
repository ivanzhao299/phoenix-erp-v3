# Chanjet External Minimal-Write Approval Package

Gate: `CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL`

Current decision: `HOLD`

Default action: do not send anything to Chanjet.

## Approval Object

One approval may cover exactly one reversible canary and must provide all fields below:

| Field | Required value |
| --- | --- |
| Environment | Named Chanjet environment; production/non-production stated explicitly |
| Account book | Exact `book_id` and book name |
| ERP company | Exact `company_code` and mapped book evidence |
| Source business | ERP business type and immutable source ID |
| Document | Exact document type and complete redacted payload hash |
| Amount | Debit/credit total, currency and accounting period |
| Actors | Different maker and reviewer/approver; named operator |
| Idempotency | Generated idempotency key and duplicate-readback rule |
| Readback | Exact readonly API and expected identity/status/amount |
| Compensation | Reversal/red-letter method and accountable owner |
| Window | Start/end time and approval expiry |
| Stop rule | Any timeout, unknown response, mismatch, duplicate or missing receipt causes HOLD |

## Mandatory Precheck

1. Wave 6 preparation endpoint reports zero unsafe drafts and zero unsafe Outbox rows.
2. Payload hash is unchanged after approval.
3. Book/company/currency/subject/auxiliary mappings are exact and approved.
4. Accounting period is open and explicitly allowed.
5. API token is write-scoped, separately stored and not reused by the readonly scheduler.
6. Readback and compensation calls are proven in a provider sandbox or documented official contract.
7. A2 security review, A1 runtime gate and A7 single-canary GO all pass.

## Execution Boundary

- one Outbox item only;
- no batch, automatic retry or background promotion;
- operator starts the call manually inside the approved window;
- first ambiguous response stops execution; it is never interpreted as success;
- receipt and readback must match before completion;
- production rollout remains a later, separate approval.

## Approval Record Template

```yaml
approval_id: CHANJET-W7-CANARY-<date>-001
decision: APPROVE | HOLD | REJECT
environment: ""
book_id: ""
company_code: ""
source_business_type: ""
source_business_id: ""
payload_hash: ""
amount: ""
currency: ""
period: ""
maker: ""
reviewer: ""
operator: ""
idempotency_key: ""
readback_method: ""
compensation_method: ""
execution_window: ""
expires_at: ""
approved_by: ""
```

An incomplete record is automatically `HOLD`.
