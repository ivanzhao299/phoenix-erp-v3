'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft } from 'lucide-react';
import { mobileApi, KpiData, PackagingDailyReport, QcInspection, FarmLog } from '@/lib/mobile-api';
import { useLanguage } from '@/contexts/LanguageContext';

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(n: number | string | undefined | null, decimals = 0): string {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (isNaN(v)) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const GRADE_COLORS: Record<string, string> = {
  AAA: '#f59e0b', AA: '#3b82f6', A: '#10b981',
  B: '#f97316', C: '#8b5cf6',
};

// ── 子组件 ───────────────────────────────────────────────────────────────────

function Section({ title, icon, color, children, loading, error }: {
  title: string; icon: string; color: string;
  children: React.ReactNode; loading: boolean; error?: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color}30`,
      borderRadius: 16, padding: '16px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{title}</span>
        {loading && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>加载中…</span>
        )}
      </div>
      {error ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px 0' }}>
          {error}
        </div>
      ) : loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : children}
    </div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'white', lineHeight: 1.1 }}>{value}</div>
      {unit && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function MobileDashboardPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const today = fmtDate(new Date());

  const [date, setDate]         = useState(today);
  const [kpi, setKpi]           = useState<KpiData | null>(null);
  const [pkg, setPkg]           = useState<PackagingDailyReport | null>(null);
  const [qc, setQc]             = useState<QcInspection[] | null>(null);
  const [farm, setFarm]         = useState<FarmLog[] | null>(null);

  const [kpiLoading, setKpiLoading]   = useState(true);
  const [pkgLoading, setPkgLoading]   = useState(true);
  const [qcLoading, setQcLoading]     = useState(true);
  const [farmLoading, setFarmLoading] = useState(true);

  const [kpiErr, setKpiErr]   = useState('');
  const [pkgErr, setPkgErr]   = useState('');
  const [qcErr, setQcErr]     = useState('');
  const [farmErr, setFarmErr] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAll = useCallback(async (d: string) => {
    // 四个请求并发，互不影响
    setKpiLoading(true); setPkgLoading(true); setQcLoading(true); setFarmLoading(true);
    setKpiErr(''); setPkgErr(''); setQcErr(''); setFarmErr('');

    // 1. KPI（仅今日有意义，其他日期也调用但结果是今日）
    mobileApi.getKpi()
      .then(data => { setKpi(data); setKpiLoading(false); })
      .catch(() => { setKpiErr('数据加载失败'); setKpiLoading(false); });

    // 2. 包装日报
    mobileApi.getPackagingReport(d)
      .then(data => { setPkg(data); setPkgLoading(false); })
      .catch(() => { setPkgErr('数据加载失败'); setPkgLoading(false); });

    // 3. 质检记录
    mobileApi.getQcInspections(d)
      .then(data => {
        // CRUD 端点可能包在 {data: [...]} 里
        const arr = Array.isArray(data) ? data : (data as any)?.data ?? [];
        setQc(arr);
        setQcLoading(false);
      })
      .catch(() => { setQcErr('数据加载失败'); setQcLoading(false); });

    // 4. 养殖日报（权限较严，403 时降级显示）
    mobileApi.getFarmLogs(d)
      .then(data => {
        const arr = Array.isArray(data) ? data : (data as any)?.data ?? [];
        setFarm(arr);
        setFarmLoading(false);
      })
      .catch((e: Error) => {
        setFarmErr(e.message?.includes('403') ? '权限不足' : e.message?.includes('401') ? '请重新登录' : '数据加载失败');
        setFarmLoading(false);
      });
  }, []);

  useEffect(() => { fetchAll(date); }, [date, refreshKey, fetchAll]);

  const isToday = date === today;
  const isFuture = date > today;

  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); };

  // ── 生产计算 ──
  const todayEggs    = kpi?.meta?.todayEggs ?? 0;
  const layingTotal  = kpi?.meta?.layingTotal ?? 0;
  const layRate      = kpi?.meta?.todayLayRate;
  const farmMortality = farm ? farm.reduce((s, r) => s + Number(r.mortality_qty || 0), 0) : null;

  // ── 包装计算 ──
  const pkgTotal   = Number(pkg?.summary?.total_packed || 0);
  const pkgPlan    = Number(pkg?.summary?.total_plan   || 0);
  const pkgRate    = pkgPlan > 0 ? Math.round((pkgTotal / pkgPlan) * 100) : null;
  const byGrade    = pkg?.by_grade ?? [];

  // ── 质检计算 ──
  const qcTotal  = qc?.length ?? 0;
  const qcPass   = qc?.filter(r => r.result === 'PASS').length ?? 0;
  const qcFail   = qc?.filter(r => r.result === 'FAIL').length ?? 0;
  const qcRate   = qcTotal > 0 ? Math.round((qcPass / qcTotal) * 100) : null;

  // ── 销售计算 ──
  const salesVal  = kpi?.stats?.sales?.value;
  const salesUnit = kpi?.stats?.sales?.unit;

  const dateLabel = (() => {
    if (date === today) return lang === 'en' ? 'Today' : lang === 'lo' ? 'ມື້ນີ້' : '今天';
    if (date === fmtDate(addDays(toDate(today), -1))) return lang === 'en' ? 'Yesterday' : lang === 'lo' ? 'ມື້ວານ' : '昨天';
    return date;
  })();

  return (
    <div style={{
      minHeight: '100svh',
      background: 'linear-gradient(160deg,#070b14 0%,#0f1929 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'white', flex: 1 }}>
          {lang === 'en' ? 'Daily Report' : lang === 'lo' ? 'ລາຍງານປະຈໍາວັນ' : '每日数据看板'}
        </span>
        <button onClick={() => setRefreshKey(k => k + 1)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 4 }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 日期选择器 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(245,158,11,0.06)',
        borderBottom: '1px solid rgba(245,158,11,0.1)',
      }}>
        <button onClick={prevDay}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 6 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{dateLabel}</div>
          {dateLabel !== date && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>}
        </div>
        <button onClick={nextDay} disabled={isToday}
          style={{ background: 'none', border: 'none', color: isToday ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', cursor: isToday ? 'default' : 'pointer', padding: 6 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 16px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

        {/* ── 生产概况 ── */}
        <Section title="生产概况" icon="🐔" color="#10b981" loading={kpiLoading} error={kpiErr}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            <StatCard label="今日产蛋" value={fmt(todayEggs)} unit="枚" color="#f59e0b" />
            <StatCard label="产蛋率" value={layRate != null ? `${layRate}%` : '—'} color="#10b981" />
            <StatCard label="存栏数" value={fmt(layingTotal)} unit="只" />
            <StatCard
              label="今日死淘"
              value={farmMortality != null ? fmt(farmMortality) : '—'}
              unit="只"
              color={farmMortality && farmMortality > 0 ? '#ef4444' : undefined}
            />
          </div>
          {farmErr && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              死淘数据：{farmErr}
            </div>
          )}
        </Section>

        {/* ── 包装产出 ── */}
        <Section title="包装产出" icon="📦" color="#f59e0b" loading={pkgLoading} error={pkgErr}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 10 }}>
            <StatCard label="完成箱数" value={fmt(pkgTotal)} unit="箱" color="#f59e0b" />
            <StatCard
              label="完成率"
              value={pkgRate != null ? `${pkgRate}%` : pkgPlan === 0 ? '无计划' : '—'}
              color={pkgRate != null ? (pkgRate >= 90 ? '#10b981' : pkgRate >= 70 ? '#f59e0b' : '#ef4444') : undefined}
            />
          </div>
          {byGrade.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>按等级分布</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {byGrade.map(g => (
                  <div key={g.grade} style={{
                    flex: '1 1 auto', minWidth: 60,
                    background: `${GRADE_COLORS[g.grade] || '#6b7280'}18`,
                    border: `1px solid ${GRADE_COLORS[g.grade] || '#6b7280'}40`,
                    borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: GRADE_COLORS[g.grade] || '#9ca3af' }}>{g.grade}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{fmt(g.qty)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>箱</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {byGrade.length === 0 && !pkgLoading && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '8px 0' }}>
              当日暂无包装记录
            </div>
          )}
        </Section>

        {/* ── 品质检测 ── */}
        <Section title="品质检测" icon="🛡️" color="#8b5cf6" loading={qcLoading} error={qcErr}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            <StatCard label="今日检测" value={fmt(qcTotal)} unit="次" />
            <StatCard
              label="合格率"
              value={qcRate != null ? `${qcRate}%` : qcTotal === 0 ? '—' : '—'}
              color={qcRate != null ? (qcRate >= 95 ? '#10b981' : qcRate >= 80 ? '#f59e0b' : '#ef4444') : undefined}
            />
            <StatCard
              label="不合格"
              value={fmt(qcFail)}
              unit="次"
              color={qcFail > 0 ? '#ef4444' : undefined}
            />
          </div>
          {qcTotal === 0 && !qcLoading && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              当日暂无检测记录
            </div>
          )}
        </Section>

        {/* ── 销售情况 ── */}
        <Section title="销售情况" icon="💰" color="#3b82f6" loading={kpiLoading} error={kpiErr}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            <StatCard
              label="今日销售额"
              value={salesVal != null ? fmt(Number(salesVal)) : '—'}
              unit={salesUnit?.split(' ')[0] || 'LAK'}
              color="#3b82f6"
            />
            <StatCard
              label="告警"
              value={String(kpi?.stats?.alerts?.value || 0)}
              unit="条"
              color={(Number(kpi?.stats?.alerts?.value) || 0) > 0 ? '#ef4444' : undefined}
            />
          </div>
          {isToday && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
              仅显示今日 POS 销售数据
            </div>
          )}
          {!isToday && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
              历史销售数据暂不支持按日查询
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
