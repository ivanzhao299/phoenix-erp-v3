import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const AGENT_TASK_WORKTREE_ROOT = '/Users/mac/phoenix-erp-worktrees/agent-tasks';
export const TASK_BRANCH_PREFIX = 'codex/task';
export const WORKSPACE_POLICY = 'task-generation-isolated-v2';

const STATIC_WORKTREE_NAMES = new Set([
  'codex-orchestrator',
  'a1-ci-runtime-gate',
  'a2-security-regression-gate',
  'a3-backend-critical-path',
  'a4-frontend-uat-smoke',
  'a5-data-readiness',
  'a6-staging-deploy-runbook',
  'a7-final-qa-gate',
  'bug-intake-a3',
  'bug-intake-a4',
]);
const STATIC_AGENT_BRANCHES = new Set([
  'w5-a1-ci-runtime-gate',
  'w5-a2-security-regression-gate',
  'w5-a3-backend-critical-path',
  'w5-a4-frontend-uat-smoke',
  'w5-a5-data-readiness',
  'w5-a6-staging-deploy-runbook',
  'w5-a7-final-qa-gate',
  'codex/bug-intake-a3',
  'codex/bug-intake-a4',
]);

export function workspaceSlug(value, fallback = 'task') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return slug || fallback;
}

export function agentSlug(agent) {
  const short = String(agent || '').match(/^A(\d)(?:-|$)/i);
  if (short) return `a${short[1]}`;
  return workspaceSlug(agent, 'orchestrator').slice(0, 36);
}

export function normalizeGeneration(value) {
  const generation = Number.parseInt(String(value ?? 1), 10);
  return Number.isFinite(generation) && generation > 0 ? generation : 1;
}

export function generationFromTask(task = {}) {
  const recordedGeneration = normalizeGeneration(task.workspace_generation);
  const dispatchGeneration = normalizeGeneration(Number(task.redispatch_count || 0) + 1);
  return Math.max(recordedGeneration, dispatchGeneration);
}

export function taskWorkspaceIdentity({ taskId, agent, generation = 1, promptFile = '' }) {
  const task = workspaceSlug(taskId);
  const agentId = agentSlug(agent);
  const normalizedGeneration = normalizeGeneration(generation);
  const leaf = `${task}-g${normalizedGeneration}-${agentId}`;
  return {
    task_id: String(taskId || ''),
    agent,
    generation: normalizedGeneration,
    worktree: path.join(AGENT_TASK_WORKTREE_ROOT, leaf),
    branch: `${TASK_BRANCH_PREFIX}/${task}/g${normalizedGeneration}/${agentId}`,
    prompt_file: promptFile,
    workspace_policy: WORKSPACE_POLICY,
    reusable: false,
  };
}

export function assignTaskWorkspace(task, config = {}) {
  const identity = taskWorkspaceIdentity({
    taskId: task.task_id,
    agent: task.agent,
    generation: generationFromTask(task),
    promptFile: task.prompt_file || config.prompt_file || '',
  });
  return {
    ...task,
    worktree: identity.worktree,
    branch: identity.branch,
    prompt_file: identity.prompt_file,
    workspace_policy: identity.workspace_policy,
    workspace_generation: identity.generation,
    workspace_reusable: false,
    template_worktree: config.template_worktree || config.worktree_path || config.worktree || '',
    template_branch: config.template_branch || config.canonical_branch || config.branch || '',
  };
}

export function retireTaskGeneration(task, {
  reason,
  retiredAt = new Date().toISOString(),
  config = {},
} = {}) {
  const currentGeneration = generationFromTask(task);
  const nextGeneration = currentGeneration + 1;
  const retiredWorkspace = {
    generation: currentGeneration,
    worktree: task.worktree,
    branch: task.branch,
    retired_at: retiredAt,
    reason: reason || 'task generation retired',
  };
  return assignTaskWorkspace({
    ...task,
    workspace_generation: nextGeneration,
    redispatch_count: Math.max(Number(task.redispatch_count || 0) + 1, nextGeneration - 1),
    retired_workspaces: [
      ...(Array.isArray(task.retired_workspaces) ? task.retired_workspaces : []),
      retiredWorkspace,
    ].slice(-10),
  }, {
    prompt_file: task.prompt_file,
    worktree_path: task.template_worktree,
    canonical_branch: task.template_branch,
    ...config,
  });
}

