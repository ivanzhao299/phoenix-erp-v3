'use client';

import { useState, useMemo } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft, Sun, Moon, Truck } from 'lucide-react';
import useSWR from 'swr';
import { mobileApi, QcInspection, DailyHenReport, FlockRecord, PackagingTrendItem, DeviceAlert, EggStockRow } from '@/lib/mobile-api';
import { authHeader } from '@/lib/mobile-auth-token';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { MobilePageSkeleton } from '@/components/mobile/MobileSkeleton';
import { formatMasterData } from '@/lib/business-display';

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
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
const GRADE_COLORS: Record<string, string> = {
  AAA: 'var(--status-warning)',
  AA: 'var(--status-info)',
  A: 'var(--status-success)',
  B: 'var(--status-warning)',
  C: 'var(--color-purple-500)'
};
const ALERT_LABELS: Record<string, string> = {
  TEMP_HIGH: '温度过高',
  TEMP_LOW: '温度过低',
  HUMIDITY_HIGH: '湿度过高',
  HUMIDITY_LOW: '湿度过低',
  CO2_HIGH: 'CO₂浓度高',
  OFFLINE: '设备离线',
  POWER_FAILURE: '电源故障',
  SENSOR_ERROR: '传感器异常',
  OVER_HIGH: '数值超上限',
  OVER_LOW: '数值超下限',
  AMMONIA_HIGH: '氨气浓度高',
  FAN_FAULT: '风机故障',
  WATER_LEAK: '漏水告警',
  FEED_LOW: '饲料不足'
};

const MOBILE_SALES_DASHBOARD_PERMS = [
  'MENU_SALES2_DASHBOARD',
  'MENU_SALES2_ORDER',
  'MENU_SALES2_CUSTOMER',
  'MENU_SALES2_PRICE',
  'MENU_SALES2_DELIVERY',
  'MENU_SALES2_RETURN',
  'MENU_SALES2_CHANNEL',
  'MENU_SALES2_REPORT',
  'MENU_SALES2_INVENTORY',
] as const;

// ── 迷你柱状图 ────────────────────────────────────────────────────────────────

function MiniBarChart({
  data,
  selectedDate
}: {
  data: PackagingTrendItem[];
  selectedDate: string;
}) {
  const {
    t
  } = useMobileTheme();
  const { t: tt } = useLanguage();
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.summary.total_packed), 1);
  return <div>
      <div style={{
      fontSize: 11,
      color: t.textFaint,
      marginBottom: 6
    }}>{tt('mob.home.last7_packing_boxes', '近 7 日包装箱数')}</div>
      <div style={{
      display: 'flex',
      gap: 4,
      alignItems: 'flex-end',
      height: 52
    }}>
        {data.map(day => {
        const pct = Math.max(day.summary.total_packed / maxVal * 100, day.summary.total_packed > 0 ? 8 : 2);
        const isSelected = day.date === selectedDate;
        const isToday = day.date === fmtDate(new Date());
        return <div key={day.date} style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2
        }}>
              <div style={{
            flex: 1,
            width: '100%',
            display: 'flex',
            alignItems: 'flex-end'
          }}>
                <div style={{
              width: '100%',
              minHeight: 2,
              height: `${pct}%`,
              background: isSelected ? 'var(--status-warning)' : isToday ? 'rgba(245,158,11,0.5)' : 'var(--status-warning-border)',
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s'
            }} />
              </div>
              <div style={{
            fontSize: 9,
            color: isSelected ? 'var(--status-warning)' : t.textFaint,
            fontWeight: isSelected ? 700 : 400
          }}>
                {day.date.slice(8)}
              </div>
            </div>;
      })}
      </div>
    </div>;
}

