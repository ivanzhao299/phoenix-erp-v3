#!/usr/bin/env node
/**
 * g199 — 好业财应收接口字段探针（双模式）
 *
 * 用途：拉好业财应收/部门/客户/科目接口的真实样本到 scripts/.g199-samples/*.json，
 *      用于锁定 docs/g199-chanjet-api-field-mapping.md 字段对照表。
 *
 * 模式 A（本地）：用 apps/api/.env 的 CHANJET_* 直接 generateToken → callApi
 *   - 前提：.env 必须有 CHANJET_APP_TICKET（生产容器里有，本地一般无 → 模式 B）
 *
 * 模式 B（线上代理）：通过 https://erp.eggslao.com/api/chanjet/call 让线上 ERP 代调
 *   - 前提：环境变量 PHOENIX_ADMIN_TOKEN 是有效的管理员 JWT
 *   - 优点：复用线上鉴权链（appTicket/cert/token 全在生产），本机无需密钥
 *
 * 用法：
 *   node scripts/g199-chanjet-probe.mjs                      # 默认：ar(应收总账) + dept + cust + book
 *   node scripts/g199-chanjet-probe.mjs ar 202605            # 单指定接口
 *   PHOENIX_ADMIN_TOKEN=eyJ... node scripts/g199-chanjet-probe.mjs   # 强制走线上代理
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../apps/api/.env');
const OUT_DIR  = resolve(__dirname, '.g199-samples');
const TOKEN_CACHE = resolve(__dirname, '.g199-chanjet-token.json');

const PROD_BASE = process.env.PHOENIX_PROD_BASE || 'https://erp.eggslao.com';
const PROD_TOKEN = process.env.PHOENIX_ADMIN_TOKEN || '';

const BOOKS = [
  { bookid: '3533914511118750', companyCode: 'COMP-LAO-AGRI',    name: '凤凰农业' },
  { bookid: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', name: '星驰农业' },
  { bookid: '3539743721526654', companyCode: 'COMP-LAO-FOOD',    name: '凤凰食品' },
];

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim();
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const CFG = {
  appKey:    env.CHANJET_APP_KEY    || '',
  appSecret: env.CHANJET_APP_SECRET || '',
  orgId:     env.CHANJET_ORG_ID     || '',
  cert:      env.CHANJET_CERT       || '',
  ticket:    env.CHANJET_APP_TICKET || '',
};

function ensureOut() {
  mkdirSync(OUT_DIR, { recursive: true });
}

function save(name, data) {
  ensureOut();
  const file = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  💾 ${file}`);
}

// ── 模式 A：本地直连好业财 ────────────────────────────────────────────────
async function localToken() {
  if (existsSync(TOKEN_CACHE)) {
    try {
      const c = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
      if (c.openToken && c.expiresAt && Date.now() < c.expiresAt - 60_000) return c.openToken;
    } catch { /* refetch */ }
  }
  if (!CFG.ticket || !CFG.cert) {
    throw new Error('本地缺 CHANJET_APP_TICKET 或 CHANJET_CERT(容器内存,本地一般无)。改走 PHOENIX_ADMIN_TOKEN 线上代理。');
  }
  const res = await fetch('https://openapi.chanjet.com/v1/common/auth/selfBuiltApp/generateToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', appKey: CFG.appKey, appSecret: CFG.appSecret },
    body: JSON.stringify({ appTicket: CFG.ticket, certificate: CFG.cert }),
  });
  const j = await res.json();
  const tok = j?.value?.accessToken;
  if (!tok) throw new Error(`generateToken 失败: ${JSON.stringify(j).slice(0, 300)}`);
  const exp = Number(j?.value?.expiresIn || 7200);
  writeFileSync(TOKEN_CACHE, JSON.stringify({ openToken: tok, expiresAt: Date.now() + exp * 1000 }));
  return tok;
}

async function callLocal(path, { method = 'GET', query = {}, body } = {}) {
  const token = await localToken();
  let url = `https://openapi.chanjet.com${path}`;
  if (Object.keys(query).length) url += `?${new URLSearchParams(query).toString()}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', appKey: CFG.appKey, appSecret: CFG.appSecret, openToken: token },
    ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}),
  });
  return res.json();
}

// ── 模式 B：线上 ERP 代理 ────────────────────────────────────────────────
async function callProd(path, { method = 'GET', query = {}, body, bookid } = {}) {
  if (!PROD_TOKEN) throw new Error('PHOENIX_ADMIN_TOKEN 未设置');
  const url = `${PROD_BASE}/api/chanjet/call`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROD_TOKEN}` },
    body: JSON.stringify({ path, method, query, body, bookid }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`代理失败 ${path}: ${j.error || JSON.stringify(j).slice(0, 200)}`);
  return j.result;
}

async function call(path, opts) {
  // 优先线上代理(更稳),无 token 才回退本地
  if (PROD_TOKEN) return callProd(path, opts);
  return callLocal(path, opts);
}