export function approvedExecutionCommand(dryRunCommand, approvalToken = 'APPROVE_AGENT_EXECUTION') {
  if (!/(^|\s)--dry-run(?=\s|$)/.test(dryRunCommand)) {
    throw new Error('dry-run command does not contain --dry-run');
  }
  return dryRunCommand.replace(
    /(^|\s)--dry-run(?=\s|$)/,
    `$1--require-approval-token ${approvalToken}`,
  );
}

export function isStaticAgentWorktree(worktree) {
  if (!worktree) return false;
  return STATIC_WORKTREE_NAMES.has(path.basename(path.resolve(worktree)));
}

export function isStaticAgentBranch(branch) {
  return STATIC_AGENT_BRANCHES.has(String(branch || ''));
}

export function validateTaskWorkspace({ taskId, agent, generation = 1, worktree, branch }) {
  const expected = taskWorkspaceIdentity({ taskId, agent, generation });
  const errors = [];
  const resolved = worktree ? path.resolve(worktree) : '';
  if (!taskId) errors.push('task_id is required');
  if (!agent) errors.push('agent is required');
  if (isStaticAgentWorktree(resolved)) errors.push('static Agent worktree is template-only and cannot execute tasks');
  if (isStaticAgentBranch(branch)) errors.push('static Agent branch is template-only and cannot execute tasks');
  if (resolved !== expected.worktree) errors.push(`worktree identity mismatch; expected ${expected.worktree}`);
  if (branch !== expected.branch) errors.push(`branch identity mismatch; expected ${expected.branch}`);
  return { ok: errors.length === 0, errors, expected };
}

export function assertTaskWorkspace(input) {
  const result = validateTaskWorkspace(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.expected;
}

function git(args, cwd) {
  try {
    return {
      ok: true,
      output: execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ''}${error.stderr || ''}`.trim() || error.message,
    };
  }
}

export function ensureTaskWorkspace({
  taskId,
  agent,
  generation = 1,
  worktree,
  branch,
  mainRoot = process.cwd(),
  dryRun = false,
}) {
  const validation = validateTaskWorkspace({ taskId, agent, generation, worktree, branch });
  if (!validation.ok) return { ok: false, error: validation.errors.join('; '), expected: validation.expected };
  if (existsSync(worktree)) {
    const actualBranch = git(['branch', '--show-current'], worktree);
    if (!actualBranch.ok || actualBranch.output !== branch) {
      return { ok: false, error: `existing worktree branch mismatch: ${actualBranch.output || '<unknown>'}` };
    }
    return { ok: true, created: false, reason: 'task workspace already exists' };
  }
  if (dryRun) return { ok: true, created: false, dryRun: true, reason: 'would create from origin/main' };

  const refresh = git(['fetch', 'origin', 'main'], mainRoot);
  if (!refresh.ok) return { ok: false, error: `cannot refresh origin/main: ${refresh.output}` };
  const branchExists = git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], mainRoot).ok;
  if (branchExists) {
    return {
      ok: false,
      error: `retired task-generation branch already exists without its worktree: ${branch}; increment workspace_generation`,
    };
  }
  mkdirSync(path.dirname(worktree), { recursive: true });
  const created = git(['worktree', 'add', '-b', branch, worktree, 'origin/main'], mainRoot);
  return created.ok
    ? { ok: true, created: true, worktree, branch }
    : { ok: false, error: `cannot create task workspace: ${created.output}` };
}
