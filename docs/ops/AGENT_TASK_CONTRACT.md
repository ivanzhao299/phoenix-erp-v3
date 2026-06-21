# Agent Task Contract

> Purpose: every Agent task must be executable, reviewable, and reversible. Fill this contract before BUILD or VERIFY work starts.

## Task Header

| Field | Value |
| --- | --- |
| 任务编号 |  |
| 任务来源 | Intake / Requirement / Incident / Release Candidate |
| 当前模式 |  |
| Assigned Agent |  |
| Branch |  |
| Risk level | Low / Medium / High / Critical |
| 任务目标 |  |

## Inputs

| Input file or source | Purpose |
| --- | --- |
|  |  |

## Scope Contract

| Field | Value |
| --- | --- |
| 允许改动范围 |  |
| 禁止改动范围 |  |
| Frozen items nearby |  |
| 是否触碰冻结项 | No |
| 是否阻断上线 | Yes/No |

## Expected Output

| Output | Required evidence |
| --- | --- |
| Code or docs changes | File list and summary |
| Verification result | Commands and outcomes |
| Risk assessment | PASS / PASS WITH CI CONDITIONS / HOLD / ROLLBACK |
| Open blockers | Owner and next action |

## Verification

| 验收命令 | Required | Result |
| --- | --- | --- |
|  | Yes/No |  |

## 验收标准 / Acceptance Standards

| Area | Standard |
| --- | --- |
| Functional |  |
| Security |  |
| Data |  |
| UI/UAT |  |
| Deployment |  |
| Rollback |  |

## Rollback

| Field | Value |
| --- | --- |
| Rollback method | Revert commit / disable flag / redeploy previous image / data restore plan |
| Rollback owner |  |
| Rollback validation |  |

## PR 要求 / PR Requirements

| Field | Value |
| --- | --- |
| PR title |  |
| PR template completed | Yes/No |
| Required reviewers |  |
| Required CI checks |  |
| Merge restriction | No direct main merge |

## 最终结论格式 / Final Conclusion Format

```text
Agent:
Task ID:
Mode:
Risk:
Files changed:
Verification:
Frozen items touched: No
Migration added: No
Schema/entity changed: No
Release blocker: Yes/No
Conclusion: PASS / PASS WITH CI CONDITIONS / HOLD / ROLLBACK
Notes:
```
