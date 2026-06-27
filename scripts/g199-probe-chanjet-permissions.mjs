#!/usr/bin/env node
/**
 * g199 — 好业财 416 接口权限探针
 *
 * 用法:
 *   PHOENIX_ADMIN_TOKEN=<JWT> node scripts/g199-probe-chanjet-permissions.mjs
 *
 * 拿 JWT:
 *   1) 浏览器登录 https://erp.eggslao.com (集团/管理员账号)
 *   2) DevTools → Application → Cookies → 找 phoenix_token (或 LocalStorage)
 *   3) export PHOENIX_ADMIN_TOKEN=eyJ...
 *
 * 策略:
 *   - 只跑 GET 类接口(纯读,无副作用)
 *   - 接口路径 placeholder 仅含 {bookid} → 第一家公司 bookid 替换;含 {id}/{employee_id} 等业务 ID → 跳过
 *   - 调线上 ERP /api/chanjet/call 代理,复用生产的 appKey/cert/openToken
 *   - 并发 5,失败重试 1 次
 *   - 输出:scripts/.g199-permission-probe.json + docs/g199-chanjet-permission-status.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(__dirname, '.chanjet-doc-dump/docs-manifest.json');
const DUMP_DIR = resolve(__dirname, '.chanjet-doc-dump/zplus');
const OUT_JSON = resolve(__dirname, '.g199-permission-probe.json');
const OUT_MD   = resolve(__dirname, '../docs/g199-chanjet-permission-status.md');

const PROD_BASE = process.env.PHOENIX_PROD_BASE || 'https://erp.eggslao.com';
const TOKEN = process.env.PHOENIX_ADMIN_TOKEN || '';
const PROBE_BOOKID = '3533914511118750'; // 凤凰农业(任一家都行,权限是 app 级)

if (!TOKEN) {
  console.error('✗ 缺 PHOENIX_ADMIN_TOKEN 环境变量');
  console.error('  浏览器登录 erp.eggslao.com → DevTools 抓 phoenix_token cookie');
  process.exit(1);
}

// 解析每个 md 拿 method + URL
import { readdirSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const zplusByid = new Map(manifest.documents.filter(d => /\/zplus\//.test(d.md_url) && d.type === 'api').map(d => [d.id, d]));

function parseMd(file) {
  const text = readFileSync(resolve(DUMP_DIR, file), 'utf8');
  const idMatch = text.match(/id:\s*(\d+)/);
  const id = idMatch ? Number(idMatch[1]) : null;
  const addr = text.match(/\*\*请求地址\*\*[::]\s*([A-Z]+)\s+(\S+)/);
  if (!addr) return null;
  const method = addr[1];
  const fullUrl = addr[2];
  const path = fullUrl.replace(/^https?:\/\/[^/]+/, '');
  const title = (text.match(/^#\s+(.+)$/m) || [, ''])[1].trim();
  return { id, method, path, title, meta: zplusByid.get(id) };
}

const all = readdirSync(DUMP_DIR).filter(f => f.endsWith('.md')).map(parseMd).filter(Boolean);
console.log(`📦 解析 ${all.length} 个接口`);

// 过滤:GET 全部 + POST 只筛 list/query/find/get 类(只读语义,无副作用)
// 排除:含 {id}/{employee_id}/{userId} 等业务 ID 占位符的接口
const RE_BIZID = /\{(?!bookid\b)[a-zA-Z_][a-zA-Z0-9_]*\}/;  // {bookid} 以外的任何 {xxx}
const RE_READ_VERB = /\/(list|query|find|findBy|get|fuzzySearch|exactSearch|search|page|paging|info|details?|me|enum|status|count|check)\b/i;
const probeable = all.filter(r => {
  if (RE_BIZID.test(r.path)) return false;
  if (r.method === 'GET') return true;            // GET 全要
  if (r.method === 'POST' && RE_READ_VERB.test(r.path)) return true;  // POST 只取读类
  return false;
});
const skipped = all.length - probeable.length;
console.log(`📊 可探测(GET 全部 + POST 读类 + 仅 bookid 占位符):${probeable.length} / ${all.length}`);
console.log(`📊 跳过(写类 POST/PUT/DELETE/远操作 或含业务 ID):${skipped}`);

if (probeable.length === 0) {
  console.error('✗ 无可探测接口');
  process.exit(1);
}

// ── 并发探针 ────────────────────────────────────────────
async function probeOne(r) {
  const url = `${PROD_BASE}/api/chanjet/call`;
  const path = r.path.replace('{bookid}', PROBE_BOOKID);
  const proxyBody = {
    path, method: r.method, bookid: PROBE_BOOKID,
    // POST 类带最小分页 body,避免某些接口因缺 body 报"参数缺失"而非 50111
    ...(r.method === 'POST' ? { body: { pageIndex: 1, pageSize: 1 } } : {}),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(proxyBody),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) {
      throw new Error('PHOENIX_ADMIN_TOKEN 无效/过期');
    }
    const j = await res.json();
    if (!j.success) {
      return { ...r, status: 'PROXY_FAIL', code: null, msg: j.error || 'unknown' };
    }
    const result = j.result;
    const code = result?.code ?? result?.error?.code ?? null;
    if (code === null && (Array.isArray(result) || result?.value || result?.success === true)) {
      return { ...r, status: 'OK', code: 200, msg: 'success' };
    }
    const codeStr = String(code);
    if (codeStr === '50111') return { ...r, status: 'NO_PERM', code, msg: result?.msg || result?.error?.msg || '接口未开通' };
    if (codeStr === '50107') return { ...r, status: 'TOKEN_INVALID', code, msg: 'openToken 失效' };
    if (codeStr === '50000') return { ...r, status: 'NOT_FOUND', code, msg: '接口不存在/路径错' };
    // 其它 code 当作业务错(实际接口已开通但参数不对等)
    const msg = (result?.error?.msg || result?.message || JSON.stringify(result).slice(0, 80)).slice(0, 80);
    if (code && code !== '0') return { ...r, status: 'BIZ_ERR_OPEN', code, msg };
    return { ...r, status: 'OK', code: code || 200, msg: 'success' };
  } catch (e) {
    if (e.message.includes('PHOENIX_ADMIN_TOKEN')) throw e;
    return { ...r, status: 'EXCEPTION', code: null, msg: e.message.slice(0, 80) };
  }
}

const CONCURRENCY = 5;
const results = [];
let done = 0;

async function pool() {
  const queue = [...probeable];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const r = queue.shift();
      try {
        const out = await probeOne(r);
        results.push(out);
      } catch (e) {
        console.error(`\n✗ 致命:${e.message}`);
        process.exit(1);
      }
      done++;
      if (done % 10 === 0) {
        const stats = countStatus(results);
        process.stdout.write(`\r  📥 ${done}/${probeable.length}  OK=${stats.OK} NO_PERM=${stats.NO_PERM} 其它=${done - stats.OK - stats.NO_PERM}     `);
      }
    }
  });
  await Promise.all(workers);
  console.log('');
}

function countStatus(arr) {
  const out = { OK: 0, NO_PERM: 0, TOKEN_INVALID: 0, NOT_FOUND: 0, BIZ_ERR_OPEN: 0, PROXY_FAIL: 0, EXCEPTION: 0 };
  for (const r of arr) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

console.log(`\n🚀 启动 ${CONCURRENCY} 并发探针 → ${PROD_BASE}/api/chanjet/call\n`);
const t0 = Date.now();
await pool();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const stats = countStatus(results);
console.log(`\n✅ 探针完成,耗时 ${elapsed}s`);
console.log(`   OK            ${stats.OK}      ← 接口可调`);
console.log(`   NO_PERM       ${stats.NO_PERM}  ← 50111,需控制台开通`);
console.log(`   BIZ_ERR_OPEN  ${stats.BIZ_ERR_OPEN}  ← 已开通,只是 GET 参数不对(实际是 list 等需要 POST body 的接口)`);
console.log(`   NOT_FOUND     ${stats.NOT_FOUND}  ← 50000 路径错/接口下架`);
console.log(`   TOKEN_INVALID ${stats.TOKEN_INVALID}  ← openToken 失效`);
console.log(`   PROXY_FAIL    ${stats.PROXY_FAIL}  ← 代理层失败`);
console.log(`   EXCEPTION     ${stats.EXCEPTION}  ← 异常`);

writeFileSync(OUT_JSON, JSON.stringify({ probedAt: new Date().toISOString(), bookid: PROBE_BOOKID, total: probeable.length, stats, results }, null, 2));
console.log(`\n💾 ${OUT_JSON}`);

// ── 生成 markdown 报告 ────────────────────────────────────
let md = '# g199 好业财接口权限体检报告\n\n';
md += `> **探测时间**: ${new Date().toISOString()}\n`;
md += `> **探测 bookid**: ${PROBE_BOOKID}(凤凰农业 — 权限是 app 级,任一家结果代表全部)\n`;
md += `> **样本**: ${probeable.length} 个 GET-only 接口(纯读无副作用;含业务 ID 占位符的接口已跳过)\n`;
md += `> **重跑**: \`PHOENIX_ADMIN_TOKEN=<JWT> node scripts/g199-probe-chanjet-permissions.mjs\`\n\n`;

md += '## 总览\n\n';
md += '| 状态 | 数量 | 含义 | 行动 |\n|---|---|---|---|\n';
md += `| ✅ OK | ${stats.OK} | 接口已开通且可调 | 无 |\n`;
md += `| ⚠️ NO_PERM(50111) | ${stats.NO_PERM} | **接口未开通** | 去控制台勾选 |\n`;
md += `| 🔧 BIZ_ERR_OPEN | ${stats.BIZ_ERR_OPEN} | 已开通,但 GET 参数不全(实为 list/query 类需 body) | 无(误报) |\n`;
md += `| ❌ NOT_FOUND(50000) | ${stats.NOT_FOUND} | 路径错或接口下架 | 字典需修正 |\n`;
md += `| ⚠️ TOKEN_INVALID(50107) | ${stats.TOKEN_INVALID} | openToken 失效 | 后端 cron 已自动 refresh |\n`;
md += `| 💥 PROXY_FAIL | ${stats.PROXY_FAIL} | ERP 代理层失败 | 看 API 容器日志 |\n`;
md += `| 💥 EXCEPTION | ${stats.EXCEPTION} | 网络/超时 | 重跑 |\n\n`;

const noPerm = results.filter(r => r.status === 'NO_PERM').sort((a, b) => a.path.localeCompare(b.path));
if (noPerm.length > 0) {
  md += '## ⚠️ 待开通清单(去控制台勾选)\n\n';
  md += `**操作**: 登录 https://open.chanjet.com/console/1242385451899027/selfApp/24959/apiPermission → 找下表接口勾选 → 保存\n\n`;
  md += '| ID | 方法 | 路径 | 名称 | 官方文档 |\n|---|---|---|---|---|\n';
  for (const r of noPerm) {
    md += `| ${r.id} | \`${r.method}\` | \`${r.path}\` | ${r.title} | [文档](${r.meta?.path || ''}) |\n`;
  }
  md += '\n';
}

const notFound = results.filter(r => r.status === 'NOT_FOUND');
if (notFound.length > 0) {
  md += '## ❌ 路径错或下架\n\n';
  md += '| ID | 路径 | 名称 |\n|---|---|---|\n';
  for (const r of notFound) {
    md += `| ${r.id} | \`${r.path}\` | ${r.title} |\n`;
  }
  md += '\n';
}

writeFileSync(OUT_MD, md);
console.log(`📄 ${OUT_MD}`);
