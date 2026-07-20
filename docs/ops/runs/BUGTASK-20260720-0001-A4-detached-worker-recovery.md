# Detached Worker Recovery

| Field | Value |
| --- | --- |
| Task | BUGTASK-20260720-0001-A4 |
| Agent | A4-Frontend-UAT-Smoke |
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
