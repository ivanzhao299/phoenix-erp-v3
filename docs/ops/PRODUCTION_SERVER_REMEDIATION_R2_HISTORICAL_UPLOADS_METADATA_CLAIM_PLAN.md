# Production Server Remediation R2 - Historical Uploads Metadata Claim Plan

Date: 2026-06-24

## Purpose

Convert the read-only historical uploads inventory into a safe metadata claim plan. This document does not authorize DB writes. It prepares a future dry-run Gate.

## Inventory Input

- Remote evidence directory: `/opt/phoenix-erp-backups/remediation-r2-historical-uploads-inventory-20260624-085306`
- File count: 74
- Total size: 63.6 MB
- Path pattern: `contracts/*`
- Extensions: PDF 38, JPG 19, PNG 17
- Static risk files: 0

## Automatically Claimable Items

None.

Reason: filesystem path evidence can identify a broad `CONTRACT_ATTACHMENT_CANDIDATE` category, but cannot determine exact `owner_type`, `owner_id`, company, store, module workflow, or record status.

## Items Requiring Human Or DB Correlation

All 74 files.

Recommended correlation targets:

1. Procurement legacy `attachment_url`.
2. Procurement V2 `contract_url`.
3. Procurement payment voucher fields.
4. Shareholder capital `attachment_urls`.
5. Finance expense / reimbursement attachment fields.
6. Warehouse CRUD attachment fields.
7. Any JSON/string field containing `uploads/contracts/`.

## Not Recommended For Direct Claim

No file should be directly claimed from filesystem evidence alone.

If no business record references a file, keep it as:

- `module_code = LEGACY_UPLOAD`
- `owner_type = LEGACY_PENDING`
- `owner_id = LEGACY_PENDING`
- `status = PENDING`
- `visibility = PROTECTED`

Only a later approved write Gate may insert those rows.

## High-Risk Files

The inventory found 0 static high-risk files.

Future Gates must still re-check:

- file MIME by server-side content sniffing if available.
- file size policy.
- whether the referenced business record is active / deleted / archived.
- whether access should be company-, store-, user-, or record-scoped.

## Orphan Files

The filesystem-only inventory found 0 `UNKNOWN_LEGACY_UPLOAD` rows because all files live under `contracts/`.

This does not prove there are no orphan files. Orphan classification requires DB correlation.

## Proposed Dry-Run Algorithm

1. Read the 74 inventory records.
2. Query DB read-only for legacy fields that contain each relative path.
3. Produce one candidate row per matched file with:
   - `file_id`
   - `original_name`
   - `stored_name`
   - `storage_path`
   - `mime_type`
   - `size_bytes`
   - `checksum` if available
   - `module_code`
   - `owner_type`
   - `owner_id`
   - `company_code`
   - `store_code`
   - `uploaded_by`
   - `status`
   - `visibility`
4. Mark unmatched files as `LEGACY_PENDING`.
5. Output a proposed insert manifest.
6. Do not write DB.

## Suggested Module Mapping

| DB evidence source | Suggested `module_code` | Suggested `owner_type` |
| --- | --- | --- |
| Procurement legacy purchase request | `LEGACY_PURCHASE` | `PURCHASE_REQUEST_ATTACHMENT` |
| Procurement V2 purchase order `contract_url` | `PROCUREMENT_V2` | `PURCHASE_ORDER_CONTRACT` |
| Procurement payment voucher | `PROCUREMENT_V2` | `PURCHASE_PAYMENT_VOUCHER` |
| Shareholder capital attachment | `SHAREHOLDER` | `CAPITAL_CONTRIBUTION_ATTACHMENT` |
| Finance expense attachment | `FINANCE` | `EXPENSE_ATTACHMENT` |
| Warehouse attachment field | `WMS` | `WMS_ATTACHMENT` |
| No DB reference | `LEGACY_UPLOAD` | `LEGACY_PENDING` |

## Validation Commands For Future Dry-Run

- Read-only DB query for all legacy fields containing `uploads/contracts`.
- Verify all proposed `storage_path` values resolve under the upload root.
- Verify no proposed row has `visibility=PUBLIC`.
- Verify no proposed response would expose `storage_path` or raw URL.
- Verify no duplicate `file_id`.
- Verify dry-run output row count matches inventory count or explains unmatched files.

## Rollback Plan

For this inventory Gate, rollback is not required because no DB or filesystem mutation occurred.

For a future write Gate:

1. Insert rows with a unique batch id or deterministic prefix.
2. Store a pre-write row count and proposed row manifest.
3. Roll back only the batch rows if user approves rollback.
4. Do not delete binaries during rollback.

## Required Approvals Before Metadata Write

1. User approval for `APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_GATE`.
2. User approval of the dry-run proposed insert manifest.
3. A2 review of access model and sensitive attachment risk.
4. A5 review of owner/module/data readiness.
5. A1 validation of no migration, no deploy, no file movement, and write boundaries.

## Recommended Next Gate

`APPROVE_HISTORICAL_UPLOADS_METADATA_CLAIM_DRY_RUN_GATE`

This next Gate must be dry-run only.

