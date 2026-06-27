#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NORMALIZABLE_FIELDS = new Set([
  'commit_hash',
  'migration_added',
  'verification_results',
  'recommend_next_agent',
]);

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/normalize-agent-result.mjs \\
    --input-json <file> \\
    --source-report <file> \\
    --worktree <path> \\
    --output-json <file> \\
    --output-md <file> \\
    [--dry-run]`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = { dryRun: false };
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') {
      values.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      values[arg.slice(2)] = normalized[i + 1];
      i += 1;
    }
  }
  return values;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function resolvePath(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function requireFile(file, label) {
  const absolute = resolvePath(file);
  if (!existsSync(absolute)) fail(`${label} does not exist: ${file}`);
  return absolute;
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function boolFromReport(report, positivePatterns, negativePatterns) {
  if (negativePatterns.some((pattern) => pattern.test(report))) return false;
  if (positivePatterns.some((pattern) => pattern.test(report))) return true;
  return null;
}

function inferCommitHash({ result, report, sourceReport, worktree }) {
  if (result.commit_hash) {
    return {
      value: result.commit_hash,
      evidence: 'input-json already contained commit_hash',
    };
  }

  const candidates = [
    path.relative(worktree, sourceReport),
    path.relative(process.cwd(), sourceReport),
  ].filter((candidate) => candidate && !candidate.startsWith('..') && candidate !== sourceReport);

  for (const reportRelative of candidates) {
    try {
      const hash = runGit(['log', '-n', '1', '--format=%H', '--', reportRelative], worktree);
      if (hash) {
        return {
          value: hash,
          evidence: `git log in worktree for ${reportRelative}`,
        };
      }
    } catch {
      // Fall through to text evidence.
    }
  }

  const textHash = report.match(/\b[a-f0-9]{7,40}\b/i)?.[0] ?? null;
  if (textHash) {
    return {
      value: textHash,
      evidence: 'first commit-like hash found in source report',
    };
  }

  try {
    const head = runGit(['rev-parse', 'HEAD'], worktree);
    return {
      value: head,
      evidence: 'worktree HEAD; used only because no report-specific commit was found',
    };
  } catch {
    return { value: null, evidence: 'unable to infer commit hash' };
  }
}

function inferMigrationAdded({ result, report }) {
  if (result.migration_added !== null && result.migration_added !== undefined) {
    return {
      value: result.migration_added,
      evidence: 'input-json already contained migration_added',
    };
  }

  const value = boolFromReport(
    report,
    [/migration\s+added\s*[:：]\s*(yes|true|是)/i, /新增\s*migration\s*[:：]\s*(是|yes|true)/i],
    [
      /migration\s+added\s*[:：]\s*(no|false|否)/i,
      /migration\/schema\/entity\/table\/column changed\s*\|\s*No/i,
      /Migration\/schema\/entity\/table\/column changed\s*\|\s*No/i,
      /Migration executed\s*\|\s*No/i,
      /Migration\/schema\/entity\/table\/column changed\s*\|\s*No/i,
      /Migration\/schema\/entity\/table\/column changed\s*\|\s*No/i,
      /Migration\/schema\/entity\/table\/column changed\s*\|\s*No/i,
    ],
  );

  if (value !== null) {
    return {
      value,
      evidence: 'source report explicitly states no migration/schema/entity/table/column change or no migration added',
    };
  }
  return { value: null, evidence: 'migration_added not safely inferable' };
}

function inferVerificationResults({ result, report }) {
  if (Array.isArray(result.verification_results) && result.verification_results.length > 0) {
    return {
      value: result.verification_results,
      evidence: 'input-json already contained verification_results',
    };
  }

  const conclusion = report.match(/PASS WITH CONDITIONS|PASS|FAIL|HOLD|ROLLBACK/i)?.[0]?.toUpperCase() ?? null;
  if (conclusion) {
    return {
      value: [
        {
          command: 'read-only security review report',
          result: conclusion,
          summary: 'No specific executable verification command was present; normalized as review_only evidence from source report.',
          review_only: true,
        },
      ],
      evidence: 'source report conclusion normalized as review_only verification result',
    };
  }
  return { value: [], evidence: 'verification_results not safely inferable' };
}

function inferNextAgent({ result, report }) {
  const existing = result.recommend_next_agent ?? result.next_agents;
  if (Array.isArray(existing) && existing.length > 0) {
    return {
      value: existing,
      evidence: 'input-json already contained recommend_next_agent or next_agents',
    };
  }

  if (/A1|CI|validation|typecheck|post-merge/i.test(report) && /PASS WITH CONDITIONS/i.test(report)) {
    return {
      value: ['A1-CI-Runtime-Gate'],
      evidence: 'A2 follow-up passed with conditions and source report references A1 validation/blockers; next gate is A1',
    };
  }
  return { value: [], evidence: 'recommend_next_agent not safely inferable' };
}

function updateMissingFields(result) {
  const missing = new Set(result.missing_fields ?? []);
  for (const field of [...missing]) {
    if (!NORMALIZABLE_FIELDS.has(field)) continue;
    const value = result[field];
    if (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '') {
      missing.delete(field);
    }
  }
  return [...missing];
}

const args = parseArgs(process.argv.slice(2));
for (const required of ['input-json', 'source-report', 'worktree', 'output-json', 'output-md']) {
  if (!args[required]) usage(1);
}

const inputJsonPath = requireFile(args['input-json'], 'input-json');
const sourceReportPath = requireFile(args['source-report'], 'source-report');
const worktree = resolvePath(args.worktree);
if (!existsSync(worktree)) fail(`worktree does not exist: ${args.worktree}`);
try {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], worktree);
  if (inside !== 'true') fail(`${worktree} is not a git repository`);
} catch (error) {
  fail(`${worktree} is not a git repository: ${error.message}`);
}

const result = JSON.parse(readFileSync(inputJsonPath, 'utf8'));
const report = readFileSync(sourceReportPath, 'utf8');
const normalized = structuredClone(result);
const evidence = [];

const commit = inferCommitHash({ result: normalized, report, sourceReport: sourceReportPath, worktree });
if (commit.value) {
  normalized.commit_hash = commit.value;
  evidence.push({ field: 'commit_hash', value: commit.value, source: commit.evidence });
}

const migrationAdded = inferMigrationAdded({ result: normalized, report });
if (migrationAdded.value !== null) {
  normalized.migration_added = migrationAdded.value;
  evidence.push({ field: 'migration_added', value: migrationAdded.value, source: migrationAdded.evidence });
}

const verification = inferVerificationResults({ result: normalized, report });
if (verification.value.length > 0) {
  normalized.verification_results = verification.value;
  evidence.push({ field: 'verification_results', value: verification.value, source: verification.evidence });
}

const nextAgent = inferNextAgent({ result: normalized, report });
if (nextAgent.value.length > 0) {
  normalized.recommend_next_agent = nextAgent.value;
  normalized.next_agents = nextAgent.value;
  evidence.push({ field: 'recommend_next_agent', value: nextAgent.value, source: nextAgent.evidence });
}

normalized.normalized = true;
normalized.normalized_at = new Date().toISOString();
normalized.normalization_source = {
  input_json: path.relative(process.cwd(), inputJsonPath),
  source_report: path.relative(process.cwd(), sourceReportPath),
  worktree,
  dry_run: args.dryRun,
};
normalized.normalization_evidence = evidence;
normalized.missing_fields = updateMissingFields(normalized);

const outputJson = resolvePath(args['output-json']);
const outputMd = resolvePath(args['output-md']);
mkdirSync(path.dirname(outputJson), { recursive: true });
mkdirSync(path.dirname(outputMd), { recursive: true });
writeFileSync(outputJson, `${JSON.stringify(normalized, null, 2)}\n`);

const md = `# Normalized Agent Result

| Field | Value |
| --- | --- |
| Task ID | ${normalized.task_id ?? 'MISSING'} |
| Agent | ${normalized.agent ?? 'MISSING'} |
| Conclusion | ${normalized.conclusion ?? 'MISSING'} |
| Commit hash | ${normalized.commit_hash ?? 'MISSING'} |
| Migration added | ${normalized.migration_added} |
| Recommended next Agent | ${(normalized.recommend_next_agent ?? []).join(', ') || 'MISSING'} |
| Missing fields | ${normalized.missing_fields.length > 0 ? normalized.missing_fields.join(', ') : 'None'} |
| Dry run | ${args.dryRun ? 'Yes' : 'No'} |
| Task board modified | No |
| Agent executed | No |
| Migration executed | No |
| Database written | No |
| Deployment executed | No |

## Normalization Evidence

${evidence.map((item) => `- ${item.field}: ${JSON.stringify(item.value)} (${item.source})`).join('\n') || '- None'}

## Verification Results

${(normalized.verification_results ?? [])
  .map((item) => `- ${item.result}: ${item.command}${item.review_only ? ' (review_only)' : ''} - ${item.summary ?? ''}`)
  .join('\n') || '- None'}
`;
writeFileSync(outputMd, md);

console.log(`Normalized result: ${normalized.conclusion ?? 'MISSING'}`);
console.log(`Missing fields: ${normalized.missing_fields.length > 0 ? normalized.missing_fields.join(', ') : 'None'}`);
console.log(`JSON: ${path.relative(process.cwd(), outputJson)}`);
console.log(`Markdown: ${path.relative(process.cwd(), outputMd)}`);
console.log('Task board modified: No');
console.log('Agent executed: No');
