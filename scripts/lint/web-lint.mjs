import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');
const baselinePath = path.join(root, 'scripts/lint/web-baseline.json');
const currentPath = path.join(root, 'cache/lint/web-current.json');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function inventory(results, repoRoot = root) {
  const counts = new Map();
  for (const result of results) {
    const file = path.relative(repoRoot, result.filePath).split(path.sep).join('/');
    if (!file.startsWith('apps/web/') || file.includes('../')) throw new Error('ESLint returned a file outside apps/web');
    for (const message of result.messages) {
      if (message.fatal) throw new Error(`ESLint parse failure: ${file}:${message.line}: ${message.message}`);
      const ruleId = message.ruleId ?? '(eslint diagnostic)';
      const severity = message.severity;
      const key = JSON.stringify([file, ruleId, severity]);
      const entry = counts.get(key) ?? { file, ruleId, severity, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  }
  const entries = [...counts.values()].sort((a, b) => compare(a.file, b.file) || compare(a.ruleId, b.ruleId) || a.severity - b.severity);
  const summary = { totalErrors: 0, totalWarnings: 0, filesWithErrors: 0, errorsByRule: {}, errorsByFile: {} };
  for (const e of entries) {
    if (e.severity === 2) {
      summary.totalErrors += e.count;
      summary.errorsByRule[e.ruleId] = (summary.errorsByRule[e.ruleId] ?? 0) + e.count;
      summary.errorsByFile[e.file] = (summary.errorsByFile[e.file] ?? 0) + e.count;
    } else if (e.severity === 1) summary.totalWarnings += e.count;
  }
  summary.filesWithErrors = Object.keys(summary.errorsByFile).length;
  summary.errorsByRule = Object.fromEntries(Object.entries(summary.errorsByRule).sort(([a], [b]) => compare(a, b)));
  return { schemaVersion: 1, entries, summary };
}

function checkedInventory(data) {
    if (data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Invalid baseline schema');
    const map = new Map();
    for (const e of data.entries) {
      if (typeof e.file !== 'string' || !e.file.startsWith('apps/web/') || e.file.includes('..') || e.file.includes('\\') ||
          typeof e.ruleId !== 'string' || ![1, 2].includes(e.severity) || !Number.isInteger(e.count) || e.count < 1) throw new Error('Invalid inventory entry');
      const key = JSON.stringify([e.file, e.ruleId, e.severity]);
      if (map.has(key)) throw new Error('Duplicate inventory entry');
      map.set(key, e.count);
    }
    return map;
}

export function regressions(baseline, current) {
  const previous = checkedInventory(baseline);
  checkedInventory(current);
  return current.entries.filter(e => e.severity === 2).flatMap(e => {
    const before = previous.get(JSON.stringify([e.file, e.ruleId, 2])) ?? 0;
    return e.count > before ? [{ ...e, before }] : [];
  });
}

export function changedRegressions(baseline, current, changed, renames = []) {
  const previous = checkedInventory(baseline);
  checkedInventory(current);
  const changedSet = new Set(changed);
  const renameMap = new Map(renames.map(({ oldPath, newPath }) => [newPath, oldPath]));
  return current.entries.filter(e => e.severity === 2 && changedSet.has(e.file)).flatMap(e => {
    const baselineFile = renameMap.get(e.file) ?? e.file;
    const before = previous.get(JSON.stringify([baselineFile, e.ruleId, 2])) ?? 0;
    return e.count > before ? [{ ...e, before, baselineFile }] : [];
  });
}

function git(args, optional = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(result.error?.message ?? result.stderr);
  }
  return result.stdout;
}

export function selectBase(explicit, run = git) {
  if (explicit) return run(['rev-parse', '--verify', `${explicit}^{commit}`]).trim();
  const mergeBase = run(['merge-base', 'HEAD', 'origin/main'], true);
  if (mergeBase) return mergeBase.trim();
  return run(['rev-parse', '--verify', 'HEAD~1^{commit}']).trim();
}

export function changedFiles(diff, untracked, present = file => existsSync(path.join(root, file))) {
  const diffFiles = parseDiff(diff).map(entry => entry.newPath ?? entry.path);
  return [...new Set([...diffFiles, ...untracked.split('\0')])]
    .filter(file => file.startsWith('apps/web/') && /\.(js|jsx|ts|tsx)$/.test(file) && present(file))
    .sort(compare);
}

export function parseDiff(diff) {
  const tokens = diff.split('\0').filter(Boolean);
  if (!tokens.length) return [];
  if (!/^(?:[ACMRT]\d*|[ACMRT])$/.test(tokens[0])) return tokens.map(path => ({ path }));
  const entries = [];
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i++];
    if (status.startsWith('R')) entries.push({ status, oldPath: tokens[i++], newPath: tokens[i++] });
    else entries.push({ status, path: tokens[i++] });
  }
  return entries;
}

