# BUG-20260707-0006 Orchestrator Supplemental Release Evidence

Date: 2026-07-08

Bug: 近期日报记录下的淘汰原因不显示中文

## Scope

This supplemental evidence was produced from the main worktree after the A7 report identified missing validation evidence. The selected production fix is backend read-side localization for `brd_daily_logs`, preserving raw codes in additive `*_code` fields while returning Chinese labels for `culling_reason` and `mortality_reason`.

## Validation Results

| Check | Result |
| --- | --- |
| API targeted Jest | PASS: 2 suites, 8 tests |
| API TypeScript | PASS |
| Web TypeScript | PASS |
| W5 closeout gate | PASS before A6/A7 artifact commit |
| Production health after deploy | PASS: `/api/health` returned `status=OK`, DB connected |

## Commands Executed

```bash
cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts src/modules/generic-crud/generic-crud.controller.spec.ts src/modules/farm/farm.service.spec.ts --runInBand
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
curl -fsS https://erp.eggslao.com/api/health
```

## Remaining Evidence Gap

Browser UAT for `/breeding/daily` is still not recorded in a screenshot/video artifact. For queue correctness, A7 is closed as `HOLD` with evidence rather than left `running`. The queue can continue, but a later UAT task should capture the user-facing table after authenticated access.

## Safety

- No migration executed.
- No database write executed by this supplemental validation.
- No production configuration changed.
- No backend/frontend code changed by this supplemental validation.

## Conclusion

GO WITH CONDITIONS for the already deployed backend read-side fix; A7 remains HOLD until browser UAT evidence is attached.
