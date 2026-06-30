#!/usr/bin/env node
/**
 * i18n 键门禁（g-i18n）
 *  1) 三语 locale 键必须完全平齐（zh == en == lo）
 *  2) 代码中所有字面量 t('key' ...) 引用的键必须在三语 locale 都存在
 * 任一不满足 → 退出码 1（CI 红灯），防止国际化回潮。
 *
 * 用法：node scripts/check-i18n-keys.js
 */
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'apps', 'web');
const LOC = path.join(WEB, 'src', 'locales');
const SRC = path.join(WEB, 'src');

const load = (l) => JSON.parse(fs.readFileSync(path.join(LOC, `${l}.json`), 'utf8'));
const zh = load('zh'), en = load('en'), lo = load('lo');
const zk = new Set(Object.keys(zh)), ek = new Set(Object.keys(en)), lk = new Set(Object.keys(lo));

let fail = 0;
const diff = (a, b, an, bn) => {
  const miss = [...a].filter((k) => !b.has(k));
  if (miss.length) {
    fail = 1;
    console.error(`❌ ${miss.length} 键在 ${an} 有但 ${bn} 缺：`, miss.slice(0, 15));
  }
};
diff(zk, ek, 'zh', 'en'); diff(zk, lk, 'zh', 'lo');
diff(ek, zk, 'en', 'zh'); diff(lk, zk, 'lo', 'zh');

// 收集代码里字面量 t('key' / 别名 tr/tt/tFn('key')（agents 为避 t 影子常用别名）。
//   仅登记「带命名空间点」的键（ui./common./dict. 等），避免误捕无关的 tr()/tt() 调用。
const pat = /\b(?:t|tr|tt|tFn)\(\s*(['"])(.*?)\1/g;
const KEYISH = /^[A-Za-z][\w-]*\./;
const referenced = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(p); }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8'); let m;
      while ((m = pat.exec(s))) { if (m[2] && KEYISH.test(m[2])) referenced.add(m[2]); }
    }
  }
};
walk(SRC);

const missZh = [...referenced].filter((k) => !zk.has(k));
if (missZh.length) {
  fail = 1;
  console.error(`❌ ${missZh.length} 个 t() 引用的键在 locale 缺失：`, missZh.slice(0, 20));
}

if (!fail) {
  console.log(`✅ i18n 键门禁通过：三语各 ${zk.size} 键平齐；${referenced.size} 个 t() 引用键全部命中。`);
}
process.exit(fail);
