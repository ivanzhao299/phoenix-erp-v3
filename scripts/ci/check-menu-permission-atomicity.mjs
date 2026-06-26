#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function trackedFiles() {
  return execFileSync('git', ['ls-files', 'apps/web/src', 'apps/api/src/modules', 'apps/api/src/common/guards'], { encoding: 'utf8' })
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
      file.endsWith('apps/web/src/app/(mobile)/mobile/dashboard/page.tsx') &&
      /hasPermission\(['"](MENU_QA|MENU_LOGISTICS)['"]/.test(line)
    ) {
      add(file, lineNo, 'Mobile dashboard quality/delivery visibility must use atomic MENU_QA_* and delivery permissions, not legacy MENU_QA or MENU_LOGISTICS.', line);
    }

    if (
      /apps\/api\/src\/modules\/quality\/quality\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_QA['"]/.test(line)
    ) {
      add(file, lineNo, 'Quality APIs must use atomic MENU_QA_OP/MENU_QA_MGR/MENU_QA_MASTER permissions, not legacy MENU_QA.', line);
    }

    if (
      /apps\/api\/src\/common\/guards\/menu-registry\.service\.ts$/.test(file) &&
      /FALLBACK_MENU_CODES/.test(text)
    ) {
      for (const requiredMenu of ['MENU_QA_MASTER', 'MENU_MOBILE_DELIVERY']) {
        if (!text.includes(`'${requiredMenu}'`)) {
          add(file, 1, `Menu registry fallback snapshot must include ${requiredMenu} so CI/test fallback stays aligned with atomic runtime permissions.`, lines[0] || file);
        }
      }
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /id:\s*["']mdc-overview["']/.test(line) &&
      /perm:\s*["']MENU_MASTER_DATA["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar master-data overview must use MENU_MD_CENTER, not coarse MENU_MASTER_DATA.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /id:\s*["']mdc-pending["']/.test(line) &&
      /perm:\s*["']MENU_MASTER_DATA["']/.test(line)
    ) {
      add(file, lineNo, 'Sidebar master-data pending must be visible through relevant atomic master-data permissions, not only coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/web\/src\/components\/master-data\/MasterDataRuntimePanel\.tsx$/.test(file) &&
      /usePermission\(["']MENU_MASTER_DATA["']\)/.test(line)
    ) {
      add(file, lineNo, 'MasterDataRuntimePanel create/edit gates must use per-type MENU_MD_* permissions, not coarse MENU_MASTER_DATA fallback.', line);
    }

    if (
      /apps\/web\/src\/app\/\(admin\)\/(data-quality|master-data\/(governance|operations|pending)|master-data\/(customers|suppliers)\/\[code\])\/page\.tsx$/.test(file) &&
      /usePermission\(["']MENU_MASTER_DATA["']\)/.test(line)
    ) {
      add(file, lineNo, 'Master-data pages must not use MENU_MASTER_DATA as page visibility fallback; use MENU_MD_CENTER, MENU_MD_QUALITY, or per-type MENU_MD_* permissions.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-center\.controller\.ts$/.test(file) &&
      /hasPerm\([^)]*MENU_MASTER_DATA/.test(line)
    ) {
      add(file, lineNo, 'Master-data center helper checks must not grant access through MENU_MASTER_DATA; require atomic MENU_MD_* permissions or ROLE_ADMIN.', line);
    }

    if (
      /apps\/api\/src\/common\/guards\/master-data-type\.guard\.ts$/.test(file) &&
      /(SUPER_MENU|MENU_MASTER_DATA|TYPE_TO_MENU\[type\]\s*\?\?|hasPerm\([^)]*MENU_MASTER_DATA)/.test(line) &&
      !/MasterDataTypeGuard|MENU_MD_<TYPE>|MENU_MD_MATERIAL/.test(line)
    ) {
      add(file, lineNo, 'MasterDataTypeGuard must not use MENU_MASTER_DATA or unknown-type fallback; require mapped MENU_MD_* permissions or ROLE_ADMIN.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-center\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Master-data center APIs must not use coarse MENU_MASTER_DATA as direct endpoint guard; use atomic center/quality/audit/per-type checks.', line);
    }

    if (
      /apps\/api\/src\/modules\/master-data\/master-data-center\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Master-data center aggregate APIs must not use coarse MENU_MASTER_DATA as altMenus fallback; use MENU_MD_CENTER or MENU_MD_QUALITY only.', line);
    }

    if (
      /apps\/api\/src\/modules\/data-quality\/data-quality\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*\[[^\]]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Data-quality APIs must not use coarse MENU_MASTER_DATA as altMenus fallback; use MENU_MD_QUALITY only.', line);
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
      /apps\/api\/src\/modules\/product-master\/controllers\/lookup\.controller\.ts$/.test(file) &&
      /@RequireMenu\([^)]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Product/master business lookup write helpers must not fall back to coarse MENU_MASTER_DATA.', line);
    }

  if (
    /apps\/api\/src\/modules\/master-data\/biz-projects\.controller\.ts$/.test(file) &&
    /@RequireMenu\([^)]*['"]MENU_MASTER_DATA['"]/.test(line)
    ) {
      add(file, lineNo, 'Biz project selector APIs must use MENU_PRC2_PROJECT with MENU_MD_PROJECT fallback, not coarse MENU_MASTER_DATA.', line);
    }

    if (
      /apps\/api\/src\/modules\/data-quality\/data-quality\.controller\.ts$/.test(file) &&
      /MENU_SYS_MONITOR|MENU_DATA_QUALITY/.test(line)
    ) {
      add(file, lineNo, 'Data-quality APIs must use MENU_MD_QUALITY with MENU_MASTER_DATA as super fallback; do not grant access through system monitor or unregistered legacy frontend code.', line);
    }

    if (
      /apps\/web\/src\/app\/\(admin\)\/(home|master-data|data-quality)\/page\.tsx$/.test(file) &&
      /MENU_DATA_QUALITY/.test(line)
    ) {
      add(file, lineNo, 'Frontend data-quality visibility must use registered MENU_MD_QUALITY, not unregistered MENU_DATA_QUALITY.', line);
    }

    if (
      /apps\/api\/src\/modules\/org\/services\/org\.service\.ts$/.test(file) &&
      /dataScopeService\.resolve\([^)]*['"]MENU_SYS_ORG['"]/.test(line)
    ) {
      add(file, lineNo, 'Org service DataScope context must use atomic MENU_MD_ORG, not coarse legacy MENU_SYS_ORG.', line);
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
      /apps\/api\/src\/modules\/chanjet\/chanjet-callback\.controller\.ts$/.test(file) &&
      /async\s+verifyCallback/.test(line)
    ) {
      const block = lines.slice(index, Math.min(lines.length, index + 32)).join('\n');
      if (/setCertificate\(|fetchCertificateByAuthCode\(|setAppTicket\(/.test(block)) {
        add(file, lineNo, 'Chanjet GET callback must be verification-only and must not consume certificate/authCode/appTicket; signed POST callback is required.', line);
      }
    }

    if (
      /apps\/api\/src\/modules\/chanjet\/chanjet-callback\.controller\.ts$/.test(file) &&
      /(tokenPreview|certPreview|ticketPreview)/.test(line)
    ) {
      add(file, lineNo, 'Chanjet manual config/test endpoints must not return token/certificate/ticket previews.', line);
    }

    if (
      /apps\/api\/src\/modules\/chanjet\/chanjet-auth\.service\.ts$/.test(file) &&
      /(appTicket 已更新:.*slice|certificate 已更新:.*slice|certificate\(authCode\) 响应: \$\{JSON\.stringify\(json\)|certificate 响应: \$\{JSON\.stringify\(json\)|generateToken 响应: \$\{JSON\.stringify\(json\)|triggerAppTicket 响应: \$\{JSON\.stringify\(json\)|certPreview)/.test(line)
    ) {
      add(file, lineNo, 'Chanjet auth service must mask sensitive token/certificate/ticket values in logs and diagnostics.', line);
    }

    if (
      /apps\/api\/src\/debug\.controller\.ts$/.test(file) &&
      /(SELECT\s+\*|samples\s*:|sys_user\s+ORDER|sys_approval_log\s+ORDER|biz_cash_flow\s+ORDER)/i.test(line)
    ) {
      add(file, lineNo, 'Production debug endpoints must not return raw user/finance/approval sample rows; expose aggregate counts only and keep production disabled.', line);
    }

    if (
      /apps\/api\/src\/debug\.controller\.ts$/.test(file) &&
      /async\s+getMigratedData/.test(line)
    ) {
      const block = lines.slice(index, Math.min(lines.length, index + 12)).join('\n');
      if (!/NODE_ENV\s*===\s*['"]production['"]/.test(block) || !/ForbiddenException/.test(block)) {
        add(file, lineNo, 'Debug migrated-data endpoint must fail closed in production before any data query.', line);
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
      /apps\/api\/src\/modules\/bff\/bff\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_MONITOR['"]/.test(line)
    ) {
      const nearby = lines.slice(Math.max(0, index - 14), Math.min(lines.length, index + 14)).join('\n');
      if (/class\s+AuditBffController|api\/audit|workbench|anti-fraud/.test(nearby)) {
        add(file, lineNo, 'Audit BFF APIs must use MENU_SETTINGS_AUDIT, not system monitor permissions.', line);
      }
    }

    if (
      /apps\/api\/src\/modules\/notification\/notification-config\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_CONFIG['"]/.test(line)
    ) {
      add(file, lineNo, 'Notification config APIs must use MENU_SETTINGS_NOTIFY with MENU_SYS_CONFIG only as altMenus fallback.', line);
    }

    if (
      /apps\/api\/src\/modules\/notification\/notification-config\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_MONITOR['"]/.test(line)
    ) {
      add(file, lineNo, 'Notification config/log APIs must use MENU_SETTINGS_NOTIFY, not MENU_SYS_MONITOR.', line);
    }

    if (
      /apps\/api\/src\/modules\/notification\/presence\.controller\.ts$/.test(file) &&
      /@RequireMenu\(\s*['"]MENU_SYS_MONITOR['"]/.test(line)
    ) {
      add(file, lineNo, 'Online user presence APIs must use MENU_SETTINGS_ONLINE_USER, not MENU_SYS_MONITOR.', line);
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
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /path:\s*["']\/settings\/audit-log["']/.test(line) &&
      /MENU_SYS_MONITOR/.test(line)
    ) {
      add(file, lineNo, 'Audit-log sidebar entry must not be visible through MENU_SYS_MONITOR; require MENU_SETTINGS_AUDIT.', line);
    }

    if (
      file.endsWith('apps/web/src/components/layout/Sidebar.tsx') &&
      /path:\s*["']\/settings\/online-users["']/.test(line) &&
      /MENU_SYS_MONITOR/.test(line)
    ) {
      add(file, lineNo, 'Online-users sidebar entry must not be visible through MENU_SYS_MONITOR; require MENU_SETTINGS_ONLINE_USER.', line);
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

    if (file.endsWith('apps/web/src/lib/mobile-roles.ts')) {
      if (/JWT permissions → 访问级别。菜单码约定：MOBILE_/.test(line)) {
        add(file, lineNo, 'Mobile runtime permissions must prefer MENU_* atomic menu codes; MOBILE_* may only remain as legacy compatibility.', line);
      }
    }
  });

  if (file.endsWith('apps/web/src/lib/mobile-roles.ts')) {
    const requiredFragments = [
      'PAGE_MENU_PERMS',
      'MENU_PRC2_REQUEST',
      'MENU_PRC2_ORDER',
      'MENU_WORKFLOW_TODO',
      'MENU_FIN2_EXPENSE',
      'MENU_MOBILE_DELIVERY',
      'if ((subject.permissions?.length ?? 0) > 0 && PAGE_MENU_PERMS[pageKey]) return',
    ];
    for (const fragment of requiredFragments) {
      if (!text.includes(fragment)) {
        add(file, 1, `Mobile page access must be backed by atomic MENU_* permissions; missing ${fragment}.`, lines[0] || file);
      }
    }
  }

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
    /apps\/api\/src\/modules\/org\/org\.controller\.ts$/.test(file) &&
    /MENU_SYS_ORG/.test(text)
  ) {
    add(file, 1, 'Org management APIs must not use legacy MENU_SYS_ORG fallback; use atomic org/company/data-scope permissions.', lines[0] || file);
  }
  if (
    /apps\/api\/src\/modules\/org\/organization\.controller\.ts$/.test(file) &&
    /MENU_SYS_ORG/.test(text)
  ) {
    add(file, 1, 'Organization runtime APIs must not use legacy MENU_SYS_ORG fallback; use MENU_MD_ORG and approved org runtime aliases only.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/modules\/business-unit\/business-unit\.controller\.ts$/.test(file) &&
    /@RequireMenu\(\s*['"]MENU_SYS_ORG['"]/.test(text)
  ) {
    add(file, 1, 'Business-unit APIs must use MENU_MD_BUSINESS_UNIT as primary permission, not coarse MENU_SYS_ORG.', lines[0] || file);
  }
  if (
    /apps\/api\/src\/modules\/business-unit\/business-unit\.controller\.ts$/.test(file) &&
    /MENU_SYS_ORG/.test(text)
  ) {
    add(file, 1, 'Business-unit APIs must not use legacy MENU_SYS_ORG fallback; use MENU_MD_BUSINESS_UNIT.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/modules\/permissions\/permissions\.module\.ts$/.test(file) &&
    /PermissionSetsController/.test(text)
  ) {
    add(file, 1, 'Permission-set routes must be registered only by PermissionSetsModule to avoid duplicate /api/permission-sets controllers.', lines[0] || file);
  }

  if (file.endsWith('apps/web/src/components/layout/Sidebar.tsx')) {
    if (/superPerm:\s*["']MENU_MASTER_DATA["']/.test(text)) {
      add(file, 1, 'Sidebar master-data child entries must not use MENU_MASTER_DATA superPerm fallback; grant explicit MENU_MD_* permissions instead.', lines[0] || file);
    }

    const coarseOrgRoutes = [
      /path:\s*["']\/master-data\/organizations["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/master-data\/business-units["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/master-data\/companies["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
      /path:\s*["']\/settings\/data-scopes["'][^\n]*perm:\s*["']MENU_SYS_ORG["']/,
    ];
    if (coarseOrgRoutes.some((pattern) => pattern.test(text))) {
      add(file, 1, 'Sidebar org/company/business-unit/data-scope entries must use atomic permissions, not MENU_SYS_ORG.', lines[0] || file);
    }

    const pendingRequiredMenus = [
      'MENU_MD_SUPPLIER',
      'MENU_MD_PROJECT',
      'MENU_MD_MATERIAL',
      'MENU_MD_PRODUCT',
      'MENU_MD_GRADE',
      'MENU_MD_PACKAGING',
      'MENU_MD_SKU',
      'MENU_MD_WAREHOUSE',
      'MENU_MD_STORE',
      'MENU_MD_DRIVER',
      'MENU_MD_VEHICLE',
      'MENU_MD_CASH_ACCOUNT',
      'MENU_MD_BANK_ACCOUNT',
      'MENU_MD_ORG',
      'MENU_MD_COMPANY',
      'MENU_SETTINGS_DATA',
    ];
    const pendingLine = lines.find((line) => /id:\s*["']mdc-pending["']/.test(line)) ?? '';
    const pendingBlock = text.slice(Math.max(0, text.indexOf('id: "mdc-pending"')), text.indexOf('id: "mdc-quality"') > 0 ? text.indexOf('id: "mdc-quality"') : text.length);
    for (const menu of pendingRequiredMenus) {
      if (!pendingLine.includes(menu) && !pendingBlock.includes(menu)) {
        add(file, 1, `Sidebar master-data pending must include ${menu} so per-type approvers can see the pending entry.`, lines[0] || file);
      }
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/master-data/pending/page.tsx')) {
    const pendingPageMenus = [
      'MENU_MD_CUSTOMER',
      'MENU_MD_SUPPLIER',
      'MENU_MD_PROJECT',
      'MENU_MD_MATERIAL',
      'MENU_MD_PRODUCT',
      'MENU_MD_GRADE',
      'MENU_MD_PACKAGING',
      'MENU_MD_SKU',
      'MENU_MD_WAREHOUSE',
      'MENU_MD_STORE',
      'MENU_MD_DRIVER',
      'MENU_MD_VEHICLE',
      'MENU_MD_CASH_ACCOUNT',
      'MENU_MD_BANK_ACCOUNT',
      'MENU_MD_ORG',
      'MENU_MD_COMPANY',
      'MENU_SETTINGS_DATA',
    ];
    for (const menu of pendingPageMenus) {
      if (!text.includes(menu)) {
        add(file, 1, `Master-data pending page must gate and load ${menu} records atomically.`, lines[0] || file);
      }
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/master-data/page.tsx')) {
    if (/MENU_MASTER_DATA/.test(text)) {
      add(file, 1, 'Master-data hub must not use coarse MENU_MASTER_DATA to reveal child tiles or member links; use MENU_MD_* atomic permissions only.', lines[0] || file);
    }
    const fixedLinks = [
      /<a\s+href=["']\/master-data\/operations["']/,
      /<a\s+href=["']\/master-data\/governance["']/,
      /<a\s+href=["']\/master-data\/pending["']/,
      /<a\s+href=["']\/data-quality["']/,
    ];
    if (fixedLinks.some(pattern => pattern.test(text))) {
      add(file, 1, 'Master-data hub action tiles must be permission-filtered before render; do not render fixed links to gated child pages.', lines[0] || file);
    }
    if (!/canViewCenter/.test(text) || !/canViewGovernance/.test(text) || !/canViewPending/.test(text) || !/canViewDataQuality/.test(text)) {
      add(file, 1, 'Master-data hub must compute atomic visibility for center/governance/pending/data-quality child entries.', lines[0] || file);
    }
    if (!/canViewCenter\s*&&\s*<MasterDataSearch/.test(text)) {
      add(file, 1, 'Master-data global search must only render for MENU_MD_CENTER/MENU_MASTER_DATA users because it calls operations/search.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/finance2/page.tsx')) {
    if (/altPerms:\s*\[[^\]]*['"]MENU_FIN2_CASH['"]/.test(text) || /hasPermission\([^)]*['"]MENU_FIN2_CASH['"]/.test(text)) {
      add(file, 1, 'Finance hub must not use legacy MENU_FIN2_CASH as a frontend fallback; use MENU_FIN2_CASH_VIEW, MENU_FIN2_CASH_TRANSFER, and MENU_FIN2_CASH_TXN atomically.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/components/layout/Sidebar.tsx')) {
    if (/id:\s*["']f2-(cash|fund)["'][\s\S]{0,220}altPerms:\s*\[[^\]]*['"]MENU_FIN2_CASH['"]/.test(text)) {
      add(file, 1, 'Finance sidebar cash/fund entries must not use legacy MENU_FIN2_CASH fallback; require MENU_FIN2_CASH_VIEW or MENU_FIN2_CASH_TRANSFER.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/home/page.tsx')) {
    if (/altPerms:\s*\[[^\]]*['"]MENU_FIN2_CASH['"]/.test(text) || /hasPermission\([^)]*['"]MENU_FIN2_CASH['"]/.test(text)) {
      add(file, 1, 'Home finance shortcuts must not use legacy MENU_FIN2_CASH fallback; use atomic cash permissions only.', lines[0] || file);
    }
    if (/altPerms:\s*\[[^\]]*['"]MENU_MASTER_DATA['"]/.test(text) || /hasPermission\([^)]*['"]MENU_MASTER_DATA['"]/.test(text)) {
      add(file, 1, 'Home master-data shortcuts and KPI widgets must not use coarse MENU_MASTER_DATA fallback; use MENU_MD_CENTER, MENU_MD_QUALITY, and per-type MENU_MD_* permissions only.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/dashboard/page.tsx')) {
    if (/altPerms:\s*\[[^\]]*['"]MENU_FIN2_CASH['"]/.test(text) || /hasPermission\([^)]*['"]MENU_FIN2_CASH['"]/.test(text)) {
      add(file, 1, 'Dashboard finance shortcut must not use legacy MENU_FIN2_CASH fallback; use atomic cash permissions only.', lines[0] || file);
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

  if (
    /apps\/api\/src\/common\/guards\/master-data-type\.guard\.ts$/.test(file) &&
    /TYPE_TO_ALT_MENUS[\s\S]*(MENU_ORG_VIEW|MENU_ORG_MANAGE)/.test(text)
  ) {
    add(file, 1, 'MasterDataTypeGuard must not allow legacy MENU_ORG_VIEW/MENU_ORG_MANAGE fallbacks; use MENU_MD_ORG/MENU_MD_COMPANY.', lines[0] || file);
  }

  if (
    /apps\/api\/src\/modules\/org\/organization\.controller\.ts$/.test(file) &&
    /MENU_ORG_VIEW|MENU_ORG_MANAGE/.test(text)
  ) {
    add(file, 1, 'Organization runtime APIs must not use legacy MENU_ORG_VIEW/MENU_ORG_MANAGE aliases; use MENU_MD_ORG.', lines[0] || file);
  }

  if (file.endsWith('apps/web/src/app/(admin)/settings/online-users/page.tsx')) {
    if (!/usePermission\(["']MENU_SETTINGS_ONLINE_USER["']\)/.test(text) || !/onlineUsersPerm\.canView/.test(text)) {
      add(file, 1, 'Online users page must gate route rendering and data load with MENU_SETTINGS_ONLINE_USER before calling /system/online-users.', lines[0] || file);
    }
    if (/MENU_SYS_MONITOR/.test(text)) {
      add(file, 1, 'Online users page must not use MENU_SYS_MONITOR as a fallback; online user access belongs to MENU_SETTINGS_ONLINE_USER.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/components/layout/OnlineUsersIndicator.tsx')) {
    if (!/usePermission\(["']MENU_SETTINGS_ONLINE_USER["']\)/.test(text) || !/onlineUsersPerm\.hasAccess/.test(text)) {
      add(file, 1, 'Online users topbar indicator must be gated with MENU_SETTINGS_ONLINE_USER before calling /system/online-count.', lines[0] || file);
    }
    if (/MENU_SYS_MONITOR/.test(text)) {
      add(file, 1, 'Online users topbar indicator must not use MENU_SYS_MONITOR as a fallback.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/settings/page.tsx')) {
    const settingsHubMenus = [
      'MENU_SETTINGS_USER',
      'MENU_SETTINGS_ROLE',
      'MENU_MD_ORG',
      'MENU_SETTINGS_DATA',
      'MENU_SETTINGS_CONFIG',
      'MENU_SETTINGS_STOCK',
      'MENU_SETTINGS_SECURITY',
      'MENU_SETTINGS_AUDIT',
      'MENU_SETTINGS_ONLINE_USER',
      'MENU_WORKFLOW_CONFIG',
      'MENU_SETTINGS_POS',
      'MENU_SETTINGS_TERMINAL',
      'MENU_SETTINGS_BRAND',
      'MENU_UAT',
    ];
    for (const menu of settingsHubMenus) {
      if (!text.includes(menu)) {
        add(file, 1, `Settings hub must gate child card visibility with ${menu}.`, lines[0] || file);
      }
    }
    if (!/items:\s*group\.items\.filter\(item\s*=>\s*item\.visible\)/.test(text)) {
      add(file, 1, 'Settings hub must filter invisible child cards before rendering.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/settings/security/page.tsx')) {
    if (!/usePermission\(["']MENU_SETTINGS_SECURITY["']\)/.test(text) || !/securityPerm\.canView/.test(text)) {
      add(file, 1, 'Security settings page must gate route rendering with MENU_SETTINGS_SECURITY before showing policy content.', lines[0] || file);
    }
    if (!/usePermission\(["']MENU_SETTINGS_USER["']\)/.test(text) || !/userPerm\.canView[\s\S]*\/api\/crud\/sys_users/.test(text)) {
      add(file, 1, 'Security settings page must only call sys_users when MENU_SETTINGS_USER is available.', lines[0] || file);
    }
    if (!/usePermission\(["']MENU_SETTINGS_AUDIT["']\)/.test(text) || !/auditPerm\.canView[\s\S]*\/api\/crud\/sys_approval_log/.test(text)) {
      add(file, 1, 'Security settings page must only call audit logs when MENU_SETTINGS_AUDIT is available.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/settings/audit-log/page.tsx')) {
    if (!/usePermission\(["']MENU_SETTINGS_AUDIT["']\)/.test(text) || !/canViewAudit/.test(text)) {
      add(file, 1, 'Audit log page must gate route rendering and data load with MENU_SETTINGS_AUDIT before calling audit CRUD APIs.', lines[0] || file);
    }
    if (/MENU_SYS_MONITOR/.test(text)) {
      add(file, 1, 'Audit log page must not use MENU_SYS_MONITOR as a fallback; audit access belongs to MENU_SETTINGS_AUDIT.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/web/src/app/(admin)/settings/notifications/page.tsx')) {
    if (!/usePermission\(["']MENU_SETTINGS_NOTIFY["']\)/.test(text) || !/notifyPerm\.canView/.test(text)) {
      add(file, 1, 'Notification settings page must gate route rendering with MENU_SETTINGS_NOTIFY before calling config/log APIs.', lines[0] || file);
    }
    if (!/notifyPerm\.canEdit/.test(text) || !/RulesTab canEdit=/.test(text) || !/ChannelsTab canEdit=/.test(text)) {
      add(file, 1, 'Notification settings high-risk buttons must be controlled by MENU_SETTINGS_NOTIFY:E.', lines[0] || file);
    }
  }

  if (file.endsWith('apps/api/src/modules/approval-engine/approval-engine.service.ts')) {
    if (!/async getHistory\([^)]*\)[\s\S]*wf_approval_instance_steps[\s\S]*actor_user_id[\s\S]*approver_user_id[\s\S]*approver_role/.test(text)) {
      add(file, 1, 'Approval history must be filtered by starter/actor/assigned user/assigned role; MENU_WORKFLOW_HISTORY must not expose global completed approvals.', lines[0] || file);
    }
    if (!/async getHistory\([^)]*\)[\s\S]*allowedCompanyCodes/.test(text)) {
      add(file, 1, 'Approval history must apply company DataScope filtering for non-global users.', lines[0] || file);
    }
    if (!/async getInstanceByBiz\([^)]*\)[\s\S]*this\.assertInstanceReadable\(inst,\s*steps\)/.test(text)) {
      add(file, 1, 'Approval by-biz lookup must reuse instance readability checks before returning details.', lines[0] || file);
    }
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
