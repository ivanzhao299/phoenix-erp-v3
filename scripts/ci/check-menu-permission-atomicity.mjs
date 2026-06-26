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
      add(file, lineNo, 'Procurement V2 controllers must prefer atomic MENU_PRC2_* guards and must not directly require MENU_PRC2_MASTER.', line);
    }

    if (
      /apps\/api\/src\/modules\/procurement-v2\/controllers\/(requests|suppliers|projects)\.controller\.ts$/.test(file) &&
      /MENU_PRC2_MASTER|LEGACY_MASTER_MENU/.test(line)
    ) {
      add(file, lineNo, 'Procurement request/supplier/project endpoints must not fall back to coarse MENU_PRC2_MASTER.', line);
    }

    if (
      /apps\/api\/src\/modules\/(workflow|approval-engine|notification)\/.+\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_WORKFLOW['"]/.test(line)
    ) {
      add(file, lineNo, 'Workflow and approval controllers must prefer atomic MENU_WORKFLOW_* guards with MENU_WORKFLOW only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/(workflow|approval-engine|notification)\/.+\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_WORKFLOW['"]/.test(line)
    ) {
      add(file, lineNo, 'Workflow, approval, and notification controllers must not use coarse MENU_WORKFLOW as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/procurement-v2\/controllers\/dashboard\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_PRC2['"]/.test(line)
    ) {
      add(file, lineNo, 'Procurement dashboard widgets must not use coarse MENU_PRC2 as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/finance-v2\/controllers\/finance-v2\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_FIN2['"]/.test(line)
    ) {
      add(file, lineNo, 'Finance dashboard must not use coarse MENU_FIN2 as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/upload\/upload\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"](MENU_WORKFLOW|MENU_PRC2_MASTER)['"]/.test(line)
    ) {
      add(file, lineNo, 'Upload endpoints must use leaf module permissions and must not fall back to MENU_WORKFLOW or MENU_PRC2_MASTER.', line);
    }

    if (
      /apps\/api\/src\/modules\/document-intelligence\/document-intelligence\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_PRC2_MASTER['"]/.test(line)
    ) {
      add(file, lineNo, 'Document intelligence extraction must use leaf procurement/material/finance permissions and must not fall back to MENU_PRC2_MASTER.', line);
    }

    if (
      /apps\/api\/src\/modules\/approval-engine\/approval-rules\.service\.ts$/.test(file) &&
      /['"]MENU_WORKFLOW['"]/.test(line)
    ) {
      add(file, lineNo, 'Approval rule audit logs must use MENU_WORKFLOW_RULES, not coarse MENU_WORKFLOW.', line);
    }

    if (
      /apps\/api\/src\/modules\/generic-crud\/generic-crud\.controller\.ts$/.test(file) &&
      /return\s+['"](MENU_FIN2|MENU_PRC2|MENU_MASTER|MENU_SALES2)['"]/.test(line)
    ) {
      add(file, lineNo, 'Generic CRUD table fallback must not return coarse parent permissions MENU_FIN2/MENU_PRC2/MENU_MASTER/MENU_SALES2.', line);
    }

    if (
      /apps\/api\/src\/modules\/bff\/bff\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SALES2['"]/.test(line)
    ) {
      add(file, lineNo, 'Sales BFF APIs must use atomic MENU_SALES2_* permissions instead of coarse MENU_SALES2.', line);
    }

    if (
      file.endsWith('apps/web/src/app/(admin)/home/page.tsx') &&
      /perm:\s*['"]MENU_SALES2['"]/.test(line)
    ) {
      add(file, lineNo, 'Home sales shortcut/card must use MENU_SALES2_DASHBOARD with atomic sales altPerms, not coarse MENU_SALES2.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /id:\s*["']s2-overview["']/.test(line) &&
      /perm:\s*["']MENU_SALES2["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar sales overview must use MENU_SALES2_DASHBOARD with atomic sales altPerms, not coarse MENU_SALES2.', line);
    }

    if (
      file.endsWith('apps/web/src/app/(mobile)/mobile/dashboard/page.tsx') &&
      /hasPermission\(['"]MENU_SALES2['"]/.test(line)
    ) {
      add(file, lineNo, 'Mobile dashboard sales visibility must use atomic MENU_SALES2_* permissions, not coarse MENU_SALES2.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /id:\s*["']mdc-overview["']/.test(line) &&
      /perm:\s*["']MENU_MASTER_DATA["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar master-data overview must use MENU_MD_CENTER with MENU_MASTER_DATA only as superPerm fallback.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /id:\s*["']mdc-pending["']/.test(line) &&
      /perm:\s*["']MENU_MASTER_DATA["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar master-data pending must be visible through relevant atomic master-data permissions, not only coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-center\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Master-data center APIs must not use coarse MENU_MASTER_DATA as direct endpoint guard; use atomic center/quality/audit/per-type checks.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-runtime\.service\.ts$/.test(file) &&
      /dataScope\.resolve\([^)]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Master-data runtime DataScope must resolve with per-type MENU_MD_* context, not coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/api\/src\/modules\/product-master\/controllers\/lookup\.controller\.ts$/.test(file) &&
      /dataScope\.resolve\([^)]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Business lookup DataScope must resolve with atomic lookup context menus, not coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-center\.controller\.ts$/.test(file) &&
      /this\.ops\.(getCenters|search|getOperationsTodo)\((?![^)]*allowedOperationTypes\(req\))/.test(line)
    ) {
      add(file, lineNo, 'Master-data operations aggregate APIs must pass allowedOperationTypes(req) so cross-type summaries/search results stay atomically scoped.', line);
    }

    if (
      /apps\/api\/src\/modules\/approval-engine\/workflow-biz-registry\.service\.ts$/.test(file) &&
      /moduleCode:\s*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Workflow biz registry must map master-data biz types to atomic MENU_MD_* module codes, not coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/api\/src\/modules\/chanjet\/chanjet-callback\.controller\.ts$/.test(file) &&
      /@(Get|Post)\(['"](?:call|test-api)['"]\)/.test(line)
    ) {
      const nearby = lines.slice(index, Math.min(lines.length, index + 5)).join('\n');
      if (!/RequireMenu\(CHANJET_PROXY_MENU,\s*['"]E['"]\)/.test(nearby)) {
        add(file, lineNo, 'Chanjet manual external API proxy/test endpoints must use MENU_FIN2_AR_LEDGER:E via CHANJET_PROXY_MENU.', line);
      }
    }

    if (
      /apps\/api\/src\/modules\/chanjet\/chanjet-callback\.controller\.ts$/.test(file) &&
      /module_code|CHANJET_CALL_PROXY|MENU_SYS_CONFIG/.test(line)
    ) {
      const nearby = lines.slice(Math.max(0, index - 8), Math.min(lines.length, index + 8)).join('\n');
      if (/writeChanjetAudit/.test(nearby) && /MENU_SYS_CONFIG/.test(nearby)) {
        add(file, lineNo, 'Chanjet proxy audit logs must use CHANJET_PROXY_MENU, not MENU_SYS_CONFIG.', line);
      }
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
      /apps\/api\/src\/modules\/bff\/bff\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SETTINGS_IT['"]/.test(line)
    ) {
      add(file, lineNo, 'User management BFF APIs must use MENU_SETTINGS_USER with MENU_SETTINGS_IT only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/notification\/notification-config\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_CONFIG['"]/.test(line)
    ) {
      add(file, lineNo, 'Notification config APIs must use MENU_SETTINGS_NOTIFY with MENU_SYS_CONFIG only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/system-monitor\/controllers\/sys-configs\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_CONFIG['"]/.test(line)
    ) {
      add(file, lineNo, 'System config APIs must use MENU_SETTINGS_CONFIG, not coarse MENU_SYS_CONFIG.', line);
    }

    if (
      /apps\/api\/src\/modules\/product-master\/controllers\/menu-admin\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_CONFIG['"]/.test(line)
    ) {
      add(file, lineNo, 'Menu registry admin APIs must use MENU_SETTINGS_MENU_REGISTRY, not coarse MENU_SYS_CONFIG.', line);
    }

    if (
      /apps\/api\/src\/modules\/chanjet\/chanjet-callback\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_CONFIG['"]/.test(line)
    ) {
      add(file, lineNo, 'Chanjet configuration and diagnostics endpoints must use MENU_SETTINGS_CHANJET, not coarse MENU_SYS_CONFIG.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /perm:\s*["']MENU_SYS_CONFIG["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar entries must use atomic settings permissions instead of coarse MENU_SYS_CONFIG.', line);
    }

    if (
      /apps\/api\/src\/modules\/master\/master\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SETTINGS_IT['"]/.test(line)
    ) {
      add(file, lineNo, 'Brand settings update must use MENU_SETTINGS_BRAND with MENU_SETTINGS_IT only as altMenus fallback.', line);
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

    if (
      file.endsWith('apps/web/src/app/(mobile)/mobile/dashboard/page.tsx') &&
      /const\s+showAlerts\s*=/.test(line) &&
      !/MENU_DEVICE_MONITOR/.test(line)
    ) {
      add(file, lineNo, 'Mobile dashboard device alerts must be gated by MENU_DEVICE_MONITOR, not broad farm or legacy IoT permissions.', line);
    }
  });

    if (
      /apps\/api\/src\/modules\/iot\/(farm-cabin|farm-device|iot-v3|mon-device)\.controller\.ts$/.test(file)
  ) {
    if (!/MenuGuard/.test(text)) {
      add(file, 1, 'IoT device controllers must use MenuGuard, not login-only AuthGuard access.', lines[0] || file);
    }
    if (!/RequireMenu\(\s*DEVICE_MENU/.test(text) || !/MENU_DEVICE_MONITOR/.test(text)) {
      add(file, 1, 'IoT device controllers must be gated by atomic MENU_DEVICE_MONITOR permissions.', lines[0] || file);
    }
    if (/@UseGuards\(\s*AuthGuard\(['"]jwt['"]\)\s*\)/.test(text)) {
      add(file, 1, 'IoT device controllers must not regress to AuthGuard-only route guards.', lines[0] || file);
    }
  }

  if (
    /apps\/api\/src\/modules\/org\/org\.controller\.ts$/.test(file) &&
    /@RequireMenu\(\s*['"]MENU_SYS_ORG['"]/.test(text)
  ) {
    add(file, 1, 'Org management APIs must use MENU_MD_ORG/MENU_MD_COMPANY/MENU_SETTINGS_DATA_SCOPE as primary permissions, not coarse MENU_SYS_ORG.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/modules\/business-unit\/business-unit\.controller\.ts$/.test(file) &&
    /@RequireMenu\(\s*['"]MENU_SYS_ORG['"]/.test(text)
  ) {
    add(file, 1, 'Business-unit APIs must use MENU_MD_BUSINESS_UNIT as primary permission, not coarse MENU_SYS_ORG.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/modules\/permissions\/permissions\.module\.ts$/.test(file) &&
    /PermissionSetsController/.test(text)
  ) {
    add(file, 1, 'Permission-set routes must be registered only by PermissionSetsModule to avoid duplicate /api/permission-sets controllers.', lines[0] || file);
  }

  if (file.endsWith('apps/web/src/components/layout/Sidebar.tsx')) {
    const coarseOrgRoutes = [
      /path:\s*["']\/master-data\/organizations["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/master-data\/business-units["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/master-data\/companies["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/settings\/data-scopes["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
    ];
    if (coarseOrgRoutes.some((pattern) => pattern.test(text))) {
      add(file, 1, 'Sidebar org/company/business-unit/data-scope entries must use atomic permissions, not MENU_SYS_ORG.', lines[0] || file);
    }
  }

  if (
    file.endsWith('apps/web/src/app/(admin)/master-data/companies/page.tsx') &&
    /usePermission\(["']MENU_SYS_ORG["']\)/.test(text)
  ) {
    add(file, 1, 'Company master-data page must use MENU_MD_COMPANY, not MENU_SYS_ORG.', lines[0] || file);
  }

  if (
    file.endsWith('apps/web/src/app/(admin)/settings/data-scopes/page.tsx') &&
    /usePermission\(["']MENU_SYS_ORG["']\)/.test(text)
  ) {
    add(file, 1, 'Data-scope settings page must use MENU_SETTINGS_DATA_SCOPE, not MENU_SYS_ORG.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/common\/guards\/master-data-type\.guard\.ts$/.test(file) &&
    /TYPE_TO_ALT_MENUS[\s\S]*MENU_SYS_ORG/.test(text)
  ) {
    add(file, 1, 'MasterDataTypeGuard must not allow coarse MENU_SYS_ORG as per-type fallback; use MENU_MD_ORG/MENU_MD_COMPANY or legacy read-only org aliases only.', lines[0] || file);
  }
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
