'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { mobileApi, QcInspection } from '@/lib/mobile-api';

// ── 日期工具 ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
const CHECK_TYPE_LABELS: Record<string, string> = {
  INCOMING: '来料检',
  PROCESS:  '过程检',
  OUTBOUND: '出库检',
  FIRST:    '首检',
  FINAL:    '终检',
};

function checkTypeLabel(type: string): string {
  return CHECK_TYPE_LABELS[type] ?? type;
}

/** 从 checkTime 字符串提取 HH:mm */
function fmtTime(checkTime: string): string {
  // 支持 "2026-05-22 14:30:00" 或 "2026-05-22T14:30:00" 或 "14:30:00" 等形式
  const match = checkTime.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : checkTime;
}

// ── 单条记录卡片 ──────────────────────────────────────────────────────────────
function InspectionCard({ item }: { item: QcInspection }) {
  const [expanded, setExpanded] = useState(false);
  const isPass = item.result === 'PASS';
  const isFail = item.result === 'FAIL';
  const hasFailItems = item.fail_items_json != null;

  const resultColor  = isPass ? '#10b981' : isFail ? '#ef4444' : 'rgba(255,255,255,0.5)';
  const resultBg     = isPass ? 'rgba(16,185,129,0.1)' : isFail ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)';
  const resultBorder = isPass ? 'rgba(16,185,129,0.25)' : isFail ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.12)';
  const resultText   = isPass ? '✓ 合格' : isFail ? '✗ 不合格' : item.result;

  return (
    <div style={{
      borderRadius: 14, marginBottom: 10,
      background: isFail ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isFail ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)'}`,
      overflow: 'hidden',
    }}>
      {/* 主行 */}
      <div
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
        onClick={() => { if (hasFailItems) setExpanded(v => !v); }}
      >
        {/* 左侧：单号 + 类型标签 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: 0.3 }}>
            {item.inspect_no}
          </div>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: 'rgba(99,179,237,0.12)', color: '#63b3ed',
            border: '1px solid rgba(99,179,237,0.25)',
          }}>
            {checkTypeLabel(item.checkType)}
          </span>
        </div>

        {/* 中间：时间 */}
        <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
          {fmtTime(item.checkTime)}
        </div>

        {/* 右侧：结果 */}
        <div style={{
          padding: '5px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          background: resultBg, color: resultColor, border: `1px solid ${resultBorder}`,
          whiteSpace: 'nowrap',
        }}>
          {resultText}
        </div>

        {/* 展开箭头（仅有 fail_items_json 时显示） */}
        {hasFailItems && (
          <div style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        )}
      </div>

      {/* 展开详情 */}
      {hasFailItems && expanded && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: '1px solid rgba(239,68,68,0.15)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6, marginTop: 10 }}>不合格项详情</div>
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.6,
            color: '#fca5a5',
            background: 'rgba(239,68,68,0.06)',
            padding: '10px 12px', borderRadius: 8,
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {JSON.stringify(item.fail_items_json, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── 骨架屏 ────────────────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {/* 汇总骨架 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 66, borderRadius: 14, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      {/* 筛选骨架 */}
      <div style={{ height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', marginBottom: 14, animation: 'pulse 1.5s infinite' }} />
      {/* 卡片骨架 */}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ height: 72, borderRadius: 14, background: 'rgba(255,255,255,0.04)', marginBottom: 10, animation: 'pulse 1.5s infinite' }} />
      ))}
    </>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function QualityPage() {
  const router = useRouter();
  const today  = fmtDate(new Date());

  const [date, setDate]         = useState(today);
  const [items, setItems]       = useState<QcInspection[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeType, setActiveType] = useState<string>('ALL');

  const isToday   = date === today;
  const dateLabel = isToday
    ? '今天'
    : date === fmtDate(addDays(toDate(today), -1))
      ? '昨天'
      : date;

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    setActiveType('ALL');
    try {
      const res = await mobileApi.getQcInspections(d);
      const arr: QcInspection[] = Array.isArray(res) ? res : ((res as { data?: QcInspection[] })?.data ?? []);
      setItems(arr);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);

  // ── 统计 ────────────────────────────────────────────────────────────────────
  const total    = items.length;
  const passCount = items.filter(i => i.result === 'PASS').length;
  const failCount = items.filter(i => i.result === 'FAIL').length;
  const passRate  = total > 0 ? Math.round((passCount / total) * 100) : 100;

  const passRateColor =
    passRate >= 95 ? '#10b981' :
    passRate >= 80 ? '#f59e0b' :
    '#ef4444';

  // ── 类型筛选 chip 列表 ──────────────────────────────────────────────────────
  const typeSet = Array.from(new Set(items.map(i => i.checkType)));

  // ── 过滤后列表 ──────────────────────────────────────────────────────────────
  const filtered = activeType === 'ALL' ? items : items.filter(i => i.checkType === activeType);

  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── AppBar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}
        >
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'white', flex: 1 }}>🛡️ 品质检测</span>
        <button
          onClick={() => loadData(date)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ── 日期导航 ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(99,179,237,0.04)',
        borderBottom: '1px solid rgba(99,179,237,0.1)',
      }}>
        <button
          onClick={() => setDate(d => fmtDate(addDays(toDate(d), -1)))}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 6 }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{dateLabel}</div>
          {dateLabel !== date && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>
          )}
        </div>
        <button
          onClick={() => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); }}
          disabled={isToday}
          style={{
            background: 'none', border: 'none',
            color: isToday ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)',
            cursor: isToday ? 'default' : 'pointer', padding: 6,
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── 内容区 ─────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 16px',
        paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
      }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>

        {/* 错误提示 */}
        {error && (
          <div style={{
            marginBottom: 12, padding: 12, borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {loading ? <SkeletonList /> : (
          <>
            {/* ── 汇总行（3列） ──────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>

              {/* 今日检测次数 */}
              <div style={{
                padding: '12px 10px', borderRadius: 14, textAlign: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>检测次数</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{total}</div>
              </div>

              {/* 合格率 */}
              <div style={{
                padding: '12px 10px', borderRadius: 14, textAlign: 'center',
                background: `rgba(${passRateColor === '#10b981' ? '16,185,129' : passRateColor === '#f59e0b' ? '245,158,11' : '239,68,68'},0.08)`,
                border: `1px solid rgba(${passRateColor === '#10b981' ? '16,185,129' : passRateColor === '#f59e0b' ? '245,158,11' : '239,68,68'},0.22)`,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>合格率</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: passRateColor }}>
                  {total > 0 ? `${passRate}%` : '—'}
                </div>
              </div>

              {/* 不合格次数 */}
              <div style={{
                padding: '12px 10px', borderRadius: 14, textAlign: 'center',
                background: failCount > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.05)',
                border: `1px solid ${failCount > 0 ? 'rgba(239,68,68,0.22)' : 'rgba(16,185,129,0.18)'}`,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>不合格</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: failCount > 0 ? '#ef4444' : '#10b981' }}>
                  {failCount}
                </div>
              </div>
            </div>

            {/* ── checkType 过滤 chips ────────────────────────────────────────── */}
            {typeSet.length > 0 && (
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14,
                paddingBottom: 2,
                scrollbarWidth: 'none',
              }}>
                <style>{`div::-webkit-scrollbar{display:none}`}</style>
                {/* 全部 */}
                <button
                  onClick={() => setActiveType('ALL')}
                  style={{
                    flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: activeType === 'ALL' ? 'rgba(99,179,237,0.25)' : 'rgba(255,255,255,0.06)',
                    color: activeType === 'ALL' ? '#63b3ed' : 'rgba(255,255,255,0.5)',
                    outline: activeType === 'ALL' ? '1px solid rgba(99,179,237,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  全部 {total > 0 ? `(${total})` : ''}
                </button>
                {typeSet.map(type => {
                  const cnt  = items.filter(i => i.checkType === type).length;
                  const active = activeType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setActiveType(type)}
                      style={{
                        flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', border: 'none',
                        background: active ? 'rgba(99,179,237,0.25)' : 'rgba(255,255,255,0.06)',
                        color: active ? '#63b3ed' : 'rgba(255,255,255,0.5)',
                        outline: active ? '1px solid rgba(99,179,237,0.45)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {checkTypeLabel(type)} ({cnt})
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── 记录列表 ────────────────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <div style={{
                padding: '48px 20px', textAlign: 'center',
                color: 'rgba(255,255,255,0.25)', fontSize: 14,
              }}>
                当日暂无检测记录
              </div>
            ) : (
              filtered.map(item => (
                <InspectionCard key={item.inspect_no} item={item} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
