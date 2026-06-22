#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { routeRequest } from './agent-route-request.mjs';

const ROOT = process.cwd();
const RUNS_DIR = 'docs/ops/runs';
const TASKS_FILE = 'docs/ops/agent-queue/tasks.json';
const TASK_BOARD_FILE = 'docs/ops/AGENT_TASK_BOARD.md';
const ROUTER_RULES_FILE = 'docs/ops/AGENT_ROUTER_RULES.json';
const DISPATCH_MAP_FILE = 'docs/ops/AGENT_DISPATCH_MAP.json';
const AGENTS = [
  'Codex-Orchestrator',
  'A1-CI-Runtime-Gate',
  'A2-Security-Regression-Gate',
  'A3-Backend-Critical-Path',
  'A4-Frontend-UAT-Smoke',
  'A5-Data-Readiness',
  'A6-Staging-Deploy-Runbook',
  'A7-Final-QA-Gate',
];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-observer.mjs [--output-dir docs/ops/runs] [--dry-run]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const args = { outputDir: RUNS_DIR, dryRun: true };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      args[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function safe(command, args, options = {}) {
  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd || ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: output.trim() };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString().trim() || error.message };
  }
}

function readJson(file, fallback) {
  const resolved = resolvePath(file);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(file) {
  const resolved = resolvePath(file);
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : '';
}

function walk(dir) {
  const resolved = resolvePath(dir);
  if (!existsSync(resolved)) return [];
  const files = [];
  for (const entry of readdirSync(resolved)) {
    const full = path.join(resolved, entry);
    const relative = path.relative(ROOT, full);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...walk(relative));
    else files.push(relative);
  }
  return files;
}

function addFinding(findings, data) {
  findings.push({
    id: `OBS-${String(findings.length + 1).padStart(4, '0')}`,
    severity: data.severity || 'LOW',
    category: data.category || 'general',
    affected_agent: data.affected_agent || 'Codex-Orchestrator',
    evidence: data.evidence || '',
    suggested_fix: data.suggested_fix || '',
    auto_fix_eligible: Boolean(data.auto_fix_eligible),
    requires_human_gate: Boolean(data.requires_human_gate),
    recommended_next_task: data.recommended_next_task || '',
  });
}

