/* 构建期给 service worker 盖一个唯一版本号，确保每次部署 sw.js 内容都变 →
   浏览器/PWA 能检测到 SW 更新 → sw-init.js 触发一次性刷新 → 用户拿到新前端，
   不再"部署了但手机端还是旧代码"。失败不阻断构建。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const swPath = join(here, '..', 'public', 'sw.js');

try {
  const id = (process.env.GITHUB_SHA || '').slice(0, 8) || String(Date.now());
  const src = readFileSync(swPath, 'utf8');
  const next = src.replace(/const VERSION = '[^']*';/, `const VERSION = 'phoenix-v3-sw-${id}';`);
  if (next !== src) {
    writeFileSync(swPath, next);
    console.log(`[stamp-sw] VERSION → phoenix-v3-sw-${id}`);
  } else {
    console.warn('[stamp-sw] VERSION 模式未匹配，跳过（不影响构建）');
  }
} catch (e) {
  console.warn('[stamp-sw] 跳过：', e && e.message);
}
