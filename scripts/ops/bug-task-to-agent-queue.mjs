#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { routeRequest } from './agent-route-request.mjs';
import { atomicWriteJson, persistTaskSnapshot, readQueueTasks } from './bug-runner-platform.mjs';

const QUEUE_FILE = 'docs/ops/agent-queue/tasks.json';
const EVENTS_FILE = 'docs/ops/agent-queue/events.jsonl';
const DISPATCH_MAP_FILE = 'docs/ops/AGENT_DISPATCH_MAP.json';
const RUNS_DIR = 'docs/ops/runs';
const TERMINAL_TASK_STATUSES = new Set([
  'completed',
  'completed_merged',
  'validation_completed',
  'implementation_completed',
  'skipped_not_applicable',
  'hold',
  'failed',
  'archived',
  'cancelled',
]);
const BUG_INTAKE_EXECUTION = {
  'A3-Backend-Critical-Path': {
    prompt_file: 'docs/ops/prompts/BUG_INTAKE_A3_TASK_PROMPT.md',
  },
  'A4-Frontend-UAT-Smoke': {
    prompt_file: 'docs/ops/prompts/BUG_INTAKE_A4_TASK_PROMPT.md',
  },
};

export function bugIntakeExecutionSlot(agent, taskId, fallback = {}) {
  if (!BUG_INTAKE_EXECUTION[agent]) return fallback;
  const slug = String(taskId || 'unknown-task').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    ...fallback,
    ...BUG_INTAKE_EXECUTION[agent],
    worktree: `/Users/mac/phoenix-erp-worktrees/bug-intake-${slug}`,
    branch: `codex/bug-intake-${slug}`,
  };
}

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
  atomicWriteJson(target, value);
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

