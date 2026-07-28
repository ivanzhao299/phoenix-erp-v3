#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assignTaskWorkspace } from './agent-task-workspace.mjs';

const DISPATCH_MAP = 'docs/ops/AGENT_DISPATCH_MAP.json';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/decide-next-agent.mjs \\
    --result-json <file> \\
    --output-plan <file> \\
    --output-contract-dir <dir> \\
    [--dry-run]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: true };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2)] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function readJson(file) {
  const absolute = resolvePath(file);
  if (!existsSync(absolute)) fail(`file does not exist: ${file}`);
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

function normalizeAgents(result) {
  return [...new Set([...(result.next_agents ?? []), ...(result.recommend_next_agent ?? [])].filter(Boolean))];
}

function value(result, modern, legacy, fallback = false) {
  if (result[modern] !== undefined) return result[modern];
  if (result[legacy] !== undefined) return result[legacy];
  return fallback;
}

function holdPlan(result, reason) {
  return {
    source_task_id: result.task_id ?? null,
    source_agent: result.agent ?? null,
    decision: 'HOLD',
    reason,
    approval_required: true,
    follow_up_dispatches: [],
  };
}

function pickPriorityAgents(result) {
  const requested = normalizeAgents(result);
  const addedMigration = value(result, 'added_migration', 'migration_added');
  const modifiedBusinessCode = value(result, 'modified_business_code', 'business_code_changed');

  if (addedMigration || modifiedBusinessCode) {
    const priority = requested.filter((agent) => agent.startsWith('A2-') || agent.startsWith('A1-'));
    if (priority.length > 0) return priority;
    return ['A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate'];
  }

  return requested;
}

function formatList(items) {
  if (!items || items.length === 0) return '- None';
  return items.map((item) => `- ${item}`).join('\n');
}

function reviewScope(agent, result) {
  if (agent.startsWith('A2-')) {
    return 'Read-only security review of changed files, RBAC, DataScope, audit, attachment ACL, sensitive logs, and any conditions from the source result.';
  }
  if (agent.startsWith('A1-')) {
    return 'CI/runtime validation, typecheck/build gates, freeze/security/W5 closeout gate evidence, and post-merge validation if applicable.';
  }
  if (agent.startsWith('A4-')) {
    return 'Frontend UAT smoke only after backend and security gates are accepted.';
  }
  if (agent.startsWith('A6-')) {
    return 'Staging deploy runbook and rollback planning only; no deployment execution.';
  }
  if (agent.startsWith('A7-')) {
    return 'Final read-only QA synthesis and GO / GO WITH CONDITIONS / HOLD / ROLLBACK recommendation.';
  }
  return `Follow-up review for ${result.task_id}.`;
}

function outputReport(agent, taskId) {
  const short = agent.split('-')[0];
  const safeTask = taskId.replace(/[^A-Z0-9_-]/gi, '_');
  return `docs/ops/${short}_${safeTask}_FOLLOW_UP_REPORT.md`;
}

function writeContract({ dir, dispatch, result }) {
  const file = resolvePath(path.join(dir, `${dispatch.follow_up_task_id}.md`));
  mkdirSync(path.dirname(file), { recursive: true });
  const body = `# Follow-Up Agent Contract

## Source Task ID

\`${result.task_id}\`

## Source Agent

\`${result.agent}\`

## Source Conclusion

\`${result.conclusion}\`

## Follow-Up Task ID

\`${dispatch.follow_up_task_id}\`

## Next Agent

\`${dispatch.next_agent}\`

## Changed Files

${formatList((result.changed_files ?? []).map((file) => `\`${file}\``))}

## Conditions

${formatList(result.conditions ?? [])}

## Blockers

${formatList(result.blockers ?? [])}

## Required Review Scope

${dispatch.required_review_scope}

## Allowed Actions

1. Read source result JSON and reports.
2. Inspect relevant changed files and evidence.
3. Run approved validation or read-only review commands.
4. Write the required output report.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migration.
5. Do not write database.
6. Do not change files outside the approved follow-up scope.

## Required Output Report

\`${dispatch.required_output_report}\`

## Stop Rules

Stop immediately if migration/schema/entity/table/column changes, DB writes, deployment, destructive git operations, or new product implementation are required.
`;
  writeFileSync(file, body);
  return file;
}

