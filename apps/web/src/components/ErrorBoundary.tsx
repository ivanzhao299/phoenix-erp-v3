'use client';
import React from 'react';

interface State { hasError: boolean; message: string }

function ErrorFallback() {
  return (
    <div className="phx-error-shell">
      <section className="phx-error-card" role="alert">
        <p className="phx-error-kicker">运行异常</p>
        <h2 className="phx-error-title">页面出现了意外错误</h2>
        <p className="phx-error-desc">
          请刷新页面重试；如果持续出现，请联系系统管理员。
        </p>
        <div className="phx-error-actions">
          <button type="button" className="phx-btn" onClick={() => window.location.reload()}>
            刷新页面
          </button>
          <button type="button" className="phx-btn phx-btn-secondary" onClick={() => { window.location.href = '/home'; }}>
            返回首页
          </button>
        </div>
      </section>
    </div>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message || '未知错误' };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // 仅记录到控制台，不暴露到 UI
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback />;
  }
}