// ── 探针 ─────────────────────────────────────────────────────────────────
async function probeBookList() {
  console.log('\n═══ 1. 账套列表 (findByEnterpriseId) ═══');
  const r = await call('/accounting/openapi/cc/book/findByEnterpriseId', {
    method: 'GET', query: { queryType: 'BINDING_TO_THIRD_PLATFORM' },
  });
  save('01-book-list', r);
  return r;
}

async function probeArStatistics(period = '202605') {
  console.log(`\n═══ 2. 应收总账 (gl/statistics/receive) period=${period} ═══`);
  const out = {};
  for (const b of BOOKS) {
    console.log(`  → ${b.name} ${b.bookid}`);
    try {
      const r = await call(`/accounting/gl/statistics/receive/${b.bookid}`, {
        method: 'GET', query: { period },
      });
      out[b.companyCode] = r;
      // 字段 sniffing:取首行所有 keys,便于人工对照
      if (Array.isArray(r) && r.length) {
        console.log(`     字段 keys: ${Object.keys(r[0]).join(', ')}`);
      } else if (Array.isArray(r?.value) && r.value.length) {
        console.log(`     value[0] keys: ${Object.keys(r.value[0]).join(', ')}`);
      } else {
        console.log(`     返回非数组,原始: ${JSON.stringify(r).slice(0, 300)}`);
      }
    } catch (e) {
      out[b.companyCode] = { error: e.message };
      console.log(`     ✗ ${e.message}`);
    }
  }
  save(`02-ar-statistics-${period}`, out);
  return out;
}

async function probeDepartments() {
  console.log('\n═══ 3. 部门列表 (department/list) ═══');
  const out = {};
  for (const b of BOOKS) {
    console.log(`  → ${b.name} ${b.bookid}`);
    try {
      const r = await call(`/accounting/openapi/cc/department/list/${b.bookid}`, { method: 'GET' });
      out[b.companyCode] = r;
      const arr = Array.isArray(r) ? r : (Array.isArray(r?.value) ? r.value : (Array.isArray(r?.result) ? r.result : []));
      if (arr.length) console.log(`     ${arr.length} 行,首行 keys: ${Object.keys(arr[0]).join(', ')}`);
      else console.log(`     原始: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) { out[b.companyCode] = { error: e.message }; console.log(`     ✗ ${e.message}`); }
  }
  save('03-departments', out);
  return out;
}

async function probeCustomers() {
  console.log('\n═══ 4. 往来单位 (party/custvendor/query) ═══');
  const out = {};
  for (const b of BOOKS) {
    console.log(`  → ${b.name} ${b.bookid}`);
    try {
      const r = await call(`/accounting/openapi/cc/party/custvendor/query/${b.bookid}`, {
        method: 'POST', body: { pageIndex: 1, pageSize: 5 },
      });
      out[b.companyCode] = r;
      const arr = Array.isArray(r?.value) ? r.value : (Array.isArray(r?.result) ? r.result : (Array.isArray(r) ? r : []));
      if (arr.length) console.log(`     首行 keys: ${Object.keys(arr[0]).join(', ')}`);
      else console.log(`     原始: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) { out[b.companyCode] = { error: e.message }; console.log(`     ✗ ${e.message}`); }
  }
  save('04-customers', out);
  return out;
}

async function probeSubjects() {
  console.log('\n═══ 5. 科目列表 (subject/list) ═══');
  const out = {};
  for (const b of BOOKS) {
    console.log(`  → ${b.name} ${b.bookid}`);
    try {
      const r = await call(`/accounting/openapi/cc/subject/list/${b.bookid}`, { method: 'GET' });
      out[b.companyCode] = r;
      const arr = Array.isArray(r) ? r : (Array.isArray(r?.value) ? r.value : []);
      if (arr.length) console.log(`     ${arr.length} 行,首行 keys: ${Object.keys(arr[0]).join(', ')}`);
      else console.log(`     原始: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) { out[b.companyCode] = { error: e.message }; console.log(`     ✗ ${e.message}`); }
  }
  save('05-subjects', out);
  return out;
}

const PROBES = {
  all:   async () => { await probeBookList(); await probeArStatistics(process.argv[3] || '202605'); await probeDepartments(); await probeCustomers(); await probeSubjects(); },
  book:  () => probeBookList(),
  ar:    () => probeArStatistics(process.argv[3] || '202605'),
  dept:  () => probeDepartments(),
  cust:  () => probeCustomers(),
  subj:  () => probeSubjects(),
};

// ── main ─────────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'all';
const fn = PROBES[cmd];
if (!fn) {
  console.error(`✗ 未知命令: ${cmd}\n  可用: ${Object.keys(PROBES).join(', ')}`);
  process.exit(1);
}

console.log(`模式: ${PROD_TOKEN ? '线上代理 (PHOENIX_ADMIN_TOKEN)' : '本地直连 (.env)'}`);
console.log(`输出: ${OUT_DIR}\n`);

fn()
  .then(() => console.log('\n✓ 完成。下一步:逐文件比对字段,填进 docs/g199-chanjet-api-field-mapping.md'))
  .catch(e => { console.error('\n✗ 异常:', e.message || e); process.exit(1); });
