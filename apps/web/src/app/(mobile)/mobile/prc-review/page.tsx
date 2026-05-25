'use client';
/**
 * /mobile/prc-review — 采购申请审核（V1 API 已停用）
 *
 * 原页面调用旧 /api/procurement/purchase-requests/* API，
 * 且 token 读取路径与系统不一致（localStorage.auth_user.token）。
 *
 * 采购申请审核（PR review / 转PO）在 V2 中由 ApprovalEngine 驱动：
 * - PR 状态流转通过 /api/v2/procurement/requests/:id/approve 或 ApprovalEngine 完成
 * - 移动端审批入口统一至 /mobile/workflow
 *
 * 本阶段：显示迁移说明 + 跳转引导。
 * 下阶段：接入 /api/v2/procurement/requests + ApprovalEngine。
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMobileTheme } from '@/contexts/MobileThemeContext';

export default function PrcReviewDeprecatedPage() {
  const router = useRouter();
  const { t } = useMobileTheme();

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
        采购审核入口已升级
      </div>
      <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.7, marginBottom: 28 }}>
        该移动采购审核入口已停用。<br />
        采购申请审批（PR Review）已迁移至<br />
        <strong style={{ color: '#7c3aed' }}>审批中心</strong>，由 Workflow 2.0 统一处理。
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
