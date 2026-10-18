# Readonly topology gap classification

The 2026-10-18 audits 39109113792 and 39110124861 repeatedly lacked three container projections. The latest audit captured all 211 systemd rows but two unsupported identities remained untraceable. This patch keeps all existing validation and replaces the single container catch reason with seven fixed failure stages. No raw metadata or error is exported. Systemd trigger relationships and unsupported identities are exported only as SHA-256 hashes; no ExecStart, arguments, environment or private material is read.

Validation: Node20, 52 tests passed (`/tmp/phoenix-topology-stage-tests-correct-worktree.log`); one initial invocation used the root worktree and failed because these forensic tests do not exist there (`/tmp/phoenix-topology-stage-tests.log`). Independent read-only operations review found no P0/P1. New tests cover six failure stages, sentinel non-disclosure, unsupported identity and timer/service hash association.

All results remain snapshots. Complete safety, continuous drain and approval remain false; unknown containers, scheduler scope, old-runtime reconciliation, independently trusted artifact authority and production registry remain release blockers. No production mutation or deployment is performed by this patch. The exact unchanged protected SSH root/trusted-path/FD9 guard and output closed vocabulary remain enforced.

## Failed-command classifier follow-up

Audit39110779186 confirmed the same three container projections fail at the inspect command, with production runtime/control records unchanged. The extra narrow classifier matches only eight fixed categories in failed-command code/stderr, never exports raw error text, and keeps each snapshot UNVERIFIED. Unknown/injected categories fall back to COMMAND_FAILURE_UNCLASSIFIED. 54 Node20 tests passed; independent operations review found no P0/P1.

A local never-started owned-container experiment did not reproduce the proposed nil-label failure (old inspect exit0); its null-only assertion failed, the container was verified and removed in finally. This experiment establishes no production root cause. The receipt is local-nil-label-projection-reproduction.json in the root evidence ledger. No template validation was relaxed on that hypothesis.

## Actual local missing-Health reproduction

The full existing projection, unlike the earlier two-label-only hypothesis, failed against a uniquely owned never-started local PostgreSQL container: exit1, exact fixed missing-Health-key signal. Receipt local-full-projection-reproduction.json binds the created/removed resource. Docker's strict template field access made the condition itself fail. The narrow fix uses index on the State map to test Health existence; the remaining 18 fields and all container validations are unchanged. Null Health remains UNVERIFIED, not healthy.

55 Node20 tests passed including an opt-in actual Docker regression (old projection fails, new projection returns19 fields/health=null; networknone, never started, full identity/owner verified before finally removal). Independent read-only review found no P0/P1. An initial invocation from the wrong root directory failed before test execution and was rerun from this worktree; both logs retained. The three production failures remain unclassified until a new protected readonly snapshot. No production deployment or state mutation is enabled.
