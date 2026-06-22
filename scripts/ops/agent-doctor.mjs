#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const BACKLOG_FILE = 'docs/ops/evolution/improvement-backlog.json';
const PATTERNS_FILE = 'docs/ops/evolution/failure-patterns.json';
const STATE_FILE = 'docs/ops/evolution/evolution-state.json';
const DOCTOR_JSON = 'docs/ops/runs/evolution-doctor-latest.json';
const DOCTOR_MD = 'docs/ops/runs/evolution-doctor-latest.md';
const PRIORITY_RANK = { P0: 4, P1: 3, P2: 2, P3: 1 };

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function readJson(file, fallback) {
  const resolved = resolvePath(file);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeFile(file, content) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, content);
}

function gitStatus() {
  try {
    return execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function hasForbiddenDirty(status) {
  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .some(
      (file) =>
        file.startsWith('apps/api/') ||
        file.startsWith('apps/web/') ||
        file.startsWith('apps/api/src/database/migrations/') ||
        file.startsWith('database/') ||
        file.startsWith('infra/') ||
        file.startsWith('.github/') ||
        file.startsWith('deploy/') ||
        file.startsWith('auth/') ||
        file.includes('schema') ||
        file.includes('entity') ||
        file.includes('table') ||
        file.includes('column'),
    );
}

export function buildDoctorReport() {
  const backlog = readJson(BACKLOG_FILE, []);
  const patterns = readJson(PATTERNS_FILE, []);
  const state = readJson(STATE_FILE, {});
  const open = backlog.filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED');
  const sorted = [...open].sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
  const status = gitStatus();
  const newest = open.map((item) => item.updated_at || item.created_at).filter(Boolean).sort().at(-1);
  const stale = !newest || Date.now() - Date.parse(newest) > 7 * 24 * 3600 * 1000 || state.backlog_stale === true;
  return {
    generated_at: new Date().toISOString(),
    result: hasForbiddenDirty(status) ? 'HOLD' : 'GO',
    open_improvement_count: open.length,
    top_3_improvement_candidates: sorted.slice(0, 3).map((item) => ({
      improvement_id: item.improvement_id,
      priority: item.priority,
      title: item.title,
      owner: item.owner_recommendation,
    })),
    repeated_pattern_count: patterns.filter((pattern) => Number(pattern.occurrence || 0) >= 2).length,
    highest_priority_improvement: sorted[0]?.improvement_id || null,
    evolution_backlog_stale: Boolean(stale),
    forbidden_dirty_detected: hasForbiddenDirty(status),
    git_status_short: status,
    codex_cli_executed: false,
    database_written: false,
    deployed: false,
  };
}

function markdown(report) {
  return `# Evolution Doctor Latest

| Field | Value |
| --- | --- |
| Result | ${report.result} |
| Open improvement count | ${report.open_improvement_count} |
| Repeated pattern count | ${report.repeated_pattern_count} |
| Highest priority improvement | ${report.highest_priority_improvement || 'None'} |
| Evolution backlog stale | ${report.evolution_backlog_stale ? 'Yes' : 'No'} |
| Forbidden dirty detected | ${report.forbidden_dirty_detected ? 'Yes' : 'No'} |

## Top 3 Improvement Candidates

${report.top_3_improvement_candidates.map((item) => `- ${item.improvement_id} / ${item.priority} / ${item.owner}: ${item.title}`).join('\n') || '- None'}
`;
}

function main() {
  const report = buildDoctorReport();
  writeFile(DOCTOR_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeFile(DOCTOR_MD, markdown(report));
  console.log(`Doctor result: ${report.result}`);
  console.log(`Open improvement count: ${report.open_improvement_count}`);
  console.log(`Repeated pattern count: ${report.repeated_pattern_count}`);
  console.log(`Highest priority improvement: ${report.highest_priority_improvement || 'None'}`);
  console.log(`Evolution backlog stale: ${report.evolution_backlog_stale ? 'Yes' : 'No'}`);
  console.log('Top 3 improvement candidates:');
  for (const item of report.top_3_improvement_candidates) {
    console.log(`- ${item.improvement_id} | ${item.priority} | ${item.owner} | ${item.title}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === resolvePath('scripts/ops/agent-doctor.mjs')) {
  main();
}
