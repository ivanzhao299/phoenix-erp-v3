# Detached Worker Recovery

| Field | Value |
| --- | --- |
| Task | BUGTASK-20260723-0003-A3 |
| Agent | A3-Backend-Critical-Path |
| Conclusion | HOLD |
| Worker exit | 0 |
| Child waited seconds | n/a |
| Worktree status before recovery | clean |
| Baseline autopilot | REFUSED: no implementation evidence |

## Safety

- Push: No
- Deploy: No
- Migration: No
- DB write: No

An abnormal/detached worker result is never allowed to merge. The task remains HOLD until a fresh worker run produces an owned business diff, a task report, a commit, and an explicit conclusion.
