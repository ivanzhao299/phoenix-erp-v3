#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';
const generatedAt = new Date().toISOString();

const books = [
  { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', companyName: '凤凰农业' },
  { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', companyName: '星驰农业' },
  { bookId: '3539743721526654', companyCode: 'COMP-LAO-FOOD', companyName: '凤凰食品' },
];

if (!execute) {
  console.error('Refusing to call production without --execute. This command is read-only for Chanjet.');
  process.exit(2);
}
if (!token) {
  console.error('PHOENIX_ADMIN_TOKEN is required.');
  process.exit(2);
}

async function request(path, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(`${path} failed status=${response.status} error=${payload?.error || 'unknown'}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'rows', 'items', 'list', 'entities']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    const rows = rowsOf(nested);
    if (rows.length) return rows;
  }
  return [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function first(record, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current?.[part], record);
    if (value != null && text(value)) return text(value);
  }
  return '';
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[\s_\-—–·()（）]/g, '');
}

function isHouse(record) {
  const value = [
    record.externalCode,
    record.externalName,
    first(record.rawData || {}, ['code', 'name', 'projectCode', 'projectName']),
  ].join(' ');
  return /鸡舍|舍号|henhouse|chickenhouse|\bhouse[\s_-]*\w+/i.test(value);
}

function statusOf(record) {
  const raw = first(record, ['status', 'rawData.status', 'rawData.enabled', 'rawData.isEnabled', 'rawData.state']);
  const normalized = normalize(raw);
  const active = ['active', 'enabled', 'enable', '1', 'true', '启用', '正常', '使用中'].includes(normalized);
  const inactive = ['inactive', 'disabled', 'disable', '0', 'false', '停用', '禁用', '已停用'].includes(normalized);
  return { raw: raw || 'UNKNOWN', productionState: active ? 'ACTIVE' : inactive ? 'INACTIVE' : 'UNKNOWN' };
}

const syncResults = [];
const blockers = [];
for (const book of books) {
  try {
    const result = await request('/api/chanjet/integration/mirror/sync', {
      method: 'POST',
      body: JSON.stringify({ scope: ['PROJECT', 'DEPARTMENT'], bookId: book.bookId }),
    });
    if (result.writeChanjet !== false) throw new Error('writeChanjet safety flag was not false');
    syncResults.push({ ...book, success: true, writeChanjet: false });
  } catch (error) {
    blockers.push(`${book.companyCode}: ${error.message}`);
    syncResults.push({ ...book, success: false, writeChanjet: false, error: error.message });
  }
}

const [projectPayload, departmentPayload, erpHousePayload] = await Promise.all([
  request('/api/chanjet/integration/mirror/entity-snapshots?entityType=PROJECT&limit=1000'),
  request('/api/chanjet/integration/mirror/entity-snapshots?entityType=DEPARTMENT&limit=1000'),
  request('/api/crud/brd_houses?limit=1000'),
]);

const projects = rowsOf(projectPayload);
const departments = rowsOf(departmentPayload);
const erpHousesRaw = rowsOf(erpHousePayload);
const chanjetHouses = projects.filter(isHouse).map((row) => ({
  bookId: text(row.bookId),
  externalId: text(row.externalId),
  code: text(row.externalCode) || first(row.rawData || {}, ['code', 'projectCode']),
  name: text(row.externalName) || first(row.rawData || {}, ['name', 'projectName']),
  ...statusOf(row),
  lastSeenAt: text(row.lastSeenAt),
}));
const houseLikeDepartments = departments.filter(isHouse).map((row) => ({
  bookId: text(row.bookId),
  externalId: text(row.externalId),
  code: text(row.externalCode),
  name: text(row.externalName),
  ...statusOf(row),
  lastSeenAt: text(row.lastSeenAt),
}));
const erpHouses = erpHousesRaw.map((row) => ({
  code: first(row, ['house_code', 'houseCode', 'code']),
  name: first(row, ['house_name', 'houseName', 'name']),
  farmCode: first(row, ['farm_code', 'farmCode']),
  status: first(row, ['status']),
  capacity: first(row, ['capacity']),
})).filter((row) => row.code || row.name);

const mappings = erpHouses.map((erp) => {
  const exactCode = chanjetHouses.filter((item) => normalize(item.code) === normalize(erp.code));
  const exactName = chanjetHouses.filter((item) => normalize(item.name) === normalize(erp.name));
  const candidates = exactCode.length ? exactCode : exactName;
  return {
    erp,
    matchStatus: candidates.length === 1 ? 'EXACT_CANDIDATE' : candidates.length > 1 ? 'AMBIGUOUS' : 'MISSING_IN_CHANJET',
    matchBasis: exactCode.length ? 'CODE' : exactName.length ? 'NAME' : 'NONE',
    chanjet: candidates,
  };
});

const report = {
  generatedAt,
  decision: blockers.length ? 'HOLD' : 'READY_FOR_HUMAN_REVIEW',
  writeChanjet: false,
  writeErpBusinessTables: false,
  books,
  syncResults,
  blockers,
  counts: {
    chanjetProjects: projects.length,
    chanjetDepartments: departments.length,
    chanjetHouseProjects: chanjetHouses.length,
    chanjetHouseDepartments: houseLikeDepartments.length,
    erpHouses: erpHouses.length,
  },
  chanjetHouses,
  houseLikeDepartments,
  erpHouses,
  mappings,
};

mkdirSync(outputDir, { recursive: true });
const jsonPath = join(outputDir, 'chanjet-house-alignment-readonly-latest.json');
const mdPath = join(outputDir, 'chanjet-house-alignment-readonly-latest.md');
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const table = (headers, rows) => [
  `|${headers.join('|')}|`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `|${row.map((value) => text(value).replace(/\|/g, '\\|')).join('|')}|`),
].join('\n');
const md = [
  '# 好业财鸡舍对齐只读审计',
  '',
  `- 生成时间：${generatedAt}`,
  `- 决策：${report.decision}`,
  '- 好业财写入：否',
  `- 好业财项目数：${projects.length}`,
  `- 好业财鸡舍项目数：${chanjetHouses.length}`,
  `- 好业财鸡舍型部门数：${houseLikeDepartments.length}`,
  `- ERP 鸡舍数：${erpHouses.length}`,
  '',
  '## 好业财鸡舍项目',
  '',
  table(['账套', '编码', '名称', '状态', '最后读取'], chanjetHouses.map((row) => [row.bookId, row.code, row.name, `${row.productionState}/${row.raw}`, row.lastSeenAt])),
  '',
  '## ERP ↔ 好业财映射候选',
  '',
  table(['ERP编码', 'ERP名称', '场区', 'ERP状态', '匹配状态', '匹配依据', '好业财项目'], mappings.map((row) => [
    row.erp.code, row.erp.name, row.erp.farmCode, row.erp.status, row.matchStatus, row.matchBasis,
    row.chanjet.map((item) => `${item.code}:${item.name}`).join('; '),
  ])),
  '',
  '## 阻断项',
  '',
  ...(blockers.length ? blockers.map((item) => `- ${item}`) : ['- 无']),
  '',
].join('\n');
writeFileSync(mdPath, md);

console.log(JSON.stringify({
  decision: report.decision,
  writeChanjet: false,
  counts: report.counts,
  blockers: report.blockers,
  outputJson: jsonPath,
  outputMd: mdPath,
}, null, 2));

if (blockers.length) process.exitCode = 2;
