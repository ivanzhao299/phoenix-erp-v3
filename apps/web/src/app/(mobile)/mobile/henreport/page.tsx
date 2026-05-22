'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { mobileApi, HenReportRow, DailyHenReport } from '@/lib/mobile-api';

const today = () => new Date().toISOString().slice(0, 10);

const addDays = (d: string, n: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};

function MetaChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: `${color}12`, border: `1px solid ${color}30`,
      borderRadius: 10, padding: '6px 10px', minWidth: 60,
    }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function HouseCard({ row }: { row: HenReportRow }) {
  const [open, setOpen] = useState(false);
  const layRateNum = parseFloat(row.lay_rate);
  const rateColor = layRateNum >= 85 ? '#10b981' : layRateNum >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
          gap: 10,
        }}
      >
        {/* House label */}
        <div style={{
          minWidth: 52, height: 36, borderRadius: 8,
          background: 'rgba(245,158,11,0.15)',
          border: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{row.house_code}</span>
        </div>

        {/* Flock + age */}
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{row.flock_no}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            {row.age_days != null ? `日龄 ${row.age_days}天` : ''}
            {row.age_days != null && row.current_qty > 0 ? ' · ' : ''}
            存栏 {row.current_qty.toLocaleString()}只
          </div>
        </div>

        {/* Lay rate badge */}
        <div style={{
          padding: '4px 10px', borderRadius: 8,
          background: `${rateColor}18`,
          border: `1px solid ${rateColor}40`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: rateColor }}>{row.lay_rate}%</span>
        </div>

        <ChevronRight
          size={16}
          color="rgba(255,255,255,0.3)"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        />
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <MetaChip label="产蛋" value={row.eggs.toLocaleString()} color="#f59e0b" />
          <MetaChip label="死亡" value={row.mortality} color="#ef4444" />
          <MetaChip label="淘汰" value={row.elimination} color="#f97316" />
          <MetaChip label="合计损耗" value={row.total_loss} color="#dc2626" />
          <MetaChip label="饲料(kg)" value={row.feed > 0 ? row.feed.toFixed(1) : '—'} color="#10b981" />
          {row.culling_reason && (
            <div style={{
              width: '100%', marginTop: 4,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(249,115,22,0.08)',
              border: '1px solid rgba(249,115,22,0.2)',
              fontSize: 12, color: 'rgba(255,255,255,0.6)',
            }}>
              淘汰原因：{row.culling_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TotalsBar({ t }: { t: DailyHenReport['totals'] }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8,
      padding: '12px 16px',
      background: 'rgba(255,255,255,0.03)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      {[
        { label: '总存栏', value: t.current_qty.toLocaleString() + '只', color: '#f59e0b' },
        { label: '总产蛋', value: t.eggs.toLocaleString() + '枚', color: '#10b981' },
        { label: '综合产蛋率', value: t.lay_rate + '%', color: parseFloat(t.lay_rate) >= 80 ? '#10b981' : '#ef4444' },
        { label: '死亡', value: String(t.mortality), color: '#ef4444' },
        { label: '淘汰', value: String(t.elimination), color: '#f97316' },
        { label: '今日损耗', value: String(t.total_loss), color: '#dc2626' },
      ].map(item => (
        <div key={item.label} style={{
          background: `${item.color}10`, border: `1px solid ${item.color}25`,
          borderRadius: 10, padding: '8px 0', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>{item.label}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: item.color }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function DailyHenReportPage() {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [report, setReport] = useState<DailyHenReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await mobileApi.getDailyHenReport(d);
      setReport(data);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const prevDay = () => setDate(d => addDays(d, -1));
  const nextDay = () => { if (date < today()) setDate(d => addDays(d, 1)); };

  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* AppBar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 10,
        gap: 10,
      }}>
        <button onClick={() => router.back()} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
        }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'white' }}>母鸡存栏日报</div>
        <button onClick={() => load(date)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', padding: 4, display: 'flex', alignItems: 'center',
        }}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Date nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button onClick={prevDay} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center',
        }}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'white', minWidth: 110, textAlign: 'center' }}>
          {date}
        </div>
        <button onClick={nextDay} disabled={date >= today()} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', cursor: date >= today() ? 'default' : 'pointer',
          color: date >= today() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
          display: 'flex', alignItems: 'center',
        }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Totals */}
      {report && <TotalsBar t={report.totals} />}

      {/* Content */}
      <div style={{
        flex: 1,
        padding: '12px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            加载中…
          </div>
        )}

        {!loading && error && (
          <div style={{
            margin: '20px 0', padding: '14px 16px', borderRadius: 12,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444', fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && report && report.rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
            暂无存栏鸡群数据
          </div>
        )}

        {!loading && report && report.rows.map((row) => (
          <HouseCard key={row.house_code + row.flock_no} row={row} />
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
