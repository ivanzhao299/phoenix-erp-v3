# Chanjet HOLD Precision Audit Production Report

## Result

- Decision: `GO_WITH_CONDITIONS`
- Production audit: `PASS`
- Input HOLD rows: `107`
- Genuine unresolved HOLD: `2`
- Audit hash: `781f6ed00984faf54e841512cf82e3e3886025ff1a6b6071df669ac009d10dcd`
- Production revision: `81a191b8`
- Deployment run: `30871812793`
- Chanjet writes in this Gate: `0`
- ERP business-fact writes in this Gate: `0`

The former 107-row HOLD total was not 107 equally ambiguous business decisions.
Production evidence now separates source corrections, ERP master creation,
mapping policy, intentional non-mapping and genuinely incomplete evidence.

## Production Classification

| Disposition | Count | Meaning | Current action |
| --- | ---: | --- | --- |
| `ERP_AUTO_APPLY_ELIGIBLE` | 29 | Product identity, business domain and runtime UOM evidence are deterministic | May enter an ERP-only master-data apply Gate; do not import finance/inventory facts |
| `ERP_POLICY_REQUIRED` | 63 | Valid source identity requires an ERP house/workshop/location or product-specific UOM policy | Generate and verify mapping policy before changing status |
| `NO_ERP_MASTER_REQUIRED` | 4 | Accounting grouping/payment semantics are not ERP transaction masters | Preserve source identity; close as intentional non-mapping |
| `CHANJET_CHANGE_PROPOSAL` | 3 | High-confidence source name correction | Explicit user approval, one-row canary, dual readback and rollback required |
| `CROSS_SYSTEM_REVIEW_REQUIRED` | 6 | Identity is real but target meaning is not safe to infer | Keep blocked until exact business identity evidence exists |
| `KEEP_HOLD` | 2 | Runtime use/UOM evidence is absent | Keep HOLD; do not guess |

### By source type

- Cash accounts: 1 intentional payment-method non-mapping; 1 incomplete bank identity.
- Departments: 11 ERP operational policies; 3 accounting grouping nodes; 3 ambiguous/wrong-domain identities.
- Products: 29 ERP-auto candidates; 16 ERP policies; 3 source correction proposals; 2 genuine HOLD.
- UOM: 22 product-specific or physical conversion policies; no global package-unit guess.
- Warehouses: 14 house/location bridge policies; 2 ambiguous generic warehouse identities.

## Genuine HOLD

| Mapping ID | Book | Source name | Missing evidence |
| --- | --- | --- | --- |
| `307000` | `3533914511118750` | 地美 | No stable runtime row/UOM evidence |
| `307056` | `3537748712226818` | 马利克 | No stable runtime row/UOM evidence |

These names are not auto-created merely because their likely veterinary domain
is recognizable. A source record, stable UOM or referenced document is still
required.

## Chanjet Optimization Approval Matrix

No proposal below has been executed.

| Priority | Mapping ID | Book | Current value | Proposed value | Risk | Reason | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Canary | `307052` | `3537748712226818` | 阿莫西林可溶性分 | 阿莫西林可溶性粉 | LOW | Correct pharmaceutical dosage-form wording | Restore 阿莫西林可溶性分 |
| 2 | `307079` | `3537748712226818` | 新谓康 | 新胃康 | LOW | Same source dataset already contains the canonical homophone spelling | Restore 新谓康 |
| 3 | `307088` | `3537748712226818` | 治梅净 | 治霉净 | LOW | Same source dataset contains the canonical product-purpose spelling | Restore 治梅净 |

Execution contract for every row:

1. User approves the exact mapping ID, book, old value and new value.
2. Read the current provider value immediately before mutation; mismatch means HOLD.
3. Execute one source row only through the official API contract.
4. Read back through both official source API and ERP read-only mirror.
5. On mismatch, use the recorded old value as compensating rollback and HOLD.
6. Never bundle the three corrections into one unobservable bulk write.

## Cross-System Review Items

- `总部人民币银行`: account number/opening bank are placeholders; do not create a real ERP bank account.
- `万象仓库直营店`, `波利坎赛合作店`: require address, company and store identity evidence before alias mapping.
- `借款`: business type incorrectly represented as a department; references must be audited before retirement/remapping.
- `总仓`, `总库`: generic warehouse names require source-document usage evidence before merge or aliasing.

## Defect Found By Production Readback

The first production request exposed `bigint = uuid` because
`chanjet_master_mapping.id` is a `bigserial` while the new lookup used
`uuid[]`. Mock-only tests had hidden the schema contract. The query now uses
`bigint[]`, fixtures use numeric IDs, and a regression assertion locks the
production type. A second refinement recognized evidenced veterinary trade
names and corrected generic UOM guidance.

## Verification

- Chanjet module tests: `13/13` suites, `205/205` tests PASS.
- API TypeScript: PASS.
- Web TypeScript: PASS.
- CI migrations, entity drift and five regression domains: PASS.
- Production deployment `30871812793`: PASS.
- Production precision endpoint: HTTP 200, 107/107 classified.
- Raw evidence: `docs/ops/runs/chanjet-hold-precision-audit-20260804.json`.

## Next Gate

1. Apply the 29 deterministic candidates to ERP master data only, with target
   verification and zero financial/inventory fact mutation.
2. Close four intentional non-mappings and materialize the 63 mapping policies.
3. Keep six cross-system reviews and two genuine HOLD rows blocked.
4. Await explicit approval for one exact Chanjet source correction canary.

