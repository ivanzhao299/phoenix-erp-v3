#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const controllerPath = 'apps/api/src/modules/generic-crud/generic-crud.controller.ts';
const controller = readFileSync(new URL(`../../${controllerPath}`, import.meta.url), 'utf8');
const required = [
  "private assertNoHouseOwnershipWrite(table: string, body: any)",
  "this.assertNoHouseOwnershipWrite(table, body);",
  "this.assertNoHouseOwnershipWrite(table, safeBody);",
  "table !== 'brd_houses' && !body.store_code",
];
const servicePath = 'apps/api/src/modules/generic-crud/generic-crud.service.ts';
const service = readFileSync(new URL(`../../${servicePath}`, import.meta.url), 'utf8');
const serviceRequired = [
  "brd_houses: new Set(['company_code', 'site_code', 'store_code'])",
  'this.assertColumnsAllowed(table, fields);',
  'this.assertColumnsAllowed(table, [key]);',
];

const failures = [];
for (const needle of required) {
  if (!controller.includes(needle)) failures.push(`${controllerPath}: missing contract: ${needle}`);
}
for (const needle of serviceRequired) {
  if (!service.includes(needle)) failures.push(`${servicePath}: missing retired-column contract: ${needle}`);
}

// The online DDL recovery method is retired; field/key guards remain mandatory.
if (/\bensureColumn\s*\(/.test(service) || /\bALTER\s+TABLE\b/i.test(service)) {
  failures.push(`${servicePath}: implicit schema repair must remain disabled`);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(relative(root, path));
  }
  return files;
}
const files = walk(join(root, 'apps/api/src/modules'));
const insertSql = /INSERT\s+INTO\s+brd_houses\s*\(([^)]*)\)/gi;
const updateSql = /UPDATE\s+brd_houses\s+SET([\s\S]*?)(?:\bWHERE\b|;|`)/gi;
const retiredColumn = /\b(?:company_code|site_code|store_code)\b/i;

for (const file of files) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const clauses = [
    ...Array.from(source.matchAll(insertSql), (match) => match[1]),
    ...Array.from(source.matchAll(updateSql), (match) => match[1]),
  ];
  if (clauses.some((clause) => retiredColumn.test(clause))) {
    failures.push(`${file}: retired brd_houses ownership column write`);
  }

  for (const literal of source.matchAll(/`([\s\S]*?)`/g)) {
    const sql = literal[1];
    if (!/\bbrd_houses\b/i.test(sql)) continue;
    const aliases = [];
    for (const match of sql.matchAll(/\b(?:FROM|JOIN|UPDATE)\s+"?brd_houses"?(?:\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi)) {
      const alias = match[1];
      if (alias && !['WHERE', 'SET', 'JOIN', 'ON', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'LIMIT'].includes(alias.toUpperCase())) {
        aliases.push(alias);
      }
    }
    const qualifiedRead = aliases.some((alias) =>
      new RegExp(`\\b${alias}\\.(?:company_code|site_code|store_code)\\b`, 'i').test(sql),
    );
    const unaliasedTarget = aliases.length === 0
      && /\b(?:FROM|UPDATE)\s+"?brd_houses"?\b/i.test(sql)
      && /\b(?:company_code|site_code|store_code)\b/i.test(sql);
    if (qualifiedRead || unaliasedTarget) {
      const line = source.slice(0, literal.index ?? 0).split('\n').length;
      failures.push(`${file}:${line}: retired brd_houses ownership column read/write`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PASS: brd_houses retired ownership columns have no business reader or writer.');
