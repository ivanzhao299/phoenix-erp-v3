# Short Command Examples

## Continue Next Gate

```text
继续下一 Gate，只执行明确候选，不执行 manual/HOLD，不部署，不重启，不 push。
```

Expected behavior:

- read `PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`;
- expand the next Gate;
- apply runtime guardrails;
- dry-run by default.

## Approve Clear Candidates

```text
批准执行上一个 dry-run 的明确候选，不执行 manual/HOLD。
```

Expected behavior:

- require a matching approval in `APPROVALS.md`;
- execute only clear candidates;
- keep manual and HOLD rows denied.

## Read-Only Audit

```text
暂停远端写入，只做审计。
```

Expected behavior:

- forbid DB write, migration, deploy, restart, and push;
- produce a read-only plan.

## High Throughput Read-Only

```text
开启高吞吐并发，只读任务可以并行。
```

Expected behavior:

- use higher parallelism for A1/A2/A5/A6/A7 read-only work;
- keep remote SSH capped and serial for fragile operations;
- do not perform writes.

## Suggest Next Step

```text
生成下一步建议，不执行任何动作。
```

Expected behavior:

- generate recommendation-only output;
- no Agent execution.

