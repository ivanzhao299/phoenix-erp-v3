'use client';
import { useState, useEffect } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { packagingApi } from '@/lib/packaging-api';
import { useTerminalContext } from '@/hooks/useTerminalContext';
import { usePackagingDicts } from '@/hooks/usePackagingDicts';
import { T } from '@/styles/terminal-theme';

export default function TerminalDashboard() {
  const { t } = useLanguage();
  const router = useRouter();
  const { openExceptionCount, ctx } = useTerminalContext();
  const [receivedQty, setReceivedQty] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    packagingApi.getShiftSummary()
      .then(data => setReceivedQty(data?.receivedQty || 0))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { dicts } = usePackagingDicts(['PKG_PACK_SPEC']);

  const gradedTotal = Object.values(ctx.gradingOutputs ?? {}).reduce((a, b) => a + b, 0);
  const packedBoxes = (ctx.packingBatches ?? []).reduce((s, b) => s + (b.boxes || 0), 0);

  // 按规格单位汇总包装数量，生成"3箱 · 2盒"格式
  const specUnitMap = Object.fromEntries(
    (dicts.PKG_PACK_SPEC ?? []).map(d => [d.code, (d.unit as string) ?? t('ui.箱', '箱')])
  );
  const unitTotals: Record<string, number> = {};
  for (const b of ctx.packingBatches ?? []) {
    const unit = specUnitMap[b.specId] ?? t('ui.箱', '箱');
    unitTotals[unit] = (unitTotals[unit] || 0) + b.boxes;
  }
  const packedUnitLabel = Object.keys(unitTotals).length > 0
    ? Object.entries(unitTotals).map(([unit, n]) => `${n}${unit}`).join(' · ')
    : t('ui.箱', '箱');

  const PIPELINE = [
    { label: t('ui.已接收', '已接收'), value: receivedQty, unit: t('ui.枚', '枚'),  color: 'var(--color-accent)' },
    { label: t('ui.已分级', '已分级'), value: gradedTotal, unit: t('ui.枚', '枚'),   color: 'var(--status-special)' },
    { label: t('ui.已包装', '已包装'), value: packedBoxes, unit: packedUnitLabel,    color: 'var(--status-warning)' },
    { label: t('ui.已入库', '已入库'), value: packedBoxes, unit: packedUnitLabel,    color: 'var(--status-success)' },
  ];

  const ACTIONS = [
    { icon: '📥', label: t('terminal.source_receive', '集蛋接收'), color: 'var(--color-accent)', path: '/terminal/packaging/source-receive',     desc: t('ui.扫码或手动录入', '扫码或手动录入') },
    { icon: '📊', label: t('terminal.grading', '分级作业'),        color: 'var(--status-special)', path: '/terminal/packaging/grading',            desc: t('ui.选批次录等级产出', '选批次录等级产出') },
    { icon: '📦', label: t('terminal.packing', '包装作业'),        color: 'var(--status-warning)', path: '/terminal/packaging/packing',            desc: t('ui.规格选择箱数录入', '规格选择箱数录入') },
    { icon: '🏷️', label: t('terminal.label_print', '标签打印'),    color: 'var(--status-success)', path: '/terminal/packaging/label-print',        desc: t('ui.打印补打箱标', '打印/补打箱标') },
    { icon: '🏭', label: t('terminal.warehouse_handover', '成品入库'), color: 'var(--color-accent)', path: '/terminal/packaging/warehouse-handover', desc: t('ui.扫码确认入库', '扫码确认入库') },
    {
      icon: '⚠️',
      label: t('terminal.exceptions', '异常上报'),
      color: openExceptionCount > 0 ? 'var(--status-danger)' : 'var(--text-secondary)',
      path: '/terminal/packaging/exceptions',
      desc: openExceptionCount > 0
        ? `${openExceptionCount} ${t('ui.条未处理', '条未处理')}`
        : t('ui.快速上报', '快速上报'),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.BG, overflow: 'hidden' }}>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 班次状态卡 */}
        {ctx.currentShift?.status === 'OPEN' ? (
          <div style={{
            background: 'var(--status-success-bg-medium)', borderRadius: 12, padding: '16px 24px',
            border: '1px solid rgba(16,185,129,0.35)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: 'var(--status-success-bg-strong)', color: 'var(--status-success)',
                borderRadius: 8, padding: '5px 14px', fontSize: 18, fontWeight: 800, letterSpacing: 0.5,
              }}>
                {({ MORNING: t('ui.早班','早班'), AFTERNOON: t('ui.下午班','下午班'), NIGHT: t('ui.夜班','夜班') } as Record<string, string>)[ctx.currentShift.shiftType ?? ''] ?? ctx.currentShift.shiftType ?? ctx.currentShift.code}
              </span>
              <span style={{ fontSize: 15, color: 'var(--status-success)', fontWeight: 700 }}>● {t('ui.进行中', '进行中')}</span>
            </div>
            <span style={{ color: 'var(--border)', fontSize: 18 }}>|</span>
            {ctx.currentShift.lineName && (
              <div style={{ fontSize: 16, color: 'var(--text-disabled)' }}>
                <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{t('ui.线体', '线体')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{ctx.currentShift.lineName}</span>
              </div>
            )}
            {ctx.currentShift.supervisorName && (
              <div style={{ fontSize: 16, color: 'var(--text-disabled)' }}>
                <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{t('ui.班组长', '班组长')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{ctx.currentShift.supervisorName}</span>
              </div>
            )}
            {ctx.currentShift.openedAt && (
              <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                {t('ui.开班时间', '开班')} {new Date(ctx.currentShift.openedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
            )}
            <div className={u.flex1} />
            <button type="button" onClick={() => router.push('/terminal/packaging/shift-close')}
              style={{
                background: 'transparent', border: '1px solid var(--status-success)',
                color: 'var(--status-success)', borderRadius: 8, padding: '10px 24px',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
              }}>
              {t('ui.交班', '交班')}
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--status-warning-bg-faint)', borderRadius: 12, padding: '16px 24px',
            border: '1px solid var(--status-warning-border)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <span style={{ fontSize: 24 }}>⏰</span>
            <span style={{ fontSize: 17, color: 'var(--status-warning)', fontWeight: 700 }}>{t('ui.当前无进行中的班次', '当前无进行中的班次')}</span>
            <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{t('ui.请先开班再开始作业', '请先开班再开始作业')}</span>
            <div className={u.flex1} />
            <button type="button" onClick={() => router.push('/terminal/packaging/shift-open')}
              style={{
                background: 'var(--status-warning)', border: 'none',
                color: 'var(--bg-page)', borderRadius: 8, padding: '10px 28px',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
              }}>
              {t('ui.开班', '开班')}
            </button>
          </div>
        )}

        {/* Progress pipeline */}
        <div style={{ background: T.CARD, borderRadius: 14, padding: '18px 24px', border: `1px solid ${T.BOR}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, color: T.MUT, fontWeight: 600, marginBottom: 14, letterSpacing: 1 }}>
            {t('ui.今日生产进度', '今日生产进度')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {PIPELINE.flatMap((step, i) => {
              const items = [(
                <div key={step.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    fontSize: 48, fontWeight: 800, lineHeight: 1,
                    color: (!loading && step.value > 0) ? step.color : T.BOR,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {loading ? '—' : step.value.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 15, color: T.MUT, marginTop: 6 }}>{step.label}</div>
                  <div style={{ fontSize: 13, color: step.color, opacity: 0.8, marginTop: 3, lineHeight: 1.5 }}>{step.unit}</div>
                </div>
              )];
              if (i < PIPELINE.length - 1) {
                items.push(
                  <div key={`arrow-${i}`} style={{ color: T.BOR, fontSize: 28, flexShrink: 0, lineHeight: 1 }}>→</div>
                );
              }
              return items;
            })}
          </div>
        </div>

        {/* Action buttons — 3 columns × 2 rows */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 14, minHeight: 0 }}>
          {ACTIONS.map(action => (
            <button type="button" key={action.path} onClick={() => router.push(action.path)}
              style={{
                background: T.CARD,
                border: `2px solid ${action.color}33`,
                borderRadius: 18,
                padding: '0 20px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer', transition: 'all 0.15s',
                position: 'relative',
              }}
              onPointerDown={e => { (e.currentTarget as HTMLButtonElement).style.background = `${action.color}18`; }}
              onPointerUp={e => { (e.currentTarget as HTMLButtonElement).style.background = T.CARD; }}
              onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = T.CARD; }}
            >
              <span style={{ fontSize: 52 }}>{action.icon}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: action.color }}>{action.label}</span>
              <span style={{ fontSize: 14, color: T.MUT, textAlign: 'center', lineHeight: 1.4 }}>{action.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Exception alert bar */}
      <div style={{
        background: 'var(--status-danger)', borderTop: `1px solid var(--status-danger)`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        cursor: 'pointer', visibility: openExceptionCount > 0 ? 'visible' : 'hidden',
      }} onClick={() => router.push('/terminal/packaging/exceptions')}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <span style={{ color: 'var(--status-danger)', fontSize: 16, fontWeight: 600 }}>
          {t('ui.存在', '存在')} {openExceptionCount} {t('ui.条未关闭异常点击处理', '条未关闭异常 — 点击处理')}
        </span>
      </div>
    </div>
  );
}