function extractSection(text, heading) {
  const pattern = new RegExp(`## ${heading}\\n+([\\s\\S]*?)(\\n## |$)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function parseMarkdownAgents(section) {
  return section
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => AGENTS.some((agent) => line.includes(agent)))
    .map((line) => AGENTS.find((agent) => line.includes(agent)))
    .filter(Boolean);
}

function loadRunPlans(runFiles) {
  const plans = [];
  for (const file of runFiles) {
    if (!/(route-plan|orchestration-plan)\.(json|md)$/.test(file)) continue;
    if (file.endsWith('.json')) {
      const data = readJson(file, null);
      if (!data) continue;
      plans.push({
        file,
        request: data.request || data.request_text || '',
        selected_agents: data.selected_agents || [],
        held_reasons: data.held_reasons || [],
        parallel_groups: data.parallel_groups || data.dispatch_groups || [],
      });
    } else {
      const text = readText(file);
      plans.push({
        file,
        request: extractSection(text, 'Request'),
        selected_agents: parseMarkdownAgents(extractSection(text, 'Selected Agents')),
        held_reasons: extractSection(text, 'Held Reasons').includes('None') ? [] : extractSection(text, 'Held Reasons').split('\n').filter(Boolean),
        parallel_groups: extractSection(text, 'Dispatch Groups')
          .split('\n')
          .filter((line) => line.includes('Group')),
      });
    }
  }
  return plans.filter((plan) => plan.request);
}

function observeRouting(findings, runFiles) {
  const plans = loadRunPlans(runFiles);
  for (const plan of plans) {
    const routed = routeRequest(plan.request);
    if (routed.route_decision === 'HOLD') continue;
    const expected = routed.selected_agents || [];
    const selected = plan.selected_agents || [];
    const missing = expected.filter((agent) => !selected.includes(agent));
    if (missing.length > 0) {
      addFinding(findings, {
        severity: missing.some((agent) => ['A2-Security-Regression-Gate', 'A3-Backend-Critical-Path'].includes(agent)) ? 'HIGH' : 'MEDIUM',
        category: 'routing',
        affected_agent: missing.join(', '),
        evidence: `${plan.file}: expected ${expected.join(', ')} but selected ${selected.join(', ') || 'none'}`,
        suggested_fix: 'Re-run Agent Router against the source request and update routing rules or orchestration plan generation.',
        auto_fix_eligible: true,
        requires_human_gate: false,
        recommended_next_task: 'Create an ops-only router regression task for the missing Agent signals.',
      });
    }
    if (expected.includes('A1-CI-Runtime-Gate') && expected.includes('A2-Security-Regression-Gate') && expected.includes('A5-Data-Readiness')) {
      const firstGroup = JSON.stringify(plan.parallel_groups?.[0] || '');
      if (!firstGroup.includes('A1-CI-Runtime-Gate') || !firstGroup.includes('A2-Security-Regression-Gate') || !firstGroup.includes('A5-Data-Readiness')) {
        addFinding(findings, {
          severity: 'LOW',
          category: 'parallel-dispatch',
          affected_agent: 'A1/A2/A5',
          evidence: `${plan.file}: readonly validation Agents are selected but not clearly grouped together.`,
          suggested_fix: 'Prefer A1/A2/A5 in one readonly-validation dispatch group when the request is docs-only or validation-only.',
          auto_fix_eligible: true,
          requires_human_gate: false,
          recommended_next_task: 'Add a parallel-group regression fixture to agent-orchestrator.',
        });
      }
    }
  }
}

function observeQueue(findings, tasks) {
  const seen = new Map();
  const byStatus = {};
  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    seen.set(task.task_id, (seen.get(task.task_id) || 0) + 1);
    if (task.status === 'claimed' && task.claimed_at) {
      const ageHours = (Date.now() - Date.parse(task.claimed_at)) / 36e5;
      if (ageHours > 24) {
        addFinding(findings, {
          severity: 'MEDIUM',
          category: 'task-queue',
          affected_agent: task.agent,
          evidence: `${task.task_id} has been claimed for ${ageHours.toFixed(1)} hours.`,
          suggested_fix: 'Diagnose the worker run and release or HOLD the task with a reason.',
          auto_fix_eligible: false,
          requires_human_gate: true,
          recommended_next_task: `Review stale claimed task ${task.task_id}.`,
        });
      }
    }
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    addFinding(findings, {
      severity: 'HIGH',
      category: 'task-queue',
      affected_agent: 'Codex-Orchestrator',
      evidence: `Duplicate task_id values: ${duplicates.map(([id]) => id).join(', ')}`,
      suggested_fix: 'Deduplicate docs/ops/agent-queue/tasks.json and add queue insertion duplicate checks.',
      auto_fix_eligible: true,
      requires_human_gate: false,
      recommended_next_task: 'Harden agent-task-queue duplicate protection.',
    });
  }
  if ((byStatus.hold || 0) + (byStatus.HOLD || 0) > 3) {
    addFinding(findings, {
      severity: 'MEDIUM',
      category: 'repeat-hold',
      affected_agent: 'Codex-Orchestrator',
      evidence: `Queue HOLD count is ${(byStatus.hold || 0) + (byStatus.HOLD || 0)}.`,
      suggested_fix: 'Cluster HOLD reasons and create one platform evolution task per repeated blocker.',
      auto_fix_eligible: false,
      requires_human_gate: true,
      recommended_next_task: 'Run Observer HOLD clustering in the next iteration.',
    });
  }
}

function isResultJson(file, data) {
  return file.endsWith('.json') && data && data.task_id && data.agent && (data.conclusion || data.parsed_at || data.changed_files);
}

function observeReports(findings, runFiles) {
  const required = [
    'commit_hash',
    'verification_results',
    'migration_executed',
    'database_written',
    'deployed',
  ];
  for (const file of runFiles.filter((item) => item.endsWith('.json'))) {
    const data = readJson(file, null);
    if (!isResultJson(file, data)) continue;
    const missing = required.filter((field) => data[field] === undefined || data[field] === null);
    if (!data.recommend_next_agent && !data.next_agents) missing.push('recommend_next_agent/next_agents');
    if (Array.isArray(data.missing_fields) && data.missing_fields.length > 0) missing.push(...data.missing_fields);
    const uniqueMissing = [...new Set(missing)];
    if (uniqueMissing.length > 0) {
      addFinding(findings, {
        severity: uniqueMissing.includes('migration_executed') || uniqueMissing.includes('database_written') ? 'HIGH' : 'MEDIUM',
        category: 'report-schema',
        affected_agent: data.agent,
        evidence: `${file}: missing ${uniqueMissing.join(', ')}`,
        suggested_fix: 'Normalize this Agent result before using it for next-Agent decision or task board update.',
        auto_fix_eligible: true,
        requires_human_gate: false,
        recommended_next_task: `Run normalize-agent-result for ${data.task_id}.`,
      });
    }
  }
}

function observeBaseline(findings, dispatchMap) {
  const mainStatus = safe('git', ['-C', '/Users/mac/phoenix-erp', 'status', '--short']);
  if (mainStatus.ok && mainStatus.output) {
    const lines = mainStatus.output.split('\n').filter(Boolean);
    const onlyRuns = lines.every((line) => line.slice(3).trim().startsWith('docs/ops/runs/'));
    addFinding(findings, {
      severity: onlyRuns ? 'LOW' : 'HIGH',
      category: 'baseline',
      affected_agent: 'main',
      evidence: `main dirty files: ${lines.join('; ')}`,
      suggested_fix: onlyRuns ? 'Baseline Autopilot can auto-commit docs/ops/runs audit artifacts.' : 'HOLD and inspect non-run dirty files before merge.',
      auto_fix_eligible: onlyRuns,
      requires_human_gate: !onlyRuns,
      recommended_next_task: onlyRuns ? 'Run baseline autopilot to record ops run artifacts.' : 'Manual baseline review for dirty main.',
    });
  }
  const mainHead = safe('git', ['-C', '/Users/mac/phoenix-erp', 'rev-parse', 'main']).output;
  for (const agent of AGENTS) {
    const config = dispatchMap[agent] || {};
    const worktree = config.worktree_path || config.worktree;
    if (!worktree || !existsSync(worktree)) {
      addFinding(findings, {
        severity: 'HIGH',
        category: 'platform-maturity',
        affected_agent: agent,
        evidence: `Missing worktree: ${worktree || 'not configured'}`,
        suggested_fix: 'Create or register the Agent worktree before dispatching tasks.',
        auto_fix_eligible: false,
        requires_human_gate: true,
        recommended_next_task: `Repair ${agent} worktree registration.`,
      });
      continue;
    }
    const status = safe('git', ['status', '--short'], { cwd: worktree });
    if (status.ok && status.output) {
      addFinding(findings, {
        severity: status.output.includes('apps/api/') || status.output.includes('apps/web/') ? 'HIGH' : 'MEDIUM',
        category: 'baseline',
        affected_agent: agent,
        evidence: `${worktree} dirty status: ${status.output.replace(/\n/g, '; ')}`,
        suggested_fix: 'Use baseline autopilot or HOLD if dirty files touch business code.',
        auto_fix_eligible: !status.output.includes('apps/api/') && !status.output.includes('apps/web/'),
        requires_human_gate: status.output.includes('apps/api/') || status.output.includes('apps/web/'),
        recommended_next_task: `Baseline cleanup for ${agent}.`,
      });
    }
    const head = safe('git', ['rev-parse', 'HEAD'], { cwd: worktree }).output;
    if (mainHead && head && head !== mainHead) {
      const behind = safe('git', ['merge-base', '--is-ancestor', head, mainHead], { cwd: worktree }).ok;
      const ahead = safe('git', ['merge-base', '--is-ancestor', mainHead, head], { cwd: worktree }).ok;
      if (behind && !ahead) {
        addFinding(findings, {
          severity: 'MEDIUM',
          category: 'baseline',
          affected_agent: agent,
          evidence: `${agent} worktree HEAD ${head.slice(0, 8)} is behind main ${mainHead.slice(0, 8)}.`,
          suggested_fix: 'Baseline Autopilot should rebase this worktree before claim or merge.',
          auto_fix_eligible: true,
          requires_human_gate: false,
          recommended_next_task: `Rebase ${agent} with baseline autopilot.`,
        });
      }
    }
  }
}

function observeMaturity(findings, dispatchMap, runFiles) {
  const missing = [];
  for (const agent of AGENTS) {
    const config = dispatchMap[agent];
    if (!config) {
      missing.push(`${agent}: dispatch map`);
      continue;
    }
    if (!config.prompt_file || !existsSync(resolvePath(config.prompt_file))) missing.push(`${agent}: prompt`);
    if (!config.worktree_path && !config.worktree) missing.push(`${agent}: worktree path`);
    if (!config.canonical_branch && !config.branch) missing.push(`${agent}: branch`);
  }
  if (missing.length > 0) {
    addFinding(findings, {
      severity: 'HIGH',
      category: 'platform-maturity',
      affected_agent: 'A1-A7',
      evidence: `Missing registration fields: ${missing.join('; ')}`,
      suggested_fix: 'Repair AGENT_DISPATCH_MAP.json and prompt coverage.',
      auto_fix_eligible: true,
      requires_human_gate: false,
      recommended_next_task: 'Patch Agent registry and dispatch map.',
    });
  }
  for (const agent of AGENTS.filter((agent) => agent !== 'Codex-Orchestrator')) {
    const shortName = agent.replace(/^A(\d)-.*/, 'A$1');
    const hasRunArtifact = runFiles.some((file) => file.includes(agent) || file.includes(shortName));
    if (!hasRunArtifact) {
      addFinding(findings, {
        severity: 'LOW',
        category: 'platform-maturity',
        affected_agent: agent,
        evidence: `No obvious run artifact found for ${agent}.`,
        suggested_fix: 'Run a dry-run acceptance task for this Agent and record the output.',
        auto_fix_eligible: false,
        requires_human_gate: false,
        recommended_next_task: `Schedule ${agent} dry-run evidence refresh.`,
      });
    }
  }
}

function summarize(findings, tasks, runFiles, dispatchMap) {
  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const highest = severityOrder.find((severity) => findings.some((finding) => finding.severity === severity)) || 'NONE';
  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generated_at: new Date().toISOString(),
    dry_run: true,
    run_files_inspected: runFiles.length,
    task_count: tasks.length,
    task_status_counts: statusCounts,
    registered_agents: AGENTS.filter((agent) => dispatchMap[agent]).length,
    findings_count: findings.length,
    highest_severity: highest,
    routing_findings: findings.filter((finding) => finding.category === 'routing').length,
    baseline_findings: findings.filter((finding) => finding.category === 'baseline').length,
    report_schema_findings: findings.filter((finding) => finding.category === 'report-schema').length,
    codex_cli_executed: false,
    database_written: false,
    deployed: false,
    pushed: false,
    merged: false,
  };
}

function markdownReport(summary, findings) {
  return `# Observer Findings Latest

| Field | Value |
| --- | --- |
| Generated at | ${summary.generated_at} |
| Run files inspected | ${summary.run_files_inspected} |
| Task count | ${summary.task_count} |
| Findings count | ${summary.findings_count} |
| Highest severity | ${summary.highest_severity} |
| Routing findings | ${summary.routing_findings} |
| Baseline findings | ${summary.baseline_findings} |
| Report schema findings | ${summary.report_schema_findings} |
| Codex CLI executed | No |
| Database written | No |
| Deployed | No |

## Findings

${findings
  .map(
    (finding) => `### ${finding.id} - ${finding.severity} - ${finding.category}

- Affected Agent: ${finding.affected_agent}
- Evidence: ${finding.evidence}
- Suggested Fix: ${finding.suggested_fix}
- Auto Fix Eligible: ${finding.auto_fix_eligible ? 'true' : 'false'}
- Requires Human Gate: ${finding.requires_human_gate ? 'true' : 'false'}
- Recommended Next Task: ${finding.recommended_next_task}`,
  )
  .join('\n\n') || 'No findings.'}
`;
}

function evolutionTasks(findings) {
  const selected = findings
    .filter((finding) => finding.severity !== 'LOW')
    .slice(0, 12)
    .map((finding, index) => ({
      task_id: `OBSERVER-EVOLUTION-${String(index + 1).padStart(3, '0')}`,
      source_finding: finding.id,
      severity: finding.severity,
      affected_agent: finding.affected_agent,
      goal: finding.recommended_next_task,
      suggested_fix: finding.suggested_fix,
      auto_fix_eligible: finding.auto_fix_eligible,
      requires_human_gate: finding.requires_human_gate,
      status: 'proposed',
    }));
  return selected;
}

function patternForFinding(finding) {
  const evidence = `${finding.category} ${finding.affected_agent} ${finding.evidence} ${finding.suggested_fix}`;
  if (/A5|Data-Readiness|readiness|数据/.test(evidence)) return 'PATTERN-PHX-001';
  if (/routing|route|漏派|protected|菜单码|角色授权|A2|A3/.test(evidence)) return 'PATTERN-004';
  if (/baseline|manual|rebase|merge|runs|dirty/.test(evidence)) return 'PATTERN-PHX-002';
  if (/report-schema|missing|verification_results|recommend_next_agent|commit_hash/.test(evidence)) return 'PATTERN-003';
  if (/queue|tasks\.json|events\.jsonl|conflict/.test(evidence)) return 'PATTERN-005';
  return null;
}

function improvementForPattern(patternId) {
  return {
    'PATTERN-PHX-001': 'IMPROVE-ROUTER-A5-READINESS',
    'PATTERN-004': 'IMPROVE-ROUTER-A2-A3-PROTECTED-ATTACHMENT',
    'PATTERN-PHX-002': 'IMPROVE-BASELINE-AUTOPILOT-LIFECYCLE',
    'PATTERN-003': 'IMPROVE-REPORT-SCHEMA-COMPLIANCE',
    'PATTERN-005': 'IMPROVE-QUEUE-CONFLICT-REDUCTION',
  }[patternId] || null;
}

function evolutionSignals(findings) {
  const patterns = new Map();
  const improvements = new Map();
  for (const finding of findings) {
    const patternId = patternForFinding(finding);
    if (!patternId) continue;
    const improvementId = improvementForPattern(patternId);
    patterns.set(patternId, (patterns.get(patternId) || 0) + 1);
    if (improvementId) improvements.set(improvementId, (improvements.get(improvementId) || 0) + 1);
  }
  return {
    suggested_evolution_patterns: [...patterns.entries()].map(([pattern_id, occurrence]) => ({ pattern_id, occurrence })),
    suggested_improvements: [...improvements.entries()].map(([improvement_id, occurrence]) => ({ improvement_id, occurrence })),
    repeated_pattern_candidates: [...patterns.entries()]
      .filter(([, occurrence]) => occurrence >= 2)
      .map(([pattern_id, occurrence]) => ({ pattern_id, occurrence })),
  };
}

function writeStableDocs(summary, findings, tasks) {
  const findingReport = `# Observer Findings Report

## Summary

- Findings count: ${summary.findings_count}
- Highest severity: ${summary.highest_severity}
- Routing findings: ${summary.routing_findings}
- Baseline findings: ${summary.baseline_findings}
- Report schema findings: ${summary.report_schema_findings}
- Codex CLI executed: No
- Database written: No
- Deployed: No

## Current Findings

${findings.map((finding) => `- ${finding.id} [${finding.severity}] ${finding.category} / ${finding.affected_agent}: ${finding.evidence}`).join('\n') || '- None'}
`;
  writeFileSync(resolvePath('docs/ops/OBSERVER_FINDINGS_REPORT.md'), findingReport);

  const taskDoc = `# Observer Evolution Tasks

> Proposed by Resident Observer. These tasks are not automatically executed.

| Task ID | Source Finding | Severity | Affected Agent | Auto Fix Eligible | Human Gate | Status | Goal |
| --- | --- | --- | --- | --- | --- | --- | --- |
${tasks
  .map(
    (task) =>
      `| ${task.task_id} | ${task.source_finding} | ${task.severity} | ${task.affected_agent} | ${task.auto_fix_eligible ? 'true' : 'false'} | ${task.requires_human_gate ? 'true' : 'false'} | ${task.status} | ${task.goal} |`,
  )
  .join('\n') || '| N/A | N/A | N/A | N/A | false | false | none | No evolution task proposed. |'}
`;
  writeFileSync(resolvePath('docs/ops/OBSERVER_EVOLUTION_TASKS.md'), taskDoc);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = resolvePath(args.outputDir || RUNS_DIR);
  mkdirSync(outputDir, { recursive: true });

  const runFiles = walk(RUNS_DIR);
  const tasks = readJson(TASKS_FILE, []);
  const dispatchMap = readJson(DISPATCH_MAP_FILE, {});
  readText(TASK_BOARD_FILE);
  readJson(ROUTER_RULES_FILE, {});

  const findings = [];
  observeRouting(findings, runFiles);
  observeQueue(findings, tasks);
  observeReports(findings, runFiles);
  observeBaseline(findings, dispatchMap);
  observeMaturity(findings, dispatchMap, runFiles);

  const summary = summarize(findings, tasks, runFiles, dispatchMap);
  const evolution = evolutionTasks(findings);
  const signals = evolutionSignals(findings);
  const payload = {
    summary,
    findings,
    evolution_tasks: evolution,
    ...signals,
    observer_boundaries: {
      codex_cli_executed: false,
      business_code_modified: false,
      migration_executed: false,
      database_written: false,
      deployed: false,
      pushed: false,
      merged: false,
    },
  };

  writeFileSync(path.join(outputDir, 'observer-findings-latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(path.join(outputDir, 'observer-findings-latest.md'), markdownReport(summary, findings));
  writeStableDocs(summary, findings, evolution);

  console.log(`Observer dry-run: ${args.dryRun ? 'Yes' : 'Yes (forced)'}`);
  console.log(`Run files inspected: ${summary.run_files_inspected}`);
  console.log(`Findings: ${summary.findings_count}`);
  console.log(`Highest severity: ${summary.highest_severity}`);
  console.log(`Routing findings: ${summary.routing_findings}`);
  console.log(`Baseline findings: ${summary.baseline_findings}`);
  console.log(`Report schema findings: ${summary.report_schema_findings}`);
  console.log(`Evolution tasks: ${evolution.length}`);
  console.log(`Suggested evolution patterns: ${signals.suggested_evolution_patterns.length}`);
  console.log(`Suggested improvements: ${signals.suggested_improvements.length}`);
  console.log('Codex CLI executed: No');
  console.log('Database written: No');
  console.log('Deployed: No');
}

main();
