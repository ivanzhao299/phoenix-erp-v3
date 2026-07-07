# BUG-20260707-0006 A6 Staging Deploy Runbook

Date: 2026-07-08

Agent: A6-Staging-Deploy-Runbook

Route: `/breeding/daily`

Issue: 近期日报记录下的淘汰原因不显示中文

Required behavior: the recent daily report table and exported report must display culling reason labels in Chinese, not raw codes such as `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, or `AGE`.

## 1. Result

A6 result: PASS WITH CONDITIONS.

Deployment execution decision: HOLD.

Reason: staging runbook, health checks, and rollback path are defined, but this document does not approve staging deployment, production deployment, database writes, migration execution, push, or merge. A4 reports the frontend repair is complete by static check, while Web typecheck and browser UAT remain blocked by missing local dependencies in the A4 worktree. Final release must remain HOLD until A1/A4/A7 complete validation on a dependency-complete environment.

## 2. Dry-Run / Diagnosis Evidence

Execution prechecks:

| Check | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` |
| `git branch --show-current` | `w5-a6-staging-deploy-runbook` |
| initial `git status --short` | clean |
| current HEAD during diagnosis | `c2e587ee docs(ops): record baseline lifecycle report` |

Read-only diagnosis:

1. A4 report exists at `docs/ops/BUG-20260707-0006_A4_FRONTEND_UAT_REPORT.md`.
2. The route page is `apps/web/src/app/(admin)/breeding/daily/page.tsx`.
3. The page loads dictionary labels through `useDictOptions('BRD_CULLING_REASON')`.
4. The page contains fallback Chinese labels for observed historical codes:
   - `LOW_PRODUCTION` -> `产蛋率低`
   - `SICKNESS` -> `患病`
   - `AGE` -> `老龄`
   - `INJURY` -> `严重外伤`
   - `OTHER` -> `其它`
5. The recent report table calls `cullingReasonLabel(r.cullingReason)` instead of rendering the raw value.
6. CSV export calls `cullingReasonLabel(r.elimReason)` for the culling reason column.
7. No RBAC, DataScope, audit, attachment ACL, API route, schema, entity, migration, or database path change was identified for A6 scope.
8. Bug screenshot attachment was not locally available; if screenshot evidence is required for release, HOLD until evidence sync or browser UAT capture is attached.

No production action, database write, migration, push, merge, task-board update, or deployment was performed.

## 3. Environment Assumptions

| Environment | Assumption |
| --- | --- |
| local / Codex | Used only for read-only diagnosis and docs/ops report generation. |
| CI | Must run A1-owned validation before release GO. |
| staging | Must be isolated from production DB, file storage, secrets, and URL. |
| production | Remains HOLD; no production deployment is approved by this runbook. |

Staging assumptions before execution:

1. Staging URL, API URL, and runtime secrets are approved separately.
2. Staging DB is not production and has a current backup before any smoke that writes data.
3. Staging user has expected `MENU_FARM_DAILY:V` access for viewing `/breeding/daily`.
4. Staging master data contains at least one active hen house with recent daily report records.
5. Staging `sys_dict` contains active `BRD_CULLING_REASON` entries, or the known historical fallback codes are enough for the candidate smoke.
6. No migration is expected for this bug because the fix is frontend presentation only.
7. No valid-submit smoke is required for this bug unless a separate owner approves staging DB writes.

## 4. Staging Entry Criteria

Do not start staging deployment until all are true:

