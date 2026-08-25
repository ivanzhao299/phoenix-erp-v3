#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;
const controllerPath = 'apps/api/src/modules/generic-crud/generic-crud.controller.ts';
const controller = readFileSync(new URL(`../../${controllerPath}`, import.meta.url), 'utf8');
const required = [
  "private assertNoHouseOwnershipWrite(table: string, body: any)",
  "this.assertNoHouseOwnershipWrite(table, body);",
  "this.assertNoHouseOwnershipWrite(table, safeBody);",
  "table !== 'brd_houses' && !body.store_code",
];

const failures = [];
for (const needle of required) {
  if (!controller.includes(needle)) failures.push(`${controllerPath}: missing contract: ${needle}`);
}

const files = execFileSync('rg', ['--files', 'apps/api/src', '-g', '*.ts'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter((file) => file && !file.endsWith('.spec.ts'));
const allowedProjectionWriters = new Set([
  'apps/api/src/modules/farm/farm-feed.service.ts',
  'apps/api/src/modules/chanjet/chanjet-erp-master-business-review.service.ts',
]);
const writeSql = /(?:INSERT\s+INTO\s+brd_houses|UPDATE\s+brd_houses\s+SET)[\s\S]{0,1200}?\b(?:company_code|site_code|store_code)\b/gi;

for (const file of files) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  if (!writeSql.test(source)) continue;
  writeSql.lastIndex = 0;
  if (!allowedProjectionWriters.has(file)) failures.push(`${file}: unauthorized brd_houses ownership write`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PASS: brd_houses ownership snapshots have guarded generic CRUD and only approved projection writers.');
