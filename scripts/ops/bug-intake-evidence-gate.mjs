#!/usr/bin/env node

const CODE_AGENT_PREFIXES = new Map([
  ['A3-Backend-Critical-Path', ['apps/api/']],
  ['A4-Frontend-UAT-Smoke', ['apps/web/']],
]);

const VALIDATION_AGENTS = new Set([
  'A1-CI-Runtime-Gate',
  'A2-Security-Regression-Gate',
  'A5-Data-Readiness',
  'A6-Staging-Deploy-Runbook',
  'A7-Final-QA-Gate',
]);

const TERMINAL_SUCCESS = new Set([
  'COMPLETED_MERGED',
  'VALIDATION_COMPLETED',
  'SKIPPED_NOT_APPLICABLE',
]);

const HOLD_STATUSES = new Set(['HOLD', 'hold', 'failed']);

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizedConclusion(text) {
  const value = String(text || '').toUpperCase();
  const candidates = [
    ['PASS_WITH_CONDITIONS', /\bPASS WITH CONDITIONS\b/],
    ['GO_WITH_CONDITIONS', /\bGO WITH CONDITIONS\b/],
    ['HOLD', /\bHOLD\b/],
    ['FAIL', /\bFAIL\b/],
    ['PASS', /\bPASS\b/],
    ['GO', /\bGO\b/],
  ].map(([conclusion, pattern]) => ({ conclusion, index: value.search(pattern) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (candidates.length > 0) return candidates[0].conclusion;
  return '';
}

function extractAgentResponse(stdout) {
  const raw = String(stdout || '');
  const runLogIndex = raw.indexOf('Run log:');
  const body = runLogIndex >= 0 ? raw.slice(raw.indexOf('\n', runLogIndex) + 1) : raw;
  return body
    .replace(/Baseline autopilot skipped by caller[^\n]*\n?/gi, '')
    .replace(/Running baseline autopilot after agent completion[^\n]*\n?/gi, '')
    .replace(/Baseline autopilot command:[^\n]*\n?/gi, '')
    .replace(/Baseline autopilot exit code:[^\n]*\n?/gi, '')
    .trim();
}

function isNotApplicable(response) {
  return /not applicable|no (new )?(backend|frontend)( source)?[ -]owned (fix|change)|no new (backend|frontend) source changes|existing owned (backend|frontend) diff evidence|belongs to (A3|A4)|outside .* scope|already (present|implemented|fixed)|already contains .*fix|fix .* already present|不属于.*范围|无需修改(后端|前端)|应由 ?A[1345]|修复.*已(存在|完成)|已经修复|已有.*修复|没有新增(后端|前端)(源码|代码)修改/i.test(response);
}

function reportFilesForTask(task, changedFiles) {
  const bugNo = String(task?.source_bug_no || '').toLowerCase();
  const taskId = String(task?.task_id || '').toLowerCase();
  return unique(changedFiles).filter((file) => {
    const lower = file.toLowerCase();
    if (!lower.startsWith('docs/ops/') || lower.startsWith('docs/ops/runs/')) return false;
    return (bugNo && lower.includes(bugNo)) || (taskId && lower.includes(taskId));
  });
}

export function evaluateWorkerEvidence(input = {}) {
  const task = input.task || {};
  const exitCode = Number(input.exitCode ?? 1);
  const changedFiles = unique(input.changedFiles);
  const response = extractAgentResponse(input.stdout);
  const parentCommitRecovered = input.parentCommitRecovered === true;
  const conclusion = parentCommitRecovered ? 'PASS_WITH_CONDITIONS' : normalizedConclusion(response);
  const expectedPrefixes = CODE_AGENT_PREFIXES.get(task.agent) || [];
  const businessChangedFiles = changedFiles.filter((file) => expectedPrefixes.some((prefix) => file.startsWith(prefix)));
  const reportFiles = reportFilesForTask(task, changedFiles);
  const commitHash = input.beforeHead && input.afterHead && input.beforeHead !== input.afterHead ? String(input.afterHead) : '';
  const base = {
    version: 1,
    agent: task.agent || '',
    exitCode,
    conclusion,
    responseChars: response.length,
    beforeHead: input.beforeHead || '',
    afterHead: input.afterHead || '',
    commitHash,
    changedFiles,
    businessChangedFiles,
    reportFiles,
    parentCommitRecovered,
    checkedAt: new Date().toISOString(),
  };

  if (exitCode !== 0) {
    return { ...base, passed: false, role: 'execution', terminalStatus: 'HOLD', reason: `Agent process exited with ${exitCode}` };
  }

  if (VALIDATION_AGENTS.has(task.agent)) {
    if (!response || ['HOLD', 'FAIL'].includes(conclusion)) {
      return { ...base, passed: false, role: 'validation', terminalStatus: 'HOLD', reason: response ? `Validation conclusion is ${conclusion}` : 'Validation produced no evidence' };
    }
    return { ...base, passed: true, role: 'validation', terminalStatus: 'VALIDATION_COMPLETED', reason: 'Validation evidence recorded; this is not implementation evidence' };
  }

  if (expectedPrefixes.length > 0) {
    if (!response) {
      return { ...base, passed: false, role: 'implementation', terminalStatus: 'HOLD', reason: 'Codex exited 0 but produced no Agent result' };
    }
    if (businessChangedFiles.length === 0 && isNotApplicable(response)) {
      return {
        ...base,
        passed: true,
        role: 'implementation_verified_existing',
        terminalStatus: 'SKIPPED_NOT_APPLICABLE',
        reason: 'Agent verified an already-integrated implementation in its ownership boundary without redundant code churn',
      };
    }
    if (['HOLD', 'FAIL'].includes(conclusion)) {
      return { ...base, passed: false, role: 'implementation', terminalStatus: 'HOLD', reason: `Agent conclusion is ${conclusion}` };
    }
    if (businessChangedFiles.length > 0 && commitHash && reportFiles.length > 0 && conclusion) {
      return { ...base, passed: true, role: 'implementation', terminalStatus: 'IMPLEMENTATION_COMPLETED', reason: 'Business change, task report, commit, and conclusion are present' };
    }
    const missing = [];
    if (businessChangedFiles.length === 0) missing.push('approved business-file change');
    if (!commitHash) missing.push('new implementation commit');
    if (reportFiles.length === 0) missing.push('task-specific report');
    if (!conclusion) missing.push('explicit PASS/GO/HOLD/FAIL conclusion');
    return { ...base, passed: false, role: 'implementation', terminalStatus: 'HOLD', reason: `Missing implementation evidence: ${missing.join(', ')}` };
  }

  return { ...base, passed: false, role: 'unknown', terminalStatus: 'HOLD', reason: `No evidence policy exists for ${task.agent || 'unknown agent'}` };
}

export function evaluateBugReleaseEvidence(tasks = [], selectedAgents = []) {
  const selected = unique(selectedAgents);
  const activeTasks = tasks.filter((task) => task.route_active !== false);
  const routePool = activeTasks.length > 0 ? activeTasks : tasks;
  const latestRedispatch = routePool.length > 0
    ? Math.max(...routePool.map((task) => Number(task.redispatch_count || 0)))
    : 0;
  const latestRouteTasks = routePool.filter((task) => Number(task.redispatch_count || 0) === latestRedispatch);
  const selectedTasks = selected.map((agent) => latestRouteTasks.find((task) => task.agent === agent)).filter(Boolean);
  const missingAgents = selected.filter((agent) => !selectedTasks.some((task) => task.agent === agent));
  const unfinished = selectedTasks.filter((task) => !TERMINAL_SUCCESS.has(task.status) && !HOLD_STATUSES.has(task.status));
  const failed = selectedTasks.filter((task) => HOLD_STATUSES.has(task.status) || task.evidence_gate?.passed === false);
  const implementationTasks = selectedTasks.filter((task) => (
    ['implementation', 'implementation_verified_existing'].includes(task.evidence_gate?.role)
    && task.evidence_gate?.passed === true
  ));
  const validationTasks = selectedTasks.filter((task) => task.evidence_gate?.role === 'validation' && task.evidence_gate?.passed === true);
  const a1Required = selected.includes('A1-CI-Runtime-Gate');
  const a1Passed = !a1Required || validationTasks.some((task) => task.agent === 'A1-CI-Runtime-Gate');
  const reasons = [];
  if (selected.length === 0) reasons.push('selected agent list is empty');
  if (missingAgents.length) reasons.push(`missing tasks: ${missingAgents.join(', ')}`);
  if (unfinished.length) reasons.push(`unfinished tasks: ${unfinished.map((task) => task.task_id).join(', ')}`);
  if (failed.length) reasons.push(`failed evidence tasks: ${failed.map((task) => task.task_id).join(', ')}`);
  if (implementationTasks.length === 0) reasons.push('no verified business implementation task');
  if (!a1Passed) reasons.push('A1 validation evidence is missing');
  return {
    version: 1,
    passed: reasons.length === 0,
    decision: reasons.length === 0 ? 'RELEASE_EVIDENCE_READY' : 'RELEASE_EVIDENCE_HOLD',
    selectedAgents: selected,
    missingAgents,
    unfinishedTasks: unfinished.map((task) => task.task_id),
    failedTasks: failed.map((task) => task.task_id),
    implementationTasks: implementationTasks.map((task) => task.task_id),
    validationTasks: validationTasks.map((task) => task.task_id),
    changedFiles: unique(implementationTasks.flatMap((task) => task.evidence_gate?.businessChangedFiles || [])),
    commitHashes: unique(implementationTasks.map((task) => task.evidence_gate?.commitHash)),
    reasons,
  };
}

function selfTest() {
  const task = { task_id: 'BUGTASK-X-02-A3', source_bug_no: 'BUG-X', agent: 'A3-Backend-Critical-Path' };
  const empty = evaluateWorkerEvidence({ task, exitCode: 0, stdout: 'Run log: x\nBaseline autopilot skipped by caller', beforeHead: 'a', afterHead: 'a', changedFiles: [] });
  if (empty.passed || empty.terminalStatus !== 'HOLD') throw new Error('empty Agent result must HOLD');
  const valid = evaluateWorkerEvidence({ task, exitCode: 0, stdout: 'Run log: x\nPASS WITH CONDITIONS\nChanged backend service', beforeHead: 'a', afterHead: 'b', changedFiles: ['apps/api/src/x.ts', 'docs/ops/BUG-X_A3_REPORT.md'] });
  if (!valid.passed || valid.role !== 'implementation') throw new Error('valid implementation evidence must pass');
  const release = evaluateBugReleaseEvidence([
    { ...task, status: 'COMPLETED_MERGED', evidence_gate: valid },
    { task_id: 'BUGTASK-X-05-A1', agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED', evidence_gate: { passed: true, role: 'validation' } },
  ], ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate']);
  if (!release.passed) throw new Error(`release evidence should pass: ${release.reasons.join('; ')}`);
  const redispatchedRelease = evaluateBugReleaseEvidence([
    { ...task, task_id: 'BUGTASK-X-OLD-A3', status: 'archived', route_active: false, redispatch_count: 0 },
    { task_id: 'BUGTASK-X-OLD-A1', agent: 'A1-CI-Runtime-Gate', status: 'archived', route_active: false, redispatch_count: 0 },
    { ...task, task_id: 'BUGTASK-X-A3', status: 'COMPLETED_MERGED', route_active: true, redispatch_count: 1, evidence_gate: valid },
    { task_id: 'BUGTASK-X-A1', agent: 'A1-CI-Runtime-Gate', status: 'VALIDATION_COMPLETED', route_active: true, redispatch_count: 1, evidence_gate: { passed: true, role: 'validation' } },
  ], ['A3-Backend-Critical-Path', 'A1-CI-Runtime-Gate']);
  if (!redispatchedRelease.passed) throw new Error(`latest redispatch evidence should pass: ${redispatchedRelease.reasons.join('; ')}`);
  console.log('BUG_INTAKE_EVIDENCE_GATE_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) selfTest();
