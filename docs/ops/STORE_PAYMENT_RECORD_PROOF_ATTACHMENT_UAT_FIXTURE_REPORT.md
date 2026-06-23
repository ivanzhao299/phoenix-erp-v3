# Store Payment Record Proof Attachment UAT Fixture Report

Date: 2026-06-23

## 1. DB Write

DB write executed: yes, limited to local `phoenix_erp` UAT fixture data.

Written scope:

1. One `store_payment_records` UAT row.
2. One `file_metadata` UAT row.

No remote production DB write was executed.

## 2. Environment

| Check | Result |
| --- | --- |
| Target database | `phoenix_erp` |
| DB user | `mac` |
| Production | No |
| `store_payment_records` exists | PASS |
| `file_metadata` exists | PASS |
| STORE-VTE-001 / 万象直营店 | PASS from prior readiness |
| COMP-LAO-AGRI mapping | PASS from prior readiness |

Evidence:

- `docs/ops/runs/store-payment-record-proof-db-evidence.json`

## 3. Proof UAT File

| Field | Value |
| --- | --- |
| file_id | `FILE-SP-PROOF-UAT-001` |
| original_name | `store-payment-proof-record-uat.pdf` |
| mime_type | `application/pdf` |
| content | UAT only; no real payment proof; no real customer data |

The local file is used only for this UAT fixture and is not a real bank, QR, customer, or payment document.

## 4. Store Payment Record

| Field | Value |
| --- | --- |
| record id | `1` |
| payment_no | `SP-UAT-PROOF-001` |
| store_code | `STORE-VTE-001` |
| company_code | `COMP-LAO-AGRI` |
| payment_account_id | `1` |
| amount | `1.00` |
| currency | `LAK` |
| payment_method | `UAT` |
| status | `PENDING` |
| proof_attachment_id | `FILE-SP-PROOF-UAT-001` |
| submitted_by | `codex_uat` |
| remark | `UAT only / no real business data / no real payment proof` |

Inserted `store_payment_records`: 1.

## 5. File Metadata

| Field | Value |
| --- | --- |
| file_id | `FILE-SP-PROOF-UAT-001` |
| module_code | `STORE_PAYMENT` |
| owner_type | `STORE_PAYMENT_RECORD` |
| owner_id | `1` |
| company_code | `COMP-LAO-AGRI` |
| store_code | `STORE-VTE-001` |
| status | `ACTIVE` |
| visibility | `PROTECTED` |
| rawUrl | not stored / not returned |

Inserted `file_metadata`: 1.

## 6. Endpoint Smoke

Evidence:

- `docs/ops/runs/store-payment-record-proof-endpoint-smoke.json`

| Endpoint | Result |
| --- | --- |
| `/store-payment/attachments/FILE-SP-PROOF-UAT-001/status` | PASS |
| `/store-payment/attachments/FILE-SP-PROOF-UAT-001/preview` | PASS, HTTP 200 protected PDF streaming |
| `/store-payment/attachments/FILE-SP-PROOF-UAT-001/download` | PASS, HTTP 200 protected PDF streaming |
| no-auth status access | PASS, 401 |
| missing file status access | PASS, 404 |

Security:

- rawUrl returned: no.
- `/uploads` exposed: no.
- `storage_path` exposed: no.

## 7. Page-Level UAT Smoke

Evidence:

- `docs/ops/runs/store-payment-record-proof-page-smoke.json`

| Check | Result |
| --- | --- |
| Record list shows `SP-UAT-PROOF-001` | PASS |
| Detail drawer shows proof attachment state | PASS |
| Status UI uses protected proof status proxy | PASS |
| Preview button enabled only after allowed status | PASS |
| Download button enabled only after allowed status | PASS |
| Preview uses protected endpoint | PASS |
| Download uses protected endpoint | PASS |
| rawUrl displayed | NO |
| `/uploads` used | NO |
| `storage_path` leaked | NO |
| fail-closed evidence | PASS |

Note: the page detail status path uses `/store-payment/records/1/proof-attachment` because the list DTO does not expose `proofAttachmentId`; the direct `/store-payment/attachments/FILE-SP-PROOF-UAT-001/status` endpoint was verified in endpoint smoke.

## 8. A2 Review

Conclusion: PASS WITH CONDITIONS.

Checks:

1. proof attachment rawUrl exposure: no.
2. `/uploads` exposure: no.
3. `storage_path` leak: no.
4. RBAC bypass: no evidence.
5. DataScope bypass: no evidence.
6. owner_type / owner_id: `STORE_PAYMENT_RECORD:1`, correct.
7. denied / missing / disabled fail-closed: pass for no-auth and missing.
8. A6 staging runbook: allowed with conditions.

Conditions:

- Local UAT data must not be copied to production.
- Production pilot requires A6 and A7 Gates.

## 9. A1 Verification

Conclusion: PASS WITH CONDITIONS.

Checks:

1. API typecheck: PASS.
2. Web typecheck: PASS.
3. endpoint smoke: PASS.
4. page UAT smoke: PASS.
5. W5 closeout gate: PASS.
6. deploy: no.
7. push: no.
8. runtime memory update: complete.

Condition:

- API development startup emitted existing bootstrap / seed logs; this Gate did not execute production deployment, migration, cleanup, reset, or push.

## 10. A5 Review

Conclusion: GO WITH CONDITIONS.

Readiness:

1. Record proof fixture exists.
2. `STORE-VTE-001` and `COMP-LAO-AGRI` are consistent across record and metadata.
3. `file_metadata.owner_id` matches `store_payment_records.id`.
4. `proof_attachment_id` matches `file_metadata.file_id`.
5. Store Payment can proceed to A6 staging runbook Gate with local UAT caveats.

## 11. Runtime Memory

Runtime Memory updated:

- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

New stage:

- `STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_VERIFIED`

## 12. Boundaries

| Boundary | Result |
| --- | --- |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Push executed | No |
| Cleanup/reset executed | No |
| Production command executed | No |
| Remote production DB write | No |
| Destructive DB operation | No |

## 13. Rollback / Recovery

If this local UAT fixture must be removed later, use a separate approved local cleanup Gate only for:

1. `file_metadata.file_id = 'FILE-SP-PROOF-UAT-001'`.
2. `store_payment_records.payment_no = 'SP-UAT-PROOF-001'`.
3. Local file `store-payment-proof-record-uat.pdf`.

No automatic cleanup was executed in this Gate.

## 14. Conclusion

Current conclusion: GO WITH CONDITIONS.

Next recommended Gates:

1. `A6_STAGING_DEPLOY_RUNBOOK`
2. `A7_FINAL_QA_GATE`
3. `STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION`
