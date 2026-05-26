'use client';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * LegacyFreezeBanner
 *
 * 旧 Finance 模块冻结提示条。
 * 显示在所有 /finance/* 页面顶部，引导用户使用 Finance V2 或 Procurement V2。
 */
export function LegacyFreezeBanner({
  redirectPath,
  redirectLabel,
}: {
  redirectPath?: string;
  redirectLabel?: string;
}) {
  const router = useRouter();
  return (
    <div style={{
      background: 'linear-gradient(90deg, #fef3c7 0%, #fef9ee 100%)',
      border: '1.5px solid #f59e0b',
      borderRadius: 12,
      padding: '14px 20px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 4 }}>
          ⚠️ 旧财务模块已冻结 — Finance V2 正在重构中
        </div>
        <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          本页面属于旧版财务模块（Legacy Finance），数据来源已废弃（fin_transactions / fin_payments），
          <strong>不再接受新增操作</strong>。当前请使用：
          <br />
          • <strong>采购 V2 → 付款管理</strong>（/procurement2/payments）— 真实付款审批与 AP 核销
          <br />
          • <strong>采购 V2 → 股东资金</strong>（/procurement2/shareholder-funds）— 股东代付台账
          <br />
          • <strong>Finance V2</strong>（/finance2）— 重构中，即将上线
        </div>
      </div>
      {redirectPath && redirectLabel && (
        <button
          onClick={() => router.push(redirectPath)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px solid #d97706', background: '#d97706',
            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {redirectLabel} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
