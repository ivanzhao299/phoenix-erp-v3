# Role Permission Matrix Atomicity Audit

Generated at: 2026-07-01T14:15:20.239Z

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
