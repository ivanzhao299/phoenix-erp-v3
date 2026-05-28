'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 客户档案已统一至新版客户管理（/sales2/customers）。
 * 本页面自动跳转，无需用户操作。
 */
export default function OrderCustomersRedirect() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          router.replace('/sales2/customers');
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
      <div style={{ fontSize: 48, lineHeight: 1 }}>👥</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
        客户资料已迁移至新版客户管理
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
        所有客户档案、信用额度及联系信息已统一至新版客户管理中心。<br />
        正在为您自动跳转，请稍候…
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
      }} onClick={() => router.replace('/sales2/customers')}>
        立即前往（{countdown}s）
      </div>
    </div>
  );
}
