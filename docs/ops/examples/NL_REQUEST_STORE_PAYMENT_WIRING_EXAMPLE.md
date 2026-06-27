# Natural Language Request Example: Store Payment AppModule Wiring

## 1. User Natural Language

“把 StorePaymentModule 最小注册到 AppModule，使已合入的 store-payment 后端接口可以被 NestJS 加载，但不得新增 migration，不得改 schema/entity/table/column，不得改前端，不得部署。”

## 2. Risk Level

L3 backend wiring / runtime behavior.

This is not low risk because it changes NestJS module loading and can expose already implemented backend endpoints. It does not approve schema, migration, frontend, deployment, or database changes.

## 3. Requirement Understanding

The request asks for a minimal backend module registration step only. Existing Store Payment backend code has already been merged, but the module must be wired into the application module so NestJS can load it.

## 4. Forbidden Work

1. No migration.
2. No schema/entity/table/column changes.
3. No frontend changes.
4. No deployment.
5. No DB writes.
6. No payment callback.
7. No financial auto-reconciliation.
8. No POS/inventory/Chanjet integration.

## 5. Recommended Agent

A3-Backend-Critical-Path.

## 6. Recommended Worktree

`/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`

## 7. Recommended Prompt

`docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md`

## 8. Recommended Task Contract

`docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md`

## 9. Default Dry-Run Command

```bash
node scripts/ops/run-agent-task.mjs \
  --agent A3-Backend-Critical-Path \
  --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path \
  --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md \
  --request-spec docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md \
  --task-contract docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md \
  --assembled-prompt-output docs/ops/runs/store-payment-wiring-a3-assembled-prompt.md \
  --dry-run
```

## 10. Human Approval Required

Yes. The task changes backend runtime loading and must be approved before non-dry-run Agent execution.
