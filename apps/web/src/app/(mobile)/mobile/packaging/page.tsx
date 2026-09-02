'use client';
import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft, Sun, Moon } from 'lucide-react';
import {
  mobileApi,
  PackagingDailyReport,
  PackagingTrendItem,
} from '@/lib/mobile-api';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useMobilePermission } from '@/hooks/useMobilePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMasterData } from '@/lib/business-display';

// ── 日期工具函数 ──────────────────────────────────────────────────────────────

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

function fmt(n: number | string | undefined | null, decimals = 0): string {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (isNaN(v)) return '—';
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  AAA: 'var(--status-warning)',
  AA:  'var(--status-info)',
  A:   'var(--status-success)',
  B:   'var(--status-warning)',
  C:   'var(--color-purple-500)',
};

// ── 迷你柱状图 ────────────────────────────────────────────────────────────────

function MiniBarChart({
  data,
  selectedDate,
}: {
  data: PackagingTrendItem[];
  selectedDate: string;
}) {
  const { t } = useMobileTheme();
  const { t: tt } = useLanguage();
  if (!data.length) return null;
  const maxVal = Math.max(...data.map(d => d.summary.total_packed), 1);

  return (
    <div>
      <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 6 }}>
        {tt('mob.biz.pkg_last7days_boxes', '近 7 日包装箱数')}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
        {data.map(day => {
          const pct = Math.max(
            (day.summary.total_packed / maxVal) * 100,
            day.summary.total_packed > 0 ? 8 : 2,
          );
          const isSelected = day.date === selectedDate;
          return (
            <div
              key={day.date}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            >
              <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${pct}%`,
                    background: isSelected ? 'var(--status-warning)' : 'var(--status-warning-border)',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s',
                    minHeight: 2,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: isSelected ? 'var(--status-warning)' : t.textFaint,
                  fontWeight: isSelected ? 700 : 400,
                }}
              >
                {day.date.slice(8)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 骨架屏 ────────────────────────────────────────────────────────────────────

function SkeletonGrid({ count = 2, cols = 2 }: { count?: number; cols?: number }) {
  const { t } = useMobileTheme();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols},1fr)`,
        gap: 8,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 72,
            borderRadius: 10,
            background: t.cardBg,
            animation: 'pulse 1.5s infinite',
          }}
        />
      ))}
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function MobilePackagingPage() {
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { t: tt, lang } = useLanguage();
  const { allowed, loading: permLoading, readonly } = useMobilePermission('packaging');
  const today = fmtDate(new Date());

  const [date, setDate]         = useState(today);
  const [pkg, setPkg]           = useState<PackagingDailyReport | null>(null);
  const [trend, setTrend]       = useState<PackagingTrendItem[]>([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [pkgErr, setPkgErr]     = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // 趋势图：随刷新 key 更新，以选中日期为终点
  useEffect(() => {
    setTrendLoading(true);
    mobileApi
      .getPackagingTrend(date, 7)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setTrend(arr);
      })
      .catch(() => { setTrend([]); })
      .finally(() => { setTrendLoading(false); });
  }, [date, refreshKey]);

  const fetchReport = useCallback((d: string) => {
    setPkgLoading(true);
    setPkgErr('');
    mobileApi
      .getPackagingReport(d)
      .then(data => { setPkg(data); })
      .catch(() => { setPkgErr(tt('mob.biz.load_failed', '数据加载失败')); setPkg(null); })
      .finally(() => { setPkgLoading(false); });
  }, []);

  useEffect(() => { fetchReport(date); }, [date, refreshKey, fetchReport]);

  if (permLoading || !allowed) return null;

  const isToday = date === today;

  const prevDay = () => setDate(d => fmtDate(addDays(toDate(d), -1)));
  const nextDay = () => {
    if (!isToday) setDate(d => fmtDate(addDays(toDate(d), 1)));
  };

  // ── 包装计算 ──
  const pkgTotal = Number(pkg?.summary?.total_packed ?? 0);
  const pkgTasks = Number(pkg?.summary?.total_tasks  ?? 0);
  const byGrade  = pkg?.by_grade ?? [];

  const dateLabel = (() => {
    if (date === today) return tt('mob.biz.today', '今天');
    if (date === fmtDate(addDays(toDate(today), -1))) return tt('mob.biz.yesterday', '昨天');
    return date;
  })();

  const noData = !pkgLoading && !pkgErr && pkgTotal === 0 && byGrade.length === 0;

  return (
    <div
      style={{
        minHeight: '100svh',
        background: t.pageBg,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      {/* ── AppBar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
          background: t.appBarBg,
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.barBorder}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            color: t.textSub,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>
          📦 {tt('mob.biz.packaging_stats', '包装统计')}
        </span>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <RefreshCw size={16} />
        </button>
        <button onClick={toggle} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: t.textSub, display: 'flex', alignItems: 'center',
        }}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* ── 日期导航 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--status-warning-bg-faint)',
          borderBottom: '1px solid var(--status-warning-bg-light)',
        }}
      >
        <button
          onClick={prevDay}
          style={{
            background: 'none',
            border: 'none',
            color: t.textSub,
            cursor: 'pointer',
            padding: 6,
          }}
        >
          <ChevronLeft size={20} />
        </button>
        <div className={u.tac}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{dateLabel}</div>
          {dateLabel !== date && (
            <div style={{ fontSize: 11, color: t.textMuted }}>{date}</div>
          )}
        </div>
        <button
          onClick={nextDay}
          disabled={isToday}
          style={{
            background: 'none',
            border: 'none',
            color: isToday ? t.textFaint : t.textSub,
            cursor: isToday ? 'default' : 'pointer',
            padding: 6,
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── 内容区 ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        {/* ── 汇总卡片 ── */}
        <div
          style={{
            background: t.cardBg,
            border: '1px solid var(--status-warning-border)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{tt('mob.biz.today_summary', '今日汇总')}</span>
            {pkgLoading && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: t.textFaint }}>
                {tt('mob.biz.loading', '加载中…')}
              </span>
            )}
          </div>

          {pkgErr ? (
            <div style={{ fontSize: 12, color: t.textFaint, textAlign: 'center', padding: '12px 0' }}>
              {pkgErr}
            </div>
          ) : pkgLoading ? (
            <SkeletonGrid count={2} cols={2} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {/* 完成箱数 */}
              <div style={{ background: t.cardBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{tt('mob.biz.completed_boxes', '完成箱数')}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--status-warning)', lineHeight: 1.1 }}>
                  {fmt(pkgTotal)}
                </div>
                <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{tt('mob.biz.unit_box', '箱')}</div>
              </div>

              {/* 完成任务数 */}
              <div style={{ background: t.cardBg, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{tt('mob.biz.completed_tasks', '完成任务数')}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>
                  {fmt(pkgTasks)}
                </div>
                <div style={{ fontSize: 10, color: t.textFaint, marginTop: 2 }}>{tt('mob.biz.unit_count', '个')}</div>
              </div>
            </div>
          )}

        </div>

        {/* ── 等级分布 ── */}
        <div
          style={{
            background: t.cardBg,
            border: '1px solid var(--status-warning-bg-light)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>
            {tt('mob.biz.grade_distribution', '等级分布')}
          </div>

          {pkgLoading ? (
            <SkeletonGrid count={4} cols={3} />
          ) : noData ? (
            <div
              style={{
                fontSize: 13,
                color: t.textFaint,
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              {tt('mob.biz.no_packaging_today', '当日暂无包装记录')}
            </div>
          ) : byGrade.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 8,
              }}
            >
              {byGrade.map(g => {
                const color = GRADE_COLORS[g.grade] || 'var(--gray-500)';
                return (
                  <div
                    key={g.grade}
                    style={{
                      background: `${color}18`,
                      border: `1px solid ${color}40`,
                      borderRadius: 10,
                      padding: '10px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4 }}>
                      {formatMasterData(g, 'grade_name', g.grade, lang)}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>
                      {fmt(g.qty)}
                    </div>
                    <div style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>
                      {tt('mob.biz.unit_egg', '枚')} · {fmt(g.tasks)}{tt('mob.biz.tasks_suffix', '任务')}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: t.textFaint,
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              {tt('mob.biz.no_packaging_today', '当日暂无包装记录')}
            </div>
          )}
        </div>

        {/* ── 7 日趋势 ── */}
        <div
          style={{
            background: t.cardBg,
            border: '1px solid var(--status-warning-bg-light)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>
            {tt('mob.biz.trend_7days', '7 日趋势')}
          </div>

          {trendLoading ? (
            <div
              style={{
                height: 80,
                borderRadius: 8,
                background: t.cardBg,
                animation: 'pulse 1.5s infinite',
              }}
            />
          ) : trend.length > 0 ? (
            <MiniBarChart data={trend} selectedDate={date} />
          ) : (
            <div
              style={{
                fontSize: 12,
                color: t.textFaint,
                textAlign: 'center',
                padding: '12px 0',
              }}
            >
              {tt('mob.biz.no_trend_data', '暂无趋势数据')}
            </div>
          )}
        </div>

        {/* ── 前往作业台 ── */}
        <a
          href="/terminal/packaging/dashboard"
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '13px 0',
            background: 'var(--status-warning-bg-light)',
            border: '1px solid var(--status-warning-bg-strong)',
            borderRadius: 12,
            color: 'var(--status-warning)',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {tt('mob.biz.go_to_workstation', '前往作业台')} →
        </a>
      </div>
    </div>
  );
}