// ── 通用 Section 容器 ─────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  color,
  children,
  loading,
  error
}: {
  title: string;
  icon: string;
  color: string;
  children: React.ReactNode;
  loading: boolean;
  error?: string;
}) {
  const {
    t
  } = useMobileTheme();
  const { t: tt } = useLanguage();
  return <div style={{
    background: t.cardBg,
    border: `1px solid ${color}30`,
    borderRadius: 16,
    padding: '16px',
    marginBottom: 12
  }}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14
    }}>
        <span className={u.fs18}>{icon}</span>
        <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: t.text
      }}>{title}</span>
        {loading && <span style={{
        marginLeft: 'auto',
        fontSize: 11,
        color: t.textFaint
      }}>{tt('mob.home.loading', '加载中…')}</span>}
      </div>
      {error ? <div style={{
      fontSize: 12,
      color: t.textMuted,
      textAlign: 'center',
      padding: '8px 0'
    }}>{error}</div> : loading ? <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2,1fr)',
      gap: 8
    }}>
          {[1, 2, 3, 4].map(i => <div key={i} style={{
        height: 52,
        borderRadius: 10,
        background: t.btnBg,
        animation: 'pulse 1.5s infinite'
      }} />)}
        </div> : children}
    </div>;
}
function StatCard({
  label,
  value,
  unit,
  color
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  const {
    t
  } = useMobileTheme();
  return <div style={{
    background: t.cardBg,
    borderRadius: 10,
    padding: '10px 12px'
  }}>
      <div style={{
      fontSize: 11,
      color: t.textMuted,
      marginBottom: 4
    }}>{label}</div>
      <div style={{
      fontSize: 20,
      fontWeight: 800,
      color: color || t.text,
      lineHeight: 1.1
    }}>{value}</div>
      {unit && <div style={{
      fontSize: 10,
      color: t.textFaint,
      marginTop: 2
    }}>{unit}</div>}
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function MobileDashboardPage() {
  const router = useRouter();
  const {
    hasPermission
  } = useAuth();
  const {
    lang,
    t: tt
  } = useLanguage();
  const {
    isDark,
    toggle,
    t
  } = useMobileTheme();
  const {
    allowed,
    loading: permLoading
  } = useMobilePermission('dashboard');
  const today = fmtDate(new Date());
  const [date, setDate] = useState(today);
  const [refreshKey, setRefreshKey] = useState(0);
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [houseExpanded, setHouseExpanded] = useState(false);
  const [flockExpanded, setFlockExpanded] = useState(false);

  // ── 菜单可见性标志（在 SWR 之前计算，用于条件 fetch）────────────────────────
  const showFarmFull = hasPermission('MENU_FARM_DATA', 'V') || hasPermission('MENU_FARM_DAILY', 'V') || hasPermission('MENU_FARM_VET', 'V');
  const showFarmSummary = !showFarmFull && hasPermission('MENU_DASHBOARD', 'V');
  const showFarm = showFarmFull || showFarmSummary;
  const showPkg = hasPermission('MENU_PKG_OP', 'V') || hasPermission('MENU_PKG_MGR', 'V');
  const showQuality = hasPermission('MENU_QA_OP', 'V') || hasPermission('MENU_QA_MGR', 'V') || hasPermission('MENU_QA_MASTER', 'V') || hasPermission('MENU_MD_QUALITY', 'V');
  const showStock = hasPermission('MENU_WMS_VIEW', 'V') || hasPermission('MENU_WMS_INOUT', 'V') || hasPermission('MENU_SALES2_INVENTORY', 'V');
  const showSales = MOBILE_SALES_DASHBOARD_PERMS.some(menu => hasPermission(menu, 'V'));
  const showAlerts = hasPermission('MENU_DEVICE_MONITOR', 'V');
  const showDelivery = hasPermission('MENU_MOBILE_DELIVERY', 'V') || hasPermission('MENU_SALES2_DELIVERY', 'V');

  // ── SWR 数据加载（null key = 跳过 fetch，不消耗网络）───────────────────────
  // 移动端优化：关闭聚焦自动重拉（避免每次切回 App 都刷 8 个端点，省流量/电量；
  //   用户可用顶部刷新按钮主动刷）；断网恢复后重拉；保留上一份数据避免切日期闪骨架。
  const swrOpts = {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    dedupingInterval: 30_000,
  };
  const {
    data: kpiData,
    isLoading: kpiLoading,
    error: _kpiErr
  } = useSWR(showFarm || showSales ? `kpi/${refreshKey}` : null, () => mobileApi.getKpi(), swrOpts);
  const {
    data: pkgData,
    isLoading: pkgLoading,
    error: _pkgErr
  } = useSWR(showPkg ? `pkg/${date}/${refreshKey}` : null, () => mobileApi.getPackagingReport(date), swrOpts);
  const {
    data: qcRaw,
    isLoading: qcLoading,
    error: _qcErr
  } = useSWR(showQuality ? `qc/${date}/${refreshKey}` : null, () => mobileApi.getQcInspections(date), swrOpts);
  const {
    data: farmReport,
    isLoading: farmLoading,
    error: _farmErr
  } = useSWR(showFarmFull ? `farm-report/${date}/${refreshKey}` : null, () => mobileApi.getDailyHenReport(date), swrOpts);
  const {
    data: trendRaw
  } = useSWR(showPkg ? `trend/${refreshKey}` : null, () => mobileApi.getPackagingTrend(today, 7), swrOpts);
  const {
    data: alertsRaw
  } = useSWR(showAlerts ? `alerts/${refreshKey}` : null, () => mobileApi.getOpenAlerts(), swrOpts);
  // G101：告警类型标签走字典 IOT_ALERT_TYPE（合并硬编码 ALERT_LABELS 兜底——新告警类型也有可读名）
  const { data: alertDict } = useSWR(showAlerts ? 'iotAlertDict' : null, () => mobileApi.getDict('IOT_ALERT_TYPE'), swrOpts);
  const alertLabels = useMemo(
    () => ({ ...ALERT_LABELS, ...Object.fromEntries((alertDict ?? []).map(d => [d.value, d.label])) }),
    [alertDict],
  );
  const {
    data: flocksRaw
  } = useSWR(showFarmFull ? `flocks/${refreshKey}` : null, () => mobileApi.getFlocks(), swrOpts);
  const {
    data: eggStockRaw
  } = useSWR(showStock ? `eggstock/${refreshKey}` : null, () => mobileApi.getEggStock(), swrOpts);
  const {
    data: deliveryStats,
    isLoading: dispatchLoading
  } = useSWR(showDelivery ? `delivery-stats/${refreshKey}` : null, async () => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '';
    const res = await fetch(`${base}/api/v2/mobile/delivery/dashboard`, {
      headers: authHeader() as HeadersInit
    });
    if (!res.ok) return null;
    return res.json();
  }, swrOpts);

  // ── 数据规范化 ────────────────────────────────────────────────────────────────
  const kpi = kpiData ?? null;
  const pkg = pkgData ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qc = useMemo((): QcInspection[] => Array.isArray(qcRaw) ? qcRaw as QcInspection[] : (qcRaw as any)?.data ?? [], [qcRaw]);
  const farm = useMemo(() => (farmReport as DailyHenReport | undefined)?.rows ?? [], [farmReport]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trend = useMemo((): PackagingTrendItem[] => Array.isArray(trendRaw) ? trendRaw as PackagingTrendItem[] : (trendRaw as any)?.data ?? [], [trendRaw]);
  const alerts = useMemo((): DeviceAlert[] => Array.isArray(alertsRaw) ? alertsRaw as DeviceAlert[] : [], [alertsRaw]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flocks = useMemo((): FlockRecord[] => Array.isArray(flocksRaw) ? flocksRaw as FlockRecord[] : (flocksRaw as any)?.data ?? [], [flocksRaw]);
  const eggStock = useMemo((): EggStockRow[] => Array.isArray(eggStockRaw) ? eggStockRaw as EggStockRow[] : [], [eggStockRaw]);
  // V2 配送统计（从 sal_delivery_orders 汇总，不再读旧 log_dispatch）
  const delStats = deliveryStats ?? null;
  const kpiErr = _kpiErr ? tt('mob.home.load_failed', '数据加载失败') : '';
  const pkgErr = _pkgErr ? tt('mob.home.load_failed', '数据加载失败') : '';
  const qcErr = _qcErr ? tt('mob.home.load_failed', '数据加载失败') : '';
  const farmErr = _farmErr ? _farmErr.message?.includes('403') ? tt('mob.home.no_permission', '权限不足') : _farmErr.message?.includes('401') ? tt('mob.home.relogin', '请重新登录') : tt('mob.home.load_failed', '数据加载失败') : '';
  if (permLoading) return <MobilePageSkeleton title={tt('mob.home.daily_board', '每日看板')} statGrid onBack={() => router.back()} />;
  if (!allowed) return null;
  const isToday = date === today;
  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => {
    if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1)));
  };

  // ── 生产计算 ──
  const todayEggs = showFarmFull ? Number(farmReport?.totals?.eggs ?? 0) : kpi?.meta?.todayEggs ?? 0;
  const layingTotal = showFarmFull ? Number(farmReport?.totals?.current_qty ?? 0) : kpi?.meta?.layingTotal ?? 0;
  const layRate = showFarmFull ? farmReport?.totals?.lay_rate : kpi?.meta?.todayLayRate;
  const farmMortality = Number(farmReport?.totals?.total_loss ?? 0);

  // 按栋舍聚合日志
  const houseMap = new Map<string, {
    eggs: number;
    mortality: number;
    dirty: number;
    broken: number;
    feed: number;
  }>();
  farm.forEach(r => {
    const key = r.house_code || r.flock_no || '—';
    const cur = houseMap.get(key) ?? {
      eggs: 0,
      mortality: 0,
      dirty: 0,
      broken: 0,
      feed: 0
    };
    cur.eggs += Number(r.eggs || 0);
    cur.mortality += Number(r.total_loss || 0);
    cur.dirty += Number(r.dirty || 0);
    cur.broken += Number(r.broken || 0);
    cur.feed += Number(r.feed || 0);
    houseMap.set(key, cur);
  });
  const houseRows = Array.from(houseMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // ── 包装计算 ──
  const pkgTotal = Number(pkg?.summary?.total_packed || 0);
  const pkgTasks = Number(pkg?.summary?.total_tasks || 0);
  const byGrade = pkg?.by_grade ?? [];

  // ── 质检计算 ──
  const qcTotal = qc.length;
  const qcPass = qc.filter(r => r.result === 'PASS').length;
  const qcFail = qc.filter(r => r.result === 'FAIL').length;
  const qcRate = qcTotal > 0 ? Math.round(qcPass / qcTotal * 100) : null;

  // ── 销售计算 ──
  const salesVal = kpi?.stats?.sales?.value;
  const salesUnit = kpi?.stats?.sales?.unit;
  const dateLabel = (() => {
    if (date === today) return lang === 'en' ? 'Today' : lang === 'lo' ? 'ມື້ນີ້' : tt('mob.home.today', '今天');
    if (date === fmtDate(addDays(toDate(today), -1))) return lang === 'en' ? 'Yesterday' : lang === 'lo' ? 'ມື້ວານ' : tt('mob.home.yesterday', '昨天');
    return date;
  })();
  return <div style={{
    minHeight: '100svh',
    background: t.pageBg,
    display: 'flex',
    flexDirection: 'column'
  }}>
      {/* 头部 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
      background: t.appBarBg,
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${t.barBorder}`,
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
        <button onClick={() => router.back()} style={{
        background: 'none',
        border: 'none',
        color: t.textSub,
        cursor: 'pointer',
        padding: 4
      }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{
        fontSize: 15,
        fontWeight: 700,
        color: t.text,
        flex: 1
      }}>
          {lang === 'en' ? 'Daily Report' : lang === 'lo' ? 'ລາຍງານປະຈໍາວັນ' : tt('mob.home.daily_data_board', '每日数据看板')}
        </span>
        <button onClick={toggle} style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        color: t.textSub,
        display: 'flex',
        alignItems: 'center'
      }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)} style={{
        background: 'none',
        border: 'none',
        color: t.textMuted,
        cursor: 'pointer',
        padding: 4
      }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 日期选择器 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: 'var(--status-warning-bg-faint)',
      borderBottom: '1px solid var(--status-warning-bg-light)'
    }}>
        <button onClick={prevDay} style={{
        background: 'none',
        border: 'none',
        color: t.textSub,
        cursor: 'pointer',
        padding: 6
      }}>
          <ChevronLeft size={20} />
        </button>
        <div className={u.tac}>
          <div style={{
          fontSize: 15,
          fontWeight: 700,
          color: t.text
        }}>{dateLabel}</div>
          {dateLabel !== date && <div style={{
          fontSize: 11,
          color: t.textMuted
        }}>{date}</div>}
        </div>
        <button onClick={nextDay} disabled={isToday} style={{
        background: 'none',
        border: 'none',
        color: isToday ? t.textFaint : t.textSub,
        cursor: isToday ? 'default' : 'pointer',
        padding: 6
      }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '12px 16px',
      paddingBottom: 'calc(24px + env(safe-area-inset-bottom))'
    }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

        {/* ══ 今日配送概况（LOG_MGR / DRIVER / ADMIN 专属） ══════════════════════ */}
        {showDelivery && <Section title={tt('mob.home.today_delivery_overview', '今日配送概况')} icon="🚛" color="var(--status-info)" loading={dispatchLoading}>
            {!delStats ? <div style={{
          textAlign: 'center',
          color: t.textFaint,
          fontSize: 13,
          padding: '10px 0'
        }}>
                {tt('mob.home.no_delivery_today', '今日暂无配送数据')}
              </div> : <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
                {/* 统计格子 */}
                <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8
          }}>
                  {[{
              label: tt('mob.home.del_today', '今日配送'),
              value: delStats.todayWave ?? 0,
              color: 'var(--status-info)'
            }, {
              label: tt('mob.home.del_to_load', '待装车'),
              value: delStats.planned ?? 0,
              color: 'var(--status-warning)'
            }, {
              label: tt('mob.home.del_in_transit', '配送中'),
              value: delStats.inTransit ?? 0,
              color: 'var(--status-info)'
            }, {
              label: tt('mob.home.del_pending_sign', '待签收'),
              value: delStats.pendingSign ?? 0,
              color: 'var(--status-warning)'
            }, {
              label: tt('mob.home.del_completed', '已完成'),
              value: delStats.todayCompleted ?? delStats.completed ?? 0,
              color: 'var(--status-success)'
            }, {
              label: tt('mob.home.del_cancelled', '已取消'),
              value: delStats.cancelled ?? 0,
              color: 'var(--slate-400)'
            }].map(({
              label,
              value,
              color
            }) => <div key={label} style={{
              background: `${color}10`,
              border: `1px solid ${color}30`,
              borderRadius: 10,
              padding: '10px 8px',
              textAlign: 'center'
            }}>
                      <div style={{
                fontSize: 10,
                color: t.textFaint,
                marginBottom: 4
              }}>{label}</div>
                      <div style={{
                fontSize: 20,
                fontWeight: 800,
                color,
                lineHeight: 1.1
              }}>{value}</div>
                    </div>)}
                </div>
                {/* 前往按钮 */}
                <button onClick={() => router.push('/mobile/delivery')} style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 10,
            border: 'none',
            background: 'var(--status-info-bg)',
            color: 'var(--status-info)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}>
                  <Truck size={14} />
                  {tt('mob.home.enter_delivery_mgmt', '进入配送管理')}
                </button>
              </div>}
          </Section>}

        {/* ══ 生产概况（农场 / 管理层） ══════════════════════════════════════════ */}
        {showFarm && <Section title={tt('mob.home.production_overview', '生产概况')} icon="🐔" color="var(--status-success)" loading={kpiLoading} error={kpiErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8
        }}>
              <StatCard label={tt('mob.home.today_eggs', '今日产蛋')} value={fmt(todayEggs)} unit={tt('mob.home.unit_egg', '枚')} color="var(--status-warning)" />
              <StatCard label={tt('mob.home.lay_rate', '产蛋率')} value={layRate != null ? `${layRate}%` : '—'} color="var(--status-success)" />
              <StatCard label={tt('mob.home.stock_count', '存栏数')} value={fmt(layingTotal)} unit={tt('mob.home.unit_bird', '只')} />
              <StatCard label={tt('mob.home.today_mortality', '今日死淘')} value={showFarmFull ? farmReport ? fmt(farmMortality) : '—' : '—'} unit={tt('mob.home.unit_bird', '只')} color={farmMortality > 0 ? 'var(--status-danger)' : undefined} />
            </div>

            {farmErr && <div style={{
          marginTop: 8,
          fontSize: 11,
          color: t.textFaint,
          textAlign: 'center'
        }}>
                {tt('mob.home.mortality_data', '死淘数据：')}{farmErr}
              </div>}

            {/* 逐栋明细：仅 FARM_FULL 角色显示 */}
            {showFarmFull && houseRows.length > 0 && <div style={{
          marginTop: 10,
          borderTop: `1px solid ${t.divider}`,
          paddingTop: 10
        }}>
                <button onClick={() => setHouseExpanded(v => !v)} style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0
          }}>
                  <span style={{
              fontSize: 12,
              color: t.textMuted,
              fontWeight: 600
            }}>{tt('mob.home.house_detail', '逐栋明细')} · {houseRows.length} {tt('mob.home.unit_house', '栋')}</span>
                  <span style={{
              fontSize: 11,
              color: t.textFaint
            }}>{houseExpanded ? tt('mob.home.collapse', '收起 ▴') : tt('mob.home.expand', '展开 ▾')}</span>
                </button>
                {houseExpanded && <div style={{
            marginTop: 8,
            overflowX: 'auto'
          }}>
                    <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12
            }}>
                      <thead>
                        <tr style={{
                  color: t.textFaint
                }}>
                          {[tt('mob.home.th_house', '栋舍'), tt('mob.home.th_eggs', '产蛋'), tt('mob.home.th_mortality', '死淘'), tt('mob.home.th_dirty_broken', '脏破蛋'), tt('mob.home.th_feed_kg', '耗料(kg)')].map((h, hi) => <th key={hi} style={{
                    padding: '4px 6px',
                    textAlign: hi === 0 ? 'left' : 'right',
                    fontWeight: 600,
                    fontSize: 10
                  }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {houseRows.map(([key, v]) => <tr key={key} style={{
                  borderTop: `1px solid ${t.divider}`
                }}>
                            <td style={{
                    padding: '5px 6px',
                    color: 'var(--status-warning)',
                    fontWeight: 600
                  }}>{key}</td>
                            <td style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    color: t.text
                  }}>{v.eggs > 0 ? fmt(v.eggs) : '—'}</td>
                            <td style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    color: v.mortality > 0 ? 'var(--status-danger)' : t.textMuted
                  }}>{v.mortality > 0 ? v.mortality : '0'}</td>
                            <td style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    color: t.textSub
                  }}>{v.dirty + v.broken > 0 ? v.dirty + v.broken : '—'}</td>
                            <td style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    color: t.textSub
                  }}>{v.feed > 0 ? fmt(v.feed, 1) : '—'}</td>
                          </tr>)}
                      </tbody>
                    </table>
                  </div>}
              </div>}

            {/* 存栏批次：仅 FARM_FULL 角色显示 */}
            {showFarmFull && flocks.length > 0 && <div style={{
          marginTop: 10,
          borderTop: `1px solid ${t.divider}`,
          paddingTop: 10
        }}>
                <button onClick={() => setFlockExpanded(v => !v)} style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0
          }}>
                  <span style={{
              fontSize: 12,
              color: t.textMuted,
              fontWeight: 600
            }}>
                    {tt('mob.home.flock_batch', '存栏批次')} · {flocks.length} {tt('mob.home.unit_batch', '批')} · {fmt(flocks.reduce((s, f) => s + Number(f.current_qty || 0), 0))} {tt('mob.home.unit_bird', '只')}
                  </span>
                  <span style={{
              fontSize: 11,
              color: t.textFaint
            }}>{flockExpanded ? tt('mob.home.collapse', '收起 ▴') : tt('mob.home.expand', '展开 ▾')}</span>
                </button>
                {flockExpanded && <div style={{
            marginTop: 8,
            overflowX: 'auto'
          }}>
                    <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12
            }}>
                      <thead>
                        <tr style={{
                  color: t.textFaint
                }}>
                          {[tt('mob.home.th_batch', '批次'), tt('mob.home.th_house', '栋舍'), tt('mob.home.th_initial', '期初'), tt('mob.home.th_current', '现存'), tt('mob.home.th_lay_rate', '产蛋率')].map((h, hi) => <th key={hi} style={{
                    padding: '4px 6px',
                    textAlign: hi === 0 ? 'left' : 'right',
                    fontWeight: 600,
                    fontSize: 10
                  }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {flocks.map(f => {
                  const lr = f.current_lay_rate != null ? Number(f.current_lay_rate) : null;
                  return <tr key={f.flock_no} style={{
                    borderTop: `1px solid ${t.divider}`
                  }}>
                              <td style={{
                      padding: '5px 6px',
                      color: 'var(--status-warning)',
                      fontWeight: 600
                    }}>{f.flock_no}</td>
                              <td style={{
                      padding: '5px 6px',
                      textAlign: 'right',
                      color: t.textSub
                    }}>{f.house_code || '—'}</td>
                              <td style={{
                      padding: '5px 6px',
                      textAlign: 'right',
                      color: t.textMuted
                    }}>{fmt(f.initial_qty)}</td>
                              <td style={{
                      padding: '5px 6px',
                      textAlign: 'right',
                      color: t.text
                    }}>{fmt(f.current_qty)}</td>
                              <td style={{
                      padding: '5px 6px',
                      textAlign: 'right',
                      color: lr != null ? lr >= 80 ? 'var(--status-success)' : lr >= 60 ? 'var(--status-warning)' : 'var(--status-danger)' : t.textFaint
                    }}>
                                {lr != null ? `${lr.toFixed(1)}%` : '—'}
                              </td>
                            </tr>;
                })}
                      </tbody>
                    </table>
                  </div>}
              </div>}
          </Section>}

        {/* ══ 包装产出 ══════════════════════════════════════════════════════════ */}
        {showPkg && <Section title={tt('mob.home.packaging_output', '包装产出')} icon="📦" color="var(--status-warning)" loading={pkgLoading} error={pkgErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8,
          marginBottom: 10
        }}>
              <StatCard label={tt('mob.home.boxes_done', '完成箱数')} value={fmt(pkgTotal)} unit={tt('mob.home.unit_box', '箱')} color="var(--status-warning)" />
              <StatCard label={tt('mob.home.tasks_done', '完成任务数')} value={fmt(pkgTasks)} unit={tt('mob.home.unit_count', '个')} />
            </div>
            {byGrade.length > 0 && <div className={u.mb12}>
                <div style={{
            fontSize: 11,
            color: t.textFaint,
            marginBottom: 6
          }}>{tt('mob.home.by_grade', '按等级分布')}</div>
                <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6
          }}>
                  {byGrade.map(g => <div key={g.grade} style={{
              flex: '1 1 auto',
              minWidth: 60,
              background: `${GRADE_COLORS[g.grade] || 'var(--gray-500)'}18`,
              border: `1px solid ${GRADE_COLORS[g.grade] || 'var(--gray-500)'}40`,
              borderRadius: 8,
              padding: '8px 10px',
              textAlign: 'center'
            }}>
                      <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: GRADE_COLORS[g.grade] || 'var(--gray-400)'
              }}>{formatMasterData(g, 'grade_name', g.grade, lang)}</div>
                      <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: t.text
              }}>{fmt(g.qty)}</div>
                      <div style={{
                fontSize: 10,
                color: t.textFaint
              }}>{tt('mob.home.unit_egg', '枚')}</div>
                    </div>)}
                </div>
              </div>}
            {trend.length > 0 && <MiniBarChart data={trend} selectedDate={date} />}
            {byGrade.length === 0 && !pkgLoading && trend.length === 0 && <div style={{
          fontSize: 12,
          color: t.textFaint,
          textAlign: 'center',
          padding: '8px 0'
        }}>{tt('mob.home.no_packaging_today', '当日暂无包装记录')}</div>}
          </Section>}

        {/* ══ 品质检测 ══════════════════════════════════════════════════════════ */}
        {showQuality && <Section title={tt('mob.home.quality_inspection', '品质检测')} icon="🛡️" color="var(--color-purple-500)" loading={qcLoading} error={qcErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 8
        }}>
              <StatCard label={tt('mob.home.today_inspection', '今日检测')} value={fmt(qcTotal)} unit={tt('mob.home.unit_times', '次')} />
              <StatCard label={tt('mob.home.pass_rate', '合格率')} value={qcRate != null ? `${qcRate}%` : '—'} color={qcRate != null ? qcRate >= 95 ? 'var(--status-success)' : qcRate >= 80 ? 'var(--status-warning)' : 'var(--status-danger)' : undefined} />
              <StatCard label={tt('mob.home.fail', '不合格')} value={fmt(qcFail)} unit={tt('mob.home.unit_times', '次')} color={qcFail > 0 ? 'var(--status-danger)' : undefined} />
            </div>
            {qcTotal === 0 && !qcLoading && <div style={{
          marginTop: 8,
          fontSize: 12,
          color: t.textFaint,
          textAlign: 'center'
        }}>{tt('mob.home.no_inspection_today', '当日暂无检测记录')}</div>}
          </Section>}

        {/* ══ 蛋品库存 ══════════════════════════════════════════════════════════ */}
        {showStock && eggStock.length > 0 && (() => {
        const totalQty = eggStock.reduce((s, r) => s + r.qty, 0);
        const totalTrays = eggStock.reduce((s, r) => s + r.trays, 0);
        const nonEmpty = eggStock.filter(r => r.qty > 0);
        return <div style={{
          background: t.cardBg,
          border: '1px solid var(--status-warning-bg-strong)',
          borderRadius: 16,
          padding: '16px',
          marginBottom: 12
        }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}>
                <div className={u.flexRow8}>
                  <span className={u.fs18}>🥚</span>
                  <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: t.text
              }}>{tt('mob.home.egg_stock', '蛋品库存')}</span>
                </div>
                <div className={u.tar}>
                  <span style={{
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--status-warning)'
              }}>{totalTrays}</span>
                  <span style={{
                fontSize: 11,
                color: t.textMuted,
                marginLeft: 3
              }}>{tt('mob.home.unit_tray', '提')}</span>
                  <span style={{
                fontSize: 13,
                color: t.textFaint,
                marginLeft: 6
              }}>{totalQty.toLocaleString()} {tt('mob.home.unit_egg', '枚')}</span>
                </div>
              </div>
              <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6
          }}>
                {nonEmpty.map(r => <div key={r.grade} style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--status-warning-bg-faint)',
              border: '1px solid var(--status-warning-border)'
            }}>
                    <div style={{
                fontSize: 11,
                color: t.textMuted
              }}>{r.name}</div>
                    <div style={{
                fontSize: 15,
                fontWeight: 800,
                color: 'var(--status-warning)'
              }}>{r.qty.toLocaleString()}</div>
                  </div>)}
                {nonEmpty.length === 0 && <div style={{
              fontSize: 12,
              color: t.textFaint,
              padding: '4px 0'
            }}>{tt('mob.home.zero_stock', '库存为零')}</div>}
              </div>
            </div>;
      })()}

        {/* ══ 销售情况 ══════════════════════════════════════════════════════════ */}
        {showSales && <Section title={tt('mob.home.sales_overview', '销售情况')} icon="💰" color="var(--status-info)" loading={kpiLoading} error={kpiErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8
        }}>
              <StatCard label={tt('mob.home.today_sales', '今日销售额')} value={salesVal != null ? fmt(Number(salesVal)) : '—'} unit={salesUnit?.split(' ')[0] || 'LAK'} color="var(--status-info)" />
              <StatCard label={tt('mob.home.today_alerts', '今日告警')} value={String(alerts.length || kpi?.stats?.alerts?.value || 0)} unit={tt('mob.home.unit_item', '条')} color={alerts.length > 0 ? 'var(--status-danger)' : undefined} />
            </div>
            <div style={{
          marginTop: 8,
          fontSize: 11,
          color: t.textFaint,
          textAlign: 'center'
        }}>
              {isToday ? tt('mob.home.today_pos_data', '今日 POS 销售数据') : tt('mob.home.history_not_supported', '历史销售数据暂不支持按日查询')}
            </div>
          </Section>}

        {/* ══ 设备告警（农场 / 农场经理 / 兽医 / 品控专属） ════════════════════ */}
        {showAlerts && alerts.length > 0 && <div style={{
        background: 'var(--status-danger-bg-faint)',
        border: '1px solid var(--status-danger-bg-medium)',
        borderRadius: 16,
        padding: '14px 16px',
        marginBottom: 12
      }}>
            <button onClick={() => setAlertsExpanded(v => !v)} style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0
        }}>
              <div className={u.flexRow8}>
                <span className={u.fs18}>⚠️</span>
                <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--status-danger)'
            }}>{tt('mob.home.device_alert', '设备告警')}</span>
                <span style={{
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 10,
              background: 'var(--status-danger-bg-medium)',
              color: 'var(--status-danger)',
              fontWeight: 700
            }}>
                  {alerts.length} {tt('mob.home.unhandled', '条未处理')}
                </span>
              </div>
              <span style={{
            color: t.textMuted,
            fontSize: 12
          }}>{alertsExpanded ? tt('mob.home.collapse_plain', '收起') : tt('mob.home.expand_plain', '展开')}</span>
            </button>
            {alertsExpanded && <div style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
                {alerts.slice(0, 15).map(a => <div key={a.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            background: t.cardBg,
            borderRadius: 10,
            borderLeft: '3px solid var(--status-danger)'
          }}>
                    <div>
                      <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--status-danger)'
              }}>
                        {alertLabels[a.alert_type] || a.alert_type}
                      </div>
                      <div style={{
                fontSize: 11,
                color: t.textMuted,
                marginTop: 2
              }}>
                        {a.erp_house_code} · {new Date(a.created_at).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                      </div>
                    </div>
                    {a.value != null && <div style={{
              fontSize: 12,
              color: 'var(--status-danger)',
              fontWeight: 700,
              textAlign: 'right'
            }}>
                        {String(a.value)}
                        {a.threshold != null && <div style={{
                fontSize: 10,
                color: t.textFaint,
                fontWeight: 400
              }}>{tt('mob.home.threshold', '阈值')} {String(a.threshold)}</div>}
                      </div>}
                  </div>)}
                {alerts.length > 15 && <div style={{
            textAlign: 'center',
            fontSize: 12,
            color: t.textFaint
          }}>
                    {tt('mob.home.total_prefix', '共')} {alerts.length} {tt('mob.home.show_latest_15', '条，仅显示最新 15 条')}
                  </div>}
              </div>}
          </div>}

        {/* 空状态：当角色权限对应的模块全部不可见时提示 */}
        {!showFarm && !showPkg && !showQuality && !showStock && !showSales && !showAlerts && !showDelivery && <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: t.textFaint
      }}>
            <div style={{
          fontSize: 40,
          marginBottom: 12
        }}>📊</div>
            <div style={{
          fontSize: 14,
          color: t.textSub
        }}>{tt('mob.home.dashboard_configuring', '您的看板正在配置中')}</div>
            <div style={{
          fontSize: 12,
          marginTop: 6
        }}>{tt('mob.home.contact_admin_data_perm', '请联系管理员分配数据权限')}</div>
          </div>}
      </div>
    </div>;
}
