'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 审批配置已统一至新版审批规则（/settings/approval-rules）。
 * 本页面自动跳转，无需用户操作。
 */
export default function ApprovalFlowsRedirect() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          router.replace('/settings/approval-rules');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      textAlign: 'center',
      padding: 32,
    }}>
      <div style={{ fontSize: 48, lineHeight: 1 }}>⚙️</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
        审批配置已迁移至新版审批规则
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        审批配置已迁移至新版审批规则，正在跳转。<br />
        请稍候…
      </div>
      <div style={{
        marginTop: 8,
        padding: '10px 28px',
        borderRadius: 10,
        background: 'var(--color-primary)',
        color: '#fff',
        fontWeight: 700,
        fontSize: 14,
        cursor: 'pointer',
      }} onClick={() => router.replace('/settings/approval-rules')}>
        立即前往（{countdown}s）
      </div>
    </div>
  );
}
