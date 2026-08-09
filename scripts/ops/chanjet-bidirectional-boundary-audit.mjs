#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MAPPING_TYPES,
  closureBatch,
  publicUserSummary,
  rowsOf,
  summarizeBy,
} from './chanjet-bidirectional-boundary-status.mjs';

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
  console.error('Refusing to call production without --execute. This audit is read-only.');
  process.exit(2);
}
if (!token) {
  console.error('PHOENIX_ADMIN_TOKEN is required.');
  process.exit(2);
}

async function request(path, timeoutMs = 120_000) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || 'unknown'}`);
  }
  return payload;
}

async function boundedMap(values, concurrency, mapper) {
  const result = new Array(values.length);
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      result[current] = await mapper(values[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return result;
}

function compactDepartment(row) {
  return {
    bookId: String(row.bookId ?? row.book_id ?? ''),
    externalId: String(row.externalId ?? row.external_id ?? ''),
    code: String(row.externalCode ?? row.external_code ?? row.code ?? ''),
    name: String(row.externalName ?? row.external_name ?? row.name ?? ''),
    status: String(row.status ?? row.rawData?.status ?? row.raw_data?.status ?? ''),
  };
}

function compactOrganization(row) {
  return {
    id: Number(row.id || 0),
    code: String(row.orgCode ?? row.org_code ?? ''),
    name: String(row.orgName ?? row.org_name ?? ''),
    type: String(row.orgType ?? row.org_type ?? ''),
    parentCode: String(row.parentCode ?? row.parent_code ?? ''),
    companyCode: String(row.companyCode ?? row.company_code ?? ''),
    status: String(row.status ?? ''),
  };
}

const generatedAt = new Date().toISOString();
const mappingRequests = Object.fromEntries(await Promise.all(MAPPING_TYPES.map(async (mappingType) => [
  mappingType,
  await request(`/api/chanjet/integration/master-mappings?mappingType=${encodeURIComponent(mappingType)}`),
])));

const [reviewEnvelope, precisionEnvelope, orgEnvelope, userEnvelope, departmentEnvelope, projectEnvelope] = await Promise.all([
  request('/api/chanjet/integration/erp-master-gap-closure/business-review'),
  request('/api/chanjet/integration/erp-master-gap-closure/precision-audit'),
  request('/api/organizations'),
  request('/api/system/users'),
  request('/api/chanjet/integration/mirror/entity-snapshots?entityType=DEPARTMENT&limit=1000'),
  request('/api/chanjet/integration/mirror/entity-snapshots?entityType=PROJECT&limit=1000'),
]);

const review = reviewEnvelope.plan || reviewEnvelope;
const precision = precisionEnvelope.audit || precisionEnvelope;
if (review.guardrails?.chanjetWrite !== false || precision.guardrails?.readonlyAudit !== true) {
  throw new Error('Production endpoint did not prove the expected read-only guardrails.');
}

const organizations = rowsOf(orgEnvelope).map(compactOrganization);
const users = rowsOf(userEnvelope);
const userBindings = await boundedMap(users, 5, async (user) => {
  const id = Number(user.id ?? user.userId ?? user.user_id ?? 0);
  if (!id) return [];
  const payload = await request(`/api/org/user-orgs/${id}`);
  return rowsOf(payload);
});
const publicUsers = users.map((user, index) => publicUserSummary(user, userBindings[index]));
const departments = rowsOf(departmentEnvelope).map(compactDepartment);
const projects = rowsOf(projectEnvelope).map(compactDepartment);

const holdLedger = (precision.items || []).map((item) => ({
  mappingId: String(item.mappingId || ''),
  mappingType: String(item.mappingType || ''),
  bookId: String(item.bookId || ''),
  companyCode: String(item.companyCode || ''),
  chanjetId: String(item.chanjetId || ''),
  chanjetCode: String(item.chanjetCode || ''),
  chanjetName: String(item.chanjetName || ''),
  authorityOwner: item.authorityOwner,
  disposition: item.disposition,
  closureBatch: closureBatch(item),
  confidence: Number(item.confidence || 0),
  risk: item.risk,
  blockers: item.blockers || [],
  sourceQualityIssues: item.sourceQualityIssues || [],
  recommendedAction: item.recommendedAction,
  autoApplyEligible: item.autoApplyEligible === true,
  requiresChanjetApproval: item.requiresChanjetApproval === true,
  chanjetChangeProposal: item.chanjetChangeProposal || null,
  uomPolicyCandidates: item.uomPolicyCandidates || [],
}));

const masterMappings = Object.fromEntries(MAPPING_TYPES.map((mappingType) => {
  const mappings = rowsOf(mappingRequests[mappingType]);
  return [mappingType, {
    total: mappings.length,
    byReviewStatus: summarizeBy(mappings, 'reviewStatus'),
    byMatchStatus: summarizeBy(mappings, 'matchStatus'),
  }];
}));
const batches = summarizeBy(holdLedger, 'closureBatch');
const report = {
  generatedAt,
  decision: 'READONLY_BASELINE_COMPLETE',
  writeChanjet: false,
  writeErpBusinessTables: false,
  providerCalls: 0,
  summary: {
    sourceReviewHash: String(review.reviewHash || precision.sourceReviewHash || ''),
    precisionAuditHash: String(precision.auditHash || ''),
    holdTotal: holdLedger.length,
    byMappingType: summarizeBy(holdLedger, 'mappingType'),
    byDisposition: summarizeBy(holdLedger, 'disposition'),
    byClosureBatch: batches,
    chanjetDepartments: departments.length,
    chanjetProjects: projects.length,
    erpOrganizations: organizations.length,
    erpUsers: users.length,
    erpUserOrgBindings: userBindings.reduce((total, bindings) => total + bindings.length, 0),
    erpUsersWithoutOrgBinding: publicUsers.filter((user) => !user.hasOrgBinding).length,
  },
  twoWayBoundary: {
    chanjetToErpMapping: 'IMPLEMENTED_AND_GATED',
    erpToChanjetProjectWrite: 'IMPLEMENTED_AND_PRODUCTION_VERIFIED',
    erpToChanjetDepartmentWrite: 'NOT_IMPLEMENTED_PROVIDER_CONTRACT_REQUIRED',
    erpToChanjetUserWrite: 'NOT_IMPLEMENTED_PROVIDER_CONTRACT_REQUIRED',
    userOrgBindingWrite: 'ERP_ENDPOINT_EXISTS_PRODUCTION_WRITE_NOT_APPROVED',
    nextRequirement: 'official provider contract plus exact per-batch approval for every external or production write',
  },
  guardrails: {
    source: precision.guardrails,
    noProviderRefresh: true,
    noExternalWrite: true,
    noErpWrite: true,
    noRawUserIdentityInArtifact: true,
  },
  masterMappings,
  organizations,
  publicUsers,
  chanjetDepartments: departments,
  holdLedger,
};
report.evidenceHash = createHash('sha256').update(JSON.stringify({
  summary: report.summary,
  twoWayBoundary: report.twoWayBoundary,
  holdLedger: report.holdLedger,
})).digest('hex');

const table = (headers, rows) => [
  `|${headers.join('|')}|`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `|${row.map((value) => String(value ?? '').replace(/\|/g, '\\|')).join('|')}|`),
].join('\n');

const markdown = [
  '# 好业财 ↔ ERP 双向边界与 HOLD 总账只读审计',
  '',
  `- 生成时间：${generatedAt}`,
  `- 决策：${report.decision}`,
  '- 好业财写入：否',
  '- ERP 业务表写入：否',
  '- 好业财平台调用：0（仅读取 ERP 已有镜像与受保护审计端点）',
  `- HOLD 总数：${holdLedger.length}`,
  `- 好业财部门：${departments.length}`,
  `- ERP 组织：${organizations.length}`,
  `- ERP 用户：${users.length}`,
  `- ERP 用户—组织绑定：${report.summary.erpUserOrgBindings}`,
  `- 无组织绑定 ERP 用户：${report.summary.erpUsersWithoutOrgBinding}`,
  '',
  '## 关闭批次',
  '',
  table(['批次', '数量'], Object.entries(batches).sort().map(([batch, count]) => [batch, count])),
  '',
  '## HOLD 总账',
  '',
  table(['批次', '类型', '账套', '编码', '名称', '处置', '风险', '建议'], holdLedger.map((item) => [
    item.closureBatch,
    item.mappingType,
    item.bookId,
    item.chanjetCode,
    item.chanjetName,
    item.disposition,
    item.risk,
    item.recommendedAction,
  ])),
  '',
  '## 双向边界',
  '',
  ...Object.entries(report.twoWayBoundary).map(([key, value]) => `- ${key}: ${value}`),
  '',
].join('\n');

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'chanjet-bidirectional-boundary-audit-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outputDir, 'chanjet-bidirectional-boundary-audit-latest.md'), `${markdown}\n`);
console.log(JSON.stringify({
  decision: report.decision,
  evidenceHash: report.evidenceHash,
  summary: report.summary,
  writeChanjet: false,
  writeErpBusinessTables: false,
  providerCalls: 0,
}));
