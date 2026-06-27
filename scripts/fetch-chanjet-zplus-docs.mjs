#!/usr/bin/env node
/**
 * 抓好业财(zplus) 全部 639 接口 markdown 文档 → scripts/.chanjet-doc-dump/zplus/
 *
 * 数据源:open.chanjet.com 官方 AI Friendly Protocol(/llms.txt 公告)
 *   - manifest: /md/docs-manifest.json (全站 2247 文档)
 *   - 单接口 markdown: /md/docs/file/apiFile/zplus/.../id=NNNNN
 *
 * 并发限速 8,失败重试 1 次,跳过已存在文件(增量)。
 * 输出文件名:<id>__<safe-title>.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '.chanjet-doc-dump/zplus');
const MANIFEST = resolve(__dirname, '.chanjet-doc-dump/docs-manifest.json');

mkdirSync(OUT_DIR, { recursive: true });

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const zplus = manifest.documents.filter(d =>
  d.md_url && /\/zplus\//.test(d.md_url) && d.type === 'api'
);

console.log(`📦 manifest 里 zplus type=api 接口数:${zplus.length}`);

const sanitize = s => s.replace(/[/\\?%*:|"<>\s]+/g, '_').slice(0, 80);
const fileFor = d => resolve(OUT_DIR, `${d.id}__${sanitize(d.title)}.md`);

// 跳过已存在(增量)
const existing = new Set(readdirSync(OUT_DIR));
const todo = zplus.filter(d => {
  const fname = `${d.id}__${sanitize(d.title)}.md`;
  return !existing.has(fname);
});
console.log(`📊 已抓 ${existing.size},待抓 ${todo.length}`);

if (todo.length === 0) { console.log('✅ 全部已抓'); process.exit(0); }

let done = 0, ok = 0, fail = 0;
const CONCURRENCY = 8;

async function fetchOne(d, retry = 1) {
  try {
    const res = await fetch(d.md_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; phoenix-erp-doc-fetcher/g199)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    // 前置 frontmatter
    const header = `<!-- AUTO-FETCHED from ${d.md_url}\n     title: ${d.title}\n     id: ${d.id}\n     fetched_at: ${new Date().toISOString()}\n-->\n\n`;
    writeFileSync(fileFor(d), header + md);
    ok++;
  } catch (e) {
    if (retry > 0) {
      await new Promise(r => setTimeout(r, 800));
      return fetchOne(d, retry - 1);
    }
    fail++;
    console.error(`  ✗ ${d.id} ${d.title.slice(0,40)} → ${e.message}`);
  } finally {
    done++;
    if (done % 50 === 0) console.log(`  📥 ${done}/${todo.length} ok=${ok} fail=${fail}`);
  }
}

// 简单并发池
async function pool() {
  const queue = [...todo];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const d = queue.shift();
      await fetchOne(d);
    }
  });
  await Promise.all(workers);
}

await pool();
console.log(`\n✅ 完成 done=${done} ok=${ok} fail=${fail}`);
console.log(`📁 输出:${OUT_DIR}`);
