# Role Permission Matrix Atomicity Audit

Generated at: 2026-07-02T05:32:02.842Z

Mode: dry-run
Database: phoenix_erp
Severity: PASS
Finding count: 0

## Boundary

- Read-only audit only.
- No DB write.
- No migration.
- No deploy.

## Result

PASS. No non-admin role grants were found on known coarse parent menu codes.