1. Target commit hash is recorded.
2. A1 validation has run on the target commit.
3. A4 Web typecheck has passed or its failure is explicitly accepted by the release owner.
4. A4 browser UAT confirms recent records display Chinese labels for at least `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, and `AGE`.
5. A2 confirms no RBAC/DataScope regression is introduced by the final release candidate.
6. A7 records final QA gate for staging.
7. Staging deploy approval is explicitly granted.
8. Staging DB write approval is explicitly granted if any smoke creates or edits a daily report.

## 5. Staging Deployment Steps

These steps are instructions only; they were not executed by A6.

1. Confirm release candidate:
   - Record commit SHA.
   - Confirm changed files are limited to approved repair scope plus docs/ops evidence.
   - Confirm no migration/schema/entity/table/column changes are included.
2. Confirm environment isolation:
   - Staging URL differs from production.
   - Staging DB differs from production.
   - Staging file storage differs from production.
   - Production secrets are not used in staging.
3. Deploy candidate through the approved staging workflow or operator runbook.
4. Record deployment evidence:
   - Start/end time.
   - Operator and approver.
   - Commit SHA / image tag.
   - Migration status: `not applicable / not run` for this bug.
5. Run health checks from section 6.
6. Run `/breeding/daily` UAT checks from section 7.
7. Record GO/HOLD/FAIL outcome with screenshots or browser/test logs.

## 6. Health Checks

Required after staging deploy:

| Check | Expected |
| --- | --- |
| API health | `/api/health` returns success. |
| Web health | staging web loads without server error. |
| Auth | staging user can log in and current-user path succeeds. |
| RBAC | user without `MENU_FARM_DAILY:V` cannot view protected daily report content. |
| DataScope | scoped user only sees permitted farm/hen house daily records. |
| Dictionary runtime | `BRD_CULLING_REASON` active labels load without client or API error. |
| Logs | no repeated 5xx, auth bypass, secret leakage, or hydration crash. |
| Migration logs | no migration executed for this bug unless a separate approved release contains unrelated migrations. |

## 7. Route Smoke Plan

Primary route: `/breeding/daily`

Read-only smoke, no DB write expected:

1. Open `/breeding/daily` with a staging user that can view daily report records.
2. Confirm the recent report table is visible.
3. Confirm rows with historical culling reason codes render Chinese labels:
   - `INJURY` displays `严重外伤`
   - `SICKNESS` displays `患病`
   - `LOW_PRODUCTION` displays `产蛋率低`
   - `AGE` displays `老龄`
4. Confirm no raw code is visible in the recent report culling reason column for the known codes above.
5. Use export action if allowed in staging and confirm the exported culling reason column also uses Chinese labels.
6. Capture screenshot or browser log evidence.

Fallback smoke if staging data lacks those codes:

1. Do not write data by default.
2. Use a read-only API or existing staging fixture inventory to identify available daily report rows and culling reason values.
3. If fixture creation is required, HOLD until staging DB write approval and cleanup owner are recorded.

## 8. Rollback Steps

Because this bug requires no migration and no schema change, rollback is code-only unless another release candidate combines additional changes.

Preferred rollback:

1. Stop rollout.
2. Revert the bad release commit with `git revert <bad-sha>`.
3. Run CI checks.
4. Redeploy previous known-good candidate through approved workflow.
5. Re-run health checks and route smoke.

Fast rollback if image tags are available:

1. Identify previous known-good `sha-<commit>` image tag.
2. Redeploy Web image for that tag through the approved staging mechanism.
3. Redeploy API image only if the combined release candidate changed API code.
4. Do not run migrations.
5. Re-run health checks.

Rollback is unclear and must HOLD if:

1. The deployed candidate includes unrelated migrations.
2. The deployed candidate includes schema/entity/table/column changes.
3. The deployed candidate includes data repair scripts or seed changes.
4. The previous known-good commit/image is not recorded.
5. Staging fixture data was written and no cleanup owner is assigned.

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Staging dictionary lacks `BRD_CULLING_REASON` labels | UI may fall back only for known codes, unknown codes may still show raw values | Verify active dictionary entries and retain fallback for observed historical codes. |
| Historical data contains codes outside the fallback set | Some rows may still display raw code | A5/A4 should inventory staging values before GO and add dictionary/fallback through approved repair if needed. |
| Web typecheck remains unrun | Type errors could be missed | A1 must run `cd apps/web && pnpm typecheck` or equivalent on dependency-complete environment. |
| Browser UAT remains unrun | Visual result could differ from static check | A4/A7 must capture `/breeding/daily` screenshot after staging deploy. |
| Candidate includes unrelated changes | Rollback complexity increases | A7 must verify diff scope before GO. |

## 10. HOLD / GO / FAIL Conditions

GO for staging smoke only when:

1. Explicit staging deploy approval exists.
2. A1 required checks are PASS or accepted as documented conditions.
3. A2/A4/A5/A7 required reports are PASS or PASS WITH CONDITIONS without production-blocking findings.
4. `/breeding/daily` recent report culling reasons render Chinese labels for known codes.
5. Exported culling reason values render Chinese labels if export is in release scope.
6. RBAC/DataScope checks remain enforced.
7. Rollback owner and previous known-good commit/image are recorded.

HOLD when:

1. Any approval is missing.
2. Web typecheck or browser UAT is unresolved without accepted condition.
3. Staging target isolation is unclear.
4. Rollback owner or previous known-good SHA is missing.
5. Screenshot/evidence sync is required but unavailable.
6. The candidate contains migration/schema/entity/table/column changes.
7. Staging data lacks coverage for the reported culling reason codes and no approved fixture plan exists.

FAIL when:

1. Recent records still show raw codes such as `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, or `AGE`.
2. Export still shows raw known culling reason codes after export validation is in scope.
3. RBAC or DataScope can be bypassed.
4. Staging deploy accidentally targets production resources.
5. Any production deploy, production DB write, migration execution, push, or merge occurs without separate approval.

## 11. Manual Approvals Required

Before staging execution:

1. Approve target commit SHA.
2. Approve staging deploy.
3. Approve staging environment and secret set.
4. Approve staging DB backup.
5. Approve any staging DB write for fixture creation or positive submit smoke.
6. Approve rollback owner and rollback window.

Before production:

1. A7 final GO decision.
2. Business owner approval.
3. Technical release owner approval.
4. Production backup confirmation.
5. Previous known-good commit/image confirmation.
6. Monitoring owner and observation window.

## 12. Changed Files

Changed by A6:

1. `docs/ops/BUG-20260707-0006_A6_STAGING_DEPLOY_RUNBOOK.md`

Referenced repair evidence from A4:

1. `apps/web/src/app/(admin)/breeding/daily/page.tsx`
2. `docs/ops/BUG-20260707-0006_A4_FRONTEND_UAT_REPORT.md`

## 13. Validation Commands

Commands executed by A6:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
rg --files docs/ops | rg 'BUG-20260707-0006|20260707-0006'
rg -n "cullingReason|BRD_CULLING_REASON|cullingReasonLabel|useDictOptions" 'apps/web/src/app/(admin)/breeding/daily/page.tsx'
sed -n '130,155p' 'apps/web/src/app/(admin)/breeding/daily/page.tsx'
sed -n '408,420p' 'apps/web/src/app/(admin)/breeding/daily/page.tsx'
sed -n '808,830p' 'apps/web/src/app/(admin)/breeding/daily/page.tsx'
test -x apps/web/node_modules/.bin/tsc; printf '%s\n' $?
```

Local dependency check:

```text
apps/web/node_modules/.bin/tsc executable: no
```

Validation still required before release GO:

```bash
cd apps/web && pnpm typecheck
open /breeding/daily on staging and capture browser evidence
```

## 14. Final Decision

PASS WITH CONDITIONS / HOLD.

The staging deploy runbook is ready for review. Deployment is not authorized by this report.
