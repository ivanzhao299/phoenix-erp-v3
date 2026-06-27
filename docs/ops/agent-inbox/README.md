# Agent Inbox Short Command Mode

Agent Inbox is the short-command entry point for Codex-Orchestrator.

Users no longer need to paste a full operational prompt for routine platform work. They can write a short intent into `USER_INTENT.md`, optionally record an explicit approval in `APPROVALS.md`, and let the runner expand the request from runtime memory, next-gate recommendations, guardrails, and the task board.

Default behavior is safe:

1. dry-run first;
2. no DB write unless an approval record matches the inferred Gate;
3. no migration, deploy, restart, push, cleanup, reset, or production operation by default;
4. execution results are written to `OUTBOX.md`.

Runner:

```bash
node scripts/ops/agent-inbox-runner.mjs --dry-run
```

## Files

| File | Purpose |
| --- | --- |
| `USER_INTENT.md` | User writes one short instruction. |
| `APPROVALS.md` | Records explicit approved Gate scope. |
| `OUTBOX.md` | Agent writes the result summary. |
| `INBOX_SCHEMA.md` | Field and parsing contract. |
| `SHORT_COMMAND_EXAMPLES.md` | Common short commands. |

## Boundaries

Agent Inbox does not itself authorize production actions. It only expands context and delegates to existing orchestrator / gate machinery.

