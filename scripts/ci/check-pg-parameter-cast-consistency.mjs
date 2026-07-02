#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const roots = [
  'apps/api/src/modules/workflow',
  'apps/api/src/modules/uat',
];

function listFiles(root) {
  try {
    return execFileSync('rg', ['--files', root], { encoding: 'utf8' })
      .split('\n')
      .filter((file) => file.endsWith('.ts'));
  } catch {
    return [];
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const files = roots.flatMap(listFiles);
const findings = [];
const templateRe = /`([\s\S]*?)`/g;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = templateRe.exec(source))) {
    const sql = match[1];
    if (!/\$\d+/.test(sql) || !/\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) continue;

    const casted = new Set([...sql.matchAll(/\$(\d+)::[a-zA-Z_][a-zA-Z0-9_\[\]]*/g)].map((item) => item[1]));
    for (const paramNo of casted) {
      const bareUse = new RegExp(`\\$${paramNo}(?!::)`);
      if (bareUse.test(sql)) {
        findings.push({
          file,
          line: lineOf(source, match.index),
          param: `$${paramNo}`,
          sql: sql.replace(/\s+/g, ' ').trim().slice(0, 240),
        });
      }
    }
  }
}

if (findings.length) {
  console.error('Result: FAIL. PG parameter cast consistency findings:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.param} is casted and also reused bare`);
    console.error(`  ${finding.sql}`);
  }
  process.exit(1);
}

console.log(`Result: PASS. PG parameter casts are consistent in ${files.length} workflow/UAT files.`);
