#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const files = {
  sidebar: 'apps/web/src/components/layout/Sidebar.tsx',
  adminLayout: 'apps/web/src/app/(admin)/layout.tsx',
  home: 'apps/web/src/app/(admin)/home/page.tsx',
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')]),
);

const checks = [
  {
    name: 'sidebar exports shared visible menu resolver',
    pass: /export function getVisibleMenu/.test(content.sidebar)
      && /export function getFirstAccessiblePath/.test(content.sidebar)
      && /export function canAccessPath/.test(content.sidebar),
  },
  {
    name: 'admin layout redirects known menu routes without permission',
    pass: /canAccessPath\(pathname,\s*hasPermission\)/.test(content.adminLayout)
      && /getFirstAccessiblePath\(hasPermission\)/.test(content.adminLayout)
      && /router\.replace\(fallback\)/.test(content.adminLayout),
  },
  {
    name: 'home shortcuts resolve through shared menu permissions',
    pass: /getFirstAccessiblePath/.test(content.home)
      && /groupId:\s*'procurement'/.test(content.home)
      && /groupId:\s*'approval'/.test(content.home)
      && /const href = s\.groupId \?/.test(content.home),
  },
  {
    name: 'home workflow shortcut does not point to workflow root',
    pass: !/label:\s*'审批工作台'[\s\S]*?href:\s*'\/workflow'[\s,}]/.test(content.home),
  },
];

let failed = 0;
for (const check of checks) {
  const mark = check.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}: ${check.name}`);
  if (!check.pass) failed += 1;
}

if (failed) {
  console.error(`Result: FAIL. ${failed} frontend menu gate check(s) failed.`);
  process.exit(1);
}

console.log('Result: PASS. Frontend menu gates are aligned.');
