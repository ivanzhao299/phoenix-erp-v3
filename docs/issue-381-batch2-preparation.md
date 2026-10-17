# Issue #381 — Batch 2 preparation (2026-10-17)

Base main: `4930b6178efe94325945610191f1234f898afb20`.

Merged main into the original PR branch without rewriting history. The zh/en/lo conflicts were resolved key by key; values introduced by main (#386 outbound types) and this PR (inbound feedback) were retained. Both compatibility fixes described in `issue-381-compatibility-backport.md` remain: replay returns each original batch identity/quantity, and only successfully saved shifts proceed to inbound.

Added an opt-in real PostgreSQL fixture test for original-batch replay, five concurrent retries, mismatched retry rejection, transaction rollback on a ledger failure, and existing inventory/grade/SKU/company/warehouse preservation. It accepts only a loopback `issue381_fixture` database with an explicit matching ownership marker, never runs application migrations, and uses real inbound/inventory/ownership services. Browser regression covers first/second/both/neither shift saved, with all API traffic intercepted.

Validation on this updated branch: API/Web typecheck PASS; inbound/inventory/farm unit tests 43 PASS; PostgreSQL fixture 5 PASS; browser 4 PASS; changed-file lint PASS (existing debt unchanged); new PG and browser files ESLint PASS. Final Batch 2 combined validation and current-head GitHub checks are recorded separately; these results do not establish frozen/security approval.

No main merge, production connection/deployment, floor change or Chanjet operation authorized or executed. Existing approval labels do not automatically cover this updated HEAD. Keep Draft pending valid approval; intended next state is READY_FOR_MERGE_REVIEW once current-head CI and approval requirements are satisfied.
