# A2 Store Payment Read-only DB Evidence Security Review

Request ID: `STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_RUN`  
Task ID: `STORE-PAYMENT-READ-ONLY-DB-EVIDENCE-A2-REVIEW`  
Agent: `A2-Security-Regression-Gate`  
Generated: `2026-06-23`

## Verdict

**Security conclusion: HOLD**

The read-only DB evidence report is acceptable as a security input, but it does not clear the previous A5 HOLD. The report confirms no secret output and no write action, but it also proves or records release-blocking gaps: Store Payment tables are absent, menu codes and role grants are absent, pilot store/user scope is mismatched or unproven, and protected proof/QR attachment access is unproven.

**A3 Backend Gate may not open for implementation.** It may only open for read-only checklists, design review, or security test planning.

**A4 Frontend Gate may not open for implementation.** It may only open for planning that does not assume live account data, grants, store scope, or attachment preview/download readiness.

## Execution Guard Evidence

| Check | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| `git branch --show-current` | `w5-a2-security-regression-gate` |
| Initial `git status --short` | clean |
| Recent HEAD | `f15cd656 docs(ops): record baseline lifecycle report` |

No business code was modified. No `apps/api/**` or `apps/web/**` file was modified. No migration, schema/entity/table/column change, DB write, deploy, push, or task-board update was performed.

## Reviewed Evidence

Primary source:

- `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`

Narrow security scans:

- Secret-pattern scan against the source report found only the report's own `Secrets printed | No`, `Password output | None`, and authorization heading text.
- This A2 task did not execute database commands, migrations, deployment commands, or production writes.

## Findings

### A2-RO-01: Source Report Does Not Leak Secrets

Severity: **Low / pass**

Evidence:

- The source report states `Secrets printed | No`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:29`.
- The DB connection section is sanitized and records `Password output | None`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:43`.
- The report includes database name, local DB user, host, and port only: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:39`.

Required remediation:

- None for the reviewed report.
- Continue excluding passwords, bearer tokens, cookies, raw signed URLs, and raw attachment storage paths from future evidence artifacts.

Release impact:

- No independent security hold from secret exposure.

### A2-RO-02: DB Evidence Boundary Is Read-only

Severity: **Low / pass**

Evidence:

- The report states the run executed only `SELECT` and catalog queries inside `BEGIN READ ONLY` transactions: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:13`.
- The report shows the query boundary as `BEGIN READ ONLY; SELECT ...; COMMIT;`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:57`.
- The report explicitly states no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, `ALTER`, `DROP`, migration command, seed command, reset, cleanup, or deploy command was executed: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:63`.

Required remediation:

- Keep the next evidence collection under `BEGIN READ ONLY`.
- Any migration execution, menu seed, role grant seed, or pilot data seed requires a separate approved gate.

Release impact:

- The report is acceptable as read-only evidence. It does not itself alter release state.

### A2-RO-03: RBAC Readiness Is Negative

Severity: **High / release blocker**

Evidence:

- The target DB is missing `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, `MENU_STORE_PAYMENT_VOID`, and `MENU_STORE_PAYMENT_EXPORT`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:181`.
- Role grants for Store Payment menu codes are missing: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:186`.
- The report records static endpoint permission design, but not live DB authorization readiness: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:188`.

Required remediation:

- Provide separately approved menu/role seed design and execution evidence.
- Re-run read-only DB proof for `sys_menu` and `sys_role_menu_permission` showing the exact Store Payment menu codes and grants by role.

Release impact:

- A5 HOLD cannot be cleared.
- A3/A4 implementation gates remain closed because UI/API enablement without menu grants risks inaccessible or incorrectly authorized flows.

### A2-RO-04: DataScope / Store Scope Readiness Is Unproven

Severity: **High / release blocker**

Evidence:

- The pilot store `STORE-VTE-001 / 万象直营店` exists and is active: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:92`.
- The store maps to `COMP-LAO-AGRI` in `sys_organizations`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:103`.
- Test users are scoped to `ST-VTE-001`, while the pilot store is `STORE-VTE-001`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:163`.
- The report concludes this namespace mismatch prevents proving cashier/store-manager Store Payment rules: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:173`.

