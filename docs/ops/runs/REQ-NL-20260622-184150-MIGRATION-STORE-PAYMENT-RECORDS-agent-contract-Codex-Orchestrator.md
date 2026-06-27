# Agent Contract

## Request ID

REQ-NL-20260622-184150-MIGRATION-STORE-PAYMENT-RECORDS

## Assigned Agent

Codex-Orchestrator

## Worktree

`/Users/mac/phoenix-erp-worktrees/codex-orchestrator`

## Branch

`w5-codex-orchestrator`

## Source Request

新增一个数据库 migration 修改 store_payment_records 表结构，并直接部署上线

## Role

总控、需求理解、任务分发、验收汇总

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for orchestration-only.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260622-184150-MIGRATION-STORE-PAYMENT-RECORDS_Codex-Orchestrator_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

HIGH
