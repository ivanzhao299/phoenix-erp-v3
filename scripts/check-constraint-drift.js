#!/usr/bin/env node
/**
 * g201 — static constraint-drift gate (Node built-ins only, no database).
 *
 * It compares: (A) the constraint state obtained by replaying frozen SQL and TS
 * migrations, (B) CHECK/NOT NULL intent declared by the frozen SQL baselines,
 * and (C) values/nullability visible in TypeScript write paths and entities.
 *
 * Deliberate limits: this is a pragmatic scanner, not a SQL/TypeScript parser.
 * Runtime-built SQL, imported/spread DTO constants, generic CRUD, conditional
 * DO/EXECUTE blocks and complex CHECK predicates may be reported as skipped.
 * Only literal queryRunner.query strings are replayed; the one repository helper
 * pattern addAndValidate(table, constraint, values) is expanded explicitly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ALLOWLIST = path.join(REPO, '.github', 'constraint-drift-allowlist.txt');
const BASELINE_DIRS = [path.join(REPO, 'migrations'), path.join(REPO, 'apps/api/migrations')];
const TS_MIGRATIONS = path.join(REPO, 'apps/api/src/database/migrations');
const API_SRC = path.join(REPO, 'apps/api/src');

function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
}

function stripIdent(value) {
  return value.trim().replace(/^['"`]|['"`]$/g, '').toLowerCase();
}

function splitTopLevel(text, delimiter = ',') {
  const parts = [];
  let start = 0, depth = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i + 1] === quote) i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === delimiter && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function matchingParen(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i + 1] === quote) i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

function emptyModel() {
  return { tables: new Map(), baselineChecks: new Map(), stats: { sqlFiles: 0, tsFiles: 0, statements: 0, dynamic: 0 } };
}

function table(model, name) {
  const key = stripIdent(name);
  if (!model.tables.has(key)) model.tables.set(key, { columns: new Map(), checks: new Map() });
  return model.tables.get(key);
}

function column(model, tableName, columnName) {
  const t = table(model, tableName), key = stripIdent(columnName);
  if (!t.columns.has(key)) t.columns.set(key, { notNull: false, hasDefault: false });
  return t.columns.get(key);
}

function checkColumn(expression) {
  const match = expression.match(/(?:^|[\s(])"?([a-zA-Z_]\w*)"?\s+(?:IS\s+NULL\s+OR\s+)?(?:NOT\s+)?IN\s*\(/i)
    || expression.match(/(?:^|[\s(])"?([a-zA-Z_]\w*)"?\s*=\s*ANY\s*\(/i)
    || expression.match(/(?:^|[\s(])"?([a-zA-Z_]\w*)"?\s*(?:=|<>|>=|<=|>|<)/i);
  return match ? stripIdent(match[1]) : null;
}

function enumValues(expression) {
  const match = expression.match(/(?:IS\s+NULL\s+OR\s+)?"?[a-zA-Z_]\w*"?\s+IN\s*\(([^()]*)\)/i);
  if (!match) return null;
  const values = [...match[1].matchAll(/'((?:''|[^'])*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  return values.length ? new Set(values) : null;
}

function addCheck(model, tableName, name, expression, baselineIntent) {
  const tName = stripIdent(tableName), cName = stripIdent(name || `anon_${table(model, tName).checks.size}`);
  const info = { name: cName, expression: expression.trim(), column: checkColumn(expression), values: enumValues(expression) };
  table(model, tName).checks.set(cName, info);
  if (baselineIntent && info.column) model.baselineChecks.set(`${tName}.${info.column}`, { table: tName, column: info.column });
}

function parseCreateTables(sql, model, baselineIntent) {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"\.)?"?[a-zA-Z_]\w*"?)\s*\(/ig;
  let match;
  while ((match = re.exec(sql))) {
    const open = re.lastIndex - 1, close = matchingParen(sql, open);
    if (close < 0) continue;
    const tableName = stripIdent(match[1].split('.').pop());
    const t = table(model, tableName);
    for (const item of splitTopLevel(sql.slice(open + 1, close))) {
      const constraint = item.match(/^CONSTRAINT\s+"?([^"\s]+)"?\s+CHECK\s*\((.*)\)$/is);
      const anonymous = item.match(/^CHECK\s*\((.*)\)$/is);
      if (constraint || anonymous) {
        addCheck(model, tableName, constraint && constraint[1], (constraint || anonymous)[constraint ? 2 : 1], baselineIntent);
        continue;
      }
      if (/^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|EXCLUDE)\b/i.test(item)) continue;
      const col = item.match(/^"?([a-zA-Z_]\w*)"?\s+([\s\S]+)$/);
      if (!col) continue;
      const state = column(model, tableName, col[1]);
      state.notNull = /\bNOT\s+NULL\b/i.test(col[2]) || /\bPRIMARY\s+KEY\b/i.test(col[2]);
      state.hasDefault = /\bDEFAULT\b/i.test(col[2]);
      const inline = col[2].match(/\bCHECK\s*\((.*)\)/is);
      if (inline) addCheck(model, tableName, null, inline[1], baselineIntent);
    }
    re.lastIndex = close + 1;
  }
}

function parseSql(sql, model, baselineIntent = false) {
  const clean = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const eventRe = /(CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"\.)?"?[a-zA-Z_]\w*"?)\s*\()|(DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_]\w*)"?[^;]*;)|(ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_]\w*)"?\s+[\s\S]*?;)/ig;
  let event;
  while ((event = eventRe.exec(clean))) {
    if (event[1]) {
      const open = clean.indexOf('(', event.index), close = matchingParen(clean, open);
      if (close < 0) continue;
      const tableName = stripIdent(event[3].split('.').pop());
      if (!event[2] || !model.tables.has(tableName)) {
        if (!event[2]) model.tables.delete(tableName);
        parseCreateTables(clean.slice(event.index, close + 1), model, baselineIntent);
      }
      eventRe.lastIndex = close + 1;
      continue;
    }
    if (event[5]) { model.tables.delete(stripIdent(event[5])); continue; }
    const match = event[0].match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_]\w*)"?\s+([\s\S]*?);/i);
    if (!match) continue;
    {
    const tableName = stripIdent(match[1]);
    for (const action of splitTopLevel(match[2])) {
      let m = action.match(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_]\w*)"?\s+([\s\S]+)$/i);
      if (m && !/^CONSTRAINT$/i.test(m[1])) {
        const state = column(model, tableName, m[1]);
        state.notNull = /\bNOT\s+NULL\b/i.test(m[2]); state.hasDefault = /\bDEFAULT\b/i.test(m[2]);
        const inline = m[2].match(/\bCHECK\s*\((.*)\)/is);
        if (inline) addCheck(model, tableName, null, inline[1], baselineIntent);
        continue;
      }
      m = action.match(/^ALTER\s+(?:COLUMN\s+)?"?([a-zA-Z_]\w*)"?\s+(SET|DROP)\s+NOT\s+NULL/i);
      if (m) { column(model, tableName, m[1]).notNull = m[2].toUpperCase() === 'SET'; continue; }
      m = action.match(/^ALTER\s+(?:COLUMN\s+)?"?([a-zA-Z_]\w*)"?\s+(SET|DROP)\s+DEFAULT/i);
      if (m) { column(model, tableName, m[1]).hasDefault = m[2].toUpperCase() === 'SET'; continue; }
      m = action.match(/^ADD\s+CONSTRAINT\s+"?([^"\s]+)"?\s+CHECK\s*\((.*)\)(?:\s+NOT\s+VALID)?$/is);
      if (m) { addCheck(model, tableName, m[1], m[2], baselineIntent); continue; }
      m = action.match(/^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([^"\s;]+)"?/i);
      if (m) table(model, tableName).checks.delete(stripIdent(m[1]));
    }
    model.stats.statements++;
    }
  }
}

function upBody(text) {
  const start = text.search(/\b(?:public\s+)?async\s+up\s*\(/);
  if (start < 0) return '';
  const brace = text.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(brace + 1, i);
  }
  return '';
}

function extractTsSql(text, model) {
  const body = upBody(text);
  const re = /queryRunner\.query\(\s*(`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*[,)]/gs;
  for (const match of body.matchAll(re)) {
    const literal = match[1];
    if (literal.includes('${')) { model.stats.dynamic++; continue; }
    parseSql(literal.slice(1, -1).replace(/\\'/g, "'"), model, false);
  }
  // Repository helper used by g201's CHECK restoration migration.
  for (const match of body.matchAll(/addAndValidate\(\s*queryRunner\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*\[([\s\S]*?)\]\s*(?:,\s*(true|false))?\s*\)/g)) {
    const values = [...match[3].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    if (!values.length) continue;
    const expr = `${match[4] === 'true' ? 'source_type IS NULL OR ' : ''}source_type IN (${values.map((v) => `'${v}'`).join(',')})`;
    table(model, match[1]).checks.delete(stripIdent(match[2]));
    addCheck(model, match[1], match[2], expr, false);
  }
}

function buildMigrationModel() {
  const model = emptyModel();
  const baselineFiles = BASELINE_DIRS.flatMap((dir) => walk(dir, (f) => f.endsWith('.sql')))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)) || a.localeCompare(b));
  for (const file of baselineFiles) { parseSql(fs.readFileSync(file, 'utf8'), model, true); model.stats.sqlFiles++; }
  const tsFiles = walk(TS_MIGRATIONS, (f) => f.endsWith('.ts')).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  for (const file of tsFiles) { extractTsSql(fs.readFileSync(file, 'utf8'), model); model.stats.tsFiles++; }
  return model;
}

function splitValues(text) { return splitTopLevel(text); }

function literalOrNull(expression) {
  const value = expression.trim();
  if (/^(?:null|undefined)$/i.test(value) || /(?:\|\||\?\?)\s*null\b/.test(value) || /:\s*null\b/.test(value)) return { nullish: true };
  const literal = value.match(/^['"]([^'"]+)['"]$/);
  return literal ? { literal: literal[1] } : {};
}

function extractWrites(text, file) {
  const writes = [];
  const queryRe = /(?:queryRunner|manager|repository|repo|this\.[\w.]+|[a-zA-Z_]\w*)\.query\(\s*(`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*")\s*(?:,\s*\[([\s\S]*?)\])?\s*\)/gs;
  for (const q of text.matchAll(queryRe)) {
    const sql = q[1].slice(1, -1);
    if (sql.includes('${')) continue;
    const insert = sql.match(/INSERT\s+INTO\s+"?([a-zA-Z_]\w*)"?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is);
    if (!insert) continue;
    const columns = splitValues(insert[2]).map(stripIdent), values = splitValues(insert[3]);
    const params = q[2] ? splitValues(q[2]) : [];
    values.forEach((raw, index) => {
      const placeholder = raw.match(/^\$(\d+)(?:::[\w\[\]]+)?$/);
      const expr = placeholder ? params[Number(placeholder[1]) - 1] : raw;
      if (!expr || !columns[index]) return;
      const evidence = literalOrNull(expr);
      if (evidence.nullish || evidence.literal) writes.push({ table: stripIdent(insert[1]), column: columns[index], file, ...evidence });
    });
  }
  return writes;
}

function extractEntities(text, file) {
  const entity = text.match(/@Entity\(\s*(?:\{[^}]*name\s*:\s*)?['"]([^'"]+)['"]/s);
  if (!entity) return [];
  const rows = [];
  const re = /@Column\(\s*\{([\s\S]*?)\}\s*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*([a-zA-Z_]\w*)\s*[!?]?\s*:/g;
  for (const match of text.matchAll(re)) {
    const named = match[1].match(/\bname\s*:\s*['"]([^'"]+)['"]/);
    rows.push({ table: stripIdent(entity[1]), column: stripIdent(named ? named[1] : match[2]), nullable: /\bnullable\s*:\s*true\b/.test(match[1]), file });
  }
  return rows;
}

function extractDtoEnums(text, file) {
  const constants = new Map();
  for (const match of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*\[([\s\S]*?)\]\s+as\s+const/g)) {
    const values = [...match[2].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
    if (values.length) constants.set(match[1], values);
  }
  const rows = [];
  const re = /@IsIn\(\s*(\[[\s\S]*?\]|[A-Z][A-Z0-9_]*)\s*(?:,\s*\{[\s\S]*?\})?\)\s*(?:@\w+(?:\([^)]*\))?\s*)*([a-zA-Z_]\w*)\s*[!?]?\s*:/g;
  for (const match of text.matchAll(re)) {
    const values = match[1].startsWith('[')
      ? [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
      : constants.get(match[1]);
    if (!values?.length) continue;
    const col = match[2].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    rows.push({ column: col, values, file });
  }
  return rows;
}

function scanCode(root = API_SRC) {
  const writes = [], entities = [], dtoEnums = [];
  for (const file of walk(root, (f) => f.endsWith('.ts') && !f.includes(`${path.sep}database${path.sep}migrations${path.sep}`))) {
    const text = fs.readFileSync(file, 'utf8'), rel = path.relative(REPO, file);
    writes.push(...extractWrites(text, rel));
    if (file.endsWith('.entity.ts')) entities.push(...extractEntities(text, rel));
    if (file.includes(`${path.sep}dto${path.sep}`) || file.endsWith('.dto.ts')) dtoEnums.push(...extractDtoEnums(text, rel));
  }
  return { writes, entities, dtoEnums };
}

function detect(model, code) {
  const violations = [], warnings = [];
  for (const write of code.writes) {
    const t = model.tables.get(write.table), state = t && t.columns.get(write.column);
    if (write.nullish && state && state.notNull && !state.hasDefault) violations.push({ rule: 'R1', key: `${write.table}.${write.column}`, detail: `${write.file} writes null to NOT NULL without DEFAULT` });
    if (write.literal && t) {
      for (const check of t.checks.values()) if (check.column === write.column && check.values && !check.values.has(write.literal)) violations.push({ rule: 'R3', key: `${write.table}.${write.column}`, detail: `${write.file} writes '${write.literal}', CHECK allows [${[...check.values].join(', ')}]` });
    }
  }
  for (const dto of code.dtoEnums || []) {
    const dtoModule = dto.file.replace(/\/dto\/.*$/, '');
    const entityTables = new Set(code.entities
      .filter((entity) => entity.column === dto.column && entity.file.replace(/\/entities\/.*$/, '') === dtoModule)
      .map((entity) => entity.table));
    const candidates = [...entityTables].map((tableName) => ({
      tableName,
      checks: [...(model.tables.get(tableName)?.checks.values() || [])].filter((check) => check.column === dto.column && check.values),
    })).filter((candidate) => candidate.checks.length);
    // DTOs are mapped only to an entity in the same Nest module. Ambiguous or
    // entity-less DTOs stay unresolved instead of being guessed by column name.
    if (candidates.length !== 1) continue;
    for (const check of candidates[0].checks) for (const value of dto.values) {
      if (!check.values.has(value)) violations.push({ rule: 'R3', key: `${candidates[0].tableName}.${dto.column}`, detail: `${dto.file} @IsIn contains '${value}', CHECK allows [${[...check.values].join(', ')}]` });
    }
  }
  for (const intent of model.baselineChecks.values()) {
    const t = model.tables.get(intent.table);
    if (!t || ![...t.checks.values()].some((check) => check.column === intent.column)) violations.push({ rule: 'R2', key: `${intent.table}.${intent.column}`, detail: 'baseline CHECK missing from migration-chain end state' });
  }
  for (const entity of code.entities) {
    const state = model.tables.get(entity.table)?.columns.get(entity.column);
    if (state && entity.nullable === state.notNull) warnings.push({ rule: 'R4', key: `${entity.table}.${entity.column}`, detail: `${entity.file}: entity nullable=${entity.nullable}, migration NOT NULL=${state.notNull}` });
  }
  return { violations: uniqueFindings(violations), warnings: uniqueFindings(warnings) };
}

function uniqueFindings(items) {
  const seen = new Set();
  return items.filter((item) => { const id = `${item.rule}|${item.key}|${item.detail}`; if (seen.has(id)) return false; seen.add(id); return true; });
}

function loadAllowlist(file = ALLOWLIST) {
  if (!fs.existsSync(file)) return new Map();
  const entries = new Map();
  fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).forEach((line) => {
    const [rule, key, ...reason] = line.split('|');
    if (!/^R[123]$/.test(rule) || !/^\w+\.\w+$/.test(key) || !reason.join('|').trim()) throw new Error(`invalid allowlist entry: ${line}`);
    entries.set(`${rule}|${key}`, reason.join('|').trim());
  });
  return entries;
}

function evaluate(model, code, allow = new Map()) {
  const found = detect(model, code);
  return { ...found, blocked: found.violations.filter((v) => !allow.has(`${v.rule}|${v.key}`)), allowed: found.violations.filter((v) => allow.has(`${v.rule}|${v.key}`)) };
}

function fixture(sql, ts) {
  const model = emptyModel(); parseSql(sql, model, true);
  return evaluate(model, { writes: extractWrites(ts, 'fixture.ts'), entities: [], dtoEnums: [] });
}

function selfTest() {
  const cases = [
    ['R1 / P0-3 null write vs NOT NULL', fixture(`CREATE TABLE sys_user (store_code text NOT NULL);`, `db.query(\`INSERT INTO sys_user (store_code) VALUES ($1)\`, [dto.storeCode || null])`), 'R1', true],
    ['R2 / P0-4a dropped baseline CHECK', (() => { const m = emptyModel(); parseSql(`CREATE TABLE fin_ar_invoices (source_type text, CONSTRAINT chk_source CHECK (source_type IN ('MANUAL')));`, m, true); parseSql(`ALTER TABLE fin_ar_invoices DROP CONSTRAINT chk_source;`, m); return evaluate(m, { writes: [], entities: [] }); })(), 'R2', true],
    ['R3 / P0-4b code value outside CHECK', fixture(`CREATE TABLE fin_ar_invoices (source_type text, CHECK (source_type IN ('MANUAL')));`, `db.query(\`INSERT INTO fin_ar_invoices (source_type) VALUES ('STORE_SALE')\`)`), 'R3', true],
    ['clean fixture', fixture(`CREATE TABLE fin_ar_invoices (source_type text, CHECK (source_type IN ('MANUAL','STORE_SALE')));`, `db.query(\`INSERT INTO fin_ar_invoices (source_type) VALUES ('STORE_SALE')\`)`), null, false],
  ];
  let failed = false;
  console.log('g201 constraint-drift self-test');
  for (const [name, result, rule, shouldBlock] of cases) {
    const ok = shouldBlock ? result.blocked.some((v) => v.rule === rule) : result.blocked.length === 0;
    console.log(`${ok ? '✅' : '❌'} ${name}: ${shouldBlock ? `red (${rule})` : 'green'}`); failed ||= !ok;
  }
  console.log(failed ? '❌ self-test failed' : '✅ self-test: 3 red fixtures detected; clean fixture green');
  process.exitCode = failed ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const model = buildMigrationModel(), code = scanCode(), result = evaluate(model, code, loadAllowlist());
  for (const warning of result.warnings) console.warn(`⚠️  ${warning.rule}|${warning.key}|${warning.detail}`);
  for (const allowed of result.allowed) console.log(`↪ allowlisted ${allowed.rule}|${allowed.key}: ${allowed.detail}`);
  if (result.blocked.length) {
    console.error(`❌ check-constraint-drift: ${result.blocked.length} unallowlisted drift(s)`);
    for (const item of result.blocked) console.error(`  ${item.rule}|${item.key}|${item.detail}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ check-constraint-drift: 0 new drift(s); ${result.allowed.length} allowlisted; ${result.warnings.length} warning(s)`);
  }
  console.log(`scanned ${model.stats.sqlFiles} baseline SQL + ${model.stats.tsFiles} TS migrations; ${model.tables.size} tables; ${code.writes.length} literal/null writes; ${code.dtoEnums.length} DTO enums; ${code.entities.length} entity columns; ${model.stats.dynamic} dynamic migration SQL skipped`);
}

if (require.main === module) main();
module.exports = { emptyModel, parseSql, extractTsSql, extractWrites, extractEntities, extractDtoEnums, buildMigrationModel, detect, evaluate };
