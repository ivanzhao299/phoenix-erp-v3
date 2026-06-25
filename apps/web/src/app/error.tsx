'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[AppError]', error);
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
          <button type="button" className="phx-btn" onClick={reset}>
            重新加载
          </button>
          <Link className="phx-btn phx-btn-secondary" href="/home">
            返回首页
          </Link>
        </div>
      </section>
    </div>
  );
}