export function isTechnicalRedispatch(payload) {
  const approval = getApproval(payload);
  if (approval?.redispatch !== true) return false;

  const generatedBy = String(payload.agentPlanGeneratedBy || '').trim().toLowerCase();
  const approvedBy = String(approval.approvedBy || '').trim().toLowerCase();
  const technicalActors = new Set([
    'bug_intake_runner',
    'bug-intake-runner',
    'bug intake runner',
  ]);

  return generatedBy.startsWith('redispatch-explicit:')
    && technicalActors.has(generatedBy.slice('redispatch-explicit:'.length))
    && technicalActors.has(approvedBy);
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

function collectSearchText(payload) {
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  return [
    payload.title,
    payload.description,
    payload.moduleCode || payload.module_code,
    payload.route,
    payload.url,
    payload.acceptanceCriteria,
    JSON.stringify(context.consoleErrors || []),
    JSON.stringify(context.failedRequests || []),
    JSON.stringify(context.clientContext || {}),
  ].filter(Boolean).join('\n').toLowerCase();
}

function refineRoutePlan(payload, routePlan) {
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const issueText = [
    payload.title,
    payload.description,
    payload.moduleCode || payload.module_code,
    payload.route,
    payload.url,
    payload.acceptanceCriteria,
  ].filter(Boolean).join('\n').toLowerCase();
  const errorText = [
    JSON.stringify(context.consoleErrors || []),
    JSON.stringify(context.failedRequests || []),
  ].join('\n').toLowerCase();
  const selected = new Set();
  const reasons = { ...(routePlan.bug_intake_policy_reasons || {}) };
  const add = (agent, reason) => {
    selected.add(agent);
    reasons[agent] = [...(reasons[agent] || []), reason];
  };

  const frontendSignal = /dashboard|卡片|页面|ui|ux|样式|按钮|弹窗|抽屉|表格|表单|前端|mobile|手机端|web|截图|视觉|不好看|丑|不显示中文|英文代码|转换.*中文|中文显示|标题/.test(issueText);
  const explicitBackendSignal = /\b500\b|http [45]|http[45]|报错.*http|pg|sql|unhandled|api\/|接口|后端|controller|service|patch |post |get |delete |保存失败|保存.*报错|提交失败|加载失败/.test(issueText);
  const ambientBackendSignal = /\b500\b|http 5|pg|sql|unhandled|request failed|internal server error/.test(errorText);
  const backendSignal = explicitBackendSignal || (!frontendSignal && ambientBackendSignal);
  const explicitSecuritySignal = /\b401\b|\b403\b|rbac|datascope|权限|角色|越权|菜单权限|guard|acl|auth|门禁|permission/.test(issueText);
  const securitySignal = explicitSecuritySignal || (!frontendSignal && /\b401\b|\b403\b|forbidden|permission denied/.test(errorText));
  const dataSignal = /数据字典|主数据|数据重复|数据缺失|数据不准|数据准备|readiness|公司映射|项目映射|供应商|客户映射|账户映射|好业财|chanjet|库存.*(为0|不变)|数量.*(为0|不变)/.test(issueText);
  const releaseSignal = /预发|staging|deploy|部署|发布|rollback|回滚|final qa|终验/.test(issueText);

  if (frontendSignal) {
    add('A4-Frontend-UAT-Smoke', 'bug-intake policy: UI/visual/page evidence requires A4');
  }
  if (backendSignal) {
    add('A3-Backend-Critical-Path', 'bug-intake policy: API/server/runtime evidence requires A3');
  }
  if (securitySignal) {
    add('A2-Security-Regression-Gate', 'bug-intake policy: RBAC/DataScope/auth evidence requires A2');
    add('A3-Backend-Critical-Path', 'bug-intake policy: security defect requires an implementation owner');
    if (/页面|打开|菜单|按钮|前端|账号|用户/.test(issueText)) {
      add('A4-Frontend-UAT-Smoke', 'bug-intake policy: user-facing security defect requires permission-aware UI repair');
    }
  }
  if (dataSignal) {
    add('A5-Data-Readiness', 'bug-intake policy: data/readiness/mapping evidence requires A5');
    add('A3-Backend-Critical-Path', 'bug-intake policy: data defect requires backend query/write-path implementation review');
  }
  if (releaseSignal) {
    add('A6-Staging-Deploy-Runbook', 'bug-intake policy: release/runbook evidence requires A6');
    add('A7-Final-QA-Gate', 'bug-intake policy: release decision evidence requires A7');
  }
  if (!frontendSignal && !backendSignal && !securitySignal && !dataSignal && !releaseSignal) {
    add('A3-Backend-Critical-Path', 'bug-intake fallback: backend diagnosis required because ownership is unclear');
    add('A4-Frontend-UAT-Smoke', 'bug-intake fallback: frontend diagnosis required because ownership is unclear');
  }
  add('A1-CI-Runtime-Gate', 'bug-intake policy: every repair requires A1 validation');

  if (selected.size > 1) selected.delete('Codex-Orchestrator');
  const order = [
    'A2-Security-Regression-Gate',
    'A3-Backend-Critical-Path',
    'A4-Frontend-UAT-Smoke',
    'A5-Data-Readiness',
    'A1-CI-Runtime-Gate',
    'A6-Staging-Deploy-Runbook',
    'A7-Final-QA-Gate',
    'Codex-Orchestrator',
  ];
  const selectedAgents = order.filter((agent) => selected.has(agent));
  return {
    ...routePlan,
    route_decision: routePlan.route_decision === 'HOLD' ? 'HOLD' : (selectedAgents.length ? 'PLAN_READY' : routePlan.route_decision),
    selected_agents: selectedAgents,
    selected_agents_after_bug_intake_policy: selectedAgents,
    bug_intake_policy_reasons: reasons,
  };
}

export function resolveRoutePlan(payload) {
  const plannedRoute = payload.agentPlan || routeRequest(buildRouteText(payload));
  const approval = getApproval(payload);
  const explicitRedispatch = approval?.redispatch === true
    && String(payload.agentPlanGeneratedBy || '').startsWith('redispatch-explicit:')
    && Array.isArray(plannedRoute.selected_agents)
    && plannedRoute.selected_agents.length > 0;

  if (explicitRedispatch) {
    return {
      ...plannedRoute,
      selected_agents_after_bug_intake_policy: [...plannedRoute.selected_agents],
      route_source: 'administrator-approved-explicit-redispatch',
    };
  }

  return refineRoutePlan(payload, plannedRoute);
}

function compactContractPayload(payload) {
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const truncate = (value, max = 4000) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    return text.length <= max ? value : `${text.slice(0, max)}\n...[truncated by bug-intake contract builder]`;
  };
  return {
    bugNo: payload.bugNo || payload.bug_no || '',
    taskNo: payload.taskNo || payload.task_no || '',
    title: payload.title || '',
    description: truncate(payload.description || '', 6000),
    route: payload.route || '',
    url: payload.url || '',
    priority: payload.priority || '',
    severity: payload.severity || '',
    moduleCode: payload.moduleCode || payload.module_code || '',
    acceptanceCriteria: truncate(payload.acceptanceCriteria || '', 4000),
    reporter: payload.reporter || null,
    context: {
      attachments: context.attachments || [],
      consoleErrors: truncate(context.consoleErrors || [], 6000),
      failedRequests: truncate(context.failedRequests || [], 6000),
      clientContext: context.clientContext || null,
      localEvidence: {
        localAttachmentPaths: context.localEvidence?.localAttachmentPaths || payload.localEvidence?.localAttachmentPaths || [],
      },
    },
    failureClassification: payload.failureClassification || null,
    agentExecutionApproval: payload.agentExecutionApproval || null,
  };
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
    JSON.stringify(compactContractPayload(payload), null, 2),
    '```',
    ``,
    `## Local Evidence`,
    ``,
    ...((payload.context?.localEvidence?.localAttachmentPaths || payload.localEvidence?.localAttachmentPaths || []).length
      ? (payload.context?.localEvidence?.localAttachmentPaths || payload.localEvidence?.localAttachmentPaths || []).map((file) => `- ${file}`)
      : ['- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.']),
    ``,
  ].join('\n');
}