const args = parseArgs(process.argv.slice(2));
for (const required of ['result-json', 'output-plan', 'output-contract-dir']) {
  if (!args[required]) usage(1);
}

const result = readJson(args['result-json']);
const dispatchMap = readJson(DISPATCH_MAP);
const missing = result.missing_fields ?? [];
const conclusion = result.conclusion ?? 'UNKNOWN';
const executedMigration = value(result, 'executed_migration', 'migration_executed');
const wroteDatabase = value(result, 'wrote_database', 'database_written');
const deployed = value(result, 'deployed', 'deployed');

let plan;
if (missing.length > 0) {
  plan = holdPlan(result, `missing fields: ${missing.join(', ')}`);
} else if (conclusion === 'FAIL' || conclusion === 'HOLD') {
  plan = holdPlan(result, `source conclusion is ${conclusion}`);
} else if (executedMigration || wroteDatabase || deployed) {
  plan = holdPlan(result, 'migration execution, database write, or deployment detected; human review required');
} else {
  const nextAgents = pickPriorityAgents(result).filter((agent) => dispatchMap[agent]);
  const followUps = nextAgents.map((agent) => {
    const config = dispatchMap[agent];
    const followUpTaskId = `${result.task_id}-${agent.split('-')[0]}-FOLLOWUP`;
    const requiredOutputReport = outputReport(agent, result.task_id);
    const execution = assignTaskWorkspace({
      task_id: followUpTaskId,
      agent,
      prompt_file: config.prompt_file,
    }, config);
    const dispatch = {
      follow_up_task_id: followUpTaskId,
      next_agent: agent,
      worktree: execution.worktree,
      branch: execution.branch,
      prompt_file: config.prompt_file,
      generated_contract_file: '',
      required_review_scope: reviewScope(agent, result),
      required_output_report: requiredOutputReport,
      approval_required: true,
    };
    const contractFile = writeContract({
      dir: args['output-contract-dir'],
      dispatch,
      result,
    });
    dispatch.generated_contract_file = path.relative(process.cwd(), contractFile);
    dispatch.run_agent_task_dry_run_command = [
      'node scripts/ops/run-agent-task.mjs',
      `--agent ${agent}`,
      `--worktree ${execution.worktree}`,
      `--prompt ${config.prompt_file}`,
      `--task-contract ${dispatch.generated_contract_file}`,
      `--assembled-prompt-output docs/ops/runs/${followUpTaskId}-assembled-prompt.md`,
      `--task-id ${followUpTaskId}`,
      '--workspace-generation 1',
      '--dry-run',
    ].join(' ');
    return dispatch;
  });

  plan = {
    source_task_id: result.task_id,
    source_agent: result.agent,
    source_conclusion: conclusion,
    decision: followUps.length > 0 ? 'DISPATCH_PLAN_READY' : 'NO_NEXT_AGENT',
    approval_required: followUps.length > 0,
    safety: {
      touched_frozen_boundary: value(result, 'touched_frozen_boundary', 'frozen_items_touched'),
      modified_business_code: value(result, 'modified_business_code', 'business_code_changed'),
      added_migration: value(result, 'added_migration', 'migration_added'),
      executed_migration: executedMigration,
      wrote_database: wroteDatabase,
      deployed,
    },
    follow_up_dispatches: followUps,
  };
}

const outputPlan = resolvePath(args['output-plan']);
mkdirSync(path.dirname(outputPlan), { recursive: true });
writeFileSync(outputPlan, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`Decision: ${plan.decision}`);
if (plan.reason) console.log(`Reason: ${plan.reason}`);
console.log(`Plan: ${path.relative(process.cwd(), outputPlan)}`);
console.log(`Follow-up dispatch count: ${plan.follow_up_dispatches.length}`);
for (const dispatch of plan.follow_up_dispatches) {
  console.log(`- ${dispatch.follow_up_task_id}: ${dispatch.next_agent}`);
  console.log(`  Contract: ${dispatch.generated_contract_file}`);
  console.log(`  Dry-run: ${dispatch.run_agent_task_dry_run_command}`);
}
console.log('No run-agent-task command executed. Task board not modified.');
