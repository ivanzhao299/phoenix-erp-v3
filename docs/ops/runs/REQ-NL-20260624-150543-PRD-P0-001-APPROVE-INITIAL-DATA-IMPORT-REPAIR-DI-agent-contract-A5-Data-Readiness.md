# Agent Contract

## Request ID

REQ-NL-20260624-150543-PRD-P0-001-APPROVE-INITIAL-DATA-IMPORT-REPAIR-DI

## Assigned Agent

A5-Data-Readiness

## Worktree

`/Users/mac/phoenix-erp-worktrees/a5-data-readiness`

## Branch

`w5-a5-data-readiness`

## Source Request

执行 PRD-P0-001 APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS：按照生产级整改任务列表，做 Initial Data Import Repair Diagnosis；只允许 A5 数据 readiness、A2 安全只读审查、A1 CI 验证并发执行；全程只读；不写库，不跑迁移，不部署，不重启，不 push，不修改业务代码，不执行 manual/HOLD。

## Role

主数据、数据基线、灰度数据条件、只读核查

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for read-only-data-readiness.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260624-150543-PRD-P0-001-APPROVE-INITIAL-DATA-IMPORT-REPAIR-DI_A5-Data-Readiness_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM
