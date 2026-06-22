#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REQUIRED_FIELDS = [
  'commit_hash',
  'changed_files',
  'frozen_items_touched',
  'business_code_changed',
  'migration_added',
  'migration_executed',
  'database_written',
  'deployed',
  'verification_results',
  'conclusion',
  'recommend_next_agent',
  'conditions',
  'blockers',
];

function usage(exitCode = 1) {
  console.log(`Usage:
  node scripts/ops/parse-agent-result.mjs \\
    --agent <agent> \\
    --worktree <path> \\
    --task-id <task-id> \\
    --result-file <file> \\
    --output-json <file> \\
    --output-md <file>`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const normalized = argv.map((arg) => arg.replace(/^–+/, '--'));
  const values = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];
    if (arg === '--help' || arg === '-h') usage(0);
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

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveFile(file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!existsSync(absolute)) fail(`file does not exist: ${file}`);
  return absolute;
}

function normalizeBool(value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (/^(yes|true|是|有|y)\b/.test(lower)) return true;
  if (/^(no|false|否|无|n)\b/.test(lower)) return false;
  return null;
}

function extractLineValue(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:：]\\s*(.+)`, 'i');
    const match = text.match(pattern);
    if (match) return match[1].trim().replace(/[。.]$/, '');
  }
  return null;
}

function extractSection(text, headingPatterns) {
  for (const heading of headingPatterns) {
    const pattern = new RegExp(`(?:^|\\n)#{1,6}\\s+.*${heading}.*\\n([\\s\\S]*?)(?=\\n#{1,6}\\s+|$)`, 'i');
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

function extractListFromSection(section) {
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]|\d+\./.test(line))
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

function extractChangedFiles(text) {
  const section = extractSection(text, ['Changed Files', '修改文件', 'Verified File List']);
  const files = new Set();
  const combined = section || text;
  const filePattern = /`([^`]+\.(?:ts|tsx|js|jsx|mjs|md|json|yml|yaml|sql))`/g;
  let match;
  while ((match = filePattern.exec(combined)) !== null) {
    const file = match[1];
    if (!file.includes(' ')) files.add(file);
  }
  return [...files];
}

function inferBusinessCodeChanged(changedFiles) {
  return changedFiles.some((file) => file.startsWith('apps/api/') || file.startsWith('apps/web/'));
}

function inferMigrationAdded(text, changedFiles) {
  if (changedFiles.some((file) => file.includes('/migrations/') || file.startsWith('migrations/'))) return true;
  const explicit = extractLineValue(text, ['Migration added', '是否新增 migration', '新增 migration']);
  return normalizeBool(explicit);
}

function parseVerificationResults(text) {
  const results = [];
  const commandSection = extractSection(text, ['Verification Commands', 'Command Results', '验证命令']);
  const source = commandSection || text;
  const commandBlocks = [...source.matchAll(/```bash\n([\s\S]*?)```[\s\S]{0,240}?Result\s*[:：]\s*(PASS|FAIL|WARN|PASS WITH CONDITIONS)/gi)];
  for (const match of commandBlocks) {
    results.push({
      command: match[1].trim().replace(/\n/g, ' && '),
      result: match[2].toUpperCase(),
    });
  }
  const tableRows = [...source.matchAll(/\|\s*`([^`]+)`\s*\|\s*(PASS|FAIL|WARN|PASS WITH CONDITIONS)\s*\|([^|\n]*)\|/gi)];
  for (const match of tableRows) {
    results.push({
      command: match[1].trim(),
      result: match[2].toUpperCase(),
      summary: match[3].trim(),
    });
  }
  return results;
}

function extractConclusion(text) {
  const explicit = extractLineValue(text, ['Final conclusion', '最终结论', 'Conclusion', 'Result']);
  if (explicit) {
    const match = explicit.match(/PASS WITH CONDITIONS|PASS|FAIL|HOLD|ROLLBACK/i);
    if (match) return match[0].toUpperCase();
  }
  const conclusionSection = extractSection(text, ['Conclusion', '最终结论']);
  const match = conclusionSection.match(/PASS WITH CONDITIONS|PASS|FAIL|HOLD|ROLLBACK/i);
  return match ? match[0].toUpperCase() : null;
}

function inferNextAgent(text) {
  const explicit = extractLineValue(text, ['Suggested next Agent', '建议下一步', 'Next Agent', 'Next step']);
  const nextSection = extractSection(text, ['Next Step', 'Next Review Request', '下一步']);
  const source = `${explicit ?? ''}\n${nextSection}`;
  const agents = [];
  const map = [
    ['A2', 'A2-Security-Regression-Gate'],
    ['A1', 'A1-CI-Runtime-Gate'],
    ['A4', 'A4-Frontend-UAT-Smoke'],
    ['A6', 'A6-Staging-Deploy-Runbook'],
    ['A7', 'A7-Final-QA-Gate'],
    ['A5', 'A5-Data-Readiness'],
    ['A3', 'A3-Backend-Critical-Path'],
  ];
  for (const [shortName, fullName] of map) {
    if (new RegExp(`\\b${shortName}\\b|${fullName}`, 'i').test(source)) agents.push(fullName);
  }
  return [...new Set(agents)];
}

