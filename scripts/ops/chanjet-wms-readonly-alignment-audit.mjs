#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const dryRun = args.includes('--dry-run');
const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE || 'http://localhost:3100/api').replace(/\/$/, '');
const token = getArg('--token', process.env.PHOENIX_ACCESS_TOKEN || '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');

function markdown(alignment) {
  const scopeRows = alignment.scopes.map((scope) =>
    `|${scope.label || scope.entityType}|${scope.bookName || scope.bookId}|${scope.bookId}|${scope.sourceRows || 0}|${scope.latestPulledAt || 'MISSING'}|`,
  );
  const contractRows = alignment.contracts.flatMap((contract) =>
    contract.fields.map((field) =>
      `|${contract.label}|${field.sourcePath}|${field.canonicalField}|${field.erpTarget}|${field.storage}|${field.required ? 'Y' : 'N'}|`,
    ),
  );
  return [
    '# 好业财 WMS 只读对齐审计',
    '',
    `生成时间：${alignment.generatedAt}`,
    '',
    `结论：**${alignment.decision}**`,
    '',
    '## 摘要',
    '',
    `- 启用账套：${alignment.summary.enabledBooks}`,
    `- 官方库存接口：${alignment.summary.inventoryContracts || alignment.contracts.length}`,
    `- 新鲜 scope：${alignment.summary.freshScopes}/${alignment.summary.expectedScopes}`,
    `- 中间层库存行：${alignment.summary.sourceRows || 0}`,
    `- 只读单据/明细：${alignment.summary.sourceDocuments}/${alignment.summary.sourceLines}`,
    `- 官方字段：${alignment.summary.officialFieldCount}`,
    `- ERP 业务字段覆盖：${alignment.summary.erpBusinessColumnCoverage}%`,
    `- 缺失业务列：${alignment.summary.missingBusinessColumns}`,
    '',
    '## 账套 Scope',
    '',
    '|库存范围|账套|bookId|镜像行数|最近同步|',
    '|---|---|---|---:|---|',
    ...scopeRows,
    '',
    '## 字段契约',
    '',
    '|单据|好业财字段|标准字段|ERP 落点|存储层|必需|',
    '|---|---|---|---|---|---|',
    ...contractRows,
    '',
    '## 条件项',
    '',
    ...(alignment.conditions.length ? alignment.conditions.map((item) => `- ${item}`) : ['- 无']),
    '',
    '## 反向同步就绪度',
    '',
    `- 当前结论：${alignment.reverseSyncReadiness?.decision || 'HOLD'}`,
    `- 好业财写入开关：${alignment.reverseSyncReadiness?.externalWriteEnabled ? '已开启' : '关闭'}`,
    `- 库存专用 Outbox：${alignment.reverseSyncReadiness?.wmsOutboxImplemented ? '已实现' : '未实现'}`,
    ...(alignment.reverseSyncReadiness?.prerequisites || []).map((item) => `- 前置：${item}`),
    '',
    '## 安全边界',
    '',
    '- 好业财写入、修改、删除：否。',
    '- ERP 出入库业务表写入：否。',
    '- 裸附件 URL 向业务页面暴露：否。',
    '- 审计仅读取 ERP 中间层、字段元数据和已镜像的好业财只读响应。',
    '',
  ].join('\n');
}

async function main() {
  const endpoint = `${apiBase}/chanjet/integration/wms-readonly-alignment`;
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      endpoint,
      authenticated: Boolean(token),
      outputJson: join(outputDir, 'chanjet-wms-readonly-alignment-latest.json'),
      outputMd: join(outputDir, 'chanjet-wms-readonly-alignment-latest.md'),
      chanjetWrite: false,
      erpBusinessWrite: false,
      deploy: false,
      push: false,
    }, null, 2)}\n`);
    return;
  }
  if (!token) throw new Error('PHOENIX_ACCESS_TOKEN or --token is required');
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true || !payload.alignment) {
    throw new Error(payload.error || payload.message || `WMS alignment audit failed with HTTP ${response.status}`);
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'chanjet-wms-readonly-alignment-latest.json'),
    `${JSON.stringify(payload.alignment, null, 2)}\n`,
  );
  writeFileSync(
    join(outputDir, 'chanjet-wms-readonly-alignment-latest.md'),
    `${markdown(payload.alignment)}\n`,
  );
  process.stdout.write(
    `${payload.alignment.decision}: scopes ${payload.alignment.summary.freshScopes}/${payload.alignment.summary.expectedScopes}, `
    + `documents ${payload.alignment.summary.sourceDocuments}, columns ${payload.alignment.summary.erpBusinessColumnCoverage}%\n`,
  );
  if (payload.alignment.decision === 'HOLD') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`chanjet-wms-readonly-alignment-audit: ${error.message}\n`);
  process.exitCode = 1;
});
