# BUG-20260713-0003 A3 Backend Closure Report

## Root Cause

Payment allocations persisted a mutable numeric AP row ID and confirmation used that ID as the only lookup key. When AP ledgers were rebuilt while retaining their AP and purchase-order numbers, the stale allocation raised `AP 台账 ID=11 不存在` even though the payable still existed.

## Repair And Retest

- Resolve through `apId`, `apNo`, `poId`, and `poNo`, with conflicting matches rejected.
- Refresh stale allocation references before settlement and validate new allocations at save time.
- Preserve DataScope ownership checks on the resolved row.
- Focused tests cover stale-ID recovery and conflicting-reference rejection.

No migration, seed, direct database write, or deployment was executed by this code change.

## Conclusion

PASS WITH CONDITIONS: implementation and focused regression tests pass; production payment confirmation smoke is required after deployment.
