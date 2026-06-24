#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const INBOX_DIR = 'docs/ops/agent-inbox';
const USER_INTENT_FILE = `${INBOX_DIR}/USER_INTENT.md`;
const APPROVALS_FILE = `${INBOX_DIR}/APPROVALS.md`;
const OUTBOX_FILE = `${INBOX_DIR}/OUTBOX.md`;
const PROJECT_STATE_FILE = 'docs/ops/runtime-memory/PROJECT_STATE.json';
const MEMORY_FILE = 'docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md';
const NEXT_ACTIONS_FILE = 'docs/ops/runtime-memory/NEXT_ACTIONS.md';
const GUARDRAILS_FILE = 'docs/ops/runtime-memory/GUARDRAILS.md';
const NEXT_GATE_FILE = 'docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md';
const TASK_BOARD_FILE = 'docs/ops/AGENT_TASK_BOARD.md';
const RUNS_DIR = 'docs/ops/runs';
const APPROVAL_TOKEN = 'APPROVE_AGENT_EXECUTION';

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-inbox-runner.mjs [--dry-run] [--execute-approved] [--parallel <n>] [--no-remote-write]

Examples:
  node scripts/ops/agent-inbox-runner.mjs --dry-run
  node scripts/ops/agent-inbox-runner.mjs --execute-approved --parallel 4
  node scripts/ops/agent-inbox-runner.mjs --dry-run --parallel 4 --no-remote-write`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const args = {
    dryRun: false,
    executeApproved: false,
    parallel: 1,
    noRemoteWrite: false,
  };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--execute-approved') {
      args.executeApproved = true;
      continue;
    }
    if (arg === '--no-remote-write') {
      args.noRemoteWrite = true;
      continue;
    }
    if (arg === '--parallel') {
      args.parallel = Number.parseInt(normalized[i + 1], 10) || 1;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.executeApproved) args.dryRun = true;
  if (args.parallel < 1) args.parallel = 1;
  return args;
}

function readRequired(file) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
  return readFileSync(file, 'utf8');
}

function extractSectionFirstLine(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (start === -1) return '';
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('#')) break;
    if (line && !line.startsWith('```')) return line.replace(/^[-*]\s*/, '');
  }
  return '';
}

function extractNextGate(markdown, projectState) {
  const match = markdown.match(/`(APPROVE_[A-Z0-9_]+|HOLD_[A-Z0-9_]+)`/);
  return match?.[1] || projectState.next_gate || 'UNKNOWN_NEXT_GATE';
}

function parseApprovals(markdown) {
  const records = [];
  let current = {};
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'approval_id' && Object.keys(current).length > 0) {
      records.push(current);
      current = {};
    }
    current[key] = value;
  }
  if (Object.keys(current).length > 0) records.push(current);
  return records;
}

function hasActiveApproval(records, gate) {
  const now = Date.now();
  return records.some((record) => {
    if (!record.approved_gate || record.approved_gate !== gate) return false;
    if (!record.approval_id || record.approval_id === 'NO_ACTIVE_APPROVAL') return false;
    if (record.expires_at) {
      const expiresAt = Date.parse(record.expires_at);
      if (Number.isFinite(expiresAt) && expiresAt < now) return false;
    }
    return true;
  });
}

function inferFlags(intent) {
  const lower = intent.toLowerCase();
  const allowReadOnly =
    /只读|审计|不写|不执行|no\s+remote\s+write|read-only|read only|不部署|不重启|不 push|不push/.test(lower);
  const pauseOnly = /暂停|只生成|不执行任何动作|plan only|计划/.test(lower);
  const highThroughput = /高吞吐|并发|parallel/.test(lower);
  const clearCandidates = /明确候选|auto_claim_ready|clear candidates|上一个 dry-run|上一 dry-run/.test(lower);
  const denyManualHold = /manual\/hold|manual|hold|人工|不执行 manual|不执行.*hold/i.test(intent);
  return {
    allowReadOnly,
    pauseOnly,
    highThroughput,
    clearCandidates,
    denyManualHold,
  };
}

function summarizeNextGate({ gate, nextGateText }) {
  const lines = nextGateText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recommendation = lines.find((line) => line.includes(gate)) || gate;
  const manualHold = /MANUAL_REVIEW_REQUIRED|HOLD/.test(nextGateText)
    ? 'Manual-review and HOLD items remain excluded.'
    : 'No manual/HOLD exclusion was detected in the recommendation.';
  const actionBit = /ACTION_BIT|action-bit|C\/A|V\/E\/X/i.test(nextGateText)
    ? 'Action-bit compatibility cleanup is a separate future Gate.'
    : 'No action-bit follow-up was detected.';
  return [recommendation, manualHold, actionBit].join('\n');
}

