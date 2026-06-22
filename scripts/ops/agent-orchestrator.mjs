#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';
const DISPATCH_MAP = 'docs/ops/AGENT_DISPATCH_MAP.json';
const SAFE_EXECUTION_AGENTS = new Set(['A1-CI-Runtime-Gate', 'A2-Security-Regression-Gate', 'A5-Data-Readiness']);

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-orchestrator.mjs \\
    (--request <text> | --request-file <file>) \\
    [--mode supervised|plan-only|execute-approved] \\
    [--parallel <number>] \\
    [--dry-run] \\
    [--approval-token <token>] \\
    [--output-dir <dir>]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {
    mode: 'supervised',
    parallel: 1,
    dryRun: null,
    outputDir: 'docs/ops/runs',
  };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  values.parallel = Number.parseInt(values.parallel, 10) || 1;
  return values;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function slugify(text) {
  const ascii = text
    .replace(/StorePaymentModule/gi, 'store payment module')
    .replace(/Store Payment/gi, 'store payment')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || 'natural-language-request';
}

function timestampForId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function safeGit(args, cwd) {
  try {
    return { ok: true, output: runGit(args, cwd) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function classifyRequest(text) {
  const lower = text.toLowerCase();
  const heldReasons = [];
  const asksMigrationOrSchema =
    /新增.*migration|创建.*migration|修改.*表结构|修改.*schema|修改.*entity|修改.*table|修改.*column|新增.*字段|新增.*表|schema\s+change|table\s+change|column\s+change/.test(
      lower,
    ) || (/执行.*migration|run\s+migration/.test(lower) && !/不执行.*migration|no\s+migration/.test(lower));
  const asksDeploy = /直接部署|部署上线|生产部署|deploy\s+to\s+prod|production\s+deploy|上线/.test(lower) && !/不部署|不执行部署|no deploy/.test(lower);
  const asksDbWrite = /写库|database write|db write|直接写|执行.*数据库/.test(lower);

  if (asksMigrationOrSchema) {
    heldReasons.push('migration/schema/entity/table/column request requires HOLD');
  }
  if (asksDeploy) {
    heldReasons.push('deploy/production request requires HOLD');
  }
  if (asksDbWrite) {
    heldReasons.push('DB write or migration execution request requires HOLD');
  }

  const docsOnly = /docs\/ops|文档|报告|总览|整理/.test(lower) && /不改业务代码|docs\/ops only|只生成/.test(lower);
  const onlyA2A1 = /只允许.*a2.*a1|a2.*只读.*a1|a2.*安全.*a1.*验证/i.test(text);
  const readOnly = /read-only|只读|复核|审查|review|验证|ci|typecheck|安全/.test(lower);
  const backend = /backend|后端|api|controller|service|module|appmodule|wiring/.test(lower);
  const frontend = /frontend|前端|页面|按钮|表格|uat|smoke/.test(lower);
  const data = /主数据|baseline|readiness|数据准备|data readiness/.test(lower);
  const deployDocs = /runbook|部署文档|回滚文档|环境矩阵/.test(lower);

  let riskLevel = 'LOW';
  if (frontend) riskLevel = 'MEDIUM';
  if (backend) riskLevel = 'MEDIUM';
  if (backend && /(写|实现|新增|修改|wire|wiring)/i.test(text)) riskLevel = 'HIGH';
  if (heldReasons.length > 0) riskLevel = 'HIGH';
  if (docsOnly) riskLevel = 'LOW';
  if (onlyA2A1) riskLevel = 'LOW/MEDIUM';
  if (readOnly && !backend && !frontend) riskLevel = 'LOW/MEDIUM';

  return {
    docsOnly,
    onlyA2A1,
    readOnly,
    backend,
    frontend,
    data,
    deployDocs,
    riskLevel,
    heldReasons,
  };
}

function selectAgents(signals) {
  const agents = new Set();
  if (signals.onlyA2A1) {
    return ['A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate'];
  }
  if (signals.docsOnly) agents.add('Codex-Orchestrator');
  if (signals.backend) agents.add('A3-Backend-Critical-Path');
  if (/HIGH|MEDIUM/.test(signals.riskLevel) || signals.backend || signals.readOnly) agents.add('A2-Security-Regression-Gate');
  if (signals.readOnly || signals.backend || signals.frontend) agents.add('A1-CI-Runtime-Gate');
  if (signals.frontend) agents.add('A4-Frontend-UAT-Smoke');
  if (signals.data) agents.add('A5-Data-Readiness');
  if (signals.deployDocs) agents.add('A6-Staging-Deploy-Runbook');
  if (signals.heldReasons.length > 0) agents.add('Codex-Orchestrator');
  if (agents.size === 0) agents.add('Codex-Orchestrator');
  return [...agents];
}

function isReadOnlyAgent(agent) {
  return (
    agent === 'A1-CI-Runtime-Gate' ||
    agent === 'A2-Security-Regression-Gate' ||
    agent === 'A5-Data-Readiness' ||
    agent === 'A7-Final-QA-Gate' ||
    agent === 'Codex-Orchestrator'
  );
}

function groupAgents(agents, parallel, signals) {
  if (signals.heldReasons.length > 0) return [];
  const groups = [];
  let current = [];
  for (const agent of agents) {
    const codeWriter = agent === 'A3-Backend-Critical-Path' || agent === 'A4-Frontend-UAT-Smoke';
    if (codeWriter) {
      if (current.length > 0) groups.push(current);
      groups.push([agent]);
      current = [];
      continue;
    }
    current.push(agent);
    if (current.length >= parallel) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function checkWorktree(agent, config, dryRun, approvalToken) {
  const result = {
    agent,
    worktree: config.worktree_path,
    branch: config.canonical_branch,
    exists: existsSync(config.worktree_path),
    is_git_repo: false,
    current_branch: null,
    clean: false,
    needs_rebase: false,
    rebase_performed: false,
    errors: [],
  };
  if (!result.exists) {
    result.errors.push('worktree does not exist');
    return result;
  }
  const inside = safeGit(['rev-parse', '--is-inside-work-tree'], config.worktree_path);
  result.is_git_repo = inside.ok && inside.output === 'true';
  if (!result.is_git_repo) {
    result.errors.push('not a git repository');
    return result;
  }
  result.current_branch = safeGit(['branch', '--show-current'], config.worktree_path).output;
  if (result.current_branch !== config.canonical_branch) {
    result.errors.push(`wrong branch: ${result.current_branch}`);
  }
  const status = safeGit(['status', '--short'], config.worktree_path).output;
  result.clean = status === '';
  if (!result.clean) result.errors.push(`worktree dirty: ${status}`);

  const ancestor = safeGit(['merge-base', '--is-ancestor', result.current_branch, 'main'], config.worktree_path);
  const reverse = safeGit(['merge-base', '--is-ancestor', 'main', result.current_branch], config.worktree_path);
  result.needs_rebase = ancestor.ok && !reverse.ok;
  if (result.needs_rebase && !dryRun && approvalToken === APPROVAL_TOKEN) {
    const rebase = safeGit(['rebase', 'main'], config.worktree_path);
    if (!rebase.ok) {
      result.errors.push(`rebase failed: ${rebase.output}`);
    } else {
      result.rebase_performed = true;
    }
  }
  return result;
}

function makeSpec({ requestId, requestText, signals }) {
  return `# Requirement Spec

## Request ID

${requestId}

## Source Natural Language

${requestText}

## Structured Requirement

Generate a supervised orchestration plan from the natural language request. The plan may prepare Agent contracts and assembled prompts, but must not perform forbidden production or data actions.

## Risk Level

${signals.riskLevel}

## Held Reasons

${signals.heldReasons.map((reason) => `- ${reason}`).join('\n') || '- None'}

## Non-Goals

1. Do not merge.
2. Do not push.
3. Do not execute migrations.
4. Do not write databases.
5. Do not deploy.
6. Do not modify business code from the Orchestrator worktree.
`;
}

function makeContract({ requestId, requestText, agent, config, signals }) {
  return `# Agent Contract

## Request ID

${requestId}

## Assigned Agent

${agent}

## Worktree

\`${config.worktree_path}\`

## Branch

\`${config.canonical_branch}\`

## Source Request

${requestText}

## Role

${config.default_role}

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under \`docs/ops/\`.
3. Run only checks appropriate for ${config.allowed_execution_phase}.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

\`docs/ops/${requestId}_${agent}_REPORT.md\`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

${signals.riskLevel}
`;
}

function assemblePrompt({ basePrompt, spec, contract }) {
  return `# Base Agent Prompt

${basePrompt.trim()}

---

# Requirement Spec

${spec.trim()}

---

# Agent Contract

${contract.trim()}

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Dry-run planning does not authorize real execution.
`;
}

function writeMdPlan(plan) {
  return `# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | ${plan.request_id} |
| Risk | ${plan.risk_level} |
| Mode | ${plan.mode} |
| Dry run | ${plan.dry_run ? 'Yes' : 'No'} |
| Parallel | ${plan.parallel} |
| Approval required | ${plan.approval_required ? 'Yes' : 'No'} |

## Request

${plan.request_text}

## Selected Agents

${plan.selected_agents.map((agent) => `- ${agent}`).join('\n') || '- None'}

## Held Reasons

${plan.held_reasons.map((reason) => `- ${reason}`).join('\n') || '- None'}

## Dispatch Groups

${plan.dispatch_groups.map((group, index) => `- Group ${index + 1}: ${group.join(', ')}`).join('\n') || '- None'}

## Next Commands

${plan.next_commands.map((command) => `\`\`\`bash\n${command}\n\`\`\``).join('\n') || '- None'}
`;
}

async function runWithLimit(items, limit, worker) {
  const results = [];
  let index = 0;
  let failed = false;
  async function next() {
    while (index < items.length && !failed) {
      const current = items[index];
      index += 1;
      const result = await worker(current);
      results.push(result);
      if (result.exit_code !== 0) {
        failed = true;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

function writeAgentLog({ outputDir, requestId, agent, stdout, stderr, exitCode }) {
  const safeAgent = agent.replace(/[^A-Za-z0-9_-]/g, '_');
  const file = path.join(outputDir, `${requestId}-approved-execution-${safeAgent}.log`);
  writeFileSync(
    file,
    `Agent: ${agent}
Exit code: ${exitCode}

STDOUT
${stdout || ''}

STDERR
${stderr || ''}
`,
  );
  return path.relative(process.cwd(), file);
}

const args = parseArgs(process.argv.slice(2));
if (!args.request && !args.requestFile) usage(1);
if (!['supervised', 'plan-only', 'execute-approved'].includes(args.mode)) fail(`invalid mode: ${args.mode}`);
args.dryRun = args.dryRun === true || args.mode !== 'execute-approved';
if (args.parallel < 1) fail('--parallel must be >= 1');

const requestText = [args.request, args.requestFile ? readFileSync(resolvePath(args.requestFile), 'utf8').trim() : '']
  .filter(Boolean)
  .join('\n\n')
  .trim();
if (!requestText) fail('request text is empty');

const outputDir = resolvePath(args.outputDir);
mkdirSync(outputDir, { recursive: true });

const dispatchMap = JSON.parse(readFileSync(resolvePath(DISPATCH_MAP), 'utf8'));
const requestId = `REQ-NL-${timestampForId()}-${slugify(requestText).toUpperCase()}`;
const signals = classifyRequest(requestText);
const selectedAgents = selectAgents(signals);
const dispatchGroups = groupAgents(selectedAgents, args.parallel, signals);
const generatedFiles = {};
const worktreeChecks = [];
const worktreeWarnings = [];
const nextCommands = [];
const forbiddenActions = ['merge', 'push', 'migration execution', 'database write', 'deploy'];
const approvalRequired = signals.riskLevel !== 'LOW' || selectedAgents.some((agent) => agent !== 'Codex-Orchestrator');
const executionResult = {
  request_id: requestId,
  mode: args.mode,
  approval_token_provided: args.approvalToken === APPROVAL_TOKEN,
  codex_cli_executed: false,
  executed_agents: [],
  skipped_agents: [],
  held_reasons: [],
  worktree_rebase_results: [],
  agent_exit_codes: {},
  agent_log_files: {},
  generated_reports: [],
  migration_executed: false,
  database_written: false,
  deployed: false,
  merged: false,
  pushed: false,
};

const spec = makeSpec({ requestId, requestText, signals });
const specPath = path.join(outputDir, `${requestId}-requirement-spec.md`);
writeFileSync(specPath, spec);
generatedFiles.requirement_spec = path.relative(process.cwd(), specPath);

const agentArtifacts = [];
for (const agent of selectedAgents) {
  const config = dispatchMap[agent];
  if (!config) continue;
  const check = checkWorktree(agent, config, args.dryRun || args.mode !== 'execute-approved', args.approvalToken);
  worktreeChecks.push(check);
  const contract = makeContract({ requestId, requestText, agent, config, signals });
  const contractPath = path.join(outputDir, `${requestId}-agent-contract-${agent}.md`);
  writeFileSync(contractPath, contract);
  const basePrompt = readFileSync(resolvePath(config.prompt_file), 'utf8');
  const assembled = assemblePrompt({ basePrompt, spec, contract });
  const promptPath = path.join(outputDir, `${requestId}-assembled-prompt-${agent}.md`);
  writeFileSync(promptPath, assembled);
  const command = [
    'node scripts/ops/run-agent-task.mjs',
    `--agent ${agent}`,
    `--worktree ${config.worktree_path}`,
    `--prompt ${config.prompt_file}`,
    `--request-spec ${path.relative(process.cwd(), specPath)}`,
    `--task-contract ${path.relative(process.cwd(), contractPath)}`,
    `--assembled-prompt-output ${path.relative(process.cwd(), promptPath)}`,
    '--dry-run',
  ].join(' ');
  nextCommands.push(command);
  agentArtifacts.push({
    agent,
    contract: path.relative(process.cwd(), contractPath),
    assembled_prompt: path.relative(process.cwd(), promptPath),
    run_agent_task_dry_run_command: command,
  });
}
generatedFiles.agent_artifacts = agentArtifacts;

let codexActuallyExecuted = false;
const heldReasons = [...signals.heldReasons];
for (const check of worktreeChecks) {
  if (check.errors.length > 0 && !args.dryRun) {
    heldReasons.push(`${check.agent}: ${check.errors.join('; ')}`);
  } else if (check.errors.length > 0) {
    worktreeWarnings.push(`${check.agent}: ${check.errors.join('; ')}`);
  }
  if (check.needs_rebase && (args.dryRun || args.mode !== 'execute-approved')) {
    worktreeWarnings.push(`${check.agent}: worktree may need rebase onto main`);
  }
}

if (!args.dryRun && args.mode === 'execute-approved') {
  if (args.approvalToken !== APPROVAL_TOKEN) {
    heldReasons.push('execute-approved requires --approval-token APPROVE_AGENT_EXECUTION');
    executionResult.skipped_agents.push(...selectedAgents);
  } else if (selectedAgents.some((agent) => !SAFE_EXECUTION_AGENTS.has(agent))) {
    heldReasons.push(`execute-approved only permits A1/A2/A5; selected unsafe agent(s): ${selectedAgents.filter((agent) => !SAFE_EXECUTION_AGENTS.has(agent)).join(', ')}`);
    executionResult.skipped_agents.push(...selectedAgents);
  } else if (heldReasons.length === 0) {
    const executableArtifacts = agentArtifacts.filter((artifact) => SAFE_EXECUTION_AGENTS.has(artifact.agent));
    const limit = Math.max(1, args.parallel);
    const runResults = await runWithLimit(executableArtifacts, limit, async (artifact) => {
      const command = artifact.run_agent_task_dry_run_command.replace(/\s--dry-run$/, ` --require-approval-token ${APPROVAL_TOKEN}`);
      const parts = command.split(/\s+/);
      const result = spawnSync(parts[0], parts.slice(1), { cwd: process.cwd(), encoding: 'utf8' });
      const exitCode = result.status ?? 1;
      const logFile = writeAgentLog({
        outputDir,
        requestId,
        agent: artifact.agent,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode,
      });
      return {
        agent: artifact.agent,
        exit_code: exitCode,
        log_file: logFile,
      };
    });
    codexActuallyExecuted = runResults.length > 0;
    executionResult.codex_cli_executed = codexActuallyExecuted;
    for (const result of runResults) {
      executionResult.agent_exit_codes[result.agent] = result.exit_code;
      executionResult.agent_log_files[result.agent] = result.log_file;
      if (result.exit_code === 0) executionResult.executed_agents.push(result.agent);
      else {
        executionResult.skipped_agents.push(...selectedAgents.filter((agent) => !executionResult.executed_agents.includes(agent)));
        heldReasons.push(`${result.agent}: run-agent-task failed with ${result.exit_code}`);
        break;
      }
    }
  }
}

const plan = {
  request_id: requestId,
  request_text: requestText,
  risk_level: signals.riskLevel,
  mode: args.mode,
  dry_run: Boolean(args.dryRun),
  parallel: args.parallel,
  selected_agents: selectedAgents,
  held_reasons: heldReasons,
  generated_files: generatedFiles,
  worktree_checks: worktreeChecks,
  worktree_warnings: worktreeWarnings,
  dispatch_groups: heldReasons.length > 0 ? [] : dispatchGroups,
  approval_required: approvalRequired,
  forbidden_actions: forbiddenActions,
  next_commands: heldReasons.length > 0 ? [] : nextCommands,
  codex_actually_executed: codexActuallyExecuted,
  approval_token_provided: args.approvalToken === APPROVAL_TOKEN,
  approved_execution_result_json: args.mode === 'execute-approved' ? `${requestId}-approved-execution-result.json` : null,
  approved_execution_summary_md: args.mode === 'execute-approved' ? `${requestId}-approved-execution-summary.md` : null,
};

const planJsonPath = path.join(outputDir, `${requestId}-orchestration-plan.json`);
const planMdPath = path.join(outputDir, `${requestId}-orchestration-plan.md`);
const summaryPath = path.join(outputDir, `${requestId}-execution-summary.md`);
const approvedResultPath = path.join(outputDir, `${requestId}-approved-execution-result.json`);
const approvedSummaryPath = path.join(outputDir, `${requestId}-approved-execution-summary.md`);
writeFileSync(planJsonPath, `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(planMdPath, writeMdPlan(plan));
writeFileSync(
  summaryPath,
  `# Execution Summary

| Field | Value |
| --- | --- |
| Request ID | ${requestId} |
| Decision | ${heldReasons.length > 0 ? 'HOLD' : 'PLAN_READY'} |
| Codex CLI executed | ${codexActuallyExecuted ? 'Yes' : 'No'} |
| Approval token provided | ${args.approvalToken === APPROVAL_TOKEN ? 'Yes' : 'No'} |
| Migration executed | No |
| Database written | No |
| Deployment executed | No |
| Merge executed | No |
| Push executed | No |

## Held Reasons

${heldReasons.map((reason) => `- ${reason}`).join('\n') || '- None'}
`,
);
plan.generated_files.orchestration_plan_json = path.relative(process.cwd(), planJsonPath);
plan.generated_files.orchestration_plan_md = path.relative(process.cwd(), planMdPath);
plan.generated_files.execution_summary = path.relative(process.cwd(), summaryPath);
executionResult.held_reasons = heldReasons;
executionResult.worktree_rebase_results = worktreeChecks.map((check) => ({
  agent: check.agent,
  needs_rebase: check.needs_rebase,
  rebase_performed: check.rebase_performed,
  errors: check.errors,
}));
if (args.mode === 'execute-approved') {
  writeFileSync(approvedResultPath, `${JSON.stringify(executionResult, null, 2)}\n`);
  writeFileSync(
    approvedSummaryPath,
    `# Approved Parallel Execution Summary

| Field | Value |
| --- | --- |
| Request ID | ${requestId} |
| Approval token provided | ${executionResult.approval_token_provided ? 'Yes' : 'No'} |
| Codex CLI executed | ${executionResult.codex_cli_executed ? 'Yes' : 'No'} |
| Executed agents | ${executionResult.executed_agents.join(', ') || 'None'} |
| Skipped agents | ${executionResult.skipped_agents.join(', ') || 'None'} |
| Migration executed | No |
| Database written | No |
| Deployment | No |
| Merge | No |
| Push | No |

## Held Reasons

${heldReasons.map((reason) => `- ${reason}`).join('\n') || '- None'}
`,
  );
  plan.generated_files.approved_execution_result = path.relative(process.cwd(), approvedResultPath);
  plan.generated_files.approved_execution_summary = path.relative(process.cwd(), approvedSummaryPath);
}
writeFileSync(planJsonPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`Request ID: ${requestId}`);
console.log(`Risk: ${signals.riskLevel}`);
console.log(`Decision: ${heldReasons.length > 0 ? 'HOLD' : 'PLAN_READY'}`);
console.log(`Selected agents: ${selectedAgents.join(', ')}`);
console.log(`Dispatch groups: ${plan.dispatch_groups.map((group) => `[${group.join(', ')}]`).join(' ') || 'None'}`);
console.log(`Plan: ${path.relative(process.cwd(), planJsonPath)}`);
console.log(`Summary: ${path.relative(process.cwd(), summaryPath)}`);
console.log(`Codex CLI executed: ${codexActuallyExecuted ? 'Yes' : 'No'}`);
if (heldReasons.length > 0) {
  console.log(`Held reasons: ${heldReasons.join('; ')}`);
}
if (worktreeWarnings.length > 0) {
  console.log(`Worktree warnings: ${worktreeWarnings.join('; ')}`);
}