function scan(files) {
  const require = createRequire(path.join(web, 'package.json'));
  const bin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
  const result = spawnSync(process.execPath, [bin, '--format', 'json', '--', ...files], {
    cwd: web, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error(result.error?.message ?? result.stderr ?? 'ESLint failed');
  return JSON.parse(result.stdout);
}

function save(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function saveAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n');
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw error;
  }
}

export function updateBaselineFile(baseline, current, target, acceptRegression = false) {
  const debt = regressions(baseline, current);
  const totalDelta = current.summary.totalErrors - baseline.summary.totalErrors;
  if (debt.length && !acceptRegression) return { updated: false, debt, totalDelta };
  saveAtomic(target, current);
  return { updated: true, debt, totalDelta };
}

export function updateBaselineFromScan(scanCurrent, baseline, target, acceptRegression = false) {
  return updateBaselineFile(baseline, scanCurrent(), target, acceptRegression);
}

function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (!['inventory', 'update', 'ratchet', 'changed'].includes(mode)) throw new Error('Expected inventory | update [--accept-regression] | ratchet | changed [--base REF]');
  const acceptsRegression = mode === 'update' && args.length === 1 && args[0] === '--accept-regression';
  if (args.length && !acceptsRegression && !(mode === 'changed' && args.length === 2 && args[0] === '--base' && args[1])) throw new Error('Only update accepts --accept-regression and changed accepts --base REF');
  if (mode === 'changed') {
    const base = selectBase(args[1]);
    const diff = git(['diff', '--name-status', '-z', '-M', '--diff-filter=ACMRT', base, '--', 'apps/web']);
    const files = changedFiles(diff, git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'apps/web']));
    const renames = parseDiff(diff).filter(entry => entry.oldPath && entry.newPath).map(({ oldPath, newPath }) => ({ oldPath, newPath }));
    console.log(`Changed-file lint base: ${base}; files: ${files.length}`);
    if (!files.length) return;
    const results = scan(files.map(file => path.relative(web, path.join(root, file))));
    const current = inventory(results);
    for (const result of results) for (const m of result.messages) console.log(`${path.relative(root, result.filePath)}:${m.line ?? 0}:${m.column ?? 0} ${m.severity === 2 ? 'error' : 'warning'} ${m.ruleId ?? ''} ${m.message}`);
    console.log(`${current.summary.totalErrors} errors / ${current.summary.totalWarnings} warnings`);
    const debt = changedRegressions(JSON.parse(readFileSync(baselinePath, 'utf8')), current, files, renames);
    for (const e of debt) console.error(`${e.file} ${e.ruleId}: baseline ${e.before} -> ${e.count}`);
    console.log(debt.length ? `FAIL: ${debt.length} changed file/rule pairs increased` : 'PASS: changed files did not increase lint debt');
    if (debt.length) process.exitCode = 1;
    return;
  }
  const current = inventory(scan(['.']));
  save(currentPath, current);
  console.log(`${current.summary.totalErrors} errors / ${current.summary.totalWarnings} warnings / ${current.summary.filesWithErrors} error files; inventory: cache/lint/web-current.json`);
  if (mode === 'update') {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const result = updateBaselineFile(baseline, current, baselinePath, acceptsRegression);
    if (result.debt.length && !acceptsRegression) {
      for (const e of result.debt) console.error(`${e.before === 0 ? 'new file/rule pair' : 'increased existing count'}: ${e.file} ${e.ruleId}: baseline ${e.before} -> ${e.count}`);
      console.error(`FAIL: baseline update would increase ${result.debt.length} error file/rule pairs (${result.totalDelta >= 0 ? '+' : ''}${result.totalDelta} total errors)`);
      process.exitCode = 1;
    } else {
      if (acceptsRegression && result.debt.length) {
        console.warn('ACCEPTING LINT DEBT REGRESSION');
        for (const e of result.debt) console.warn(`${e.before === 0 ? 'new file/rule pair' : 'increased existing count'}: ${e.file} ${e.ruleId}: baseline ${e.before} -> ${e.count}`);
        console.warn(`Total error delta: ${result.totalDelta >= 0 ? '+' : ''}${result.totalDelta}`);
      }
      console.log('Baseline explicitly updated atomically; review the diff before committing.');
    }
  } else if (mode === 'ratchet') {
    const debt = regressions(JSON.parse(readFileSync(baselinePath, 'utf8')), current);
    for (const e of debt) console.error(`${e.file} ${e.ruleId}: ${e.before} -> ${e.count}`);
    console.log(debt.length ? `FAIL: ${debt.length} file/rule pairs increased` : 'PASS: no file/rule error count increased');
    if (debt.length) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
