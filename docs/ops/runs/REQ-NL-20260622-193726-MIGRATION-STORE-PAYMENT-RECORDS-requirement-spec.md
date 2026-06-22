# Requirement Spec

## Request ID

REQ-NL-20260622-193726-MIGRATION-STORE-PAYMENT-RECORDS

## Source Natural Language

新增 migration 修改 store_payment_records 表结构，并部署上线

## Structured Requirement

Generate a supervised orchestration plan from the natural language request. The plan may prepare Agent contracts and assembled prompts, but must not perform forbidden production or data actions.

## Risk Level

HIGH

## Held Reasons

- migration/schema/entity/table/column request requires HOLD
- deploy/production request requires HOLD

## Non-Goals

1. Do not merge.
2. Do not push.
3. Do not execute migrations.
4. Do not write databases.
5. Do not deploy.
6. Do not modify business code from the Orchestrator worktree.
