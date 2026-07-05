#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { routeRequest } from './agent-route-request.mjs';

const QUEUE_FILE = 'docs/ops/agent-queue/tasks.json';
const DISPATCH_MAP_FILE = 'docs/ops/AGENT_DISPATCH_MAP.json';
const RUNS_DIR = 'docs/ops/runs';

function usage(code = 1) {
  console.log(`Usage:
  node scripts/ops/bug-task-to-agent-queue.mjs \\
    --repair-task-json docs/ops/runs/bugtask.json \\
    [--dry-run] [--apply]

The JSON may be a full bug report detail, a repair_task_payload object, or an object containing agentPlan.`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveFile(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function readJson(file) {
  return JSON.parse(readFileSync(resolveFile(file), 'utf8'));
}

function writeJson(file, value) {
  const target = resolveFile(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function nowStamp() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function extractPayload(input) {
  if (input.repairTaskPayload) return input.repairTaskPayload;
  if (input.repair_task_payload) return input.repair_task_payload;
  return input;
}

function getApproval(payload) {
  const approval = payload.agentExecutionApproval || payload.agent_execution_approval;
  return approval && typeof approval === 'object' ? approval : null;
}

function isAgentExecutionApproved(payload) {
  return getApproval(payload)?.approved === true;
}

function buildRouteText(payload) {
  return [
    payload.title,
    payload.bugNo || payload.bug_no,
    payload.taskNo || payload.task_no,
    payload.moduleCode || payload.module_code,
    payload.route,
    payload.url,
    payload.acceptanceCriteria,
    JSON.stringify(payload.context || {}),
    JSON.stringify(payload.agentPlan || {}),
  ].filter(Boolean).join('\n');
}

function agentShort(agent) {
  const match = agent.match(/^A(\d)/);
  return match ? `A${match[1]}` : 'ORCH';
}

function taskContract(payload, agent) {
  return [
    `# Bug Repair Agent Contract`,
    ``,
    `Source bug: ${payload.bugNo || payload.bug_no || 'UNKNOWN'}`,
    `Source repair task: ${payload.taskNo || payload.task_no || 'UNKNOWN'}`,
    `Assigned agent: ${agent}`,
    ``,
    `## Issue`,
    ``,
    payload.title || '',
    ``,
    `## Route`,
    ``,
    payload.route || '',
    ``,
    `## Guardrails`,
    ``,
    `- Start with dry-run / diagnosis.`,
    `- Do not deploy automatically.`,
    `- Do not write database or run migration without explicit gate.`,
    `- Preserve RBAC, DataScope, audit, and attachment ACL.`,
    `- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.`,
    ``,
    `## Context`,
    ``,
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    ``,
  ].join('\n');
}

function buildTasks(payload, plan, dispatchMap) {
  const bugNo = payload.bugNo || payload.bug_no || 'BUG-UNKNOWN';
  const repairTaskNo = payload.taskNo || payload.task_no || plan.source_repair_task_no || `BUGTASK-${nowStamp()}`;
  const selected = plan.selected_agents || [];
  return selected.map((agent, index) => {
    const cfg = dispatchMap[agent] || {};
    const short = agentShort(agent);
    const taskId = `${repairTaskNo}-${String(index + 1).padStart(2, '0')}-${short}`;
    const contractFile = `${RUNS_DIR}/${taskId}-contract.md`;
    return {
      task_id: taskId,
      request_id: repairTaskNo,
      title: `Repair ${bugNo}: ${payload.title || 'bug intake issue'} (${agent})`,
      source_bug_no: bugNo,
      source_repair_task_no: repairTaskNo,
      source: 'bug-intake',
      agent,
      status: 'pending',
      priority: payload.priority || (agent.includes('A1') || agent.includes('A2') ? 'P0' : 'P1'),
      risk_level: agent.includes('A3') || agent.includes('A4') ? 'MEDIUM/HIGH' : 'LOW/MEDIUM',
      allowed_paths: cfg.allowed_paths || ['docs/ops/**'],
      forbidden_paths: cfg.forbidden_paths || ['production deploy', 'DB write', 'migration execution'],
      prompt_file: cfg.prompt_file || '',
      contract_file: contractFile,
      request_spec: '',
      worktree: cfg.worktree || cfg.worktree_path || '',
      branch: cfg.branch || cfg.canonical_branch || '',
      dependencies: [],
      claimed_by: null,
      claimed_at: null,
      completed_at: null,
      result_file: null,
      next_agents: cfg.handoff_to || [],
      approval_required: true,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repairTaskJson) usage(1);
  if (!args.dryRun && !args.apply) args.dryRun = true;
  const input = readJson(args.repairTaskJson);
  const payload = extractPayload(input);
  const dispatchMap = readJson(DISPATCH_MAP_FILE);
  const routePlan = payload.agentPlan || routeRequest(buildRouteText(payload));
  if (routePlan.route_decision === 'HOLD') {
    console.log('HOLD: route plan is HOLD; no agent queue tasks generated.');
    console.log(JSON.stringify(routePlan.held_reasons || [], null, 2));
    process.exit(2);
  }

  if (args.apply && !isAgentExecutionApproved(payload)) {
    console.error('HOLD: --apply requires repair_task_payload.agentExecutionApproval.approved = true.');
    console.error('Generate an Agent plan in ERP, then approve "投入 Agent 队列" before applying queue tasks.');
    process.exit(2);
  }

  const tasks = buildTasks(payload, routePlan, dispatchMap);
  const summary = {
    decision: 'BUG_TASK_QUEUE_PLAN_READY',
    source_repair_task_no: payload.taskNo || payload.task_no || routePlan.source_repair_task_no,
    selected_agents: routePlan.selected_agents,
    generated_tasks: tasks.map((task) => task.task_id),
    agent_execution_approval: getApproval(payload),
    apply: Boolean(args.apply),
  };

  mkdirSync(resolveFile(RUNS_DIR), { recursive: true });
  writeJson(`${RUNS_DIR}/bug-task-agent-queue-plan-latest.json`, { summary, routePlan, tasks });
  writeFileSync(
    resolveFile(`${RUNS_DIR}/bug-task-agent-queue-plan-latest.md`),
    `# Bug Task Agent Queue Plan\n\n## Selected Agents\n\n${(routePlan.selected_agents || []).map((a) => `- ${a}`).join('\n') || '- None'}\n\n## Generated Tasks\n\n${tasks.map((t) => `- ${t.task_id} -> ${t.agent}`).join('\n') || '- None'}\n`,
  );
  for (const task of tasks) {
    writeFileSync(resolveFile(task.contract_file), taskContract(payload, task.agent));
  }

  if (args.apply) {
    const queue = existsSync(resolveFile(QUEUE_FILE)) ? readJson(QUEUE_FILE) : [];
    const existing = new Set(queue.map((task) => task.task_id));
    const incoming = tasks.filter((task) => !existing.has(task.task_id));
    queue.push(...incoming);
    writeJson(QUEUE_FILE, queue);
    summary.added_tasks = incoming.map((task) => task.task_id);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
