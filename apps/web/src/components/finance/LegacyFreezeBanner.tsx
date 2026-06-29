'use client';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <div style={{
      background: 'linear-gradient(90deg, var(--status-warning-bg-faint) 0%, var(--status-warning-bg-page) 100%)',
      border: '1.5px solid var(--status-warning)',
      borderRadius: 12,
      padding: '14px 20px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <AlertTriangle size={20} color="var(--status-warning)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--status-warning)', marginBottom: 4 }}>
          ⚠️ {t('ui.旧财务模块已停用，请使用新版财务管理','旧财务模块已停用，请使用新版财务管理')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--status-warning-dark)', lineHeight: 1.6 }}>
          {t('ui.本页面属于旧版财务模块（已停用），数据来源已废弃，','本页面属于旧版财务模块（已停用），数据来源已废弃，')}
          <strong>{t('ui.不再接受新增操作','不再接受新增操作')}</strong>{t('ui.。当前请使用：','。当前请使用：')}
          <br />
          • <strong>{t('ui.采购管理 → 付款管理','采购管理 → 付款管理')}</strong>（/procurement2/payments）— {t('ui.真实付款审批与应付核销','真实付款审批与应付核销')}
          <br />
          • <strong>{t('ui.采购管理 → 股东资金','采购管理 → 股东资金')}</strong>（/procurement2/shareholder-funds）— {t('ui.股东代付台账','股东代付台账')}
          <br />
          • <strong>{t('ui.财务管理','财务管理')}</strong>（/finance2）— {t('ui.应收 / 应付 / 资金 / 报表','应收 / 应付 / 资金 / 报表')}
        </div>
      </div>
      {redirectPath && redirectLabel && (
        <button
          onClick={() => router.push(redirectPath)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '7px 14px', borderRadius: 8,
            border: '1.5px solid var(--status-warning)', background: 'var(--status-warning)',
            color: 'var(--bg-card)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {redirectLabel} <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
