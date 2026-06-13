#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 * 畅捷通好业财 · 只读连通性探针（P1 打样）
 * ────────────────────────────────────────────────────────────────────────
 * 目的：用真实凭据跑通「换 access_token → 遍历账套 → 拉一个银行账户列表」，
 *       打印原始 JSON，用返回结构反推后续 P2 暂存表/映射表设计。
 *
 * 只读、独立脚本——不进 NestJS 主代码，不写 Phoenix 库，不写用友平台。
 *
 * 运行：
 *   node scripts/yonyou-probe.mjs                 # 默认拉银行账户
 *   node scripts/yonyou-probe.mjs accountsets     # 只列账套
 *   node scripts/yonyou-probe.mjs bank            # 银行账户
 *   node scripts/yonyou-probe.mjs customers       # 客户
 *   node scripts/yonyou-probe.mjs suppliers       # 供应商
 *   node scripts/yonyou-probe.mjs accounts        # 会计科目
 *   node scripts/yonyou-probe.mjs staff           # 职员
 *
 * 凭据读 apps/api/.env（已 gitignore，严禁贴聊天/进仓库）：
 *   CHANJET_BASE_URL=https://...        # 开放平台 API 域名（应用详情/文档中心可查）
 *   CHANJET_APP_KEY=xxxx
 *   CHANJET_APP_SECRET=xxxx
 *   CHANJET_ORG_IDS=orgId1,orgId2,orgId3   # 三个账套的 orgId（委托后可得）
 *   # 可选：若你已手握 access_token，先填这个跳过换取逻辑做最小验证
 *   CHANJET_ACCESS_TOKEN=
 *
 * ⚠️ 标了 TODO(接口清单) 的常量/路径，等你发来「已订阅接口清单」后据实填写，
 *    现在留占位，避免凭记忆瞎写真实接口路径。
 * ════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH   = resolve(__dirname, '../apps/api/.env');
const TOKEN_CACHE = resolve(__dirname, '.yonyou-token.json'); // gitignore: scripts/.yonyou-*.json

// ── 极简 .env 加载（无依赖）─────────────────────────────────────────────
function loadEnv(path) {
  if (!existsSync(path)) {
    console.error(`✗ 找不到 ${path}——请在 apps/api/.env 填好畅捷通凭据后重试`);
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim();
  }
  return env;
}

const env = loadEnv(ENV_PATH);
const CFG = {
  baseUrl:   env.CHANJET_BASE_URL   || '',
  appKey:    env.CHANJET_APP_KEY    || '',
  appSecret: env.CHANJET_APP_SECRET || '',
  orgIds:   (env.CHANJET_ORG_IDS    || '').split(',').map(s => s.trim()).filter(Boolean),
  presetToken: env.CHANJET_ACCESS_TOKEN || '',
};

function requireCfg(keys) {
  const missing = keys.filter(k => !CFG[k] || (Array.isArray(CFG[k]) && !CFG[k].length));
  if (missing.length) {
    console.error(`✗ apps/api/.env 缺少：${missing.map(k => 'CHANJET_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase()).join(', ')}`);
    console.error('  （先填 BASE_URL / APP_KEY / APP_SECRET / ORG_IDS）');
    process.exit(1);
  }
}

