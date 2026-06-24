# Production Server Remediation R2 - Restore SSH And Metadata Claim Dry-Run Report

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_METADATA_CLAIM_EXECUTION_APPROVAL.

SSH command-level observability was restored enough to execute the read-only dry-run using a single low-concurrency remote execution pattern. The metadata claim dry-run completed and generated one proposed row per historical upload file. Only AUTO_CLAIM_READY rows may be considered for the next write Gate.

## SSH Observability

- Host alias: erp.
- SSH user: root.
- Port: 22.
- Effective server SSH state after repair: `AuthorizedKeysCommand none`, `LoginGraceTime 60`, `MaxStartups 200:30:600`, `UseDNS no`, `GSSAPIAuthentication no`.
- Stable execution strategy used: long timeout, low concurrency, server-side file output, short local stdout, tar pull for artifacts.
- Remaining condition: direct fresh SSH handshakes can still be slow or flaky, so future remote automation should avoid bursty SSH and prefer one prepared command or a persistent master connection.

## Remote Evidence

Remote audit directory:

`/opt/phoenix-erp-backups/remediation-r2-restore-ssh-and-metadata-claim-dry-run-20260624-111145`

Local pulled evidence:

`docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/`

Required artifacts generated:

- `manifest.json`
- `ssh_observability_check.txt`
- `db_owner_lookup_summary.txt`
- `historical_uploads_claim_input_inventory.txt`
- `metadata_claim_dry_run_rows.json`
- `metadata_claim_dry_run_rows.csv`
- `metadata_claim_auto_candidates.txt`
- `metadata_claim_manual_review_required.txt`
- `metadata_claim_unresolved.txt`
- `metadata_claim_risk_summary.txt`

## Dry-Run Counts

| Metric | Value |
| --- | ---: |
| Input files | 74 |
| Dry-run rows | 74 |
| AUTO_CLAIM_READY | 15 |
| MANUAL_REVIEW_REQUIRED | 0 |
| UNRESOLVED_OR_HOLD | 59 |
| Searched DB text/json columns | 245 |

## Owner Correlation Method

- Read inventory input from the previous historical uploads inventory directory.
- Recomputed SHA-256 checksums on the remote host from the upload volume.
- Queried the remote `phoenix_erp` DB in read-only mode through the API container environment.
- Searched contract, agreement, document, attachment, upload, purchase, payment, expense, reimbursement, invoice, file, and voucher related text/json columns.
- Classified a file as AUTO_CLAIM_READY only when there was exactly one exact DB path match with an owner id.
- Did not infer owner ids from filesystem path alone.

## Query Summary

- DB identity: database `phoenix_erp`, schema `public`.
- AUTO sources:
  - `prc2_purchase_orders.contract_url`: 14 files.
  - `prc2_payments.voucher_url`: 1 file.
- Manual review candidates: 0.
- Unresolved / hold: 59 files with no DB owner evidence in searched attachment/path fields.

## AUTO_CLAIM_READY Scope

The 15 AUTO_CLAIM_READY files are proposed only for a later approved execution Gate. They are not written in this Gate.

- LEGACY-86CCCB96341DB69EABAF9BEA | 1781514783547-3yoo8a.jpg | PURCHASE_ATTACHMENT | 28 | prc2_purchase_orders.contract_url
- LEGACY-F1DFBF44C46690EF481B0971 | 1781511754258-tam2bd.pdf | PURCHASE_ATTACHMENT | 9 | prc2_purchase_orders.contract_url
- LEGACY-CCCBD887FFB465403975CBE1 | 1781947550550-a1jp3n.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-0C03625682F01F3DF2875147 | 1781947549455-y35eh7.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-F1E8642AB39851218F0F8EDA | 1781947665345-nzvnkk.pdf | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-DB1ED37A83BBAB46C703E8BF | 1781514766216-hlwd0h.jpg | PURCHASE_ATTACHMENT | 28 | prc2_purchase_orders.contract_url
- LEGACY-527B6AB3D424E9A84DB034F6 | 1781947549997-ms9r15.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-F59619EA0A8CBDDA7410EB88 | 1781947548358-6c8apo.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-C52E94DDBF973160ED3786C0 | 1781947666321-rlbxuz.pdf | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-05EFFBCBDA8A65EADE91F797 | 1781947548904-a64p6n.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-D538B8A5D82482BAC16B8805 | 1782096190526-s2iabs.pdf | PAYMENT_ATTACHMENT | 12 | prc2_payments.voucher_url
- LEGACY-D900C1ED371D58BB1EFFF6F9 | 1781947551079-zzrkh8.jpg | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-E6E86E83DA12AF973177038E | 1781514789396-16sarr.pdf | PURCHASE_ATTACHMENT | 28 | prc2_purchase_orders.contract_url
- LEGACY-8D8CC97AEBFBC5C9683320D9 | 1781947665832-1op0zs.pdf | PURCHASE_ATTACHMENT | 29 | prc2_purchase_orders.contract_url
- LEGACY-137C78CC7C7EA46CAE9E3B74 | 1781514773912-70dbgn.jpg | PURCHASE_ATTACHMENT | 28 | prc2_purchase_orders.contract_url

## Security And Data Boundaries

| Boundary | Result |
| --- | --- |
| DB write | No |
| file_metadata insert | No |
| File delete | No |
| File move | No |
| Permission change | No |
| Migration | No |
| Deploy | No |
| Restart | No |
| Push | No |
| Raw URL generated | No |
| Public /uploads URL generated | No |
| Nginx changed | No |
| Env changed | No |
| Business code changed | No |

## A1 / A2 / A5 Review

- A1 conclusion: PASS WITH CONDITIONS. Manifest, JSON, CSV, and W5 gate are required for final local validation; no DB write, file delete, deploy, restart, or push occurred.
- A2 conclusion: PASS WITH CONDITIONS. No raw URL or public `/uploads` URL was generated; 59 unresolved files were not auto-claimed; next execution Gate must only include AUTO_CLAIM_READY rows.
- A5 conclusion: GO WITH CONDITIONS. Fifteen files have sufficient DB owner evidence for a proposed write manifest; 59 files remain data-readiness HOLD and require later manual review or broader business-owner evidence.

## Current Decision

READY_FOR_METADATA_CLAIM_EXECUTION_APPROVAL.

## Next Single Gate

`APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_EXECUTION_GATE`

Scope restriction for next Gate: only the 15 AUTO_CLAIM_READY rows may be written, and only after user approval. The 59 unresolved files must remain out of scope.
