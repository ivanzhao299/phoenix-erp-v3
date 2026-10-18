#!/usr/bin/env node
/** Conservative direct TaskService capability coverage, not a transitive
 * dependency proof or replacement for runtime drain/independent review. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = (() => {
  for (const name of ['typescript', path.join(root, 'apps/api/node_modules/typescript')]) {
    try { return require(name); } catch { /* Try the existing API install. */ }
  }
  throw new Error('BACKGROUND_FLOOR_TYPESCRIPT_REQUIRED');
})();
const IOT = 'apps/api/src/modules/iot/iot-sync.service.ts';
const excluded = file => /(?:^|\/)(?:__tests__|tests?|fixtures?)(?:\/|$)|\.(?:spec|test|test-fixture|fixture|d)\.ts$/.test(file);
function source(file) {
  if (file !== IOT) return fs.readFileSync(path.join(root, file), 'utf8');
  // Do not decode, retain or inspect the legacy sensitive header. Advance
  // only over line boundaries; parse the already-audited class body at 25+.
  const fd = fs.openSync(path.join(root, file), 'r'), byte = Buffer.alloc(1);
  try {
    let lines = 0;
    while (lines < 24) { if (fs.readSync(fd, byte, 0, 1, null) !== 1) throw new Error('BACKGROUND_FLOOR_IOT_SCOPE_REQUIRED'); if (byte[0] === 10) lines++; }
    return '\n'.repeat(23) + 'class RedactedIoTHeader {\n' + fs.readFileSync(fd, 'utf8');
  } finally { fs.closeSync(fd); }
}
export function inspectBackgroundFloor(sources, criticalFiles) {
  if (!Array.isArray(criticalFiles) || criticalFiles.some(v => typeof v !== 'string') || new Set(criticalFiles).size !== criticalFiles.length) throw new Error('BACKGROUND_FLOOR_CONTRACT_INVALID');
  const pins = new Set(criticalFiles), consumers = [];
  for (const [file, text] of Object.entries(sources).sort()) {
    if (!file.startsWith('apps/api/src/') || !file.endsWith('.ts') || excluded(file)) continue;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (ast.parseDiagnostics.length) throw new Error('BACKGROUND_FLOOR_SOURCE_PARSE_REQUIRED');
    const types = new Set(), receivers = new Set(); let capability = false;
    for (const node of ast.statements) if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text.replace(/\.(?:js|ts)$/, '');
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const spec of named.elements) {
        if ((spec.propertyName || spec.name).text === 'BackgroundTaskService') { capability = true; types.add(spec.name.text); }
      }
      if (module.endsWith('/background-task.service')) {
        capability = true;
        if (node.importClause?.name) types.add(node.importClause.name.text);
        if (named && ts.isNamespaceImport(named)) types.add(named.name.text + '.BackgroundTaskService');
      }
    }
    if (file === IOT) { capability = true; types.add('BackgroundTaskService'); }
    const registrations = [];
    function visit(node) {
      if ((ts.isParameter(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) && node.type && ts.isIdentifier(node.name)
        && ts.isTypeReferenceNode(node.type) && types.has(node.type.typeName.getText(ast))) {
        capability = true; receivers.add(node.name.text); receivers.add('this.' + node.name.text);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
        && ts.isPropertyAccessExpression(node.initializer.expression) && node.initializer.expression.name.text === 'get'
        && node.initializer.arguments.some(arg => types.has(arg.getText(ast)))) receivers.add(node.name.text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    function calls(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['run', 'spawn', 'runScheduled'].includes(node.expression.name.text)
        && receivers.has(node.expression.expression.getText(ast))) registrations.push({ method: node.expression.name.text, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
      ts.forEachChild(node, calls);
    }
    calls(ast);
    // Imports and typed capability consumers are pinned even when aliases or
    // indirect calls prevent a precise method count. Never equate zero direct
    // calls with absence of capability. This is intentionally conservative.
    if (capability) consumers.push({ file, pinned: pins.has(file), registrations, ...(file === IOT ? { sourceScope: 'LINE_25_ONWARD_LEGACY_HEADER_EXCLUDED' } : {}) });
  }
  return { consumers, missing: consumers.filter(c => !c.pinned).map(c => c.file) };
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() && entry.name.endsWith('.ts') ? [file] : [];
  });
}
export function checkRepositoryBackgroundFloor() {
  const sources = Object.fromEntries(files(path.join(root, 'apps/api/src')).map(file => path.relative(root, file).split(path.sep).join('/'))
    .filter(file => !excluded(file)).map(file => [file, source(file)]));
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ops/production-config-contract.json'), 'utf8'));
  return inspectBackgroundFloor(sources, contract.criticalFiles);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = checkRepositoryBackgroundFloor();
    console.log(JSON.stringify({ ...result, result: result.missing.length ? 'FAIL' : 'PASS', scope: 'DIRECT_TYPED_TASK_SERVICE_CAPABILITY_CONSUMERS_ONLY' }));
    if (result.missing.length) process.exitCode = 1;
  } catch { console.error('BACKGROUND_FLOOR_COVERAGE_UNVERIFIED'); process.exitCode = 1; }
}
