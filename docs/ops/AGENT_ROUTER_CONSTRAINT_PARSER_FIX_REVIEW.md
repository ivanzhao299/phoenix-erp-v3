# Agent Router Constraint Parser Fix Review

## Problem

The request:

> 对 Store Payment 试点 readiness 做低风险并行验证：只允许 A2 安全只读审查、A1 CI 验证、A5 数据 readiness 检查；不允许 A3/A4 修改业务代码，不执行 migration，不写数据库，不部署，不 push

previously selected A3/A4 because Router treated `A3/A4` as explicit positive mentions and ignored the preceding negative phrase `不允许`.

## Root Cause

Router keyword matching ran before natural language constraints. Explicit Agent aliases inside deny phrases were counted as positive route signals.

## Allowlist / Denylist Rules

Allowlist markers:

- `只允许`
- `仅允许`
- `only allow`
- `allow only`

Denylist markers:

- `不允许`
- `禁止`
- `不要`
- `不得`
- `disallow`
- `exclude`

Hard constraints:

- `不执行 migration`
- `不写数据库`
- `不部署`
- `不 push`
- `不改业务代码`
- `不修改 apps/api`
- `不修改 apps/web`

## Constraint Priority

1. denylist
2. allowlist
3. keyword routing

If allowlist and denylist conflict, Router returns HOLD.

## Validation Results

| Case | Result |
| --- | --- |
| Original failed execute-approved request | PASS: selected only A2, A1, A5 in dry-run validation; A3/A4 denied. |
| Pure denylist | PASS: selected A1 + A5; A3/A4 denied. |
| UI task normal route | PASS: selected A4 + A1; A3 denied by `不改后端接口`. |
| UI task but A4 denied | PASS: selected A1 only; A4 denied. |

## Route-plan Fields

Route plans now include:

- `allowed_agents`
- `denied_agents`
- `hard_constraints`
- `constraint_conflicts`
- `selected_agents_after_constraints`

## Safety

- Fixed `不允许 A3/A4` no longer triggering A3/A4.
- Business code changed: No.
- Migration executed: No.
- Database written: No.
- Deployed: No.

## Next Step

Use these constraint fields in future approved execution guards and Observer diagnostics.
