'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Save, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import { mobileApi, FeedLedgerRow } from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return r;
}

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function numInput(val: number | string): string {
  return val === 0 || val === '0' ? '' : String(val);
}

const ALERT_COLOR = { CRITICAL: '#ef4444', WARN: '#f59e0b' } as const;

// ── 单行编辑卡片 ──────────────────────────────────────────────────────────────

function MaterialCard({
  row,
  houses,
  onChange,
}: {
  row: FeedLedgerRow;
  houses: string[];
  onChange: (updated: Partial<FeedLedgerRow>) => void;
}) {
  const { t } = useMobileTheme();
  const [expanded, setExpanded] = useState(false);

  const alertColor = row.alert ? ALERT_COLOR[row.alert] : null;
  const daysLabel  = row.days_left != null
    ? `${row.days_left}天`
    : '—';
  const daysColor = row.days_left == null ? t.textFaint
    : row.days_left <= 3  ? '#ef4444'
    : row.days_left <= 7  ? '#f59e0b'
    : row.days_left <= 14 ? '#fbbf24'
    : '#10b981';

  const setOutbound = (house: string, val: string) => {
    const detail = { ...row.outbound_detail, [house]: Number(val) || 0 };
    onChange({ outbound_detail: detail });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 10px',
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 8, color: t.text, fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
    WebkitAppearance: 'none',
  };

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${alertColor ? alertColor + '50' : t.cardBorder}`,
      background: alertColor ? `${alertColor}08` : t.sectionBg,
      overflow: 'hidden',
      marginBottom: 8,
    }}>
      {/* 主行 */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
          gap: 10, textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{row.material_name}</span>
            <span style={{ fontSize: 11, color: t.textFaint }}>{row.unit}</span>
            {row.alert && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                background: `${alertColor}20`, color: alertColor!,
              }}>
                {row.alert === 'CRITICAL' ? '⚠ 建议采购' : '关注'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: t.textSub }}>
              库存 <b style={{ color: t.text }}>{row.current_stock.toLocaleString('zh-CN')}</b>
            </span>
            <span style={{ fontSize: 12, color: daysColor, fontWeight: 600 }}>
              可用 {daysLabel}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} color={t.textMuted} /> : <ChevronDown size={16} color={t.textMuted} />}
      </button>

      {/* 展开的输入区域 */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${t.divider}` }}>
          {/* 前日库存 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 4 }}>昨日库存</div>
              <div style={{ fontSize: 14, color: t.textSub, padding: '8px 10px', background: t.sectionBg, borderRadius: 8, border: `1px solid ${t.divider}` }}>
                {row.prev_stock.toLocaleString('zh-CN')}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 4 }}>今日入库</div>
              <input
                type="number" inputMode="numeric" min="0"
                value={numInput(row.inbound_qty)}
                onChange={e => onChange({ inbound_qty: Number(e.target.value) || 0 })}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 4 }}>日用量</div>
              <input
                type="number" inputMode="numeric" min="0"
                value={numInput(row.daily_usage)}
                onChange={e => onChange({ daily_usage: Number(e.target.value) || 0 })}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>

          {/* 各栋出库 */}
          <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 6 }}>今日出库（各栋）</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {houses.map(house => (
              <div key={house}>
                <div style={{ fontSize: 10, color: t.textFaint, marginBottom: 3, textAlign: 'center' }}>{house}</div>
                <input
                  type="number" inputMode="numeric" min="0"
                  value={numInput(row.outbound_detail[house] ?? 0)}
                  onChange={e => setOutbound(house, e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, textAlign: 'center' }}
                />
              </div>
            ))}
          </div>

          {/* 合计行 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, padding: '8px 10px', background: t.sectionBg, borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>出库合计</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{row.outbound_total.toLocaleString('zh-CN')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: t.textMuted }}>→ 库存</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{row.current_stock.toLocaleString('zh-CN')}</span>
          </div>

          {/* 备注 */}
          <div style={{ marginTop: 8 }}>
            <input
              type="text"
              value={row.note}
              onChange={e => onChange({ note: e.target.value })}
              placeholder="备注（如：建议采购）"
              style={{ ...inputStyle, textAlign: 'left' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function FeedLedgerPage() {
  const router  = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('feed');
  const today   = fmtDate(new Date());
  const [date, setDate]       = useState(today);
  const [rows, setRows]       = useState<FeedLedgerRow[]>([]);
  const [houses, setHouses]   = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  const isToday = date === today;

  const loadData = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const [ledger, houseList] = await Promise.all([
        mobileApi.getFeedLedger(d),
        mobileApi.getFeedHouses(),
      ]);
      const arr = Array.isArray(ledger) ? ledger : (ledger as any)?.data ?? [];
      setRows(arr);
      const hs = Array.isArray(houseList) ? houseList : (houseList as any)?.data ?? [];
      setHouses(hs);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(date); }, [date, loadData]);
  if (permLoading || !allowed) return null;

  // 当某行修改时，重新计算 outbound_total 和 current_stock
  const updateRow = (idx: number, patch: Partial<FeedLedgerRow>) => {
    setRows(prev => {
      const next = [...prev];
      const r    = { ...next[idx], ...patch };
      const detail = r.outbound_detail ?? {};
      r.outbound_total = Object.values(detail).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      r.current_stock  = Math.max(0, (r.prev_stock ?? 0) + (r.inbound_qty ?? 0) - r.outbound_total);
      const daily = r.daily_usage ?? 0;
      r.days_left = daily > 0 ? Math.floor(r.current_stock / daily) : null;
      r.alert = r.days_left != null && r.days_left <= 7 ? (r.days_left <= 3 ? 'CRITICAL' : 'WARN') : null;
      next[idx] = r;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await mobileApi.saveFeedLedger(date, rows);
      if (res?.code === 200 || Array.isArray(res?.data)) {
        const arr = Array.isArray(res?.data) ? res.data : res;
        if (Array.isArray(arr)) setRows(arr);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res?.msg || '保存失败');
      }
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); };

  const alertRows = rows.filter(r => r.alert);
  const dateLabel = isToday ? '今天' : date === fmtDate(addDays(toDate(today), -1)) ? '昨天' : date;

  return (
    <div style={{
      minHeight: '100svh',
      background: t.pageBg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: t.appBarBg, backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>🌾 饲料台账</span>
        <button onClick={() => loadData(date)}
          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 10,
            background: saved ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.15)',
            border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.35)'}`,
            color: saved ? '#10b981' : '#f59e0b',
            cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700,
          }}
        >
          <Save size={14} />
          {saving ? '保存中…' : saved ? '已保存' : '保存'}
        </button>
      </div>

      {/* 日期选择 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(245,158,11,0.06)',
        borderBottom: '1px solid rgba(245,158,11,0.1)',
      }}>
        <button onClick={prevDay}
          style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 6 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{dateLabel}</div>
          {dateLabel !== date && <div style={{ fontSize: 11, color: t.textMuted }}>{date}</div>}
        </div>
        <button onClick={nextDay} disabled={isToday}
          style={{ background: 'none', border: 'none', color: isToday ? t.textFaint : t.textSub, cursor: isToday ? 'default' : 'pointer', padding: 6 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 内容 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}>
        {/* 预警汇总 */}
        {alertRows.length > 0 && (
          <div style={{
            marginBottom: 12, padding: '12px 14px', borderRadius: 12,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>⚠ 库存预警</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {alertRows.map(r => (
                <div key={r.material_name} style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 12,
                  background: r.alert === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                  color: r.alert === 'CRITICAL' ? '#f87171' : '#f59e0b', fontWeight: 600,
                }}>
                  {r.material_name}
                  <span style={{ marginLeft: 4, fontWeight: 400, opacity: 0.7 }}>
                    {r.days_left}天
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: 64, borderRadius: 14, background: t.cardBg, animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        ) : (
          <>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
            {rows.map((row, idx) => (
              <MaterialCard
                key={row.material_name}
                row={row}
                houses={houses}
                onChange={patch => updateRow(idx, patch)}
              />
            ))}
            {rows.length === 0 && (
              <div style={{ textAlign: 'center', color: t.textFaint, fontSize: 14, paddingTop: 40 }}>
                暂无数据
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
