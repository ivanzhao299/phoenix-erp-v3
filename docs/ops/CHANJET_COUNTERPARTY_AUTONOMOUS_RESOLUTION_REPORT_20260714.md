# Chanjet Counterparty Autonomous Resolution Report

Date: 2026-07-14  
Scope: Chanjet customer/supplier readonly middle-layer mapping  
Decision: **GO** for counterparty resolution; **GO WITH CONDITIONS** for the wider finance alignment lifecycle

## Outcome

The reported queue contained 353 unresolved rows at the earlier baseline. By execution time the readonly mirror had received six additional rows, and the final verification sync received one more row. The system processed the moving production set rather than freezing the old count.

| Metric | Final result |
| --- | ---: |
| Chanjet source rows | 322 |
| Generated role-specific candidates | 411 |
| Exact ERP master mappings | 51 |
| Isolated readonly source identities | 360 |
| Approved mapping coverage | 411 / 411 |
| Live pending | 0 |
| Conflicts | 0 |
| Unknown roles | 0 |
| Candidates requiring human review | 0 |
| Historical wrong-role mappings rejected with audit evidence | 72 |

## Resolution Rules

1. A real ERP master is confirmed only when role and book/company scope are valid and one unique exact code or normalized-name match exists.
2. A supplier without `owner_company_code` is treated as a group-shared master only when the exact match is unique and the master is ACTIVE.
3. An ERP master owned by another company is never cross-company auto-confirmed.
4. When no ERP master exists but Chanjet book, role, ID, code, and name are complete, the system creates a `SOURCE_ONLY` identity in `chanjet_master_mapping`.
5. `SOURCE_ONLY` identities never create or update `sal_customers` or `prc2_suppliers` and never write Chanjet.
6. Duplicate top-scoring candidates remain `CONFLICT`; fuzzy matching remains disabled.

## Historical Residue

Seventy-two records created on 2026-07-03 through 2026-07-05 were classified as CUSTOMER even though the current Chanjet `partyRoleTypeId=100101` identifies them as SUPPLIER. The same external IDs now have approved SUPPLIER mappings.

The cleanup did not delete these records. It changed their review status to `REJECTED` and retained:

- the stale mapping type;
- the current mapping type;
- processing identity and timestamp;
- `writeChanjet=false`;
- `writeErpBusinessTables=false`;
- the role-reclassification reason.

Database evidence after cleanup:

- current CUSTOMER/SUPPLIER `PENDING + PENDING`: 0;
- stale-role records: 72;
- stale-role records rejected with audit evidence: 72;
- approved `SOURCE_ONLY`: 360;
- all 360 source-only records explicitly declare no Chanjet write and no ERP business-table write.

## Production Verification

The final readonly alignment cycle ran in production from `2026-07-14T16:14:21.018Z` to `2026-07-14T16:15:04.383Z`.

| Check | Result |
| --- | --- |
| Readonly mirror decision | GO |
| Mirror attempts | 1 |
| Target results | 46 |
| Mirror failures | 0 |
| Mapping errors | 0 |
| Mapping decision after refresh | GO |
| Chanjet write | false |
| ERP business-table write | false |
| Wider production readiness | GO WITH CONDITIONS |

The wider lifecycle remains conditional because finance-card authority coverage is still 0% and the latest readonly sync success metric is 98%. These conditions do not reopen the counterparty queue.

## Code, Migration, And Deployment

Commits:

- `80b5fd3e` - readonly source identity support;
- `98c126bb` - database check constraint permits `SOURCE_ONLY`;
- `04d27e9b` - deterministic exact mapping confirmation;
- `120f00b5` - active group-shared supplier confirmation;
- `740236d4` - stale role mapping audit rejection.

Successful deployment runs:

- `29343453328`
- `29345335108`
- `29347261401`
- `29348139947`
- `29349469535`

Validation:

- API TypeScript: PASS;
- Chanjet unit tests: 23 / 23 PASS;
- W5 closeout gates: 19 / 19 PASS with the required freeze/security touch declarations;
- AI Delivery CI Build: PASS;
- CI Web Unit Tests: PASS;
- CI/CD Build & Deploy: PASS.

The independent AI Delivery CI Security workflow remains red only on the pre-existing repository-wide i18n hardcoded-literal gate: 3,251 findings in 176 files. No Chanjet security or freeze gate failed.

## Guardrails

- Chanjet create/update/delete: **not executed**.
- Voucher push: **disabled**.
- ERP customer/supplier business-table write: **not executed**.
- Fuzzy auto-match: **disabled**.
- Production deployment: **completed**.
- Production schema migration: only the reviewed `SOURCE_ONLY` check-constraint migration was executed; no business DML was included.

## Next Gate

`CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`

Promote only metrics whose readonly semantics and reconciliation evidence are already authoritative. Chanjet writeback remains blocked behind a separate explicit approval Gate.
