# Agent Task Board

> Purpose: lightweight task board for Delivery Factory coordination. Keep one row per Agent-owned task.

## Status Values

| Status | Meaning |
| --- | --- |
| TODO | Task accepted but not started. |
| IN_PROGRESS | Agent is actively working. |
| BLOCKED | Agent cannot proceed without decision/evidence. |
| REVIEW | Output is ready for review. |
| PASS | Task passed required checks. |
| PASS_WITH_CI_CONDITIONS | Local/docs checks passed; CI or external evidence pending. |
| HOLD | Task blocks release. |
| ROLLBACK | Task requires rollback action. |

## Board

| Task ID | Agent | Branch | Status | PR | Risk level | Frozen item touched | Verification result | Blockers | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W5-P0-ADF-00 | Codex-Orchestrator | w5-ai-delivery-factory-setup | IN_PROGRESS | TBD | Low | No | Docs-only setup in progress | None | Complete docs and PR template |

## Update Rules

1. Every dispatched task must have an Agent and risk level.
2. `Frozen item touched` must be `No` unless an explicit exception is approved.
3. `PASS_WITH_CI_CONDITIONS` must list the exact pending CI checks.
4. `HOLD` must list owner, blocker, and required decision.
5. Production deploy tasks must remain `HOLD` until `PRODUCTION_GO_NO_GO` records GO or GO WITH CONDITIONS.
