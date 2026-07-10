#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const ts = (() => {
  const candidates = [
    'typescript',
    path.join(ROOT, 'node_modules/typescript'),
    path.join(ROOT, 'apps/web/node_modules/typescript'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next known install location.
    }
  }
  throw new Error('Cannot find TypeScript. Install it with `npm install --no-save --ignore-scripts typescript@5` or `pnpm install --filter web --frozen-lockfile`.');
})();
const SRC = path.join(ROOT, 'apps/web/src');
const RUNS = path.join(ROOT, 'docs/ops/runs');
const REPORT_JSON = path.join(RUNS, 'i18n-hardcoded-literals-latest.json');
const REPORT_MD = path.join(RUNS, 'i18n-hardcoded-literals-latest.md');
const LOCALE_DIR = path.join(SRC, 'locales');

const args = new Set(process.argv.slice(2));
const writeReport = args.has('--write-report');
const failOnFindings = args.has('--fail-on-findings');
const failOnUncovered = args.has('--fail-on-uncovered');

const includeDirs = [
  path.join(SRC, 'app'),
  path.join(SRC, 'components'),
  path.join(SRC, 'lib'),
  path.join(SRC, 'hooks'),
];

const ignoreFiles = [
  '/locales/',
  '/__tests__/',
];

const ignoreChinese = [
  /^[\u4e00-\u9fff]$/, // single unit labels are often data/unit codes and are noisy
  /[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff].*[\u4e00-\u9fff]/,
];

const localePrefixes = [
  'common.', 'ui.', 'menu.', 'status.', 'workflow.', 'approval.', 'settings.',
  'md.', 'finance.', 'fin2.', 'procurement.', 'sales.', 'warehouse.', 'breeding.',
  'quality.', 'dashboard.', 'system.', 'store.', 'mobile.', 'trace.', 'pos.',
  'auto.literal.',
];

function loadJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const zhLocale = loadJson(path.join(LOCALE_DIR, 'zh.json'));
const enLocale = loadJson(path.join(LOCALE_DIR, 'en.json'));
const loLocale = loadJson(path.join(LOCALE_DIR, 'lo.json'));
const autoTranslatable = new Set();
for (const key of Object.keys(zhLocale)) {
  if (!localePrefixes.some((prefix) => key.startsWith(prefix))) continue;
  const source = String(zhLocale[key] || '').replace(/\s+/g, ' ').trim();
  if (!source || !/[\u4e00-\u9fff]/.test(source)) continue;
  if (enLocale[key] && loLocale[key]) autoTranslatable.add(source);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist'].includes(entry.name)) walk(file, out);
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry.name) && !ignoreFiles.some((part) => file.includes(part))) out.push(file);
  }
  return out;
}

function isImportLike(node) {
  let p = node.parent;
  while (p) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    p = p.parent;
  }
  return false;
}

function isObjectKey(node) {
  const p = node.parent;
  return p && ts.isPropertyAssignment(p) && p.name === node;
}

function isTypeOnly(node) {
  let p = node.parent;
  while (p) {
    if (ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isLiteralTypeNode(p)) return true;
    p = p.parent;
  }
  return false;
}

function isI18nCallArg(node) {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  const expr = p.expression;
  return ts.isIdentifier(expr) && ['t', 'tr', 'tt', 'tFn'].includes(expr.text);
}

function shouldRecord(text) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value || !/[\u4e00-\u9fff]/.test(value)) return false;
  if (/^(auto\.literal|common|ui|menu|status|workflow|approval|settings|md|finance|procurement|sales|warehouse|breeding|quality|dashboard|system|store|mobile|trace|pos|prc2|mob|terminal)\./.test(value)) return false;
  if (/^[A-Z0-9_:/.\-\s]+$/.test(value)) return false;
  if (ignoreChinese.some((re) => re.test(value))) return false;
  return true;
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function collect(file) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const value = node.getText(sf).replace(/\s+/g, ' ').trim();
      if (shouldRecord(value)) findings.push({ file, line: lineOf(sf, node), kind: 'jsx-text', text: value });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = node.text;
      if (shouldRecord(value) && !isImportLike(node) && !isObjectKey(node) && !isTypeOnly(node) && !isI18nCallArg(node)) {
        findings.push({ file, line: lineOf(sf, node), kind: 'string-literal', text: value.replace(/\s+/g, ' ').trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

const allFindings = includeDirs.flatMap((dir) => walk(dir)).flatMap(collect);
const findingsWithCoverage = allFindings.map((finding) => ({
  ...finding,
  auto_translatable: autoTranslatable.has(finding.text.replace(/\s+/g, ' ').trim()),
}));
const byFile = new Map();
for (const finding of findingsWithCoverage) {
  const rel = path.relative(ROOT, finding.file);
  if (!byFile.has(rel)) byFile.set(rel, []);
  byFile.get(rel).push({ ...finding, file: rel });
}

const sortedFiles = [...byFile.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([file, findings]) => ({ file, count: findings.length, samples: findings.slice(0, 8) }));

const report = {
  generated_at: new Date().toISOString(),
  scope: 'apps/web/src app/components/lib/hooks',
  total_findings: findingsWithCoverage.length,
  auto_translatable_findings: findingsWithCoverage.filter((item) => item.auto_translatable).length,
  manual_componentization_findings: findingsWithCoverage.filter((item) => !item.auto_translatable).length,
  affected_files: sortedFiles.length,
  top_files: sortedFiles.slice(0, 50),
  findings: findingsWithCoverage.map((item) => ({
    ...item,
    file: path.relative(ROOT, item.file),
  })),
  note: 'This detects remaining hardcoded Chinese literals. Existing key parity gate only proves referenced t() keys exist; it does not prove full UI i18n coverage.',
};

if (writeReport) {
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const lines = [
    '# i18n Hardcoded Literals Audit',
    '',
    `Generated: ${report.generated_at}`,
    '',
    `Total findings: ${report.total_findings}`,
    `Auto-translatable by runtime bridge: ${report.auto_translatable_findings}`,
    `Still requiring componentization or dictionary modeling: ${report.manual_componentization_findings}`,
    `Affected files: ${report.affected_files}`,
    '',
    'This report is intentionally stricter than `scripts/check-i18n-keys.js`: key parity can pass while pages still render hardcoded Chinese.',
    '',
    '## Top Files',
    '',
    '| File | Count | Samples |',
    '|---|---:|---|',
    ...report.top_files.map((item) => `| \`${item.file}\` | ${item.count} | ${item.samples.map((s) => `${s.line}:${s.text}`).join('<br>')} |`),
    '',
  ];
  fs.writeFileSync(REPORT_MD, lines.join('\n'));
}

console.log(`i18n-hardcoded-literals: ${allFindings.length} findings in ${sortedFiles.length} files`);
if (writeReport) console.log(`reports: ${path.relative(ROOT, REPORT_JSON)}, ${path.relative(ROOT, REPORT_MD)}`);
if (failOnUncovered && report.manual_componentization_findings > 0) process.exit(1);
if (failOnFindings && findingsWithCoverage.length > 0) process.exit(1);
