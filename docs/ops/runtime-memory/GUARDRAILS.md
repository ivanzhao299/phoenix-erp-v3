# Runtime Memory Guardrails

Last updated: 2026-06-23

1. Do not rely on long-lived chat context for Store Payment project state.
2. Codex-Orchestrator must read `docs/ops/runtime-memory/*` before continuing Store Payment.
3. Do not ask the user to manually run Terminal commands for routine sync, docs/ops/runs cleanup, rebase, merge, or W5 gate.
4. Baseline Autopilot is the default lifecycle for safe commit, rebase, merge, and gate validation.
5. Production deployment requires explicit user approval.
6. Push requires explicit user approval.
7. Remote production DB writes require explicit user approval.
8. Migration execution requires a dedicated approved Gate.
9. Attachment preview/download must not be enabled before an A3 protected streaming Gate and A2 security review.
10. Raw URL exposure is forbidden.
11. Do not return naked `/uploads` URLs for Store Payment proof / QR attachments.
12. Do not open `http(s)` attachment links from the Store Payment frontend.
13. No cleanup, reset, or destructive operation may run without explicit approval.
