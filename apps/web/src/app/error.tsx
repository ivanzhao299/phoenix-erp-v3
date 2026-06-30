'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * 是否为"代码分块加载失败"类错误。
 * 部署新版本后，旧页面/旧 HTML 仍引用被替换掉 hash 的 _next/static chunk，
 * 浏览器拉取 404 → Next 抛 ChunkLoadError；表现为任意路由"当前页面加载失败"。
 */
function isChunkLoadError(error?: Error): boolean {
  const text = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    text,
  );
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[AppError]', error);
    // 分块加载失败：自动硬刷新一次拉取最新 HTML + chunk（reset() 只重渲染、拿不到新 chunk，救不了）。
    // 用 sessionStorage 时间戳兜底，10s 内只自动刷新一次，避免真·持续故障时陷入刷新死循环。
    if (typeof window !== 'undefined' && isChunkLoadError(error)) {
      try {
        const KEY = 'phx_chunk_reload_at';
        const last = Number(sessionStorage.getItem(KEY) || '0');
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* sessionStorage 不可用时忽略，留给用户手动「重新加载」 */
      }
    }
  }, [error]);

  return (
    <div className="phx-error-shell">
      <section className="phx-error-card" role="alert">
        <p className="phx-error-kicker">页面异常</p>
        <h1 className="phx-error-title">当前页面加载失败</h1>
        <p className="phx-error-desc">
          请刷新重试；如果问题持续出现，请联系管理员并提供当前操作路径。
        </p>
        <div className="phx-error-actions">
          <button type="button" className="phx-btn" onClick={() => { window.location.reload(); }}>
            重新加载
          </button>
          <Link className="phx-btn phx-btn-secondary" href="/home">
            返回首页
          </Link>
        </div>
        {error?.digest && (
          <p className="phx-error-desc" style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            错误码：{error.digest}
          </p>
        )}
      </section>
    </div>
  );
}