const args = parseArgs(process.argv.slice(2));
for (const required of ['agent', 'worktree', 'task-id', 'result-file', 'output-json', 'output-md']) {
  if (!args[required]) usage(1);
}

const worktree = path.resolve(args.worktree);
if (!existsSync(worktree)) fail(`worktree does not exist: ${worktree}`);
try {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], worktree);
  if (inside !== 'true') fail(`${worktree} is not a git repository`);
} catch (error) {
  fail(`${worktree} is not a git repository: ${error.message}`);
}

const resultFile = resolveFile(args['result-file']);
const text = readFileSync(resultFile, 'utf8');
const changedFiles = extractChangedFiles(text);
const verificationResults = parseVerificationResults(text);
const commitHash =
  extractLineValue(text, ['commit hash', 'Commit', 'A3 commit reviewed', 'HEAD'])?.match(/[a-f0-9]{7,40}/i)?.[0] ?? null;

const conditions = extractListFromSection(extractSection(text, ['Conditions', '条件项']));
const blockers = extractListFromSection(extractSection(text, ['Blockers', '阻断项']));
const nextAgents = inferNextAgent(text);

const summary = {
  task_id: args['task-id'],
  agent: args.agent,
  worktree,
  worktree_branch: runGit(['branch', '--show-current'], worktree),
  result_file: path.relative(process.cwd(), resultFile),
  parsed_at: new Date().toISOString(),
  commit_hash: commitHash,
  changed_files: changedFiles,
  frozen_items_touched: normalizeBool(extractLineValue(text, ['是否触碰冻结项', 'Frozen items touched', 'Frozen boundary touched'])) ?? inferBusinessCodeChanged(changedFiles),
  business_code_changed: normalizeBool(extractLineValue(text, ['是否改业务代码', 'Business code changed'])) ?? inferBusinessCodeChanged(changedFiles),
  migration_added: inferMigrationAdded(text, changedFiles),
  migration_executed: normalizeBool(extractLineValue(text, ['Migration executed', '是否执行 migration', 'Migration was executed'])) ?? false,
  database_written: normalizeBool(extractLineValue(text, ['Database writes', 'DB write performed', '是否写库', 'Database written'])) ?? false,
  deployed: normalizeBool(extractLineValue(text, ['Deployment executed', 'Deployment performed', '是否部署', 'Deployment'])) ?? false,
  verification_results: verificationResults,
  conclusion: extractConclusion(text),
  recommend_next_agent: nextAgents,
  conditions,
  blockers,
};

summary.missing_fields = REQUIRED_FIELDS.filter((field) => {
  const value = summary[field];
  if (Array.isArray(value)) return value.length === 0 && !['conditions', 'blockers'].includes(field);
  return value === null || value === undefined || value === '';
});

const outputJson = path.isAbsolute(args['output-json']) ? args['output-json'] : path.resolve(process.cwd(), args['output-json']);
const outputMd = path.isAbsolute(args['output-md']) ? args['output-md'] : path.resolve(process.cwd(), args['output-md']);
mkdirSync(path.dirname(outputJson), { recursive: true });
mkdirSync(path.dirname(outputMd), { recursive: true });
writeFileSync(outputJson, `${JSON.stringify(summary, null, 2)}\n`);

const md = `# Agent Result Summary

| Field | Value |
| --- | --- |
| Task ID | ${summary.task_id} |
| Agent | ${summary.agent} |
| Worktree | \`${summary.worktree}\` |
| Branch | \`${summary.worktree_branch}\` |
| Commit hash | ${summary.commit_hash ?? 'MISSING'} |
| Conclusion | ${summary.conclusion ?? 'MISSING'} |
| Frozen items touched | ${summary.frozen_items_touched} |
| Business code changed | ${summary.business_code_changed} |
| Migration added | ${summary.migration_added} |
| Migration executed | ${summary.migration_executed} |
| Database written | ${summary.database_written} |
| Deployed | ${summary.deployed} |
| Recommended next Agent | ${summary.recommend_next_agent.join(', ') || 'MISSING'} |

## Changed Files

${summary.changed_files.map((file) => `- \`${file}\``).join('\n') || '- MISSING'}

## Verification Results

${summary.verification_results.map((item) => `- ${item.result}: \`${item.command}\`${item.summary ? ` - ${item.summary}` : ''}`).join('\n') || '- MISSING'}

## Conditions

${summary.conditions.map((item) => `- ${item}`).join('\n') || '- None'}

## Blockers

${summary.blockers.map((item) => `- ${item}`).join('\n') || '- None'}

## Missing Fields

${summary.missing_fields.map((item) => `- ${item}`).join('\n') || '- None'}
`;
writeFileSync(outputMd, md);

console.log(`Parsed result: ${summary.conclusion ?? 'MISSING'}`);
console.log(`JSON: ${path.relative(process.cwd(), outputJson)}`);
console.log(`Markdown: ${path.relative(process.cwd(), outputMd)}`);
if (summary.missing_fields.length > 0) {
  console.log(`Missing fields: ${summary.missing_fields.join(', ')}`);
}
