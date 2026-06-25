# Procurement Contract OCR Autofill Plan

Date: 2026-06-25

## Goal

Add a controlled "合同识别并回填" capability to the procurement order form so users can upload PDF/image contracts and let the system extract likely values for the current form fields.

The feature is feasible, but it should be implemented behind a review-and-apply flow. The system must never silently overwrite user-entered values.

## Current Page

- Page: `apps/web/src/app/(admin)/procurement2/orders/OrderForm.tsx`
- Existing upload component: `AttachmentUploader`
- Existing upload channel: `/api/upload/contract`
- Existing stored value: `contractUrl` stores a JSON string array of protected file references or historical attachment references.

## Target Fields

The first production-safe extraction scope should map only to fields already present in the purchase order form:

| Field | Suggested extraction |
| --- | --- |
| `contractNo` | Contract number / agreement number |
| `supplierName` / `supplierCode` | Supplier legal name, with later master-data matching |
| `companyName` / `companyCode` | Buyer company, with later organization matching |
| `totalAmount` / line amounts | Contract total amount, item amount hints |
| `currencyCode` | CNY / LAK / THB / USD |
| `expectedDate` | Delivery date / expected delivery |
| `payDeadline` | Payment due date / settlement term |
| `contractNote` | Extracted summary: payment terms, delivery terms, warranty, penalty, special terms |
| items | Later phase only: material name, spec, quantity, unit, unit price |

## Recommended UX

1. User uploads contract PDF/images in the existing "合同附件" field.
2. A new button appears: `识别合同并填表`.
3. System opens a side panel showing:
   - extracted fields,
   - confidence,
   - source evidence snippet/page,
   - conflict with existing form values.
4. User checks boxes and clicks `应用到表单`.
5. Existing form fields are filled only for selected fields.
6. User saves draft manually.

## Backend Design

Add a procurement-only extraction endpoint:

```text
POST /api/v2/procurement/orders/contract-extract
```

Request:

```json
{
  "fileIds": ["FILE-..."],
  "mode": "DRAFT_PREFILL",
  "existingForm": {
    "companyCode": "...",
    "supplierCode": "...",
    "currencyCode": "..."
  }
}
```

Response:

```json
{
  "fields": {
    "contractNo": { "value": "HT-2026-001", "confidence": 0.92, "source": "page 1" },
    "currencyCode": { "value": "CNY", "confidence": 0.88, "source": "page 2" },
    "contractNote": { "value": "付款条件：...", "confidence": 0.74, "source": "summary" }
  },
  "warnings": [
    "供应商名称未能唯一匹配主数据，请人工选择"
  ],
  "rawTextStored": false
}
```

## Processing Pipeline

Phase 1:

1. Verify file ownership and DataScope.
2. Load protected file through backend service only.
3. Extract text:
   - PDF text layer first.
   - Image OCR fallback.
4. Run deterministic parsing for common labels:
   - 合同编号 / 合同号 / Contract No.
   - 甲方 / 乙方 / Supplier / Buyer.
   - 金额 / Total / Amount.
   - 交付日期 / Delivery Date.
   - 付款条件 / Payment Terms.
5. Return candidates with confidence.
6. No auto-save.

Phase 2:

1. Add supplier/company fuzzy matching.
2. Add item line extraction.
3. Add duplicate contract warning.
4. Add audit record for extraction usage.

Phase 3:

1. Optional AI model extraction for complex scanned contracts.
2. Human confirmation remains mandatory.
3. Retain extraction result only as audit summary, not raw private contract text, unless explicitly approved.

## Security Boundary

- Do not expose raw file URLs.
- Do not allow `/uploads` path access.
- Do not bypass attachment ACL.
- Do not write DB during extraction.
- Do not overwrite form fields automatically.
- Do not store full contract text by default.
- Do not send files to external OCR/AI providers without explicit environment-level approval.
- Record operator, fileId list, extracted field names, and apply action in audit logs.

## Frontend Integration

Modify `OrderForm.tsx` after `AttachmentUploader`:

- Add `识别合同并填表` button when `fContractUrls.length > 0`.
- Add loading state `extractingContract`.
- Add `ContractExtractReviewPanel`.
- Add "Apply selected" logic:
  - only apply checked fields,
  - preserve user edits unless user confirms overwrite,
  - show warning for low-confidence fields.

## Implementation Phases

### P0: Approval selection expansion

Implemented separately for procurement request/order/payment submit flows.

### P1: Extraction dry-run API

- Add backend endpoint.
- Support protected file references.
- Return deterministic extraction result.
- No DB write.
- No external AI.

### P2: Frontend review panel

- Add button and result panel.
- Allow selective field application.
- No silent overwrite.

### P3: Supplier/company matching

- Match extracted names against active master data.
- Low confidence requires manual selection.

### P4: Optional advanced OCR/AI

- Only after security and cost approval.
- Must support redaction and audit.

## Validation

- API typecheck.
- Web typecheck.
- Upload PDF and image smoke.
- Contract extraction endpoint returns no raw URL.
- Form apply does not save until user clicks save.
- Existing contract upload remains compatible.
- No DB write in extraction dry-run.

## Recommendation

Proceed with P1/P2 as the next development gate. This will give users immediate value while keeping the extraction safe, auditable, and reversible.
