# Production Server Remediation R2 - Historical Uploads Metadata Claim Execution Report

Date: 2026-06-24

## Conclusion

Current conclusion: GO.

The approved metadata claim execution Gate inserted exactly the 15 AUTO_CLAIM_READY historical upload rows into the remote production-prep `file_metadata` table. The 59 UNRESOLVED_OR_HOLD files were not inserted and remain HOLD for later manual review or deeper owner-evidence correlation.

## Remote Execution Directory

`/opt/phoenix-erp-backups/remediation-r2-historical-uploads-metadata-claim-execution-20260624-120740`

Local pulled evidence:

`docs/ops/runs/historical-uploads-metadata-claim-execution-20260624-120740/`

## Counts

| Metric | Value |
| --- | ---: |
| Input execution rows | 15 |
| AUTO_CLAIM_READY input rows | 15 |
| inserted_count | 15 |
| skipped_count | 0 |
| failed_count | 0 |
| verified_rows_count | 15 |
| bad_verification_count | 0 |
| Continuing HOLD files | 59 |

## Scope Enforcement

- Only AUTO_CLAIM_READY rows were included in the execution input.
- No UNRESOLVED_OR_HOLD rows were written.
- Owner evidence came from the previous read-only dry-run.
- Conflicts would have been skipped by `ON CONFLICT(file_id) DO NOTHING`; no conflicts occurred.

## Post-Insert Verification

- All 15 inserted file ids were verified in `file_metadata`.
- `visibility=PROTECTED` verification passed.
- `status` verification passed.
- `owner_type` / `owner_id` were present for all inserted rows.
- `rawUrl` was not generated.
- Public `/uploads` URL was not generated.
- Public HTTPS `/uploads` remained `403`.

## Boundaries

| Boundary | Result |
| --- | --- |
| DB write | Yes, only `file_metadata` |
| file_metadata insert | Yes, 15 rows |
| Contract table modified | No |
| Business table modified | No |
| File delete | No |
| File move | No |
| Permission change | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Nginx changed | No |
| Env changed | No |
| rawUrl returned/generated | No |
| /uploads public URL generated | No |

## A1 / A2 / A5 Review

- A1 conclusion: PASS WITH CONDITIONS. Execution manifest exists, inserted/skipped/failed counts are present, W5 gate still required locally, and no migration/deploy/restart/push occurred.
- A2 conclusion: PASS WITH CONDITIONS. The execution did not generate raw URLs, did not reopen public `/uploads`, and did not auto-claim unresolved files.
- A5 conclusion: GO WITH CONDITIONS. Historical metadata readiness improved for 15 DB-proven attachments; 59 files remain HOLD.

## Rollback / Recovery Recommendation

If rollback is required, create a separate approved DB rollback Gate that deletes only the inserted `file_id` set from this manifest. Do not delete or move upload files.

## Next Recommendation

`APPROVE_MENU_ROLE_DATASCOPE_REMOTE_AUDIT`

Alternative follow-up: `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.

Keep `HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW` open for the remaining 59 files.
