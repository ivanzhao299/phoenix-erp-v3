# Requirement Spec

## Request ID

REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION

## Source Natural Language

为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库

## Structured Requirement

Generate a supervised orchestration plan from the natural language request. The plan may prepare Agent contracts and assembled prompts, but must not perform forbidden production or data actions.

## Risk Level

HIGH

## Held Reasons

- DB write or migration execution request requires HOLD

## Non-Goals

1. Do not merge.
2. Do not push.
3. Do not execute migrations.
4. Do not write databases.
5. Do not deploy.
6. Do not modify business code from the Orchestrator worktree.
