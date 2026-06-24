# Production Server Remediation R3 - Unresolved Uploads Owner Diagnosis Report

Date: 2026-06-24

## Conclusion

Current conclusion: HOLD.

The unresolved upload owner diagnosis confirms that `file_metadata` now contains 15 protected historical rows, but those rows belong to purchase/payment owner classes. The previously unresolved 59 historical files still have no safe owner evidence in this batch and must remain HOLD.

## Evidence

Remote evidence directory:

`/opt/phoenix-erp-backups/remediation-r3-high-throughput-batch1-20260624-124012`

Local evidence file:

`docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/unresolved_uploads_owner_diagnosis.txt`

Prior claim dry-run evidence:

`docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/metadata_claim_dry_run_rows.json`

## File Metadata Summary

| Field | Count |
| --- | ---: |
| `file_metadata` rows | 15 |
| legacy rows | 15 |
| legacy module marker rows | 0 |
| active rows | 15 |
| protected rows | 15 |

## Owner Distribution

| module_code | owner_type | rows |
| --- | --- | ---: |
| `PURCHASE` | `PURCHASE_ATTACHMENT` | 14 |
| `PAYMENT` | `PAYMENT_ATTACHMENT` | 1 |

## Unresolved Historical Uploads

The earlier owner-correlation dry-run produced:

| Classification | Count |
| --- | ---: |
| AUTO_CLAIM_READY | 15 |
| MANUAL_REVIEW_REQUIRED | 0 |
| UNRESOLVED_OR_HOLD | 59 |

Only the 15 AUTO rows were approved and inserted in the previous Gate. The 59 unresolved files still lack owner evidence and must not be inserted into `file_metadata` by inference.

## Attachment-Like Surface

The read-only scan found 25 attachment-like columns, including:

- `prc2_purchase_orders.contract_url`
- `prc2_payments.voucher_url`
- `store_payment_accounts.qr_attachment_id`
- `store_payment_records.proof_attachment_id`
- `wms_inbound.attachment_url`
- `wms_outbound.attachment_url`

This broad surface reinforces that unresolved ownership must stay conservative.

## Findings

| Severity | Finding |
| --- | --- |
| P0 | None newly proven in this batch. |
| P1 | 59 historical files remain unresolved and must not be auto-claimed. |
| P1 | Attachment-like columns span multiple modules; broad matching risks wrong ownership. |
| P2 | A manual review or second-pass evidence strategy is needed for the remaining files. |

## A2 Review

Conclusion: PASS WITH CONDITIONS.

The 59 unresolved files must remain fail-closed. Do not expose raw paths, do not backfill without owner proof, and do not turn filesystem heuristics into ACL authority.

## A5 Review

Conclusion: HOLD.

Data evidence is insufficient for the 59 unresolved files. The next step must be manual review or a strictly read-only second-pass correlation design.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| `file_metadata` insert | No |
| File delete/move | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |

## Next Recommended Gate

`HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW`

Optional later path:

`APPROVE_UNRESOLVED_UPLOADS_SECOND_PASS_OWNER_CORRELATION_DRY_RUN`
