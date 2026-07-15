# Bug Intake Worktree Quarantine

| Field | Value |
| --- | --- |
| Task | BUGTASK-20260715-0003-A4 |
| Trigger task | BUGTASK-20260715-0003-A4 |
| Agent | A4-Frontend-UAT-Smoke |
| Original worktree | `/Users/mac/phoenix-erp-worktrees/bug-intake-a4` |
| Quarantine worktree | `/Users/mac/phoenix-erp-worktrees/bug-intake-quarantine/BUGTASK-20260715-0003-A4-20260715074417` |
| Quarantine branch | `codex/quarantine/bugtask-20260715-0003-a4-20260715074417` |
| Clean execution slot recreated | Yes |

## Preserved status

```text
M apps/web/src/app/(admin)/breeding/page.tsx
 M apps/web/src/app/(admin)/home/page.tsx
 M apps/web/src/lib/breeding-overview-metrics.test.ts
 M apps/web/src/lib/breeding-overview-metrics.ts
 M apps/web/src/lib/home-farm-kpi.test.ts
 M apps/web/src/lib/home-farm-kpi.ts
?? docs/ops/runs/bug-20260715-0001-a4-frontend-uat-smoke.md
```

## Decision

HOLD. The incomplete files are preserved for diagnosis. They were not committed, merged, pushed, or deployed. A fresh dedicated worktree is created from `origin/main` only when every preservation step succeeds.


