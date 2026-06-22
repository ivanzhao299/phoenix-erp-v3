# V3-E Evolution Center Migration Plan

## Goal

Migrate the ANKSEN Agent Studio V3-E Resident Observer / Evolution Center capability into Phoenix ERP AI Delivery Factory using Phoenix-native paths:

- `scripts/ops/**`
- `docs/ops/**`
- `docs/ops/evolution/**`
- `docs/ops/runs/**`
- `docs/ops/agent-queue/**`

## Why Migrate

Phoenix Agent Platform already has Resident Observer, Router, Goal/Planner/Queue, Baseline Autopilot, Doctor, and Finalize concepts. V3-E adds the missing evolution loop:

Observer Finding -> Failure Pattern -> Evolution Planner -> Improvement Candidate -> Improvement Backlog -> Goal-to-Queue -> Agent Task Queue -> Doctor / Finalize visibility.

## Relationship To ANKSEN Agent Studio V3-E

This migration preserves the V3-E concept but adapts storage and command paths to Phoenix ERP conventions. The Phoenix platform should not depend on the original `ops/agent-orchestrator/scripts/**` path.

## Why Not Use The Original Path

The original path is not part of the Phoenix Agent Platform layout. Phoenix keeps operational automation in `scripts/ops/**` and operational state in `docs/ops/**`. Using the original path would split platform behavior across two command surfaces and make Baseline Autopilot / Doctor visibility harder to reason about.

## New Directory Structure

- `scripts/ops/agent-evolution-planner.mjs`
- `scripts/ops/agent-goal-to-queue.mjs`
- `scripts/ops/agent-doctor.mjs`
- `scripts/ops/agent-finalize.mjs`
- `docs/ops/evolution/failure-patterns.json`
- `docs/ops/evolution/learning-log.json`
- `docs/ops/evolution/improvement-backlog.json`
- `docs/ops/evolution/evolution-state.json`
- `docs/ops/runs/evolution-*.json`
- `docs/ops/runs/evolution-*.md`

## Closed Loop

1. Resident Observer scans run artifacts, task queue, task board, Router rules, dispatch map, and worktree status.
2. Observer emits findings plus suggested evolution patterns and improvements.
3. Evolution Planner reads patterns, learning log, backlog, state, Observer reports, and recent runs.
4. Planner generates idempotent improvement candidates.
5. Apply mode writes improvement backlog, learning log, state, and latest plan artifacts.
6. Goal-to-Queue can convert a selected improvement into a READY Agent task.
7. Doctor and Finalize expose backlog health and GO/HOLD status.

## Forbidden Boundaries

This migration does not authorize:

- Business code changes.
- `apps/api/**` or `apps/web/**` edits.
- Migration creation or execution.
- Schema/entity/table/column edits.
- Seed, reset, cleanup, push, deploy, production migration, or DB write.

## Current Limits

- Goal-to-Queue apply is available but this migration only validates dry-run.
- Planner candidates are deterministic but still require human approval before execution.
- Doctor reports W5 gate status and forbidden dirty files, but does not self-repair.

## Store Payment Usage

Store Payment toolchain self-optimization can now enter the loop as improvement tasks, especially Router regression hardening, report schema compliance, baseline lifecycle coverage, and queue conflict reduction.
