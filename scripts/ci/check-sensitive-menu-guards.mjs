#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'apps/api/src';
const sensitivePathOrText = [
  /permission/i,
  /role/i,
  /user/i,
  /notification/i,
  /presence/i,
  /chanjet/i,
  /upload/i,
  /file/i,
  /attachment/i,
  /document-intelligence/i,
  /workflow/i,
  /approval/i,
  /finance/i,
  /cash/i,
  /bank/i,
  /procurement/i,
  /purchase/i,
  /inventory/i,
  /wms/i,
];

const documentedLoginOnly = new Set([
  'apps/api/src/auth/auth.controller.ts',
  'apps/api/src/health.controller.ts',
  'apps/api/src/modules/product-master/controllers/lookup.controller.ts',
  'apps/api/src/modules/procurement-v2/procurement-v2.controller.ts',
]);

const controllerFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && path.endsWith('.controller.ts')) controllerFiles.push(path);
  }
}

walk(root);

const findings = [];
for (const file of controllerFiles.sort()) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('@Controller')) continue;
  if (documentedLoginOnly.has(file)) continue;
  const sensitive = sensitivePathOrText.some((pattern) => pattern.test(file) || pattern.test(text));
  if (!sensitive) continue;
  const hasMenuGuard = text.includes('MenuGuard');
  const hasRequireMenu = text.includes('@RequireMenu');
  if (!hasMenuGuard || !hasRequireMenu) {
    findings.push({
      file,
      hasMenuGuard,
      hasRequireMenu,
    });
  }
}

console.log(`Sensitive controller files inspected: ${controllerFiles.length}`);
console.log(`Documented login-only exceptions: ${documentedLoginOnly.size}`);
console.log(`Sensitive menu guard findings: ${findings.length}`);

if (findings.length > 0) {
  for (const finding of findings) {
    console.log(
      `WARN ${finding.file} menuGuard=${finding.hasMenuGuard} requireMenu=${finding.hasRequireMenu}`,
    );
  }
  console.log('Result: WARN. Findings are backlog candidates until this check is promoted to fail mode.');
} else {
  console.log('Result: PASS. No sensitive controller menu guard findings.');
}
