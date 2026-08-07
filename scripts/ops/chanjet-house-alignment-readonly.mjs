#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { statusOf } from './chanjet-house-alignment-status.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const execute = args.includes('--execute');
const skipRefresh = args.includes('--skip-refresh');
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

function rawStatusFlags(rawData) {
  if (!rawData || typeof rawData !== 'object') return {};
  return Object.fromEntries(Object.entries(rawData)
    .filter(([key, value]) => /status|enable|stop|state|valid|active|delete|disable/i.test(key)
      && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 20));
}

const syncResults = [];
const blockers = [];
for (const book of books) {
  if (skipRefresh) {
    syncResults.push({ ...book, success: true, skipped: true, writeChanjet: false });
    continue;
  }
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
  rawStatusFlags: rawStatusFlags(row.rawData),
  lastSeenAt: text(row.lastSeenAt),
}));
const erpHouses = erpHousesRaw.map((row) => ({
  code: first(row, ['house_code', 'houseCode', 'code']),
  name: first(row, ['house_name', 'houseName', 'name']),
  farmCode: first(row, ['farm_code', 'farmCode']),
  status: first(row, ['status']),
  capacity: first(row, ['capacity']),
})).filter((row) => row.code || row.name);
const projectCatalog = projects.map((row) => ({
  bookId: text(row.bookId),
  externalId: text(row.externalId),
  code: text(row.externalCode) || first(row.rawData || {}, ['code', 'projectCode']),
  name: text(row.externalName) || first(row.rawData || {}, ['name', 'projectName']),
  projectCategoryCode: first(row.rawData || {}, [
    'projectCategoryCode', 'categoryCode', 'projectCategory.code', 'projectCategoryCode.code',
  ]),
  projectCategoryName: first(row.rawData || {}, [
    'projectCategoryName', 'categoryName', 'projectCategory.name', 'projectCategoryCode.name',
  ]),
  ...statusOf(row),
  rawStatusFlags: rawStatusFlags(row.rawData),
}));

const expectedBookId = (erp) => {
  const farm = normalize(erp.farmCode);
  const name = normalize(erp.name);
  if (farm.includes('mengsai') || farm.includes('lph') || name.includes('孟赛')) return books[0].bookId;
  if (farm.includes('farmdp') || farm.includes('dongpeng') || name.includes('东鹏')) return books[1].bookId;
  if (farm.includes('vte') || name.includes('万象')) return books[2].bookId;
  return '';
};
const isTestHouse = (erp) => /debug|test|测试|cs[-_]?\d*/i.test(`${erp.code} ${erp.name} ${erp.farmCode}`);

const mappings = erpHouses.map((erp) => {
  const bookId = expectedBookId(erp);
  const exactCode = chanjetHouses.filter((item) => normalize(item.code) === normalize(erp.code));
  const exactName = chanjetHouses.filter((item) => (!bookId || item.bookId === bookId) && normalize(item.name) === normalize(erp.name));
  const candidates = exactCode.length ? exactCode : exactName;
  const departmentCandidates = houseLikeDepartments.filter((item) => (!bookId || item.bookId === bookId)
    && normalize(item.name) === normalize(erp.name));
  const testData = isTestHouse(erp);
  return {
    erp,
    expectedBookId: bookId,
    dataClass: testData ? 'TEST_OR_DEBUG' : 'PRODUCTION_CANDIDATE',
    matchStatus: testData ? 'EXCLUDE_TEST_DATA'
      : candidates.length === 1 ? 'EXACT_PROJECT_CANDIDATE'
        : candidates.length > 1 ? 'AMBIGUOUS_PROJECT'
          : departmentCandidates.length === 1 ? 'FOUND_AS_DEPARTMENT_REQUIRES_MIGRATION'
            : departmentCandidates.length > 1 ? 'AMBIGUOUS_DEPARTMENT'
              : 'MISSING_IN_CHANJET',
    matchBasis: exactCode.length ? 'PROJECT_CODE' : exactName.length ? 'PROJECT_NAME'
      : departmentCandidates.length ? 'DEPARTMENT_NAME' : 'NONE',
    chanjet: candidates,
    chanjetDepartments: departmentCandidates,
  };
});

const report = {
  generatedAt,
  decision: blockers.length ? 'HOLD' : 'READY_FOR_HUMAN_REVIEW',
  writeChanjet: false,
  writeErpBusinessTables: false,
  skipRefresh,
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
  projectCatalog,
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
  '## 好业财现有项目分类证据',
  '',
  table(['账套', '项目编码', '项目名称', '分类编码', '分类名称', '状态'], projectCatalog.map((row) => [
    row.bookId, row.code, row.name, row.projectCategoryCode, row.projectCategoryName, `${row.productionState}/${row.raw}`,
  ])),
  '',
  '## ERP ↔ 好业财映射候选',
  '',
  table(['ERP编码', 'ERP名称', '场区', '数据分类', '目标账套', '匹配状态', '匹配依据', '好业财对象'], mappings.map((row) => [
    row.erp.code, row.erp.name, row.erp.farmCode, row.dataClass, row.expectedBookId, row.matchStatus, row.matchBasis,
    [...row.chanjet, ...row.chanjetDepartments].map((item) => `${item.code}:${item.name}`).join('; '),
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