// ── access_token：缓存 + 自动刷新（短期有效，约2h，绝不写死）──────────────
async function getAccessToken() {
  // 0) 若 .env 直接给了 token，先用它做最小验证（会过期，仅打样用）
  if (CFG.presetToken) return CFG.presetToken;

  // 1) 命中未过期缓存则复用
  if (existsSync(TOKEN_CACHE)) {
    try {
      const c = JSON.parse(readFileSync(TOKEN_CACHE, 'utf8'));
      if (c.access_token && c.expires_at && Date.now() < c.expires_at - 60_000) {
        return c.access_token;
      }
    } catch { /* ignore，重新换取 */ }
  }

  requireCfg(['baseUrl', 'appKey', 'appSecret']);

  // 2) 用 appKey + appSecret 换 access_token
  // TODO(接口清单)：填实畅捷通好业财「获取 access_token」的真实 endpoint / 参数 / 签名。
  //   自建应用常见形态（待以应用详情/文档中心校准）：
  //     GET  {baseUrl}/auth/getAccessToken?appKey=..&appSecret=..
  //     或   POST {baseUrl}/openapi/oauth/token  body: {grant_type, appKey, appSecret}
  //   返回里取 access_token + expires_in(秒)。
  const TOKEN_ENDPOINT = `${CFG.baseUrl}/__TODO_token_endpoint__`;
  console.warn('⚠️  token endpoint 尚未填实（TODO接口清单）——下面这次调用预计会失败，属正常占位。');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'GET',
    // TODO(接口清单)：按真实签名方式补 header / query / body
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  console.log('—— token 换取原始返回 ——\n', JSON.stringify(json, null, 2));

  const token   = json.access_token || json.data?.access_token;
  const expires = json.expires_in   || json.data?.expires_in || 7200; // 秒
  if (!token) {
    console.error('✗ 未取到 access_token——把上面的原始返回贴给我，我据此填实换取逻辑。');
    process.exit(1);
  }
  writeFileSync(TOKEN_CACHE, JSON.stringify({
    access_token: token,
    expires_at: Date.now() + Number(expires) * 1000,
  }, null, 2));
  return token;
}

// ── 通用调用（GET）──────────────────────────────────────────────────────
async function call(path, { orgId, query = {} } = {}) {
  const token = await getAccessToken();
  const qs = new URLSearchParams({ ...query });
  // TODO(接口清单)：账套标识参数名以真实接口为准（orgId / ts / accountSetId ...）
  if (orgId) qs.set('orgId', orgId);
  const url = `${CFG.baseUrl}${path}?${qs.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      // TODO(接口清单)：token 传递方式以真实接口为准（header Bearer / access_token query / 签名头）
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { httpStatus: res.status, raw: text }; }
  return { status: res.status, json };
}

// ── 接口目录（路径待填实）────────────────────────────────────────────────
// TODO(接口清单)：以下路径全部为占位，等「已订阅接口清单」到位后逐条替换为真实路径。
const ENDPOINTS = {
  accountsets: '/__TODO__/accountsets',     // 账套列表
  bank:        '/__TODO__/bankAccount/list',// 基础档案-资金账户(银行账户)
  customers:   '/__TODO__/customer/list',   // 客户
  suppliers:   '/__TODO__/supplier/list',   // 供应商
  accounts:    '/__TODO__/glAccount/list',  // 会计科目
  staff:       '/__TODO__/staff/list',      // 职员
};

async function probeEntity(kind) {
  const path = ENDPOINTS[kind];
  if (!path) { console.error(`✗ 未知实体：${kind}`); process.exit(1); }

  // 账套列表通常不按 orgId 维度；其余逐账套拉
  if (kind === 'accountsets') {
    const { status, json } = await call(path);
    console.log(`\n══ 账套列表 (HTTP ${status}) ══\n`, JSON.stringify(json, null, 2));
    return;
  }

  requireCfg(['orgIds']);
  for (const orgId of CFG.orgIds) {
    console.log(`\n══ ${kind} @ 账套 ${orgId} ══`);
    // TODO(接口清单)：分页参数名以真实接口为准（pageIndex/pageSize 或 page/limit）
    const { status, json } = await call(path, { orgId, query: { pageIndex: 1, pageSize: 20 } });
    console.log(`HTTP ${status}\n`, JSON.stringify(json, null, 2));
  }
}

// ── main ────────────────────────────────────────────────────────────────
const kind = process.argv[2] || 'bank';
console.log('畅捷通好业财 只读探针 · 目标实体:', kind);
console.log('BASE_URL:', CFG.baseUrl || '(未填)', '| 账套数:', CFG.orgIds.length, '| 预置token:', CFG.presetToken ? '有' : '无');
probeEntity(kind).catch(e => { console.error('✗ 异常：', e); process.exit(1); });