function buildTasks(payload, plan, dispatchMap) {
  const bugNo = payload.bugNo || payload.bug_no || 'BUG-UNKNOWN';
  const repairTaskNo = payload.taskNo || payload.task_no || plan.source_repair_task_no || `BUGTASK-${nowStamp()}`;
  const selected = plan.selected_agents || [];
  const approval = getApproval(payload);
  const redispatchCount = Number(payload.redispatchCount || approval?.redispatchCount || 0);
  const tasks = selected.map((agent) => {
    const short = agentShort(agent);
    const taskId = `${repairTaskNo}-${short}`;
    const cfg = bugIntakeExecutionSlot(agent, taskId, dispatchMap[agent] || {});
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
      route_active: true,
      route_selected_agents: selected,
      redispatch_count: redispatchCount,
      last_redispatch_at: Array.isArray(payload.redispatchHistory) && payload.redispatchHistory.length
        ? payload.redispatchHistory[payload.redispatchHistory.length - 1]?.redispatchedAt || null
        : null,
    };
  });
  const byAgent = new Map(tasks.map((task) => [task.agent, task]));
  const implementationIds = ['A3-Backend-Critical-Path', 'A4-Frontend-UAT-Smoke']
    .map((agent) => byAgent.get(agent)?.task_id)
    .filter(Boolean);
  const a5Id = byAgent.get('A5-Data-Readiness')?.task_id;
  const a2Id = byAgent.get('A2-Security-Regression-Gate')?.task_id;
  const a1Id = byAgent.get('A1-CI-Runtime-Gate')?.task_id;
  const a6Id = byAgent.get('A6-Staging-Deploy-Runbook')?.task_id;

  for (const task of tasks) {
    if (task.agent === 'A3-Backend-Critical-Path' || task.agent === 'A4-Frontend-UAT-Smoke') {
      task.dependencies = a5Id ? [a5Id] : [];
    } else if (task.agent === 'A2-Security-Regression-Gate') {
      task.dependencies = implementationIds;
    } else if (task.agent === 'A1-CI-Runtime-Gate') {
      task.dependencies = [...implementationIds, ...(a2Id ? [a2Id] : []), ...(a5Id ? [a5Id] : [])];
    } else if (task.agent === 'A6-Staging-Deploy-Runbook') {
      task.dependencies = [a1Id, a2Id].filter(Boolean);
    } else if (task.agent === 'A7-Final-QA-Gate') {
      task.dependencies = [a6Id || a1Id, a2Id].filter(Boolean);
    }
  }
  return tasks;
}

