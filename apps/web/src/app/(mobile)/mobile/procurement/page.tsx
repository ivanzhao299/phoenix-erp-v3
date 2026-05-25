'use client';
/**
 * /mobile/procurement — V1 采购审批入口（已停用）
 *
 * 原页面调用旧 /api/procurement/* (V1) 审批 API，与 Workflow 2.0 ApprovalEngine 完全不兼容。
 * 审批操作已切换至统一审批中心 /mobile/workflow。
 *
 * 本页面重定向至 /mobile/workflow，不得再调用 V1 审批 API。
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMobileTheme } from '@/contexts/MobileThemeContext';

export default function ProcurementDeprecatedPage() {
  const router = useRouter();
  const { t } = useMobileTheme();

  // 3 秒后自动跳转
  useEffect(() => {
    const timer = setTimeout(() => router.replace('/mobile/workflow'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div style={{
      minHeight: '100svh', background: t.pageBg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>🔄</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 12 }}>
        采购审批入口已升级
      </div>
      <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.7, marginBottom: 28 }}>
        该移动采购审批入口已停用。<br />
        采购审批已统一至 <strong style={{ color: '#7c3aed' }}>审批中心</strong>，<br />
        审批流程由 Workflow 2.0 引擎驱动。
      </div>
      <button
        onClick={() => router.replace('/mobile/workflow')}
        style={{
          padding: '14px 32px', borderRadius: 14, border: 'none',
          background: '#7c3aed', color: '#fff',
          fontWeight: 700, fontSize: 16, cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        前往审批中心
      </button>
      <button
        onClick={() => router.push('/mobile/home')}
        style={{
          padding: '10px 24px', borderRadius: 12,
          border: `1px solid ${t.cardBorder}`, background: 'transparent',
          color: t.textSub, fontSize: 14, cursor: 'pointer',
        }}
      >
        返回首页
      </button>
      <div style={{ fontSize: 12, color: t.textFaint, marginTop: 24 }}>
        3 秒后自动跳转至审批中心…
      </div>
    </div>
  );
}
