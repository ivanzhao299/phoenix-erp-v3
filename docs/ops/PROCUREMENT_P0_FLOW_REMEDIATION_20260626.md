# Procurement P0 Flow Remediation - 2026-06-26

## Scope

This remediation targets the high-frequency procurement flow reported by users:

- Purchase material quick-create failed from the procurement material picker.
- Purchase request contract OCR did not write back into the existing request/detail fields.
- Purchase request approval submit could not clearly select the next approver because the request flow used the order menu code.

## Changes

### Material Quick Create

- Added `POST /api/lookup/materials/quick`.
- Kept material lookup read-only under `/api/lookup/materials`.
- Quick create now requires procurement or material master permissions:
  - `MENU_PRC2_REQUEST:C`
  - `MENU_PRC2_ORDER:C`
  - `MENU_MD_MATERIAL:C`
  - `MENU_MASTER_DATA:C`
- The endpoint reuses the master-data runtime quick-create path, including:
  - `MAT` code generation.
  - master-data validation.
  - audit logging.
  - `ACTIVE` operational material creation.

### Material Picker

- Updated the material picker to call `/api/lookup/materials/quick`.
- Fixed normalization for `materialType` returned by lookup APIs.
- Newly created materials are inserted into the local picker list immediately.

### Purchase Request OCR Autofill

- Added multi-attachment upload to the purchase request form.
- Added contract OCR review panel using the shared `DocumentAutofillPanel`.
- OCR suggestions are not applied automatically.
- The user must select suggestions and click confirm before fields are written.
- Suggestions are written back to existing form fields only:
  - request subject
  - currency
  - expected arrival date
  - remark / contract note
  - purchase detail rows
- The UI does not add separate generated text boxes for extracted contract fields.

### Approval Submit Alignment

- Purchase request submit candidate lookup now uses `MENU_PRC2_REQUEST`.
- Purchase request approval engine startup now uses `MENU_PRC2_REQUEST`.
- Purchase order approval remains on `MENU_PRC2_ORDER`.

## Guardrails

- No DB migration was added.
- No production DB write was executed by this remediation.
- No deployment command was executed locally.
- No non-procurement business module was changed.

## Verification

- API typecheck: PASS.
- Web typecheck: PASS.
- W5 closeout gate: pending at report creation, executed before commit.

## Follow-Up

Next remediation batch should continue with:

1. Global approval UX consistency across PC and mobile.
2. Procurement request/order field density and visual polish.
3. Permission/menu gate audit for high-frequency procurement and finance flows.
4. Legacy attachment entry consolidation onto protected upload/file metadata paths.