export function mergeExistingQueueTask(
  previous,
  task,
  { redispatchRequested = false, preserveTerminalEvidence = false } = {},
) {
  const previousRedispatchCount = Number(previous.redispatch_count || 0);
  const nextRedispatchCount = Number(task.redispatch_count || 0);
  const newerRedispatch = redispatchRequested && nextRedispatchCount > previousRedispatchCount;
  const remoteNotReadyArchive = previous.route_active === false
    && String(previous.route_superseded_reason || '').startsWith('remote bug is not executable:');
  const interruptedApprovedReactivation = String(previous.reactivation_reason || '')
    === 'remote repair task became executable after NOT_READY archival';
  const approvedAfterRemoteNotReady = String(previous.status || '').toLowerCase() === 'archived'
    && (remoteNotReadyArchive || interruptedApprovedReactivation)
    && task.route_active !== false;

  if (newerRedispatch && preserveTerminalEvidence && previous.evidence_gate?.passed === true && [
    'completed',
    'completed_merged',
    'validation_completed',
    'implementation_completed',
    'skipped_not_applicable',
  ].includes(String(previous.status || '').toLowerCase())) {
    return {
      action: 'carried_forward_terminal',
      task: {
        ...previous,
        title: task.title,
        dependencies: task.dependencies,
        route_active: true,
        route_selected_agents: task.route_selected_agents,
        allowed_paths: task.allowed_paths,
        forbidden_paths: task.forbidden_paths,
        prompt_file: task.prompt_file,
        contract_file: task.contract_file,
        redispatch_count: nextRedispatchCount,
        last_redispatch_at: task.last_redispatch_at,
        carried_forward_at: new Date().toISOString(),
        carried_forward_reason: 'verified terminal evidence preserved across a technical redispatch generation',
      },
    };
  }

  if (!newerRedispatch && !approvedAfterRemoteNotReady) {
    if (TERMINAL_TASK_STATUSES.has(String(previous.status || '').toLowerCase())) {
      // Terminal evidence is immutable within one dispatch generation. In
      // particular, keep quarantined worktree/branch pointers instead of
      // silently restoring the shared A3/A4 execution slot on every sync.
      return { action: 'skipped_terminal', task: previous };
    }
    return {
      action: 'updated_existing',
      task: {
        ...previous,
        agent: task.agent,
        title: task.title,
        dependencies: task.dependencies,
        route_active: true,
        route_selected_agents: task.route_selected_agents,
        allowed_paths: task.allowed_paths,
        forbidden_paths: task.forbidden_paths,
        prompt_file: task.prompt_file,
        contract_file: task.contract_file,
        worktree: task.worktree,
        branch: task.branch,
      },
    };
  }

  return {
    action: 'requeued',
    task: {
      ...previous,
      ...task,
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
      completed_at: null,
      result_file: null,
      reason: null,
      route_superseded_reason: null,
      evidence_gate: null,
      implementation_commit: '',
      integrated_commit: '',
      integrated_at: null,
      changed_files: [],
      baseline_autopilot_exit_code: null,
      baseline_autopilot_skipped: null,
      redispatch_count: Math.max(previousRedispatchCount, nextRedispatchCount),
      redispatched_at: task.last_redispatch_at || new Date().toISOString(),
      carried_forward_at: null,
      carried_forward_reason: null,
      dependency_recovered_at: null,
      recovered_from_run_log: null,
      integration_method: null,
      worktree_baseline_sync: null,
      retry_after: null,
      remote_repair_status: null,
      redispatch_history: [
        ...(Array.isArray(previous.redispatch_history) ? previous.redispatch_history : []),
        {
          at: new Date().toISOString(),
          previous_status: previous.status || '',
          previous_result_file: previous.result_file || null,
          source_bug_no: task.source_bug_no,
          source_repair_task_no: task.source_repair_task_no,
          reason: approvedAfterRemoteNotReady
            ? 'remote repair task became executable after NOT_READY archival'
            : 'explicit redispatch generation',
        },
      ].slice(-20),
      reactivation_reason: approvedAfterRemoteNotReady
        ? 'remote repair task became executable after NOT_READY archival'
        : null,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repairTaskJson) usage(1);
  if (!args.dryRun && !args.apply) args.dryRun = true;
  const input = readJson(args.repairTaskJson);
  const payload = extractPayload(input);
  const dispatchMap = readJson(DISPATCH_MAP_FILE);
  const routePlan = resolveRoutePlan(payload);
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
    const queue = readQueueTasks(resolveFile(QUEUE_FILE));
    const baseQueue = structuredClone(queue);
    const existingIndex = new Map(queue.map((task, index) => [task.task_id, index]));
    const incoming = [];
    const requeued = [];
    const approvedReactivations = [];
    const skippedExisting = [];
    const approval = getApproval(payload);
    const redispatchRequested = approval?.redispatch === true;
    const preserveTerminalEvidence = isTechnicalRedispatch(payload);
    const generatedIds = new Set(tasks.map((task) => task.task_id));
    const sourceBugNo = payload.bugNo || payload.bug_no || '';
    const superseded = [];
    for (const existing of queue) {
      if (existing.source !== 'bug-intake' || existing.source_bug_no !== sourceBugNo || generatedIds.has(existing.task_id)) continue;
      if (existing.status === 'running') {
        existing.route_active = false;
        existing.route_superseded_reason = 'route refined while task was already running; result cannot satisfy current route';
        continue;
      }
      existing.route_active = false;
      existing.status = 'archived';
      existing.completed_at = existing.completed_at || new Date().toISOString();
      existing.route_superseded_reason = 'Agent removed by evidence-based bug-intake route refinement';
      superseded.push(existing.task_id);
    }
    for (const task of tasks) {
      if (!existingIndex.has(task.task_id)) {
        queue.push(task);
        incoming.push(task);
        continue;
      }
      const index = existingIndex.get(task.task_id);
      const previous = queue[index];
      const merged = mergeExistingQueueTask(previous, task, {
        redispatchRequested,
        preserveTerminalEvidence,
      });
      queue[index] = merged.task;
      if (merged.action !== 'requeued') {
        skippedExisting.push(previous);
        continue;
      }
      requeued.push(queue[index]);
      if (merged.task.reactivation_reason) approvedReactivations.push(queue[index]);
    }
    persistTaskSnapshot({
      tasksFile: resolveFile(QUEUE_FILE),
      eventsFile: resolveFile(EVENTS_FILE),
      baseTasks: baseQueue,
      incomingTasks: queue,
      explicitRedispatch: redispatchRequested || approvedReactivations.length > 0,
    });
    summary.added_tasks = incoming.map((task) => task.task_id);
    summary.requeued_tasks = requeued.map((task) => task.task_id);
    summary.approved_reactivations = approvedReactivations.map((task) => task.task_id);
    summary.skipped_existing_tasks = skippedExisting.map((task) => task.task_id);
    summary.superseded_tasks = superseded;
  }

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
