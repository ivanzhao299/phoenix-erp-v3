# Bug Intake Worktree Quarantine

| Field | Value |
| --- | --- |
| Task | BUGTASK-20260711-0002-A3 |
| Trigger task | BUGTASK-20260711-0005-A3 |
| Agent | A3-Backend-Critical-Path |
| Original worktree | `/Users/mac/phoenix-erp-worktrees/bug-intake-a3` |
| Quarantine worktree | `/Users/mac/phoenix-erp-worktrees/bug-intake-quarantine/BUGTASK-20260711-0002-A3-20260712115119` |
| Quarantine branch | `codex/quarantine/bugtask-20260711-0002-a3-20260712115119` |
| Clean execution slot recreated | Yes |

## Preserved status

```text
M apps/api/src/modules/farm/farm-medicine.service.spec.ts
 M apps/api/src/modules/farm/farm-medicine.service.ts
?? docs/ops/runs/BUGTASK-20260711-0002-A3-backend-report.md
```

## Decision

HOLD. The incomplete files are preserved for diagnosis. They were not committed, merged, pushed, or deployed. A fresh dedicated worktree is created from `origin/main` only when every preservation step succeeds.