function gateAgentGuidance(gate) {
  if (/INITIAL_DATA_IMPORT/i.test(gate)) {
    return {
      allowedAgents: ['A5-Data-Readiness', 'A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate'],
      description:
        'This Gate is a read-only initial data import diagnosis. Route to A5 data readiness, A2 security review, and A1 validation only.',
    };
  }
  if (/MASTER_DATA/i.test(gate)) {
    return {
      allowedAgents: ['A5-Data-Readiness', 'A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate'],
      description:
        'This Gate is a read-only master data remediation planning Gate. Route to A5, A2, and A1 only unless a later approval widens scope.',
    };
  }
  if (/ACTION_BIT/i.test(gate)) {
    return {
      allowedAgents: ['A2-Security-Regression-Gate', 'A1-CI-Runtime-Gate', 'Codex-Orchestrator'],
      description:
        'This Gate is action-bit cleanup planning. Route to A2/A1/Codex-Orchestrator unless implementation is separately approved.',
    };
  }
  return {
    allowedAgents: [],
    description: 'Use Agent Router to choose the safest route. If uncertain, use Codex-Orchestrator route-review.',
  };
}

function buildExpandedRequest({ intent, gate, projectState, nextGateText, guardrailsText, flags, args }) {
  const guidance = gateAgentGuidance(gate);
  const constraints = [
    'no push。',
    'no deploy。',
    'no restart。',
    'no migration。',
    'no cleanup/reset。',
    '禁止修改业务代码。',
    '禁止修改远端服务器配置。',
  ];
  if (args.noRemoteWrite || flags.allowReadOnly) {
    constraints.push('no DB write。');
    constraints.push('no remote write。');
  }
  if (flags.denyManualHold) {
    constraints.push('不执行 MANUAL_REVIEW_REQUIRED 项，不执行 HOLD 项。');
  }
  if (flags.clearCandidates) {
    constraints.push('只处理上一 dry-run 或 recommendation 中明确列出的 clear candidates。');
  }
  if (guidance.allowedAgents.length > 0) {
    constraints.push(`只允许 ${guidance.allowedAgents.join(' / ')}。`);
    constraints.push('不允许 A3/A4/A6/A7 执行。');
  }

  return `Agent Inbox short command expanded request.

User short intent:
${intent}

Current runtime stage:
${projectState.current_stage || 'UNKNOWN'}

Active decision:
${projectState.active_decision || 'UNKNOWN'}

Inferred next Gate:
${gate}

Next Gate recommendation summary:
${summarizeNextGate({ gate, nextGateText })}

Routing guidance:
${guidance.description}

Hard constraints:
${constraints.map((item) => `- ${item}`).join('\n')}

Guardrail anchor:
${guardrailsText.split(/\r?\n/).slice(0, 24).join('\n')}

Required behavior:
1. Generate a complete route plan from runtime memory, next-gate recommendation, guardrails, and task board.
2. Default to dry-run unless an active approval exactly matches the inferred Gate.
3. If execution is not approved, do not execute remote operations.
4. Write results to Agent Inbox OUTBOX and docs/ops/runs.
`;
}

