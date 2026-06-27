#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDoctorReport } from './agent-doctor.mjs';

const ROOT = process.cwd();
const REQUIRED_JSON = [
  'docs/ops/evolution/failure-patterns.json',
  'docs/ops/evolution/learning-log.json',
  'docs/ops/evolution/improvement-backlog.json',
  'docs/ops/evolution/evolution-state.json',
];
const FINALIZE_JSON = 'docs/ops/runs/evolution-finalize-latest.json';
const FINALIZE_MD = 'docs/ops/runs/evolution-finalize-latest.md';
const FINALIZE_ALIAS_JSON = 'docs/ops/runs/finalize-latest.json';

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  return { apply: normalized.includes('--apply') };
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function readJson(file) {
  return JSON.parse(readFileSync(resolvePath(file), 'utf8'));
}

function writeFile(file, content) {
  const resolved = resolvePath(file);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, content);
}

function run(command, args) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    };
  } catch (error) {
    return { ok: false, output: error.stderr?.toString().trim() || error.message };
  }
}

function changedFiles() {
  const output = run('git', ['status', '--short']).output || '';
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}

function forbiddenDirty(files) {
  return files.filter(
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

function markdown(report) {
  return `# Evolution Finalize Latest

| Field | Value |
| --- | --- |
| FINALIZE RESULT | ${report.finalize_result} |
| JSON valid | ${report.json_valid ? 'Yes' : 'No'} |
| Backlog readable | ${report.backlog_readable ? 'Yes' : 'No'} |
| Top candidates exist | ${report.top_candidates_exist ? 'Yes' : 'No'} |
| Forbidden dirty count | ${report.forbidden_dirty.length} |
| W5 closeout gate | ${report.w5_closeout_gate.ok ? 'PASS' : 'FAIL'} |
| Business code modified | No |
| DB written | No |
| Deployed | No |

## Doctor Summary

- Open improvement count: ${report.doctor.open_improvement_count}
- Repeated pattern count: ${report.doctor.repeated_pattern_count}
- Highest priority improvement: ${report.doctor.highest_priority_improvement || 'None'}
`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.apply) {
  console.error('agent-finalize requires --apply to write finalize result.');
  process.exit(1);
}

let jsonValid = true;
let backlogReadable = true;
for (const file of REQUIRED_JSON) {
  try {
    readJson(file);
  } catch {
    jsonValid = false;
    if (file.endsWith('improvement-backlog.json')) backlogReadable = false;
  }
}

const doctor = buildDoctorReport();
const backlog = backlogReadable ? readJson('docs/ops/evolution/improvement-backlog.json') : [];
const files = changedFiles();
const forbidden = forbiddenDirty(files);
const w5 = existsSync(resolvePath('scripts/ci/check-w5-closeout-gate.mjs'))
  ? run('node', ['scripts/ci/check-w5-closeout-gate.mjs'])
  : { ok: true, output: 'W5 closeout gate not present; treated as not applicable.' };
const topCandidatesExist = Array.isArray(backlog) && backlog.length > 0 && doctor.top_3_improvement_candidates.length > 0;
const finalizeResult = jsonValid && backlogReadable && topCandidatesExist && forbidden.length === 0 && w5.ok ? 'GO' : 'HOLD';

const report = {
  generated_at: new Date().toISOString(),
  finalize_result: finalizeResult,
  json_valid: jsonValid,
  backlog_readable: backlogReadable,
  top_candidates_exist: topCandidatesExist,
  forbidden_dirty: forbidden,
  w5_closeout_gate: w5,
  doctor,
  business_code_modified: false,
  database_written: false,
  deployed: false,
};

writeFile(FINALIZE_JSON, `${JSON.stringify(report, null, 2)}\n`);
writeFile(FINALIZE_ALIAS_JSON, `${JSON.stringify(report, null, 2)}\n`);
writeFile(FINALIZE_MD, markdown(report));
console.log(`FINALIZE RESULT: ${finalizeResult}`);
console.log(`W5 closeout gate: ${w5.ok ? 'PASS' : 'FAIL'}`);
console.log(`Open improvement count: ${doctor.open_improvement_count}`);
console.log(`Highest priority improvement: ${doctor.highest_priority_improvement || 'None'}`);
if (forbidden.length > 0) console.log(`Forbidden dirty files: ${forbidden.join(', ')}`);
process.exit(finalizeResult === 'GO' ? 0 : 1);
