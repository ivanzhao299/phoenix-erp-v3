#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const writeReport = args.has('--write-report');
const jsonReportPath = resolve(ROOT, 'docs/ops/runs/sys-alert-source-coverage-latest.json');
const mdReportPath = resolve(ROOT, 'docs/ops/runs/sys-alert-source-coverage-latest.md');

const files = {
  exceptionFilter: 'apps/api/src/common/filters/all-exceptions.filter.ts',
  cronMonitor: 'apps/api/src/modules/system-monitor/services/cron-monitor.service.ts',
  iotSync: 'apps/api/src/modules/iot/iot-sync.service.ts',
  sysAlertsService: 'apps/api/src/modules/system-monitor/services/sys-alerts.service.ts',
  sysAlertsController: 'apps/api/src/modules/system-monitor/controllers/sys-alerts.controller.ts',
};

function read(file) {
  const abs = resolve(ROOT, file);
  if (!existsSync(abs)) return '';
  return readFileSync(abs, 'utf8');
}

function has(source, pattern) {
  if (pattern instanceof RegExp) return pattern.test(source);
  return source.includes(pattern);
}

function buildChecks() {
  const exceptionFilter = read(files.exceptionFilter);
  const cronMonitor = read(files.cronMonitor);
  const iotSync = read(files.iotSync);
  const sysAlertsService = read(files.sysAlertsService);
  const sysAlertsController = read(files.sysAlertsController);

  return [
    {
      id: 'API_5XX_SOURCE',
      description: 'Unhandled API 5xx errors create sys_alerts.',
      file: files.exceptionFilter,
      pass: has(exceptionFilter, "alertType: 'API_5XX'")
        && has(exceptionFilter, 'raiseCriticalAlert')
        && has(exceptionFilter, 'createAlert'),
    },
    {
      id: 'PG_ERROR_SOURCE',
      description: 'PostgreSQL errors create sys_alerts.',
      file: files.exceptionFilter,
      pass: has(exceptionFilter, "alertType: 'PG_ERROR'")
        && has(exceptionFilter, 'raisePgAlert')
        && has(exceptionFilter, 'PG_ERROR_MAP'),
    },
    {
      id: 'CRON_FAILURE_SOURCE',
      description: 'Cron failures create sys_alerts.',
      file: files.cronMonitor,
      pass: has(cronMonitor, "alertType: 'CRON_FAILURE'")
        && has(cronMonitor, 'runGuarded')
        && has(cronMonitor, 'createAlert'),
    },
    {
      id: 'IOT_DEVICE_ALERT_SOURCE',
      description: 'IoT threshold device alerts create sys_alerts.',
      file: files.iotSync,
      pass: has(iotSync, "alertType: 'IOT_DEVICE_ALERT'")
        && has(iotSync, 'mon_device_alert_event')
        && has(iotSync, 'createAlert'),
    },
    {
      id: 'IOT_SYNC_FAILURE_SOURCE',
      description: 'IoT per-house sync failures create sys_alerts.',
      file: files.iotSync,
      pass: has(iotSync, "alertType: 'IOT_SYNC_FAILURE'")
        && has(iotSync, 'createAlert'),
    },
    {
      id: 'IOT_SYNC_DOWN_SOURCE',
      description: 'IoT cloud-wide sync outage creates sys_alerts even when using direct SQL fallback.',
      file: files.iotSync,
      pass: has(iotSync, "'IOT_SYNC_DOWN'")
        && has(iotSync, 'INSERT INTO sys_alerts')
        && has(iotSync, 'IOT_DEMO_FALLBACK'),
    },
    {
      id: 'ALERT_DELIVERY_HEALTH',
      description: 'System alerts expose delivery health and station notification evidence.',
      file: files.sysAlertsService,
      pass: has(sysAlertsService, 'getDeliveryHealth')
        && has(sysAlertsService, 'SYSTEM_ALERT')
        && has(sysAlertsService, 'sys_notifications')
        && has(sysAlertsController, "@Get('delivery-health')"),
    },
    {
      id: 'ALERT_APPEND_ONLY',
      description: 'Alert center remains append-only: no DELETE endpoint; resolve is one-way.',
      file: files.sysAlertsController,
      pass: !has(sysAlertsController, /@Delete\s*\(/)
        && has(sysAlertsController, "@Patch(':id/resolve')")
        && has(sysAlertsService, 'resolved = TRUE')
        && has(sysAlertsService, 'resolved_at = NOW()'),
    },
    {
      id: 'ALERT_MENU_GUARD',
      description: 'Alert center is guarded by MENU_SYS_MONITOR view/action permissions.',
      file: files.sysAlertsController,
      pass: has(sysAlertsController, "RequireMenu('MENU_SYS_MONITOR', 'V')")
        && has(sysAlertsController, "RequireMenu('MENU_SYS_MONITOR', 'A')")
        && has(sysAlertsController, "@UseGuards(AuthGuard('jwt'), MenuGuard)"),
    },
  ];
}

function toMarkdown(result) {
  const lines = [
    '# Sys Alert Source Coverage Gate',
    '',
    `- Generated At: ${result.generatedAt}`,
    `- Decision: ${result.decision}`,
    '',
    '| Check | Result | File | Description |',
    '|---|---:|---|---|',
  ];
  for (const check of result.checks) {
    lines.push(`| ${check.id} | ${check.pass ? 'PASS' : 'FAIL'} | ${check.file} | ${check.description} |`);
  }
  if (result.failures.length) {
    lines.push('', '## Failures', '');
    for (const failure of result.failures) {
      lines.push(`- ${failure.id}: ${failure.description}`);
    }
  } else {
    lines.push('', 'All required alert sources and delivery constraints are present.');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const checks = buildChecks();
  const failures = checks.filter((check) => !check.pass);
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failures.length ? 'FAIL' : 'PASS',
    checks,
    failures,
  };
  const md = toMarkdown(result);
  console.log(md.trim());

  if (writeReport) {
    mkdirSync(dirname(jsonReportPath), { recursive: true });
    writeFileSync(jsonReportPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(mdReportPath, md);
  }

  if (failures.length) {
    console.error(`Result: FAIL. ${failures.length} sys_alert source coverage check(s) failed.`);
    process.exit(1);
  }
  console.log('Result: PASS. sys_alert source coverage is present.');
}

main();
