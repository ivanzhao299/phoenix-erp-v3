'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { T } from '@/styles/terminal-theme';


export default function TerminalDashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { openExceptionCount, ctx } = useTerminalContext();
  const [receivedQty, setReceivedQty] = useState(0);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    packagingApi.getShiftSummary()
      .then(data => setReceivedQty(data?.receivedQty || 0))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const gradedTotal = Object.values(ctx.gradingOutputs ?? {}).reduce((a, b) => a + b, 0);
  const packedBoxes = (ctx.packingBatches ?? []).reduce((s, b) => s + (b.boxes || 0), 0);

  const PIPELINE = [
    { label: t('ui.已接收', '已接收'), value: receivedQty, unit: t('ui.枚', '枚'), color: '#3b82f6' },
    { label: t('ui.已分级', '已分级'), value: gradedTotal, unit: t('ui.枚', '枚'),  color: '#7c3aed' },
    { label: t('ui.已包装', '已包装'), value: packedBoxes, unit: t('ui.箱', '箱'),  color: '#f59e0b' },
    { label: t('ui.已入库', '已入库'), value: packedBoxes, unit: t('ui.箱', '箱'),  color: '#059669' },
  ];

  const ACTIONS = [
    { icon: '📥', label: t('terminal.source_receive', '集蛋接收'), color: '#3b82f6', path: '/terminal/packaging/source-receive',     desc: t('ui.扫码或手动录入', '扫码或手动录入') },
    { icon: '📊', label: t('terminal.grading', '分级作业'),        color: '#7c3aed', path: '/terminal/packaging/grading',            desc: t('ui.选批次录等级产出', '选批次录等级产出') },
    { icon: '📦', label: t('terminal.packing', '包装作业'),        color: '#f59e0b', path: '/terminal/packaging/packing',            desc: t('ui.规格选择箱数录入', '规格选择箱数录入') },
    { icon: '🏷️', label: t('terminal.label_print', '标签打印'),    color: '#059669', path: '/terminal/packaging/label-print',        desc: t('ui.打印补打箱标', '打印/补打箱标') },
    { icon: '🏭', label: t('terminal.warehouse_handover', '成品入库'), color: '#0891b2', path: '/terminal/packaging/warehouse-handover', desc: t('ui.扫码确认入库', '扫码确认入库') },
    {
      icon: '⚠️',
      label: t('terminal.exceptions', '异常上报'),
      color: openExceptionCount > 0 ? '#ef4444' : '#64748b',
      path: '/terminal/packaging/exceptions',
      desc: openExceptionCount > 0
        ? `${openExceptionCount} ${t('ui.条未处理', '条未处理')}`
        : t('ui.快速上报', '快速上报'),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{
        background: T.CARD, borderBottom: `1px solid ${T.BOR}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.TXT }}>
            🥚 {t('terminal.title', '分级包装作业台')}
          </div>
          <div style={{ fontSize: 12, color: T.MUT, marginTop: 2 }}>
            {t('ui.操作员', '操作员')}：{user?.name || user?.username}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.ACC, fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </div>
          <div style={{ fontSize: 11, color: T.MUT }}>
            {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Progress pipeline */}
        <div style={{ background: T.CARD, borderRadius: 14, padding: 20, border: `1px solid ${T.BOR}` }}>
          <div style={{ fontSize: 12, color: T.MUT, fontWeight: 600, marginBottom: 16, letterSpacing: 1 }}>
            {t('ui.今日生产进度', '今日生产进度')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {PIPELINE.flatMap((step, i) => {
              const items = [(
                <div key={step.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 32, fontWeight: 800,
                    color: (!loading && step.value > 0) ? step.color : T.BOR,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {loading ? '—' : step.value.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: T.MUT, marginTop: 4 }}>{step.label}</div>
                  <div style={{ fontSize: 10, color: step.color, opacity: 0.7, marginTop: 2 }}>{step.unit}</div>
                </div>
              )];
              if (i < PIPELINE.length - 1) {
                items.push(
                  <div key={`arrow-${i}`} style={{ color: T.BOR, fontSize: 22, flexShrink: 0, lineHeight: 1 }}>→</div>
                );
              }
              return items;
            })}
          </div>
        </div>

        {/* Action buttons — 3 columns × 2 rows */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {ACTIONS.map(action => (
            <button key={action.path} onClick={() => router.push(action.path)}
              style={{
                background: T.CARD,
                border: `2px solid ${action.color}33`,
                borderRadius: 16,
                padding: '24px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                cursor: 'pointer', transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${action.color}18`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.CARD; }}
            >
              <span style={{ fontSize: 38 }}>{action.icon}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: action.color }}>{action.label}</span>
              <span style={{ fontSize: 11, color: T.MUT, textAlign: 'center', lineHeight: 1.4 }}>{action.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Exception alert bar */}
      {openExceptionCount > 0 && (
        <div style={{
          background: '#3b1515', borderTop: `1px solid #7f1d1d`,
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          cursor: 'pointer',
        }} onClick={() => router.push('/terminal/packaging/exceptions')}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ color: '#fca5a5', fontSize: 13 }}>
            {t('ui.存在', '存在')} {openExceptionCount} {t('ui.条未关闭异常点击处理', '条未关闭异常 — 点击处理')}
          </span>
        </div>
      )}
    </div>
  );
}
