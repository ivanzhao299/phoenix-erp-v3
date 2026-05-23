'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft, Sun, Moon } from 'lucide-react';
import { mobileApi, KpiData, PackagingDailyReport, QcInspection, FarmLog, FlockRecord, PackagingTrendItem, DeviceAlert, EggStockRow } from '@/lib/mobile-api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton } from '@/components/mobile/MobileSkeleton';

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

const ALERT_LABELS: Record<string, string> = {
  TEMP_HIGH: '温度过高', TEMP_LOW: '温度过低',
  HUMIDITY_HIGH: '湿度过高', HUMIDITY_LOW: '湿度过低',
  CO2_HIGH: 'CO₂浓度高', OFFLINE: '设备离线',
  POWER_FAILURE: '电源故障', SENSOR_ERROR: '传感器异常',
  OVER_HIGH: '数值超上限', OVER_LOW: '数值超下限',
  AMMONIA_HIGH: '氨气浓度高', FAN_FAULT: '风机故障',
  WATER_LEAK: '漏水告警', FEED_LOW: '饲料不足',
};

// ── 迷你柱状图 ────────────────────────────────────────────────────────────────

function MiniBarChart({ data, selectedDate }: { data: PackagingTrendItem[]; selectedDate: string }) {
  const { t } = useMobileTheme();
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.summary.total_packed), 1);
  return (
    <div>
      <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6 }}>近 7 日包装箱数</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 52 }}>
        {data.map(day => {
          const pct = Math.max((day.summary.total_packed / maxVal) * 100, day.summary.total_packed > 0 ? 8 : 2);
          const isSelected = day.date === selectedDate;
          const isToday = day.date === fmtDate(new Date());
          return (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                <div style={{
                  width: '100%',
                  height: `${pct}%`,
                  background: isSelected ? '#f59e0b' : isToday ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.25)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.3s',
                  minHeight: 2,
                }} />
              </div>
              <div style={{ fontSize: 9, color: isSelected ? '#f59e0b' : t.textFaint, fontWeight: isSelected ? 700 : 400 }}>
                {day.date.slice(8)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 子组件 ───────────────────────────────────────────────────────────────────

function Section({ title, icon, color, children, loading, error }: {
  title: string; icon: string; color: string;
  children: React.ReactNode; loading: boolean; error?: string;
}) {
  const { t } = useMobileTheme();
  return (
    <div style={{
      background: t.cardBg,
      border: `1px solid ${color}30`,
      borderRadius: 16, padding: '16px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{title}</span>
        {loading && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: t.textFaint }}>加载中…</span>
        )}
      </div>
      {error ? (
        <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '8px 0' }}>
          {error}
        </div>
      ) : loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 52, borderRadius: 10, background: t.btnBg, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : children}
    </div>
  );
}

function StatCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  const { t } = useMobileTheme();
  return (
    <div style={{ background: t.cardBg, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || t.text, lineHeight: 1.1 }}>{value}</div>
      {unit && <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function MobileDashboardPage() {
  const router = useRouter();
  const { lang } = useLanguage();
  const { isDark, toggle, t } = useMobileTheme();
  const { allowed, loading: permLoading } = useMobilePermission('dashboard');
  const today = fmtDate(new Date());

  const [date, setDate]         = useState(today);
  const [kpi, setKpi]           = useState<KpiData | null>(null);
  const [pkg, setPkg]           = useState<PackagingDailyReport | null>(null);
  const [qc, setQc]             = useState<QcInspection[] | null>(null);
  const [farm, setFarm]         = useState<FarmLog[] | null>(null);
  const [trend, setTrend]       = useState<PackagingTrendItem[]>([]);
  const [alerts, setAlerts]     = useState<DeviceAlert[]>([]);
  const [flocks, setFlocks]     = useState<FlockRecord[]>([]);
  const [eggStock, setEggStock] = useState<EggStockRow[]>([]);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [houseExpanded, setHouseExpanded]   = useState(false);
  const [flockExpanded, setFlockExpanded]   = useState(false);

  const [kpiLoading, setKpiLoading]   = useState(true);
  const [pkgLoading, setPkgLoading]   = useState(true);
  const [qcLoading, setQcLoading]     = useState(true);
  const [farmLoading, setFarmLoading] = useState(true);

  const [kpiErr, setKpiErr]   = useState('');
  const [pkgErr, setPkgErr]   = useState('');
  const [qcErr, setQcErr]     = useState('');
  const [farmErr, setFarmErr] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);

  // 趋势图、告警、存栏批次只在初次加载/刷新时更新（不随日期切换重复请求）
  useEffect(() => {
    mobileApi.getPackagingTrend(today, 7)
      .then(data => { const arr = Array.isArray(data) ? data : (data as any)?.data ?? []; setTrend(arr); })
      .catch(() => {});
    mobileApi.getOpenAlerts()
      .then(data => { const arr = Array.isArray(data) ? data : []; setAlerts(arr); })
      .catch(() => {});
    mobileApi.getFlocks()
      .then(data => { const arr = Array.isArray(data) ? data : (data as any)?.data ?? []; setFlocks(arr); })
      .catch(() => {});
    mobileApi.getEggStock()
      .then(data => { setEggStock(Array.isArray(data) ? data : []); })
      .catch(() => {});
  }, [refreshKey, today]);

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
  if (permLoading) return <MobilePageSkeleton title="每日看板" statGrid onBack={() => router.back()} />;
  if (!allowed) return null;

  const isToday = date === today;
  const isFuture = date > today;

  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => { if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1))); };

  // ── 生产计算 ──
  const todayEggs    = kpi?.meta?.todayEggs ?? 0;
  const layingTotal  = kpi?.meta?.layingTotal ?? 0;
  const layRate      = kpi?.meta?.todayLayRate;
  const farmMortality = farm ? farm.reduce((s, r) => s + Number(r.mortality_qty || 0), 0) : null;

  // 按栋舍聚合日志（同一 house_code / flock_no 可能有多班次）
  const houseMap = new Map<string, { eggs: number; mortality: number; dirty: number; broken: number; feed: number }>();
  (farm ?? []).forEach(r => {
    const key = r.house_code || r.flock_no || '—';
    const cur = houseMap.get(key) ?? { eggs: 0, mortality: 0, dirty: 0, broken: 0, feed: 0 };
    cur.eggs     += Number(r.eggs_produced || 0);
    cur.mortality += Number(r.mortality_qty || 0);
    cur.dirty    += Number(r.dirty_eggs    || 0);
    cur.broken   += Number(r.broken_eggs   || 0);
    cur.feed     += Number(r.feed_consumed || 0);
    houseMap.set(key, cur);
  });
  const houseRows = Array.from(houseMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

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
      background: t.pageBg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        background: t.appBarBg,
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: t.textSub, cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>
          {lang === 'en' ? 'Daily Report' : lang === 'lo' ? 'ລາຍງານປະຈໍາວັນ' : '每日数据看板'}
        </span>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)}
          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', padding: 4 }}>
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
            <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint, textAlign: 'center' }}>
              死淘数据：{farmErr}
            </div>
          )}

          {/* 逐栋明细（可展开） */}
          {houseRows.length > 0 && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${t.divider}`, paddingTop: 10 }}>
              <button
                onClick={() => setHouseExpanded(v => !v)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                  逐栋明细 · {houseRows.length} 栋
                </span>
                <span style={{ fontSize: 11, color: t.textFaint }}>{houseExpanded ? '收起 ▴' : '展开 ▾'}</span>
              </button>
              {houseExpanded && (
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: t.textFaint }}>
                        {['栋舍', '产蛋', '死淘', '脏破蛋', '耗料(kg)'].map(h => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: h === '栋舍' ? 'left' : 'right', fontWeight: 600, fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {houseRows.map(([key, v]) => (
                        <tr key={key} style={{ borderTop: `1px solid ${t.divider}` }}>
                          <td style={{ padding: '5px 6px', color: '#f59e0b', fontWeight: 600 }}>{key}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: t.text }}>{v.eggs > 0 ? fmt(v.eggs) : '—'}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: v.mortality > 0 ? '#f87171' : t.textMuted }}>{v.mortality > 0 ? v.mortality : '0'}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: t.textSub }}>{(v.dirty + v.broken) > 0 ? v.dirty + v.broken : '—'}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: t.textSub }}>{v.feed > 0 ? fmt(v.feed, 1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 存栏批次（可展开，仅 FARM_MGR+ 可见） */}
          {flocks.length > 0 && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${t.divider}`, paddingTop: 10 }}>
              <button
                onClick={() => setFlockExpanded(v => !v)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                  存栏批次 · {flocks.length} 批 · {fmt(flocks.reduce((s, f) => s + Number(f.current_qty || 0), 0))} 只
                </span>
                <span style={{ fontSize: 11, color: t.textFaint }}>{flockExpanded ? '收起 ▴' : '展开 ▾'}</span>
              </button>
              {flockExpanded && (
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: t.textFaint }}>
                        {['批次', '栋舍', '期初', '现存', '产蛋率'].map(h => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: h === '批次' ? 'left' : 'right', fontWeight: 600, fontSize: 10 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flocks.map(f => {
                        const lr = f.current_lay_rate != null ? Number(f.current_lay_rate) : null;
                        return (
                          <tr key={f.flock_no} style={{ borderTop: `1px solid ${t.divider}` }}>
                            <td style={{ padding: '5px 6px', color: '#f59e0b', fontWeight: 600 }}>{f.flock_no}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'right', color: t.textSub }}>{f.house_code || '—'}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'right', color: t.textMuted }}>{fmt(f.initial_qty)}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'right', color: t.text }}>{fmt(f.current_qty)}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'right', color: lr != null ? (lr >= 80 ? '#10b981' : lr >= 60 ? '#f59e0b' : '#ef4444') : t.textFaint }}>
                              {lr != null ? `${lr.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6 }}>按等级分布</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {byGrade.map(g => (
                  <div key={g.grade} style={{
                    flex: '1 1 auto', minWidth: 60,
                    background: `${GRADE_COLORS[g.grade] || '#6b7280'}18`,
                    border: `1px solid ${GRADE_COLORS[g.grade] || '#6b7280'}40`,
                    borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: GRADE_COLORS[g.grade] || '#9ca3af' }}>{g.grade}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{fmt(g.qty)}</div>
                    <div style={{ fontSize: 10, color: t.textFaint }}>箱</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 7 日趋势迷你柱状图 */}
          {trend.length > 0 && <MiniBarChart data={trend} selectedDate={date} />}
          {byGrade.length === 0 && !pkgLoading && trend.length === 0 && (
            <div style={{ fontSize: 12, color: t.textFaint, textAlign: 'center', padding: '8px 0' }}>
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
              value={qcRate != null ? `${qcRate}%` : '—'}
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
            <div style={{ marginTop: 8, fontSize: 12, color: t.textFaint, textAlign: 'center' }}>
              当日暂无检测记录
            </div>
          )}
        </Section>

        {/* ── 蛋品库存 ── */}
        {eggStock.length > 0 && (() => {
          const totalQty   = eggStock.reduce((s, r) => s + r.qty, 0);
          const totalTrays = eggStock.reduce((s, r) => s + r.trays, 0);
          const nonEmpty   = eggStock.filter(r => r.qty > 0);
          return (
            <div style={{
              background: t.cardBg,
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 16, padding: '16px',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🥚</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>蛋品库存</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{totalTrays}</span>
                  <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 3 }}>提</span>
                  <span style={{ fontSize: 13, color: t.textFaint, marginLeft: 6 }}>{totalQty.toLocaleString()} 枚</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {nonEmpty.map(r => (
                  <div key={r.grade} style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}>
                    <div style={{ fontSize: 11, color: t.textMuted }}>{r.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{r.qty.toLocaleString()}</div>
                  </div>
                ))}
                {nonEmpty.length === 0 && (
                  <div style={{ fontSize: 12, color: t.textFaint, padding: '4px 0' }}>库存为零</div>
                )}
              </div>
            </div>
          );
        })()}

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
              label="今日告警"
              value={String(alerts.length || kpi?.stats?.alerts?.value || 0)}
              unit="条"
              color={alerts.length > 0 ? '#ef4444' : undefined}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint, textAlign: 'center' }}>
            {isToday ? '今日 POS 销售数据' : '历史销售数据暂不支持按日查询'}
          </div>
        </Section>

        {/* ── 设备告警列表 ── */}
        {alerts.length > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 16, padding: '14px 16px',
            marginBottom: 12,
          }}>
            <button
              onClick={() => setAlertsExpanded(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>
                  设备告警
                </span>
                <span style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.2)', color: '#f87171', fontWeight: 700,
                }}>
                  {alerts.length} 条未处理
                </span>
              </div>
              <span style={{ color: t.textMuted, fontSize: 12 }}>
                {alertsExpanded ? '收起' : '展开'}
              </span>
            </button>

            {alertsExpanded && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.slice(0, 15).map(a => (
                  <div key={a.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px',
                    background: t.cardBg,
                    borderRadius: 10,
                    borderLeft: '3px solid #ef4444',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                        {ALERT_LABELS[a.alert_type] || a.alert_type}
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                        {a.erp_house_code} · {new Date(a.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {a.value != null && (
                      <div style={{ fontSize: 12, color: '#f87171', fontWeight: 700, textAlign: 'right' }}>
                        {String(a.value)}
                        {a.threshold != null && <div style={{ fontSize: 10, color: t.textFaint, fontWeight: 400 }}>阈值 {String(a.threshold)}</div>}
                      </div>
                    )}
                  </div>
                ))}
                {alerts.length > 15 && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: t.textFaint }}>
                    共 {alerts.length} 条，仅显示最新 15 条
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
