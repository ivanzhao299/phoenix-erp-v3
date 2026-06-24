#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const MAIN_ROOT = '/Users/mac/phoenix-erp';
const DEFAULT_MAX_RETRIES = 3;
const RUN_ARTIFACT_COMMIT = 'docs(ops): record generated ops run artifacts';
const OPS_ARTIFACT_COMMIT = 'docs(ops): record generated ops artifacts';
const AUTOMATION_COMMIT = 'chore(ops): update automation tooling';
const DEFAULT_AGENT_RESULT_COMMIT = 'chore(ops): record agent task output';
const DISPATCH_MAP_FILE = 'docs/ops/AGENT_DISPATCH_MAP.json';
let activeSummary = null;

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/agent-baseline-autopilot.mjs \\
    --agent <agent-name> \\
    --branch <branch-name> \\
    [--worktree <path>] \\
    [--max-retries 3] \\
    [--dry-run] [--yes] [--allow-code] [--schema-gate <request-id>] [--staging-bootstrap] \\
    [--auto-commit] [--auto-merge] [--run-gates]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {
    dryRun: true,
    maxRetries: DEFAULT_MAX_RETRIES,
    autoCommit: true,
    autoMerge: true,
    runGates: true,
  };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg === '--yes') {
      values.yes = true;
      values.dryRun = false;
      continue;
    }
    if (arg === '--allow-code') {
      values.allowCode = true;
      continue;
    }
    if (arg === '--staging-bootstrap') {
      values.stagingBootstrap = true;
      continue;
    }
    if (arg === '--auto-commit') {
      values.autoCommit = true;
      continue;
    }
    if (arg === '--skip-auto-commit') {
      values.autoCommit = false;
      continue;
    }
    if (arg === '--auto-merge') {
      values.autoMerge = true;
      continue;
    }
    if (arg === '--skip-auto-merge') {
      values.autoMerge = false;
      continue;
    }
    if (arg === '--run-gates') {
      values.runGates = true;
      continue;
    }
    if (arg === '--skip-gates') {
      values.runGates = false;
      continue;
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = normalized[i + 1];
      i += 1;
    }
  }
  values.maxRetries = Number.parseInt(values.maxRetries, 10) || DEFAULT_MAX_RETRIES;
  return values;
}

function fail(message, extra = {}) {
  if (activeSummary) {
    activeSummary.status = 'HOLD';
    activeSummary.hold_reason = message;
    activeSummary.hold_context = extra;
    writeLifecycleReport(activeSummary);
  }
  console.error(`HOLD: ${message}`);
  for (const [key, value] of Object.entries(extra)) {
    if (value) console.error(`${key}: ${value}`);
  }
  process.exit(1);
}

function resolvePath(file, cwd = process.cwd()) {
  return path.isAbsolute(file) ? file : path.resolve(cwd, file);
}

function loadDispatchMap() {
  const file = resolvePath(DISPATCH_MAP_FILE);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8'));
}

function inferArgs(args) {
  const dispatchMap = loadDispatchMap();
  const currentWorktree = process.cwd();
  const currentBranch = safe('git', ['branch', '--show-current'], { cwd: currentWorktree });
  const branch = args.branch || (currentBranch.ok ? currentBranch.output : null);
  let agent = args.agent || null;
  let worktree = args.worktree || null;

  for (const [name, config] of Object.entries(dispatchMap)) {
    if (!agent && branch && config.canonical_branch === branch) agent = name;
    if (!agent && currentWorktree === config.worktree_path) agent = name;
    if (!worktree && branch && config.canonical_branch === branch) worktree = config.worktree_path;
    if (!worktree && agent === name) worktree = config.worktree_path;
  }

  return {
    ...args,
    agent,
    branch,
    worktree,
  };
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return output ? output.trim() : '';
}

function safe(command, args, options = {}) {
  try {
    return { ok: true, output: run(command, args, options) };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString() || error.message };
  }
}

