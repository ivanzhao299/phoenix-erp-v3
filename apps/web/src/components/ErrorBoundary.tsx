'use client';
import React from 'react';

interface State { hasError: boolean; message: string }

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
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        fontFamily: 'sans-serif', color: '#374151', background: '#f9fafb',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>页面出现了意外错误</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          请刷新页面重试，或联系系统管理员
        </p>
        <button
type="button"           onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: '#f59e0b', color: '#fff', fontSize: 14,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          刷新页面
        </button>
      </div>
    );
  }
}
