#!/usr/bin/env node
/**
 * 畅捷通好业财 · 探针 v2
 *
 * 用法：
 *   node scripts/chanjet-probe.mjs              # 用已有证书获取 token
 *   node scripts/chanjet-probe.mjs diag         # 打印配置诊断
 *   node scripts/chanjet-probe.mjs accounts     # 会计科目
 *   node scripts/chanjet-probe.mjs customers    # 客户
 *   node scripts/chanjet-probe.mjs suppliers     # 供应商
 *   node scripts/chanjet-probe.mjs inventory     # 存货
 *   node scripts/chanjet-probe.mjs voucher       # 凭证
 *   node scripts/chanjet-probe.mjs discover      # 批量端点探测
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../apps/api/.env');
const TOKEN_CACHE = resolve(__dirname, '.chanjet-token-v2.json');

function loadEnv(path) {
  if (!existsSync(path)) { console.error(`✗ 找不到 ${path}`); process.exit(1); }
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
  orgId:     env.CHANJET_ORG_ID    || '',
  cert:      env.CHANJET_CERT      || '',
};

const BASE = 'https://openapi.chanjet.com';

// ── 获取 openToken ──────────────────────────────────────────
async function getToken() {
  if (existsSync(TOKEN_CACHE)) {
    try {
      const c = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
      if (c.openToken && c.expiresAt && Date.now() < c.expiresAt - 60_000) {
        console.log(`♻️  复用缓存 token（过期 ${new Date(c.expiresAt).toLocaleString('zh-CN')}）`);
        return c.openToken;
      }
    } catch { /* 重新获取 */ }
  }

  if (!CFG.cert) {
    console.error('✗ CHANJET_CERT 为空，无法获取 token');
    console.error('  需要先通过控制台授权软证书，或等 appTicket 回调获取 certificate');
    process.exit(1);
  }

  if (!env.CHANJET_APP_TICKET) {
    console.error('✗ 无 appTicket（需 .env 加 CHANJET_APP_TICKET 或先跑回调收到推送）');
    console.error('  1. 部署 webhook → 2. 控制台填消息接收地址 → 3. 触发 appTicket → 4. 重试');
    process.exit(1);
  }

  console.log('🔑 POST /v1/common/auth/selfBuiltApp/generateToken ...');
  const body = {
    appTicket: env.CHANJET_APP_TICKET,
    certificate: CFG.cert,
  };

  const res = await fetch(`${BASE}/v1/common/auth/selfBuiltApp/generateToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appKey: CFG.appKey,
      appSecret: CFG.appSecret,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`   HTTP ${res.status}`);
  console.log('   响应:', JSON.stringify(json, null, 2).slice(0, 600));

  const r = json.value || json.result || json.data || json;
  const openToken = r?.accessToken || r?.openToken || r?.access_token;
  if (!openToken) {
    console.error('\n✗ 获取 token 失败');
    process.exit(1);
  }

  const expiresIn = r?.expiresIn || r?.expires_in || 7200;
  writeFileSync(TOKEN_CACHE, JSON.stringify({
    openToken,
    expiresAt: Date.now() + Number(expiresIn) * 1000,
  }, null, 2));
  console.log(`\n✓ openToken 已获取，有效 ${expiresIn}s`);
  return openToken;
}

// ── 调用好业财 API ──────────────────────────────────────────
async function callApi(module, action, body = {}) {
  const token = await getToken();
  const url = `${BASE}/tplus/api/v2/${module}/${action}`;
  console.log(`\n📡 POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appKey: CFG.appKey,
      appSecret: CFG.appSecret,
      openToken: token,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log(`   HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  return json;
}

// ── 命令 ────────────────────────────────────────────────────
const CMDS = {
  async token() {
    console.log('\n═══ 获取 openToken ═══\n');
    console.log(`  AppKey:   ${CFG.appKey}`);
    console.log(`  OrgId:    ${CFG.orgId}`);
    console.log(`  Cert:     ${CFG.cert ? CFG.cert.slice(0, 30) + '…' : '(空)'}\n`);
    const t = await getToken();
    console.log(`\n  Token: ${t.slice(0, 40)}…`);
  },

  async diag() {
    console.log('\n═══ 配置诊断 ═══\n');
    console.log(`  CHANJET_APP_KEY:    ${CFG.appKey || '❌ 空'}`);
    console.log(`  CHANJET_APP_SECRET: ${CFG.appSecret ? CFG.appSecret.slice(0, 8) + '…' : '❌ 空'}`);
    console.log(`  CHANJET_ORG_ID:     ${CFG.orgId || '❌ 空'}`);
    console.log(`  CHANJET_CERT:       ${CFG.cert ? '✅ ' + CFG.cert.slice(0, 30) + '…' : '❌ 空'}`);
    console.log(`  CHANJET_MSG_SECRET: ${env.CHANJET_MSG_SECRET ? '✅ 已配置' : '⚠️  未配置（可选）'}`);
    console.log(`\n  Token 缓存: ${existsSync(TOKEN_CACHE) ? '✅ 存在' : '— 无'}`);
    console.log(`\n  回调地址: https://erp.eggslao.com/api/chanjet/callback`);
    console.log('  API 域名: https://openapi.chanjet.com');
    console.log('  好业财 API: POST /tplus/api/v2/{Module}/{Action}');
  },

  async accounts()  { await callApi('Account', 'Query', { pageIndex: 1, pageSize: 5 }); },
  async customers() { await callApi('Customer', 'Query', { pageIndex: 1, pageSize: 5 }); },
  async suppliers() { await callApi('Supplier', 'Query', { pageIndex: 1, pageSize: 5 }); },
  async inventory() { await callApi('Inventory', 'Query', { pageIndex: 1, pageSize: 5 }); },
  async voucher()   { await callApi('Voucher', 'Query', { pageIndex: 1, pageSize: 3 }); },

  async discover() {
    console.log('\n═══ 批量端点探测 ═══\n');
    const token = await getToken();
    const endpoints = [
      '/tplus/api/v2/Account/Query',
      '/tplus/api/v2/Customer/Query',
      '/tplus/api/v2/Supplier/Query',
      '/tplus/api/v2/Inventory/Query',
      '/tplus/api/v2/Voucher/Query',
      '/tplus/api/v2/Department/Query',
      '/tplus/api/v2/Project/Query',
      '/tplus/api/v2/Bank/Query',
      '/tplus/api/v2/Warehouse/Query',
      '/tplus/api/v2/CashFlow/Query',
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(BASE + ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            appKey: CFG.appKey,
            appSecret: CFG.appSecret,
            openToken: token,
          },
          body: JSON.stringify({ pageIndex: 1, pageSize: 1 }),
        });
        const text = await res.text();
        const icon = res.status === 200 ? '✅' : '⚠️';
        console.log(`${icon} [${res.status}] ${ep}`);
        if (res.status !== 404) console.log(`   ${text.slice(0, 150)}\n`);
      } catch (e) {
        console.log(`❌ ${ep} → ${e.message}`);
      }
    }
  },
};

const cmd = process.argv[2] || 'token';
const fn = CMDS[cmd];
if (!fn) {
  console.error(`✗ 未知命令: ${cmd}\n  可用: ${Object.keys(CMDS).join(', ')}`);
  process.exit(1);
}
fn().catch(e => { console.error('✗', e.message || e); process.exit(1); });
