# BUG-20260709-0003 Integrated Repair

- Symptom: inventory-ledger transaction types exposed English codes.
- Repair: the ledger renders the centralized Chinese transaction-type mapping and preserves the original code only as diagnostic title metadata.
- Verification: `bug-20260709-0003-warehouse-ledger.test.ts`, existing mapping tests, Web typecheck, and W5 closeout gate.
- Conclusion: PASS WITH CONDITIONS pending CI/CD and production smoke evidence.