function statusEntries(cwd) {
  const output = execFileSync('git', ['status', '--short'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!output.trim()) return [];
  return output.split('\n').filter(Boolean).map((raw) => ({
    raw,
    path: raw.slice(3).trim(),
  }));
}

function allMatch(entries, predicate) {
  return entries.length > 0 && entries.every((entry) => predicate(entry.path));
}

function isRunArtifact(file) {
  return file.startsWith('docs/ops/runs/');
}

function isOpsFile(file) {
  return file.startsWith('docs/ops/') || file.startsWith('scripts/ops/');
}

function isApiFile(file) {
  return file.startsWith('apps/api/');
}

function isWebFile(file) {
  return file.startsWith('apps/web/');
}

function isMigrationOrSchemaFile(file) {
  return (
    file.startsWith('apps/api/src/database/migrations/') ||
    file.startsWith('migrations/') ||
    file.includes('/migration/') ||
    file.includes('/migrations/') ||
    file.endsWith('.entity.ts') ||
    file.includes('/entities/')
  );
}

function isStagingBootstrapFile(file) {
  return (
    file === '.env.staging.example' ||
    file === 'docker-compose.staging.yml' ||
    file === '.github/workflows/staging-deploy.yml' ||
    file.startsWith('deploy/staging/')
  );
}

function hasFrozenBoundary(entries) {
  return entries.some((entry) => isMigrationOrSchemaFile(entry.path));
}

function hasBusinessCode(entries) {
  return entries.some((entry) => isApiFile(entry.path) || isWebFile(entry.path));
}

function commitMessageFor(entries, agent) {
  if (allMatch(entries, isRunArtifact)) return RUN_ARTIFACT_COMMIT;
  if (entries.every((entry) => entry.path.startsWith('scripts/ops/'))) return AUTOMATION_COMMIT;
  if (entries.every((entry) => isOpsFile(entry.path))) return OPS_ARTIFACT_COMMIT;
  if (entries.some((entry) => isApiFile(entry.path))) return `feat(api): record ${agent || 'agent'} result`;
  if (entries.some((entry) => isWebFile(entry.path))) return `feat(web): record ${agent || 'agent'} result`;
  return DEFAULT_AGENT_RESULT_COMMIT;
}

function findWorktree(branch) {
  const output = run('git', ['worktree', 'list', '--porcelain'], { cwd: MAIN_ROOT });
  const records = output.split('\n\n').filter(Boolean);
  for (const record of records) {
    const lines = Object.fromEntries(
      record.split('\n').map((line) => {
        const [key, ...rest] = line.split(' ');
        return [key, rest.join(' ')];
      }),
    );
    if (lines.branch === `refs/heads/${branch}`) return lines.worktree;
  }
  return null;
}

function conflictFiles(cwd) {
  const output = safe('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
  return output.output ? output.output.split('\n').filter(Boolean) : [];
}

function canAutoResolveDocsConflict(files) {
  return files.length > 0 && files.every((file) => file.startsWith('docs/ops/runs/'));
}

function autoResolveDocsConflict(cwd, files, dryRun) {
  if (!canAutoResolveDocsConflict(files)) {
    return { ok: false, reason: 'conflict contains non docs/ops/runs files' };
  }
  if (dryRun) return { ok: true, dryRun: true };
  for (const file of files) {
    const checkout = safe('git', ['checkout', '--theirs', '--', file], { cwd });
    if (!checkout.ok) return { ok: false, reason: checkout.output };
    run('git', ['add', file], { cwd });
  }
  const cont = safe('git', ['rebase', '--continue'], { cwd });
  return cont.ok ? { ok: true } : { ok: false, reason: cont.output };
}

function maybeCommit(cwd, entries, message, args, summary, label) {
  if (entries.length === 0) return false;
  if (!args.autoCommit) fail(`${label} has changes and auto-commit is disabled`, { status: entries.map((entry) => entry.raw).join('\n') });
  if (hasFrozenBoundary(entries) && !args.schemaGate) {
    fail(`${label} touches migration/schema/entity/table/column boundary`, { status: entries.map((entry) => entry.raw).join('\n') });
  }
  if (hasBusinessCode(entries) && !args.allowCode) {
    fail(`${label} contains business code and --allow-code was not provided`, { status: entries.map((entry) => entry.raw).join('\n') });
  }
  const unsupported = entries.filter((entry) => !(
    isOpsFile(entry.path) ||
    (args.stagingBootstrap && isStagingBootstrapFile(entry.path)) ||
    (args.allowCode && (isApiFile(entry.path) || isWebFile(entry.path))) ||
    (args.schemaGate && isMigrationOrSchemaFile(entry.path))
  ));
  if (unsupported.length > 0) {
    fail(`${label} has unsupported dirty files`, {
      unsupported: unsupported.map((entry) => `${entry.raw} -> ${entry.path}`).join('\n'),
      status: entries.map((entry) => entry.raw).join('\n'),
    });
  }
  if (args.dryRun) {
    console.log(`${label}: dry-run would auto-commit ${entries.length} file(s) with message: ${message}`);
    console.log(entries.map((entry) => entry.raw).join('\n'));
    summary.auto_commit_planned.push({ label, message, files: entries.map((entry) => entry.path) });
    return false;
  }
  run('git', ['add', ...entries.map((entry) => entry.path)], { cwd });
  run('git', ['commit', '-m', message], { cwd, stdio: 'inherit' });
  summary.auto_commits.push({ label, message, files: entries.map((entry) => entry.path) });
  return true;
}

function retryGuard(summary, maxRetries, reason) {
  summary.retries += 1;
  if (summary.retries > maxRetries) {
    fail('retry limit exceeded', { maxRetries: String(maxRetries), reason });
  }
}

function reportPathFor(summary, ext) {
  const root = summary.worktree || process.cwd();
  const dir = path.resolve(root, 'docs/ops/runs');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeAgent = String(summary.agent || 'unknown-agent').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(dir, `${stamp}-${safeAgent}-baseline-lifecycle.${ext}`);
}

function writeLifecycleReport(summary) {
  const jsonPath = summary.report_json || reportPathFor(summary, 'json');
  const mdPath = summary.report_md || reportPathFor(summary, 'md');
  summary.report_json = jsonPath;
  summary.report_md = mdPath;
  const jsonPayload = { ...summary };
  delete jsonPayload.report_json;
  delete jsonPayload.report_md;
  writeFileSync(jsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
  writeFileSync(
    mdPath,
    `# Agent Baseline Lifecycle Report

| Field | Value |
| --- | --- |
| Status | ${summary.status || 'UNKNOWN'} |
| Agent | ${summary.agent || 'N/A'} |
| Branch | ${summary.branch || 'N/A'} |
| Worktree | \`${summary.worktree || 'N/A'}\` |
| Dry run | ${summary.dry_run ? 'Yes' : 'No'} |
| Retries | ${summary.retries} / ${summary.max_retries} |
| Rebase | ${summary.rebase} |
| Merge | ${summary.merge} |
| W5 gate | ${summary.gate} |
| Push | ${summary.push} |
| Deploy | ${summary.deploy} |
| Migration executed | ${summary.migration_executed} |
| Database written | ${summary.database_written} |
| HOLD reason | ${summary.hold_reason || 'None'} |

## Auto Commit Planned

${(summary.auto_commit_planned || []).map((item) => `- ${item.label}: ${item.message} (${item.files.length} file(s))`).join('\n') || '- None'}

## Auto Commits

${(summary.auto_commits || []).map((item) => `- ${item.label}: ${item.message} (${item.files.length} file(s))`).join('\n') || '- None'}
`,
  );
  return { jsonPath, mdPath };
}

function commitLifecycleReport(summary, report) {
  if (summary.dry_run) return;
  const root = summary.worktree;
  if (!root) return;
  const files = [path.relative(root, report.jsonPath), path.relative(root, report.mdPath)];
  run('git', ['add', ...files], { cwd: root });
  run('git', ['commit', '-m', 'docs(ops): record baseline lifecycle report'], { cwd: root, stdio: 'inherit' });
  summary.auto_commits.push({
    label: 'baseline lifecycle report',
    message: 'docs(ops): record baseline lifecycle report',
    files,
  });
}

function safeMergeBranch(args, summary) {
  const syncCommand = ['node', 'scripts/ops/agent-sync-and-merge.mjs', args.branch, args.dryRun ? '--dry-run' : '--yes'];
  if (args.allowCode) syncCommand.push('--allow-code');
  if (args.stagingBootstrap) syncCommand.push('--staging-bootstrap');
  if (args.schemaGate) syncCommand.push('--schema-gate', args.schemaGate);
  console.log(`Safe merge command: cd ${MAIN_ROOT} && ${syncCommand.join(' ')}`);
  if (args.dryRun) {
    summary.merge = 'dry-run: would call agent-sync-and-merge.mjs';
    return;
  }
  const result = spawnSync(syncCommand[0], syncCommand.slice(1), { cwd: MAIN_ROOT, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if ((result.status ?? 1) !== 0) fail('safe merge failed', { exitCode: String(result.status ?? 1) });
  summary.merge = 'completed';
}

function runGate(args, summary) {
  const gate = path.join(MAIN_ROOT, 'scripts/ci/check-w5-closeout-gate.mjs');
  if (!args.runGates) {
    summary.gate = 'skipped by --skip-gates';
    return;
  }
  if (!existsSync(gate)) {
    summary.gate = 'skipped: script missing';
    return;
  }
  if (args.dryRun) {
    summary.gate = 'dry-run: would run node scripts/ci/check-w5-closeout-gate.mjs';
    console.log(summary.gate);
    return;
  }
  const result = spawnSync('node', ['scripts/ci/check-w5-closeout-gate.mjs'], { cwd: MAIN_ROOT, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  summary.gate = (result.status ?? 1) === 0 ? 'PASS' : `FAIL ${result.status ?? 1}`;
  if ((result.status ?? 1) !== 0) fail('W5 closeout gate failed', { exitCode: String(result.status ?? 1) });
}

function main() {
  const args = inferArgs(parseArgs(process.argv.slice(2)));
  if (!args.agent || !args.branch) usage(1);
  if (!existsSync(MAIN_ROOT)) fail(`main root not found: ${MAIN_ROOT}`);
  const mainInside = safe('git', ['rev-parse', '--is-inside-work-tree'], { cwd: MAIN_ROOT });
  if (!mainInside.ok || mainInside.output !== 'true') fail('main root is not a git repository');
  const mainBranches = run('git', ['branch', '--list', 'main'], { cwd: MAIN_ROOT });
  if (!mainBranches) fail('main branch does not exist');

  const summary = {
    agent: args.agent,
    branch: args.branch,
    worktree: args.worktree || null,
    status: 'RUNNING',
    dry_run: args.dryRun,
    max_retries: args.maxRetries,
    retries: 0,
    auto_commit_planned: [],
    auto_commits: [],
    rebase: 'not-started',
    merge: 'not-started',
    gate: 'not-started',
    push: 'No',
    deploy: 'No',
    migration_executed: 'No',
    database_written: 'No',
  };
  activeSummary = summary;

  const mainBranch = run('git', ['branch', '--show-current'], { cwd: MAIN_ROOT });
  if (mainBranch !== 'main') fail(`main root must be on main, got ${mainBranch || '(detached)'}`);

  let mainStatus = statusEntries(MAIN_ROOT);
  if (mainStatus.length > 0) {
    const message = allMatch(mainStatus, isRunArtifact) ? RUN_ARTIFACT_COMMIT : OPS_ARTIFACT_COMMIT;
    maybeCommit(MAIN_ROOT, mainStatus, message, args, summary, 'main worktree');
  }

  const worktree = args.worktree || findWorktree(args.branch);
  if (!worktree) fail(`no worktree found for branch ${args.branch}`);
  summary.worktree = worktree;
  if (!existsSync(worktree)) fail(`worktree path does not exist: ${worktree}`);
  const targetInside = safe('git', ['rev-parse', '--is-inside-work-tree'], { cwd: worktree });
  if (!targetInside.ok || targetInside.output !== 'true') fail('target worktree is not a git repository', { worktree });
  const targetBranch = run('git', ['branch', '--show-current'], { cwd: worktree });
  if (targetBranch !== args.branch) fail(`target worktree branch mismatch`, { expected: args.branch, actual: targetBranch, worktree });

  let targetStatus = statusEntries(worktree);
  if (targetStatus.length > 0) {
    maybeCommit(worktree, targetStatus, commitMessageFor(targetStatus, args.agent), args, summary, 'target worktree');
  }

  console.log(`Main root: ${MAIN_ROOT}`);
  console.log(`Agent: ${args.agent}`);
  console.log(`Branch: ${args.branch}`);
  console.log(`Worktree: ${worktree}`);
  console.log(`Mode: ${args.dryRun ? 'dry-run' : 'yes'}`);

  const fetch = args.dryRun ? { ok: true, output: 'dry-run' } : safe('git', ['fetch', 'origin'], { cwd: worktree });
  if (!fetch.ok) fail('git fetch origin failed', { error: fetch.output });
  console.log(args.dryRun ? 'Dry-run: would run git fetch origin.' : 'Fetched origin.');

  if (args.dryRun) {
    summary.rebase = 'dry-run: would run git rebase main';
    console.log(summary.rebase);
  } else {
    const rebase = safe('git', ['rebase', 'main'], { cwd: worktree });
    if (!rebase.ok) {
      const conflicts = conflictFiles(worktree);
      if (canAutoResolveDocsConflict(conflicts)) {
        retryGuard(summary, args.maxRetries, 'docs/ops/runs rebase conflict');
        const resolved = autoResolveDocsConflict(worktree, conflicts, false);
        if (!resolved.ok) fail('auto-resolving docs/ops/runs conflict failed', { reason: resolved.reason });
        summary.rebase = 'auto-resolved docs/ops/runs conflict and continued';
      } else {
        fail('git rebase main failed; manual intervention required', {
          worktree,
          conflicts: conflicts.join('\n') || '(unknown)',
          next: 'Run git rebase --continue or git rebase --abort in the target worktree.',
          error: rebase.output,
        });
      }
    } else {
      summary.rebase = 'completed';
      console.log('Rebase completed.');
    }
  }

  if (args.autoMerge) {
    safeMergeBranch(args, summary);
  } else {
    summary.merge = 'skipped by --skip-auto-merge';
  }

  console.log('\nMain status:');
  console.log(args.dryRun ? '(dry-run: not checked after merge)' : run('git', ['status', '--short'], { cwd: MAIN_ROOT }) || '(clean)');

  runGate(args, summary);
  summary.status = 'COMPLETED_MERGED';
  const report = writeLifecycleReport(summary);
  commitLifecycleReport(summary, report);
  if (!args.dryRun && args.autoMerge) safeMergeBranch(args, summary);

  console.log('\nAutopilot summary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Lifecycle report JSON: ${path.relative(process.cwd(), report.jsonPath)}`);
  console.log(`Lifecycle report MD: ${path.relative(process.cwd(), report.mdPath)}`);
  console.log('Push executed: No');
  console.log('Deploy executed: No');
  console.log('Migration executed: No');
  console.log('Database written: No');
}

main();
