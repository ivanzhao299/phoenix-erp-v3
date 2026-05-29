/* eslint-disable */
// ═══════════════════════════════════════════════════════════════
//  Phoenix ERP V3 — Service Worker
//  策略：
//    - install: skipWaiting, precache /offline 与基础静态
//    - activate: 清理旧缓存，立即接管
//    - fetch:
//        GET /api/*       → network-first，失败时回退 cached JSON（如有）
//        GET 同源静态     → stale-while-revalidate
//        GET 导航请求     → network-first，失败时回 /offline
//        非 GET / 跨源    → 透传，不缓存
//  设计原则：永不缓存敏感 GET（带 Authorization 头的 API 不写缓存）
// ═══════════════════════════════════════════════════════════════
const VERSION = 'phoenix-v3-sw-v5';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/manifest.json',
  '/favicon.ico',
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── 工具：判断是否可缓存的同源静态 ─────────────────────────────────
function isSameOriginStatic(url) {
  if (url.origin !== self.location.origin) return false;
  // 排除 API 与 Server Actions / RSC payload
  if (url.pathname.startsWith('/api/')) return false;
  // 完全排除 /_next/ 路径（Turbopack dev 下 chunk hash 每次重启都变，缓存会导致模块加载崩溃）
  if (url.pathname.startsWith('/_next/')) return false;
  // 静态资源后缀白名单（仅缓存 public/ 下的真正静态资源）
  return (
    /\.(css|woff2?|ttf|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ── 1) /api/*: network-first，**不写缓存**（含敏感数据 / 鉴权头）──
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ code: 0, offline: true, msg: 'offline — no cached response' }),
          { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
        )
      )
    );
    return;
  }

  // ── 2) 导航请求 (HTML): network-first → 失败回 /offline.html ──
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // ── 3) 同源静态: stale-while-revalidate ──
  if (isSameOriginStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || (await network) || new Response('', { status: 504 });
      })
    );
    return;
  }

  // 其他（跨域 / 第三方）—— 透传
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* ignore */ }

  const title   = payload.title  || 'Phoenix ERP';
  const body    = payload.body   || '你有新的审批待办';
  const url     = payload.url    || '/mobile/workflow';
  const icon    = payload.icon   || '/icon-256.png';
  const badge   = payload.badge  || '/icon-32.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      tag:  'phoenix-erp-push',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/mobile/workflow';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(url); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