function writeOutbox({ projectState, gate, intent, result, runJsonPath, runMdPath, command, stdout, stderr }) {
  const text = `# Agent Inbox Outbox

Last updated: ${new Date().toISOString()}

## Current Stage

${projectState.current_stage || 'UNKNOWN'}

## User Intent

${intent}

## Inferred Gate

${gate}

## Executed Actions

- Agent Inbox runner expanded the short command.
- Runtime memory, next-gate recommendation, guardrails, and task board were read.
- Orchestrator command was ${result.orchestrator_invoked ? 'invoked' : 'not invoked'}.

## Result

${result.status}

## Command

\`\`\`bash
${command.join(' ')}
\`\`\`

## Artifacts

- Run JSON: \`${runJsonPath}\`
- Run Markdown: \`${runMdPath}\`

## Safety Flags

| Item | Result |
| --- | --- |
| DB write | No |
| Migration | No |
| Deploy | No |
| Restart | No |
| Push | No |

## Orchestrator Output Summary

\`\`\`text
${stdout.slice(0, 4000)}
${stderr ? `\nSTDERR\n${stderr.slice(0, 2000)}` : ''}
\`\`\`

## Next Approval Needed

${result.next_approval_needed}
`;
  writeFileSync(OUTBOX_FILE, text);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectState = JSON.parse(readRequired(PROJECT_STATE_FILE));
  const memoryText = readRequired(MEMORY_FILE);
  const nextActionsText = readRequired(NEXT_ACTIONS_FILE);
  const guardrailsText = readRequired(GUARDRAILS_FILE);
  const nextGateText = readRequired(NEXT_GATE_FILE);
  const taskBoardText = readRequired(TASK_BOARD_FILE);
  const userIntentText = readRequired(USER_INTENT_FILE);
  const approvalsText = readRequired(APPROVALS_FILE);
  const intent = extractSectionFirstLine(userIntentText, '## Current Short Command') || userIntentText.trim();
  if (!intent) throw new Error('USER_INTENT.md has no short command');

  const inferredGate = /下一\s*Gate|next\s+gate/i.test(intent)
    ? extractNextGate(nextGateText, projectState)
    : projectState.next_gate || extractNextGate(nextGateText, projectState);
  const approvals = parseApprovals(approvalsText);
  const approved = hasActiveApproval(approvals, inferredGate);
  const flags = inferFlags(intent);
  const parallel = flags.highThroughput ? Math.max(args.parallel, 4) : args.parallel;
  const remoteWriteForbidden = args.noRemoteWrite || flags.allowReadOnly || !approved;
  const mode = args.executeApproved && approved && !flags.pauseOnly ? 'execute-approved' : 'supervised';
  const dryRun = args.dryRun || mode !== 'execute-approved' || flags.pauseOnly;

  mkdirSync(RUNS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const requestFile = path.join(RUNS_DIR, `${stamp}-agent-inbox-expanded-request.md`);
  const runJsonPath = path.join(RUNS_DIR, `${stamp}-agent-inbox-route-plan.json`);
  const runMdPath = path.join(RUNS_DIR, `${stamp}-agent-inbox-route-plan.md`);
  const expandedRequest = buildExpandedRequest({
    intent,
    gate: inferredGate,
    projectState,
    nextGateText,
    guardrailsText,
    flags,
    args: { ...args, noRemoteWrite: remoteWriteForbidden },
  });
  writeFileSync(requestFile, expandedRequest);

  const command = [
    'node',
    'scripts/ops/agent-orchestrator.mjs',
    '--request-file',
    requestFile,
    '--mode',
    mode,
    '--parallel',
    String(parallel),
    '--output-dir',
    RUNS_DIR,
  ];
  if (dryRun) command.push('--dry-run');
  if (mode === 'execute-approved') command.push('--approval-token', APPROVAL_TOKEN);

  const child = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const stdout = child.stdout || '';
  const stderr = child.stderr || '';
  const status = child.status === 0 ? (dryRun ? 'GO_WITH_CONDITIONS' : 'GO') : 'HOLD';
  const result = {
    intent,
    inferred_gate: inferredGate,
    runtime_stage: projectState.current_stage || null,
    active_decision: projectState.active_decision || null,
    mode,
    dry_run: dryRun,
    parallel,
    approved,
    remote_write_forbidden: remoteWriteForbidden,
    flags,
    hard_constraints: {
      db_write: 'forbidden by Agent Inbox runner',
      migration: 'forbidden',
      deploy: 'forbidden',
      restart: 'forbidden',
      push: 'forbidden',
      business_code: 'forbidden for this runner task',
    },
    context_files: {
      memory: MEMORY_FILE,
      project_state: PROJECT_STATE_FILE,
      next_actions: NEXT_ACTIONS_FILE,
      guardrails: GUARDRAILS_FILE,
      next_gate_recommendation: NEXT_GATE_FILE,
      task_board: TASK_BOARD_FILE,
      user_intent: USER_INTENT_FILE,
      approvals: APPROVALS_FILE,
    },
    expanded_request_file: requestFile,
    orchestrator_invoked: true,
    orchestrator_command: command,
    orchestrator_exit_code: child.status,
    stdout_excerpt: stdout.slice(0, 4000),
    stderr_excerpt: stderr.slice(0, 2000),
    status,
    next_approval_needed: approved
      ? 'Review generated plan and Agent outputs before any further Gate.'
      : `Record explicit approval in APPROVALS.md for ${inferredGate} before execute-approved mode.`,
    safety: {
      db_write: false,
      migration: false,
      deploy: false,
      restart: false,
      push: false,
      remote_server_modified: false,
    },
    read_sizes: {
      memory: memoryText.length,
      next_actions: nextActionsText.length,
      guardrails: guardrailsText.length,
      task_board: taskBoardText.length,
    },
  };
  writeFileSync(runJsonPath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(
    runMdPath,
    `# Agent Inbox Route Plan

| Field | Value |
| --- | --- |
| Intent | ${intent} |
| Inferred Gate | ${inferredGate} |
| Mode | ${mode} |
| Dry run | ${dryRun ? 'Yes' : 'No'} |
| Parallel | ${parallel} |
| Active approval | ${approved ? 'Yes' : 'No'} |
| Result | ${status} |

## Expanded Request

\`${requestFile}\`

## Orchestrator Command

\`\`\`bash
${command.join(' ')}
\`\`\`

## Safety

- DB write: No
- Migration: No
- Deploy: No
- Restart: No
- Push: No

## Next Approval Needed

${result.next_approval_needed}
`,
  );
  writeOutbox({
    projectState,
    gate: inferredGate,
    intent,
    result,
    runJsonPath,
    runMdPath,
    command,
    stdout,
    stderr,
  });

  console.log(`Agent Inbox result: ${status}`);
  console.log(`Inferred Gate: ${inferredGate}`);
  console.log(`Mode: ${mode}`);
  console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}`);
  console.log(`Active approval: ${approved ? 'Yes' : 'No'}`);
  console.log(`Run JSON: ${runJsonPath}`);
  console.log(`Run MD: ${runMdPath}`);
  console.log(`OUTBOX: ${OUTBOX_FILE}`);
  if (child.status !== 0) {
    console.error(stderr || stdout);
    process.exit(child.status || 1);
  }
}

try {
  main();
} catch (error) {
  console.error(`agent-inbox-runner: ${error.message}`);
  process.exit(1);
}
