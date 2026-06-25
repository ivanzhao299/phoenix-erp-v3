#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function trackedFiles() {
  return execFileSync('git', ['ls-files', 'apps/web/src', 'apps/api/src/modules'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => /\.(tsx?|jsx?)$/.test(file));
}

const findings = [];

function add(file, lineNo, message, line) {
  findings.push({ file, lineNo, message, line: line.trim() });
}

for (const file of trackedFiles()) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNo = index + 1;

    if (
      file.endsWith('apps/web/src/app/(admin)/daily-work/page.tsx') &&
      /perm:\s*['"]MENU_FIN2_CASH['"]/.test(line) &&
      /permOp:\s*['"]C['"]/.test(line)
    ) {
      add(file, lineNo, 'Daily-work cash create shortcuts must use MENU_FIN2_CASH_TXN:C, not coarse MENU_FIN2_CASH:C.', line);
    }

    if (
      /@RequireMenu\([^,]+,\s*['"]{2}/.test(line)
    ) {
      add(file, lineNo, 'RequireMenu action bit must not be empty. Use V/C/E/D/A/X explicitly.', line);
    }

    if (
      /apps\/api\/src\/modules\/procurement-v2\/controllers\/.+\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_PRC2_MASTER['"]/.test(line)
    ) {
      add(file, lineNo, 'Procurement V2 controllers must prefer atomic MENU_PRC2_* guards with MENU_PRC2_MASTER only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/(workflow|approval-engine|notification)\/.+\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_WORKFLOW['"]/.test(line)
    ) {
      add(file, lineNo, 'Workflow and approval controllers must prefer atomic MENU_WORKFLOW_* guards with MENU_WORKFLOW only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/permissions\/permissions\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SETTINGS_IT['"]/.test(line)
    ) {
      add(file, lineNo, 'Role permission APIs must use MENU_SETTINGS_ROLE with MENU_SETTINGS_IT only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/(?:permissions|permission-sets)\/permission-sets\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SETTINGS_IT['"]/.test(line)
    ) {
      add(file, lineNo, 'Permission-set APIs must use MENU_SETTINGS_PERMISSION_SET with MENU_SETTINGS_IT only as altMenus fallback.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /path:\s*["']\/settings\/roles["']/.test(line) &&
      /perm:\s*["']MENU_SETTINGS_IT["']/.test(line)
    ) {
      add(file, lineNo, 'Settings roles menu must be gated by MENU_SETTINGS_ROLE, not coarse MENU_SETTINGS_IT.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /path:\s*["']\/settings\/permission-sets["']/.test(line) &&
      /perm:\s*["']MENU_SETTINGS_IT["']/.test(line)
    ) {
      add(file, lineNo, 'Settings permission-sets menu must be gated by MENU_SETTINGS_PERMISSION_SET, not coarse MENU_SETTINGS_IT.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /href="\/terminal\/packaging\/dashboard"/.test(line)
    ) {
      const nearby = lines.slice(Math.max(0, index - 12), Math.min(lines.length, index + 8)).join('\n');
      if (!/MENU_PKG_OP/.test(nearby) || !/MENU_PKG_MGR/.test(nearby)) {
        add(file, lineNo, 'Packaging terminal shortcut must be gated by MENU_PKG_OP or MENU_PKG_MGR.', line);
      }
    }
  });
}

console.log(`check-menu-permission-atomicity: inspected ${trackedFiles().length} frontend/backend source file(s)`);
console.log(`Menu permission atomicity findings: ${findings.length}`);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`FAIL ${finding.file}:${finding.lineNo} ${finding.message}`);
    console.error(`  ${finding.line}`);
  }
  process.exit(1);
}

console.log('Result: PASS. No known coarse menu permission regression found.');
