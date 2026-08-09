# Chanjet House Project Rollout Closure Report — 2026-08-09

## Decision

- Stage: `CHANJET_HOUSE_PROJECT_ALIGNMENT_PRODUCTION_COMPLETE`
- Decision: `GO`
- Production revision: `c54299d9b8fc31c9736a35212e5be65a3761af65`
- Protected API deployment: `31303925835` — success
- Final readonly acceptance: `31304598356` — success
- Final evidence generated at: `2026-08-09T08:53:59.492Z`

## Final production state

| Evidence | Result |
| --- | ---: |
| Chanjet projects | 18 |
| Chanjet house projects | 12 |
| Chanjet departments | 36 |
| Chanjet house-shaped departments | 13 |
| ERP houses | 18 |
| Blockers | 0 |
| Active house projects in category `00` | 12 / 12 |

The rollout changed only Chanjet `PROJECT` records. The production endpoint never
writes users, departments, user-organization bindings, financial facts or
inventory facts. Every write returned `changedExistingDepartment=false`; the
final provider audit retained 36 departments and 13 house-shaped departments.
The deployment Phase C evidence before rollout retained 34 ERP user-organization
bindings, and the rollout path contains no mutation statement for those tables.

## Exact mapping and execution evidence

| ERP house | Chanjet book | Chanjet project id | Name | Run |
| --- | --- | --- | --- | --- |
| `HOUSE_MS_01` | `3533914511118750` | `3652517887214593` | 1号鸡舍 | `31304169741` |
| `HOUSE_MS_02` | `3533914511118750` | `3650197932874743` | 2号鸡舍 | existing / final readback |
| `HOUSE_MS_03` | `3533914511118750` | `3652519365837859` | 3号鸡舍 | `31304272394` |
| `HOUSE_MS_04` | `3533914511118750` | `3652520034697291` | 4号鸡舍 | `31304302166` |
| `HOUSE_MS_05` | `3533914511118750` | `3652520439587801` | 5号鸡舍 | `31304331046` |
| `HOUSE_MS_06` | `3533914511118750` | `3652521242663394` | 6号鸡舍 | `31304359886` |
| `HOUSE_DP_01` | `3537748712226818` | `3652522316405609` | 1号鸡舍 | `31304399220` |
| `HOUSE_DP_02` | `3537748712226818` | `3652522587067774` | 2号鸡舍 | `31304429863` |
| `HOUSE_DP_03` | `3537748712226818` | `3652523390148892` | 3号鸡舍 | `31304459307` |
| `HOUSE_DP_04` | `3537748712226818` | `3652523792801638` | 4号鸡舍 | `31304490187` |
| `HOUSE_DP_05` | `3537748712226818` | `3652524466113525` | 5号鸡舍 | `31304530044` |
| `HOUSE_DP_06` | `3537748712226818` | `3652525134975987` | 公鸡舍 | `31304558823` |

All eleven new targets were executed serially. Each result passed:

1. exact reviewed book/code/name/category whitelist;
2. ERP `ACTIVE` house and exact farm ownership check;
3. read-before-write collision check;
4. one-item `batchUpsert`;
5. provider detail readback;
6. provider list cardinality and unchanged-existing-project invariant;
7. ERP readonly mirror readback;
8. compensating rollback readiness.

## Production incident, recovery and permanent guard

The first `HOUSE_MS_01` attempt (`31302621385`) exposed a provider-contract
ambiguity: reusing the category id as `batchUpsert.id` updated the existing
`HOUSE_MS_02` record instead of creating a second project. The queue was stopped
before any other target ran.

- `31302930947` restored `HOUSE_MS_02 / 2号鸡舍` with its original project id.
- `31302979203` verified the exact pre-rollout baseline: 7 projects, one active
  house project, 36 departments and zero blockers.
- PR #38 assigned a unique stable upstream identity to every reviewed house and
  added three hard invariants: a create response may not reuse a pre-write
  project id, project count must increase by exactly one, and all pre-write
  project identities and business relations must remain unchanged.
- If any invariant fails, the endpoint restores the overwritten record's
  original code, name and status through the same source identity and stops.

The official Chanjet project module documents the standalone add/update paths
and the integration `batchUpsert` contract at:
`https://open.chanjet.com/md/docs/file/apiFile/zplus/zjjcda/project?inline=true`.
The application still receives provider `50111` for standalone project add, so
the authorized integration path remains in use with the stronger production
behavior guard.

## Verification gates

- Targeted Chanjet Jest: 41 / 41 passed.
- Full API Jest: 54 suites / 474 tests passed.
- Operations tests: 113 / 113 passed.
- API TypeScript and build: passed.
- Changed-file ESLint: 0 errors; 20 pre-existing controller warnings.
- W5 closeout with explicit security/freeze approval: 20 / 20 passed.
- PR #38 functional CI: all passed; protected-file static gate was intentionally
  overridden only after the explicit approval record and local W5 pass.
- Production health after deployment: API `OK`, database connected, no JWT fallback.

## Evidence files

- `docs/ops/runs/chanjet-house-alignment-readonly-latest.json`
- `docs/ops/runs/chanjet-house-alignment-readonly-latest.md`
- GitHub PR #37: rollout whitelist and serial workflow.
- GitHub PR #38: unique source identity, overwrite detection and original-value rollback.

## Closure

The house cost-object alignment line is complete. No further house project write
is pending. Cash accounts, product permissions, reconciliation cleanup and other
Chanjet work remain separate Gates and are not implicitly approved by this
closure.
