'use client';
import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorState — 统一错误态。暗色经 CSS 变量适配。
 * 用法：<ErrorState message={err} onRetry={reload} />
 */
export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ title = '加载失败', message, onRetry, compact }: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', gap: 10, padding: compact ? '24px 16px' : '40px 24px',
      }}
    >
      <div
        style={{
          width: compact ? 40 : 52, height: compact ? 40 : 52, borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-muted)', color: 'var(--status-danger)',
        }}
      >
        <AlertTriangle size={compact ? 20 : 26} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360 }}>{message}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 6, padding: '7px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}
        >
          重试
        </button>
      )}
    </div>
  );
}
