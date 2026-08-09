#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildHoldBatchPlan } from './chanjet-hold-batch-plan-policy.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};

const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!execute) {
  console.error('Refusing production planning without --execute. This command is read-only.');
  process.exit(2);
}
if (!token) {
  console.error('Protected admin authentication is required.');
  process.exit(2);
}

async function request(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || payload?.message || 'unknown'}`);
  }
  return payload;
}

const [precisionEnvelope, reviewEnvelope, policyEnvelope] = await Promise.all([
  request('/api/chanjet/integration/erp-master-gap-closure/precision-audit'),
  request('/api/chanjet/integration/erp-master-gap-closure/business-review'),
  request('/api/chanjet/integration/wms/domain-policies'),
]);
const plan = buildHoldBatchPlan({
  audit: precisionEnvelope.audit || precisionEnvelope,
  businessPlan: reviewEnvelope.plan || reviewEnvelope,
  domainPolicies: policyEnvelope.domainPolicies || policyEnvelope,
});
if (plan.guardrails.writeChanjet !== false || plan.guardrails.writeErpBusinessTables !== false) {
  throw new Error('read-only batch plan guardrails are not proven');
}

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, 'chanjet-hold-batch-plan-latest.json');
const mdPath = join(outputDir, 'chanjet-hold-batch-plan-latest.md');
writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const table = [
  '|批次|映射ID|类型|公司|来源编码|来源名称|就绪状态|目标/领域|',
  '|---|---:|---|---|---|---|---|---|',
  ...plan.rows.map((row) => [
    row.closureBatch,
    row.mappingId,
    row.mappingType,
    row.companyCode,
    row.chanjetCode,
    row.chanjetName,
    row.readiness,
    row.expectedHouseCode || row.proposedDomain || row.proposedPolicy || '',
  ].map(escape).join('|')).map((line) => `|${line}|`),
];
const markdown = [
  '# 好业财 ↔ Phoenix ERP HOLD 分批执行计划',
  '',
  `- 生成时间：${plan.generatedAt}`,
  `- 精确审计哈希：\`${plan.auditHash}\``,
  `- HOLD 总数：${plan.summary.total}`,
  '- 好业财写入：否',
  '- ERP 业务表写入：否',
  '- 所有生产写入仍需逐批明确批准。',
  '',
  '## 批次统计',
  '',
  ...Object.entries(plan.summary.byBatch).map(([batch, count]) => `- ${batch}: ${count}`),
  '',
  '## 精确清单',
  '',
  ...table,
  '',
].join('\n');
writeFileSync(mdPath, markdown, 'utf8');

console.log(`Chanjet HOLD batch plan ready total=${plan.summary.total}`);
console.log(`artifact=${jsonPath}`);
