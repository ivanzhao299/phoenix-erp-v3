# Production Server Remediation R1 File Metadata Repair Precheck

Date: 2026-06-23

## Objective

Confirm the safe repair path for missing `file_metadata` on the production-side remediation target.

## Known Evidence

| Item | Result |
| --- | --- |
| remote File Metadata migration file | missing |
| local File Metadata migration file | present |
| local File Metadata migration hash | `9ba67741f1a43528a399aa4ec42031d4dc2a6b33bc761aa2fb1607599364e70b` |
| remote File Metadata migration history | no match |
| remote `file_metadata` table | missing |
| missing cause | `CODE_NOT_DEPLOYED` |

## Repair Path

Recommended path:

1. Align remote code so `1782042418112-CreateFileMetadata.ts` exists in the remote deploy path.
2. Run a dedicated File Metadata migration execution Gate only after code alignment is complete.
3. After migration execution, perform read-only validation for table, columns, indexes, constraints, and migration history.
4. Keep protected attachment preview/download disabled on the remediation target until File Metadata, ACL, DataScope, and A2 checks pass.

## Manual Table Creation

Skipping code alignment and manually creating `file_metadata` is not recommended.

Reasons:

- It bypasses reviewed migration history.
- It increases future TypeORM migration drift.
- It makes rollback and audit trail weaker.
- It risks schema mismatch with the application code.

## Migration Execution Status

This Gate did not execute migration.

Direct migration execution is not allowed in this Gate.

## Recommended Follow-up Gates

1. `REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`
2. `FILE_METADATA_MIGRATION_EXECUTION_GATE`

## A1 / A2 / A5

| Agent | Conclusion |
| --- | --- |
| A1 | PASS WITH CONDITIONS |
| A2 | PASS WITH CONDITIONS |
| A5 | HOLD until File Metadata exists and is validated |

## Safety Record

| Action | Result |
| --- | --- |
| DB write | no |
| migration | no |
| deploy | no |
| restart | no |
| push | no |

## Conclusion

READY_FOR_REMOTE_CODE_ALIGNMENT_APPROVAL. File Metadata repair must start with code alignment, not manual DB surgery.

