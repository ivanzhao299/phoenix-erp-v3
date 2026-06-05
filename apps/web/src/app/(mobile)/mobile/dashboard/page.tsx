'use client';

import { useState, useMemo } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft, Sun, Moon, Truck } from 'lucide-react';
import useSWR from 'swr';
import { mobileApi, QcInspection, FarmLog, FlockRecord, PackagingTrendItem, DeviceAlert, EggStockRow } from '@/lib/mobile-api';
import { authHeader } from '@/lib/mobile-auth-token';
import { useAuth } from '@/contexts/AuthContext';
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

// ── 模块可见角色集合（角色字符串直接比较，无需引入 R 对象） ──────────────────

/** 生产概况——全量（含逐栋明细 + 存栏批次展开） */
const FARM_FULL = ['ROLE_ADMIN', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_BREEDER', 'ROLE_FIN_COST'];
/** 生产概况——汇总（仅 4 个数字卡，不展开明细） */
const FARM_SUMMARY = ['ROLE_CEO', 'ROLE_QA_MGR', 'ROLE_WMS_MGR', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_AUDITOR', 'ROLE_SALES_MGR', 'ROLE_PRC_BUYER'];
/** 包装产出 */
const SHOW_PKG = ['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_FARM_MGR', 'ROLE_QA_MGR', 'ROLE_WMS_MGR', 'ROLE_PKG_MGR', 'ROLE_PKG_OP', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_FIN_COST', 'ROLE_AUDITOR', 'ROLE_PRC_BUYER'];
/** 品质检测 */
const SHOW_QUALITY = ['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_QA_MGR', 'ROLE_WMS_MGR', 'ROLE_PKG_MGR', 'ROLE_FIN_COST', 'ROLE_AUDITOR'];
/** 蛋品库存 */
const SHOW_STOCK = ['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_FARM_MGR', 'ROLE_QA_MGR', 'ROLE_WMS_MGR', 'ROLE_PKG_MGR', 'ROLE_LOG_MGR', 'ROLE_STORE_MGR', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_FIN_COST', 'ROLE_AUDITOR', 'ROLE_SALES_REP', 'ROLE_SALES_MGR', 'ROLE_REGION_MGR', 'ROLE_PRC_BUYER'];
/** 销售情况 */
const SHOW_SALES = ['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_FARM_MGR', 'ROLE_LOG_MGR', 'ROLE_STORE_MGR', 'ROLE_FIN_CFO', 'ROLE_FIN_ACCT', 'ROLE_FIN_COST', 'ROLE_AUDITOR', 'ROLE_SALES_REP', 'ROLE_SALES_MGR', 'ROLE_REGION_MGR', 'ROLE_CASHIER'];
/** 设备告警 */
const SHOW_ALERTS = ['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_FARM_MGR', 'ROLE_VET', 'ROLE_BREEDER', 'ROLE_QA_MGR'];
/** 今日配送波次（新增模块） */
const SHOW_DELIVERY = ['ROLE_ADMIN', 'ROLE_LOG_MGR', 'ROLE_DRIVER'];

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
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.summary.total_packed), 1);
  return <div>
      <div style={{
      fontSize: 11,
      color: t.textFaint,
      marginBottom: 6
    }}>近 7 日包装箱数</div>
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
      }}>加载中…</span>}
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
    user
  } = useAuth();
  const role = user?.role ?? '';
  const {
    lang
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

  // ── 角色可见性标志（在 SWR 之前计算，用于条件 fetch） ────────────────────────
  const showFarmFull = FARM_FULL.includes(role);
  const showFarmSummary = FARM_SUMMARY.includes(role);
  const showFarm = showFarmFull || showFarmSummary;
  const showPkg = SHOW_PKG.includes(role);
  const showQuality = SHOW_QUALITY.includes(role);
  const showStock = SHOW_STOCK.includes(role);
  const showSales = SHOW_SALES.includes(role);
  const showAlerts = SHOW_ALERTS.includes(role);
  const showDelivery = SHOW_DELIVERY.includes(role);

  // ── SWR 数据加载（null key = 跳过 fetch，不消耗网络）───────────────────────
  const swrOpts = {
    revalidateOnFocus: true,
    dedupingInterval: 5_000
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
    data: farmRaw,
    isLoading: farmLoading,
    error: _farmErr
  } = useSWR(showFarmFull ? `farm/${date}/${refreshKey}` : null, () => mobileApi.getFarmLogs(date), swrOpts);
  const {
    data: trendRaw
  } = useSWR(showPkg ? `trend/${refreshKey}` : null, () => mobileApi.getPackagingTrend(today, 7), swrOpts);
  const {
    data: alertsRaw
  } = useSWR(showAlerts ? `alerts/${refreshKey}` : null, () => mobileApi.getOpenAlerts(), swrOpts);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const farm = useMemo((): FarmLog[] => Array.isArray(farmRaw) ? farmRaw as FarmLog[] : (farmRaw as any)?.data ?? [], [farmRaw]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trend = useMemo((): PackagingTrendItem[] => Array.isArray(trendRaw) ? trendRaw as PackagingTrendItem[] : (trendRaw as any)?.data ?? [], [trendRaw]);
  const alerts = useMemo((): DeviceAlert[] => Array.isArray(alertsRaw) ? alertsRaw as DeviceAlert[] : [], [alertsRaw]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flocks = useMemo((): FlockRecord[] => Array.isArray(flocksRaw) ? flocksRaw as FlockRecord[] : (flocksRaw as any)?.data ?? [], [flocksRaw]);
  const eggStock = useMemo((): EggStockRow[] => Array.isArray(eggStockRaw) ? eggStockRaw as EggStockRow[] : [], [eggStockRaw]);
  // V2 配送统计（从 sal_delivery_orders 汇总，不再读旧 log_dispatch）
  const delStats = deliveryStats ?? null;
  const kpiErr = _kpiErr ? '数据加载失败' : '';
  const pkgErr = _pkgErr ? '数据加载失败' : '';
  const qcErr = _qcErr ? '数据加载失败' : '';
  const farmErr = _farmErr ? _farmErr.message?.includes('403') ? '权限不足' : _farmErr.message?.includes('401') ? '请重新登录' : '数据加载失败' : '';
  if (permLoading) return <MobilePageSkeleton title="每日看板" statGrid onBack={() => router.back()} />;
  if (!allowed) return null;
  const isToday = date === today;
  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => {
    if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1)));
  };

  // ── 生产计算 ──
  const todayEggs = kpi?.meta?.todayEggs ?? 0;
  const layingTotal = kpi?.meta?.layingTotal ?? 0;
  const layRate = kpi?.meta?.todayLayRate;
  const farmMortality = farm.reduce((s, r) => s + Number(r.mortality_qty || 0), 0);

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
    cur.eggs += Number(r.eggs_produced || 0);
    cur.mortality += Number(r.mortality_qty || 0);
    cur.dirty += Number(r.dirty_eggs || 0);
    cur.broken += Number(r.broken_eggs || 0);
    cur.feed += Number(r.feed_consumed || 0);
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
    if (date === today) return lang === 'en' ? 'Today' : lang === 'lo' ? 'ມື້ນີ້' : '今天';
    if (date === fmtDate(addDays(toDate(today), -1))) return lang === 'en' ? 'Yesterday' : lang === 'lo' ? 'ມື້ວານ' : '昨天';
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
          {lang === 'en' ? 'Daily Report' : lang === 'lo' ? 'ລາຍງານປະຈໍາວັນ' : '每日数据看板'}
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
        {showDelivery && <Section title="今日配送概况" icon="🚛" color="var(--status-info)" loading={dispatchLoading}>
            {!delStats ? <div style={{
          textAlign: 'center',
          color: t.textFaint,
          fontSize: 13,
          padding: '10px 0'
        }}>
                今日暂无配送数据
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
              label: '今日配送',
              value: delStats.todayWave ?? 0,
              color: 'var(--status-info)'
            }, {
              label: '待装车',
              value: delStats.planned ?? 0,
              color: 'var(--status-warning)'
            }, {
              label: '配送中',
              value: delStats.inTransit ?? 0,
              color: 'var(--status-info)'
            }, {
              label: '待签收',
              value: delStats.pendingSign ?? 0,
              color: 'var(--status-warning)'
            }, {
              label: '已完成',
              value: delStats.todayCompleted ?? delStats.completed ?? 0,
              color: 'var(--status-success)'
            }, {
              label: '已取消',
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
                  进入配送管理
                </button>
              </div>}
          </Section>}

        {/* ══ 生产概况（农场 / 管理层） ══════════════════════════════════════════ */}
        {showFarm && <Section title="生产概况" icon="🐔" color="var(--status-success)" loading={kpiLoading} error={kpiErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8
        }}>
              <StatCard label="今日产蛋" value={fmt(todayEggs)} unit="枚" color="var(--status-warning)" />
              <StatCard label="产蛋率" value={layRate != null ? `${layRate}%` : '—'} color="var(--status-success)" />
              <StatCard label="存栏数" value={fmt(layingTotal)} unit="只" />
              <StatCard label="今日死淘" value={showFarmFull ? farm.length > 0 ? fmt(farmMortality) : '—' : '—'} unit="只" color={farmMortality > 0 ? 'var(--status-danger)' : undefined} />
            </div>

            {farmErr && <div style={{
          marginTop: 8,
          fontSize: 11,
          color: t.textFaint,
          textAlign: 'center'
        }}>
                死淘数据：{farmErr}
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
            }}>逐栋明细 · {houseRows.length} 栋</span>
                  <span style={{
              fontSize: 11,
              color: t.textFaint
            }}>{houseExpanded ? '收起 ▴' : '展开 ▾'}</span>
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
                          {['栋舍', '产蛋', '死淘', '脏破蛋', '耗料(kg)'].map(h => <th key={h} style={{
                    padding: '4px 6px',
                    textAlign: h === '栋舍' ? 'left' : 'right',
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
                    存栏批次 · {flocks.length} 批 · {fmt(flocks.reduce((s, f) => s + Number(f.current_qty || 0), 0))} 只
                  </span>
                  <span style={{
              fontSize: 11,
              color: t.textFaint
            }}>{flockExpanded ? '收起 ▴' : '展开 ▾'}</span>
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
                          {['批次', '栋舍', '期初', '现存', '产蛋率'].map(h => <th key={h} style={{
                    padding: '4px 6px',
                    textAlign: h === '批次' ? 'left' : 'right',
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
        {showPkg && <Section title="包装产出" icon="📦" color="var(--status-warning)" loading={pkgLoading} error={pkgErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8,
          marginBottom: 10
        }}>
              <StatCard label="完成箱数" value={fmt(pkgTotal)} unit="箱" color="var(--status-warning)" />
              <StatCard label="完成任务数" value={fmt(pkgTasks)} unit="个" />
            </div>
            {byGrade.length > 0 && <div className={u.mb12}>
                <div style={{
            fontSize: 11,
            color: t.textFaint,
            marginBottom: 6
          }}>按等级分布</div>
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
              }}>{g.grade}</div>
                      <div style={{
                fontSize: 16,
                fontWeight: 800,
                color: t.text
              }}>{fmt(g.qty)}</div>
                      <div style={{
                fontSize: 10,
                color: t.textFaint
              }}>枚</div>
                    </div>)}
                </div>
              </div>}
            {trend.length > 0 && <MiniBarChart data={trend} selectedDate={date} />}
            {byGrade.length === 0 && !pkgLoading && trend.length === 0 && <div style={{
          fontSize: 12,
          color: t.textFaint,
          textAlign: 'center',
          padding: '8px 0'
        }}>当日暂无包装记录</div>}
          </Section>}

        {/* ══ 品质检测 ══════════════════════════════════════════════════════════ */}
        {showQuality && <Section title="品质检测" icon="🛡️" color="var(--color-purple-500)" loading={qcLoading} error={qcErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 8
        }}>
              <StatCard label="今日检测" value={fmt(qcTotal)} unit="次" />
              <StatCard label="合格率" value={qcRate != null ? `${qcRate}%` : '—'} color={qcRate != null ? qcRate >= 95 ? 'var(--status-success)' : qcRate >= 80 ? 'var(--status-warning)' : 'var(--status-danger)' : undefined} />
              <StatCard label="不合格" value={fmt(qcFail)} unit="次" color={qcFail > 0 ? 'var(--status-danger)' : undefined} />
            </div>
            {qcTotal === 0 && !qcLoading && <div style={{
          marginTop: 8,
          fontSize: 12,
          color: t.textFaint,
          textAlign: 'center'
        }}>当日暂无检测记录</div>}
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
              }}>蛋品库存</span>
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
              }}>提</span>
                  <span style={{
                fontSize: 13,
                color: t.textFaint,
                marginLeft: 6
              }}>{totalQty.toLocaleString()} 枚</span>
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
            }}>库存为零</div>}
              </div>
            </div>;
      })()}

        {/* ══ 销售情况 ══════════════════════════════════════════════════════════ */}
        {showSales && <Section title="销售情况" icon="💰" color="var(--status-info)" loading={kpiLoading} error={kpiErr}>
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2,1fr)',
          gap: 8
        }}>
              <StatCard label="今日销售额" value={salesVal != null ? fmt(Number(salesVal)) : '—'} unit={salesUnit?.split(' ')[0] || 'LAK'} color="var(--status-info)" />
              <StatCard label="今日告警" value={String(alerts.length || kpi?.stats?.alerts?.value || 0)} unit="条" color={alerts.length > 0 ? 'var(--status-danger)' : undefined} />
            </div>
            <div style={{
          marginTop: 8,
          fontSize: 11,
          color: t.textFaint,
          textAlign: 'center'
        }}>
              {isToday ? '今日 POS 销售数据' : '历史销售数据暂不支持按日查询'}
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
            }}>设备告警</span>
                <span style={{
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 10,
              background: 'var(--status-danger-bg-medium)',
              color: 'var(--status-danger)',
              fontWeight: 700
            }}>
                  {alerts.length} 条未处理
                </span>
              </div>
              <span style={{
            color: t.textMuted,
            fontSize: 12
          }}>{alertsExpanded ? '收起' : '展开'}</span>
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
                        {ALERT_LABELS[a.alert_type] || a.alert_type}
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
              }}>阈值 {String(a.threshold)}</div>}
                      </div>}
                  </div>)}
                {alerts.length > 15 && <div style={{
            textAlign: 'center',
            fontSize: 12,
            color: t.textFaint
          }}>
                    共 {alerts.length} 条，仅显示最新 15 条
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
        }}>您的看板正在配置中</div>
            <div style={{
          fontSize: 12,
          marginTop: 6
        }}>请联系管理员分配数据权限</div>
          </div>}
      </div>
    </div>;
}