Required remediation:

- Provide read-only DB evidence that pilot cashier and store manager users are active, carry the intended roles, and resolve to the exact same store-code namespace used by Store Payment accounts and records.
- Decide whether the pilot namespace is `STORE-VTE-001` or `ST-VTE-001`, then align users, org scope, and Store Payment rows before reopening A5.

Release impact:

- A5 HOLD cannot be cleared because a user could be denied valid pilot access or scoped to the wrong store.

### A2-RO-05: Attachment Proof / QR ACL Readiness Is Not Proven

Severity: **High if preview/download is enabled; Medium if preview/download is deferred**

Evidence:

- Attachment/upload table candidates were not found by the DB scan: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:82`.
- `store_payment_accounts.qr_attachment_id` and `store_payment_records.proof_attachment_id` are not queryable because the tables are missing: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:208`.
- Protected preview/download DB proof is not proven: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:210`.
- The report keeps attachment readiness on `HOLD`: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:214`.

Required remediation:

- Before enabling preview/download, prove a protected attachment endpoint enforces Store Payment RBAC plus the same store/finance/admin scope as the owning account or record.
- If this is deferred, UI/API must not expose raw attachment IDs, raw storage paths, public URLs, or usable preview/download links.

Release impact:

- If proof/QR preview is required for pilot, HOLD remains.
- If preview/download is explicitly disabled, this can become a documented pilot condition after the table/menu/scope blockers are cleared.

### A2-RO-06: Store Payment DB Readiness Is Negative

Severity: **High / release blocker**

Evidence:

- `store_payment_accounts` and `store_payment_records` are missing in the target DB: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:75`.
- Store Payment table columns, constraints, and indexes are absent in the target DB: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:130`.
- Pilot Store Payment account rows cannot be queried because the account table is missing: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:150`.
- The report records that A5 HOLD is not cleared: `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md:218`.

Required remediation:

- Use a separate approved migration gate for `1782041418112-CreateStorePaymentTables.ts`.
- After approved execution, re-run read-only evidence for table existence, constraints/indexes, active pilot account rows, status distribution, and proof attachment population.

Release impact:

- A5 HOLD cannot be cleared.
- A3/A4 implementation gates remain closed because the target DB cannot support the Store Payment runtime path.

## Gate Decision

| Gate | Decision | Security rationale |
| --- | --- | --- |
| A5 HOLD clearance | `HOLD` | Current evidence is read-only and sanitized, but release blockers remain. |
| A3 Backend Gate | `HOLD` | May not open for implementation until DB tables, menu grants, pilot account rows, user scope, and attachment policy are proven or separately gated. |
| A4 Frontend Gate | `HOLD` | May not open for implementation until A3/A5 readiness exists; frontend must not assume protected attachment preview or live Store Payment data. |
| Migration Gate | `HOLD / separate approval required` | This task did not execute and did not authorize migration. |

## Conditions Required To Reconsider HOLD

1. Read-only DB proof that `store_payment_accounts` and `store_payment_records` exist with expected constraints and indexes.
2. At least one active Store Payment account row for `STORE-VTE-001` and `COMP-LAO-AGRI`, or an approved correction to the pilot company/store mapping.
3. Store Payment menu rows and role grants exist for account, record, confirm/reject, void, and the approved export policy.
4. Pilot cashier and store manager users are active and scoped to the same store code used by Store Payment records.
5. Proof/QR attachment preview/download is protected by authenticated RBAC plus scope, or explicitly disabled with no raw identifiers/URLs exposed.
6. Follow-up evidence remains read-only and contains no secrets.

## Final Conclusion

**HOLD.**

The read-only DB evidence report is security-acceptable as an evidence artifact. It confirms no database write, migration, deploy, push, business-code change, or secret exposure. It also confirms enough negative readiness evidence that A5 HOLD cannot be cleared from a security perspective.
