"use client";

/**
 * HOME-1 — Phoenix ERP 企业运营工作台（创意版）
 *
 * 布局：
 *   · Hero 欢迎横幅（左 70% 文案 + 主 CTA，右 30% 数字气泡）
 *   · 不对称双栏（左 60% 事务流 + 经营概览，右 40% 数据质量驾驶舱）
 *   · 8 大业务中心 tile 阵列
 *   · 角色化 CTA / 顺序
 */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity, Inbox, Clock, AlertTriangle, ShieldAlert, TrendingUp,
  Users, ShoppingCart, ShoppingBag, Wallet, Building2, Warehouse,
  Layers, GitBranch, ArrowRight, Sparkles,
  CircleDollarSign, Receipt, CreditCard, Package, CheckCircle2,
  Zap, Bell, Target, ChevronRight,
  ClipboardList as ClipboardListIcon,
  Bird, EggFried, LineChart, Wheat as WheatIcon, Droplets,
} from "lucide-react";
import request from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFirstAccessiblePath, type PermissionChecker } from "@/components/layout/Sidebar";
import { cockpitCard, inlineBadge, kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue } from "@/components/design-system/cockpit-styles";

// ── 数据类型 ─────────────────────────────────────────
interface WorkflowSummary { todo: number; ccUnread: number; overdueTodo: number; running: number; startedRunning: number; }
interface QualityScores { overall: number; masterData: number; alertCount: number; highAlertCount: number; }
interface CenterMember { type: string; total: number; active: number; pending: number; frozen: number; }
interface CenterStat { key: string; label: string; objectCount: number; pendingCount: number; riskCount: number; healthScore: number; members: CenterMember[]; }
interface TodoTask { task_no: string; title: string; node_name: string; created_at: string; due_at?: string; starter_name?: string; }
interface FarmKpiState { totalStock?: number; layRate?: number; eggsToday?: number; feedToday?: number | null; waterToday?: number | null; alarmCount?: number; }

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asRows(payload: any): any[] {
  const rows = payload?.data?.rows ?? payload?.data ?? payload?.rows ?? payload;
  return Array.isArray(rows) ? rows : [];
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── 8 大业务中心 ─────────────────────────────────────
// G11：每个 shortcut 加 perm 字段，按用户权限动态过滤
type Shortcut = { key: string; label: string; href: string; icon: any; accent: string; gradient: string; perm: string; altPerms?: string[]; groupId?: string };
const SHORTCUTS: Shortcut[] = [
  { key: 'customer',  label: '客户中心',     href: '/master-data/customers',  icon: Users,       accent: '#3B82F6', gradient: 'linear-gradient(135deg, #3B82F622 0%, transparent 60%)', perm: 'MENU_MD_CUSTOMER' },
  { key: 'supplier',  label: '供应商中心',   href: '/master-data/suppliers',  icon: Building2,   accent: '#06B6D4', gradient: 'linear-gradient(135deg, #06B6D422 0%, transparent 60%)', perm: 'MENU_MD_SUPPLIER' },
  { key: 'procure',   label: '采购中心',     href: '/procurement2/dashboard', icon: ShoppingBag, accent: '#A855F7', gradient: 'linear-gradient(135deg, #A855F722 0%, transparent 60%)', perm: 'MENU_PRC2_DASHBOARD', altPerms: ['MENU_PRC2_SUPPLIER', 'MENU_PRC2_PROJECT', 'MENU_PRC2_REQUEST', 'MENU_PRC2_ORDER', 'MENU_PRC2_PAYMENT', 'MENU_PRC2_RECEIPT', 'MENU_PRC2_SHIPMENT', 'MENU_PRC2_FUND'], groupId: 'procurement' },
  { key: 'sales',     label: '销售中心',     href: '/sales2',                 icon: ShoppingCart, accent: '#10B981', gradient: 'linear-gradient(135deg, #10B98122 0%, transparent 60%)', perm: 'MENU_SALES2_DASHBOARD', altPerms: ['MENU_SALES2_ORDER', 'MENU_SALES2_CUSTOMER', 'MENU_SALES2_PRICE', 'MENU_SALES2_DELIVERY', 'MENU_SALES2_RETURN', 'MENU_SALES2_CHANNEL', 'MENU_SALES2_REPORT'], groupId: 'sales' },
  { key: 'finance',   label: '财务中心',     href: '/finance2',               icon: Wallet,      accent: '#F59E0B', gradient: 'linear-gradient(135deg, #F59E0B22 0%, transparent 60%)', perm: 'MENU_FIN2_REPORT', altPerms: ['MENU_FIN2_AR', 'MENU_FIN2_AR_LEDGER', 'MENU_FIN2_AP', 'MENU_FIN2_CASH_VIEW', 'MENU_FIN2_CASH_TRANSFER', 'MENU_FIN2_SHAREHOLDER', 'MENU_FIN2_EXPENSE', 'MENU_FIN2_REIMBURSE'], groupId: 'finance' },
  { key: 'inventory', label: '库存中心',     href: '/warehouse',              icon: Warehouse,   accent: '#EAB308', gradient: 'linear-gradient(135deg, #EAB30822 0%, transparent 60%)', perm: 'MENU_WMS_VIEW', groupId: 'inventory' },
  { key: 'workflow',  label: '审批工作台',   href: '/workflow/todos',          icon: GitBranch,   accent: '#EC4899', gradient: 'linear-gradient(135deg, #EC489922 0%, transparent 60%)', perm: 'MENU_WORKFLOW_TODO', altPerms: ['MENU_WORKFLOW_HISTORY', 'MENU_WORKFLOW_NOTIFY'], groupId: 'approval' },
  { key: 'quality',   label: '数据质量',     href: '/data-quality',           icon: ShieldAlert, accent: '#EF4444', gradient: 'linear-gradient(135deg, #EF444422 0%, transparent 60%)', perm: 'MENU_MD_QUALITY' },
];

// ── 角色对应主 CTA + 默认入口 ────────────────────────
// 优先：每日工作台（高频用户专用）→ 待办 → 角色专属页面
function hasAnyPerm(hasPermission: PermissionChecker, menuCodes: string[]) {
  return menuCodes.some(code => hasPermission(code, "V"));
}

function ctaFor(role: string | undefined, todo: number, hasPermission: PermissionChecker, t: (k: string, f?: string) => string): { label: string; href: string; icon: any } {
  // 高频作业角色：直接送到每日工作台（一站式录入入口）
  if (hasPermission('MENU_DASHBOARD', 'V') && role && (
    role.includes('PRODUCTION_DATA_SUPERVISOR') ||
    role.includes('FARM') ||
    role.includes('PKG') ||
    role.includes('FARMER') ||
    role.includes('CASHIER') ||
    role.includes('STORE_MGR')
  )) {
    return { label: t('home.enterDailyWork', '进入每日工作台'), href: '/daily-work', icon: ClipboardListIcon };
  }
  if (todo > 0 && hasPermission('MENU_WORKFLOW_TODO', 'V')) return { label: `${t('home.handleNow', '立即处理')} ${todo} ${t('home.todosUnit', '个待办')}`, href: '/workflow/todos', icon: Inbox };
  if ((role?.includes('CASH') || role?.includes('TREASURY')) && hasPermission('MENU_FIN2_CASH_VIEW', 'V')) return { label: t('home.enterCashCenter', '进入资金账户中心'), href: '/finance2/cash-accounts', icon: Wallet };
  if (role?.includes('FIN')) {
    const financePath = getFirstAccessiblePath(hasPermission, 'finance');
    if (financePath) return { label: t('home.enterFinance', '进入财务中心'), href: financePath, icon: Wallet };
  }
  if (role?.includes('PRC') || hasAnyPerm(hasPermission, ['MENU_PRC2_DASHBOARD', 'MENU_PRC2_SUPPLIER', 'MENU_PRC2_PROJECT', 'MENU_PRC2_REQUEST', 'MENU_PRC2_ORDER', 'MENU_PRC2_PAYMENT', 'MENU_PRC2_RECEIPT', 'MENU_PRC2_SHIPMENT', 'MENU_PRC2_FUND'])) {
    const procurementPath = getFirstAccessiblePath(hasPermission, 'procurement');
    if (procurementPath) return { label: t('home.enterProcurement', '进入采购中心'), href: procurementPath, icon: ShoppingBag };
  }
  if (role?.includes('SALES')) {
    const salesPath = getFirstAccessiblePath(hasPermission, 'sales');
    if (salesPath) return { label: t('home.enterSales', '进入销售中心'), href: salesPath, icon: ShoppingCart };
  }
  if (role?.includes('WMS')) {
    const inventoryPath = getFirstAccessiblePath(hasPermission, 'inventory');
    if (inventoryPath) return { label: t('home.enterInventory', '进入库存中心'), href: inventoryPath, icon: Warehouse };
  }
  const masterPath = getFirstAccessiblePath(hasPermission, 'master-data');
  if (masterPath) return { label: t('home.enterMasterData', '进入主数据中心'), href: masterPath, icon: Sparkles };
  if (hasPermission('MENU_MD_QUALITY', 'V')) return { label: t('home.enterDataQuality', '进入数据质量驾驶舱'), href: '/data-quality', icon: ShieldAlert };
  if (hasPermission('MENU_DASHBOARD', 'V')) return { label: t('home.enterDailyWork', '进入每日工作台'), href: '/daily-work', icon: ClipboardListIcon };
  const firstPath = getFirstAccessiblePath(hasPermission);
  return { label: firstPath ? t('home.enterWorkspace', '进入我的工作区') : t('home.viewMyTodos', '查看我的待办'), href: firstPath || '/workflow/todos', icon: Inbox };
}

// G18-4 IA：home 不再 redirect 到 daily-work。
//   home = 企业运营 KPI 看板（数字驱动）；daily-work = 录入入口（任务驱动）。
//   两者业务边界划清，所有用户进 home 都看 KPI（按权限过滤数据源），
//   有快速入口的 CTA 引导到 daily-work。

// ── 主组件 ───────────────────────────────────────────
export default function HomePage() {
  const { user, hasPermission } = useAuth();
  const { t } = useLanguage();
  const masterDataPath = getFirstAccessiblePath(hasPermission, 'master-data');
  // 数据质量与主数据运营统计只按原子菜单展示，避免父级主数据码透出无关子入口。
  const hasQualityPerm = hasPermission('MENU_MD_QUALITY', 'V');
  const hasCentersPerm = hasPermission('MENU_MD_CENTER', 'V');
  // G18-4：移除"ops 用户直接 return DailyWorkPage"逻辑。
  //   home 始终展示企业 KPI 看板（hero + 概览），与 daily-work 划清边界。
  //   ops 用户看到的 SHORTCUTS 仅含他有权进入的业务中心，hero CTA 引导到 daily-work。
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [scores, setScores] = useState<QualityScores | null>(null);
  const [centers, setCenters] = useState<CenterStat[]>([]);
  const [todoList, setTodoList] = useState<TodoTask[]>([]);
  // G19-E：养殖运营 KPI（拼合现有 farm/iot endpoint，不新建后端）
  const [farmKpi, setFarmKpi] = useState<FarmKpiState | null>(null);

  useEffect(() => {
    // G11：按权限懒加载 — 无权用户不发对应请求
    // 可选总览 widget：silent=true → 任何权限/数据问题静默降级，不弹全局 toast
    const requests: Promise<any>[] = [
      request<{ data: WorkflowSummary }>('/workflow/tasks/summary', { silent: true }).then(r => r.data).catch(() => null),
      request<{ data: TodoTask[] }>('/workflow/tasks/todo?limit=6', { silent: true }).then(r => r.data || []).catch(() => [] as TodoTask[]),
    ];
    requests.push(hasQualityPerm
      ? request<QualityScores>('/data-quality/scores', { silent: true }).catch(() => null)
      : Promise.resolve(null));
    requests.push(hasCentersPerm
      ? request<CenterStat[]>('/master-data/operations/centers', { silent: true }).catch(() => [])
      : Promise.resolve([]));

    Promise.all(requests).then(([s, t, q, c]) => {
      setSummary(s);
      setTodoList(Array.isArray(t) ? t.slice(0, 6) : []);
      setScores(q);
      setCenters(c || []);
    });

    // G19-E：拼养殖 KPI（hasPermission('MENU_FARM_DATA') 则拉）
    if (hasPermission('MENU_FARM_DATA', 'V')) {
      const today = localDateString();
      Promise.all([
        request<any>(`/v3/farm/daily-hen-report?date=${today}`).catch(() => null),
        request<any>(`/v3/iot/devices/all-summary`).catch(() => null),
        request<any>(`/crud/brd_daily_logs?log_date=${today}&limit=500`, { silent: true }).catch(() => null),
      ]).then(([hen, iot, dailyLogs]) => {
        const rows = asRows(hen);
        const totals = hen?.totals || hen?.data?.totals || null;
        const dailyRows = asRows(dailyLogs);
        const totalStock = rows.reduce((s: number, r: any) => s + (asNumber(r.current_qty) || asNumber(r.total_qty)), 0);
        const eggsToday  = rows.reduce((s: number, r: any) => s + (asNumber(r.eggs) || asNumber(r.eggs_produced)), 0);
        const layRate    = totalStock > 0 ? +(eggsToday / totalStock * 100).toFixed(1) : 0;
        const summary    = iot?.data?.summary;
        const houses     = iot?.data?.houses || [];
        const sumKnown = (field: 'feedToday' | 'waterToday') => {
          if (!Array.isArray(houses)) return null;
          let hasKnown = false;
          const total = houses.reduce((s: number, h: any) => {
            const raw = h?.[field];
            if (raw == null || raw === '') return s;
            const n = Number(raw);
            if (!Number.isFinite(n)) return s;
            hasKnown = true;
            return s + n;
          }, 0);
          return hasKnown ? total : null;
        };
        const hasDailyLog = Number(totals?.logged_houses ?? 0) > 0;
        const henFeedKg  = totals?.feed;
        const henWaterL  = totals?.water;
        const logFeedKg  = dailyRows.reduce((s: number, r: any) => s + asNumber(r.feed_consumed), 0);
        const logWaterL  = dailyRows.reduce((s: number, r: any) => s + asNumber(r.water_consumed), 0);
        const iotFeedKg  = sumKnown('feedToday');
        // IoT overview uses the same field rendered as T on the device page; /home displays water in L.
        const iotWater = sumKnown('waterToday');
        const iotWaterL = iotWater == null ? null : iotWater * 1000;
        const feedToday = hasDailyLog
          ? asNumber(henFeedKg)
          : (iotFeedKg ?? (logFeedKg > 0 ? logFeedKg : null));
        const waterToday = hasDailyLog
          ? asNumber(henWaterL)
          : (logWaterL > 0 ? logWaterL : iotWaterL);
        const alarmCount = summary?.totalAlarms ?? 0;
        setFarmKpi({ totalStock, layRate, eggsToday, feedToday, waterToday, alarmCount });
      });
    }
  }, [hasQualityPerm, hasCentersPerm, hasPermission]);

  const totalObjects = useMemo(() => centers.reduce((s, c) => s + c.objectCount, 0), [centers]);
  const totalRisk = useMemo(() => centers.reduce((s, c) => s + c.riskCount, 0), [centers]);
  const totalPending = useMemo(() => centers.reduce((s, c) => s + c.pendingCount, 0), [centers]);
  const avgHealth = useMemo(() => centers.length === 0 ? 0 : Math.round(centers.reduce((s, c) => s + c.healthScore, 0) / centers.length), [centers]);

  const role = (user as any)?.role || ((user as any)?.roles && (user as any).roles[0]) || '';
  const displayName: string = (user as any)?.realNameZh || (user as any)?.username || t('home.user', '用户');
  const todoCount = summary?.todo ?? 0;
  const cta = ctaFor(role, todoCount, hasPermission, t);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6)  return t('home.greetEarly', '凌晨好');
    if (h < 12) return t('home.greetMorning', '早上好');
    if (h < 14) return t('home.greetNoon', '中午好');
    if (h < 18) return t('home.greetAfternoon', '下午好');
    return t('home.greetEvening', '晚上好');
  }, [t]);

  // 今日要点（智能文案）— G11：高危告警/主数据待审批 仅治理类角色可见
  const todayBriefing = useMemo(() => {
    const parts: string[] = [];
    if (todoCount > 0)                          parts.push(`${todoCount} ${t('home.todosPending', '个待办待处理')}`);
    if ((summary?.overdueTodo ?? 0) > 0)        parts.push(`${summary?.overdueTodo} ${t('home.overdueUnit', '个超时')}`);
    if (hasQualityPerm && (scores?.highAlertCount ?? 0) > 0)  parts.push(`${scores?.highAlertCount} ${t('home.highAlertsUnit', '项高危告警')}`);
    if (hasCentersPerm && totalPending > 0)     parts.push(`${totalPending} ${t('home.mdPendingUnit', '单主数据待审批')}`);
    if (parts.length === 0) return t('home.noUrgent', '今天没有紧急事项，可以专注做事。');
    return t('home.todayHas', '今天有 ') + parts.join(t('home.listSep', '、')) + t('home.handlePriority', '，请优先处理。');
  }, [todoCount, summary, scores, totalPending, hasQualityPerm, hasCentersPerm, t]);

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ───── HERO 欢迎横幅（页面顶部，统一入口）───── */}
      <HeroBanner
        greeting={greeting}
        userName={displayName}
        briefing={todayBriefing}
        ctaLabel={cta.label}
        ctaHref={cta.href}
        CtaIcon={cta.icon}
        todoCount={todoCount}
        overdueCount={summary?.overdueTodo ?? 0}
        highAlertCount={scores?.highAlertCount ?? 0}
        masterDataPath={masterDataPath}
        showAlertBubble={hasQualityPerm}
      />

      {/* g200m(2026-06-20):养殖 KPI 6 卡 emoji→lucide,自写卡 → kpiCardCompact(tone) */}
      {hasPermission('MENU_FARM_DATA', 'V') && farmKpi && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {([
            { label: t('home.kpiTotalStock', '当前总存栏'), value: farmKpi.totalStock != null ? farmKpi.totalStock.toLocaleString() : '--', unit: t('home.unitBird', '羽'), tone: 'info' as const, Icon: Bird },
            { label: t('home.kpiEggsToday', '今日产蛋'), value: farmKpi.eggsToday != null ? farmKpi.eggsToday.toLocaleString() : '--', unit: t('home.unitEgg', '枚'), tone: 'success' as const, Icon: EggFried },
            { label: t('home.kpiLayRate', '今日产蛋率'), value: farmKpi.layRate != null ? farmKpi.layRate.toFixed(1) : '--', unit: '%', tone: 'success' as const, Icon: LineChart },
            { label: t('home.kpiFeedToday', '今日饲料消耗'), value: farmKpi.feedToday != null ? farmKpi.feedToday.toFixed(0) : '--', unit: 'kg', tone: 'warning' as const, Icon: WheatIcon },
            { label: t('home.kpiWaterToday', '今日用水'), value: farmKpi.waterToday != null ? farmKpi.waterToday.toFixed(1) : '--', unit: 'L', tone: 'info' as const, Icon: Droplets },
            { label: t('home.kpiAlarm', '设备告警'), value: farmKpi.alarmCount?.toString() ?? '0', unit: t('home.unitItem', '条'), tone: ((farmKpi.alarmCount ?? 0) > 0 ? 'danger' : 'success') as 'danger' | 'success', Icon: AlertTriangle },
          ]).map(k => (
            <div key={k.label} style={kpiCardCompact(k.tone)}>
              <div style={kpiCardCompactLabel}>
                <k.Icon size={13} /> {k.label}
              </div>
              <div style={{ ...kpiCardCompactValue(k.tone), display: 'flex', alignItems: 'baseline', gap: 4 }}>
                {k.value}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>{k.unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───── 主体布局：按权限渲染双栏或单栏 ───── */}
      {hasQualityPerm || hasCentersPerm ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 12 }}>
          {/* 左栏：事务流 + 经营概览 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TodoTimeline todoList={todoList} todoCount={todoCount} />
            <BusinessOverview hasPermission={hasPermission} />
          </div>
          {/* 右栏：治理类组件 — 仅治理类角色可见 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hasQualityPerm && (
              <>
                <QualityScoreCard score={scores?.overall ?? 0} masterDataScore={scores?.masterData ?? 0} />
                {(scores?.highAlertCount ?? 0) > 0 && (
                  <RiskAlertBanner highAlertCount={scores?.highAlertCount ?? 0} totalAlertCount={scores?.alertCount ?? 0} />
                )}
              </>
            )}
            {hasCentersPerm && (
              <HealthCard healthScore={avgHealth} totalObjects={totalObjects} totalRisk={totalRisk} />
            )}
          </div>
        </div>
      ) : (
        // G11：业务录入用户（孟赛生产数据主管等）只看事务流 + 经营概览，
        // 不显示数据质量驾驶舱 / 高危告警 / 主数据健康度
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TodoTimeline todoList={todoList} todoCount={todoCount} />
          <BusinessOverview hasPermission={hasPermission} />
        </div>
      )}

      {/* ───── 业务中心 — 按角色 perm 过滤 ───── */}
      <ShortcutsGrid hasPermission={hasPermission} />
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Hero 欢迎横幅
// ══════════════════════════════════════════════════════
function HeroBanner({ greeting, userName, briefing, ctaLabel, ctaHref, CtaIcon, todoCount, overdueCount, highAlertCount, masterDataPath, showAlertBubble }: {
  greeting: string; userName: string; briefing: string;
  ctaLabel: string; ctaHref: string; CtaIcon: any;
  todoCount: number; overdueCount: number; highAlertCount: number;
  masterDataPath?: string; showAlertBubble: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div style={{
      position: 'relative',
      borderRadius: 16,
      overflow: 'hidden',
      background: `linear-gradient(135deg, var(--color-primary) 0%, rgba(0,0,0,0) 80%), var(--bg-card)`,
      border: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: 20,
      padding: '18px 24px',
    }}>
      {/* 背景装饰圆 */}
      <div aria-hidden style={{
        position: 'absolute', right: -80, top: -80,
        width: 240, height: 240, borderRadius: '50%',
        background: 'var(--color-primary)', opacity: 0.08, pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: 80, bottom: -120,
        width: 180, height: 180, borderRadius: '50%',
        background: 'var(--color-primary)', opacity: 0.06, pointerEvents: 'none',
      }} />

      {/* 左：欢迎文案 + CTA */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={inlineBadge('default')}>{t('home.opsWorkbench', '运营工作台')}</span>
          <span style={{ opacity: 0.6 }}>·</span>
          <span>{new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.3,
          color: 'var(--text-primary)', lineHeight: 1.15,
        }}>
          {greeting}，{userName}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 720 }}>
          {briefing}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Link href={ctaHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 8,
            background: 'var(--color-primary)',
            color: 'var(--text-on-dark, white)',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
            boxShadow: '0 4px 12px var(--overlay-black-15)',
          }}>
            <CtaIcon size={14} /> {ctaLabel} <ArrowRight size={12} />
          </Link>
          {/* 主数据中心副 CTA — 只跳转到用户实际可访问的第一个主数据叶子入口。 */}
          {masterDataPath && (
            <Link href={masterDataPath} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8,
              background: 'var(--bg-muted)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
            }}>
              <Sparkles size={12} /> {t('home.masterDataCenter', '主数据中心')}
            </Link>
          )}
        </div>
      </div>

      {/* 右：数字气泡 — G11：高危告警仅治理类角色可见 */}
      <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
        <NumberBubble icon={<Inbox size={13} />} label={t('home.todo', '待办')} value={todoCount} tone="brand" />
        <NumberBubble icon={<Clock size={13} />} label={t('home.overdue', '超时')} value={overdueCount} tone={overdueCount > 0 ? 'danger' : 'default'} />
        {showAlertBubble && (
          <NumberBubble icon={<Bell size={13} />} label={t('home.highAlert', '高危告警')} value={highAlertCount} tone={highAlertCount > 0 ? 'warning' : 'default'} />
        )}
      </div>
    </div>
  );
}

function NumberBubble({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'brand' | 'warning' | 'danger' | 'default' }) {
  const color = tone === 'brand'   ? 'var(--color-primary)'
              : tone === 'warning' ? 'var(--status-warning)'
              : tone === 'danger'  ? 'var(--status-danger)'
              : 'var(--text-primary)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: 10,
      minWidth: 110,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 6,
        background: `${color}1a`, color,
      }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
        <strong style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</strong>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 待办 Timeline
// ══════════════════════════════════════════════════════
function TodoTimeline({ todoList, todoCount }: { todoList: TodoTask[]; todoCount: number }) {
  const { t: tr } = useLanguage();
  return (
    <div style={{ ...cockpitCard, padding: 14, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--color-primary)', color: 'var(--text-on-dark, white)',
        }}>
          <Target size={14} />
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{tr('home.todoFlow', '事务流 · 我的待办')}</h3>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
          {tr('home.total', '共')} <strong style={{ color: 'var(--color-primary)' }}>{todoCount}</strong> {tr('home.orderUnit', '单')}
        </span>
        <Link href="/workflow/todos" style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {tr('home.all', '全部')} <ChevronRight size={12} />
        </Link>
      </div>

      {todoList.length === 0 ? (
        <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--status-success)', marginBottom: 8, opacity: 0.6 }} />
          <div style={{ fontSize: 13 }}>{tr('home.noTodo', '暂无待办任务，今天可以专注做事 ✨')}</div>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 12 }}>
          {/* 时间轴竖线 */}
          <span aria-hidden style={{
            position: 'absolute', left: 5, top: 6, bottom: 6, width: 2,
            background: 'var(--border)', borderRadius: 1,
          }} />
          {todoList.map((t, i) => {
            const due = t.due_at ? new Date(t.due_at) : null;
            const isOverdue = due ? due.getTime() < Date.now() : false;
            const isUrgent = due && !isOverdue ? (due.getTime() - Date.now()) < 24 * 3600 * 1000 : false;
            const dotColor = isOverdue ? 'var(--status-danger)' : isUrgent ? 'var(--status-warning)' : 'var(--color-primary)';
            return (
              <Link key={i} href={`/workflow/todos?taskNo=${encodeURIComponent(t.task_no)}`} style={{
                position: 'relative', display: 'flex', gap: 12, padding: '10px 12px 10px 16px', marginLeft: -12,
                borderRadius: 8, textDecoration: 'none', color: 'inherit',
                transition: 'background 0.12s',
              }}>
                {/* 圆点 */}
                <span aria-hidden style={{
                  position: 'absolute', left: -1, top: 14,
                  width: 12, height: 12, borderRadius: '50%',
                  background: dotColor, border: '2px solid var(--bg-card)',
                  boxShadow: `0 0 0 2px ${dotColor}40`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {t.title || t.node_name || t.task_no}
                    </strong>
                    {isOverdue && <span style={inlineBadge('danger')}>{tr('home.overdueTag', '已超时')}</span>}
                    {isUrgent && <span style={inlineBadge('warning')}>{tr('home.within24h', '24h 内')}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 10 }}>
                    <span>{t.node_name}</span>
                    {t.starter_name && <span>· {tr('home.starter', '发起：')}{t.starter_name}</span>}
                    {due && <span>· {tr('home.due', '截止')} {due.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--text-secondary)', alignSelf: 'center' }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 经营概览（紧凑 5 卡 horizontal）
// ══════════════════════════════════════════════════════
function BusinessOverview({ hasPermission }: { hasPermission: PermissionChecker }) {
  const { t } = useLanguage();
  // G20-3 IA 立宪（B1 欠债治理）：经营概览 vs 业务中心导航职责划清
  //   · BusinessOverview = 财务指标导航（销售/现金/应收/应付）
  //   · SHORTCUTS         = 业务中心 8 大入口（客户/供应商/采购/销售/财务/库存/工作流/数据质量）
  //   删"库存"卡 — 与 SHORTCUTS.inventory 完全重叠（同 href / 同 perm，纯重复）
  //   后续 G21+ 计划：BusinessOverview 进一步改为纯指标卡（带今日数字、删 href），与 SHORTCUTS 完全分离
  const allCards = [
    { label: t('home.bizSales', '销售'), icon: ShoppingCart,     accent: '#10B981', href: '/sales2',                sub: t('home.bizSalesSub', '订单 · 收款'),  perm: 'MENU_SALES2_DASHBOARD', altPerms: ['MENU_SALES2_ORDER', 'MENU_SALES2_CUSTOMER', 'MENU_SALES2_PRICE', 'MENU_SALES2_DELIVERY', 'MENU_SALES2_RETURN', 'MENU_SALES2_CHANNEL', 'MENU_SALES2_REPORT'] },
    { label: t('home.bizCash', '现金'), icon: CircleDollarSign, accent: '#3B82F6', href: '/finance2/cash-accounts', sub: t('home.bizCashSub', '账户 · 流水'),  perm: 'MENU_FIN2_CASH_VIEW' },
    { label: t('home.bizAr', '应收'), icon: Receipt,          accent: '#06B6D4', href: '/finance2/ar',           sub: t('home.bizArSub', '发票 · 账龄'),  perm: 'MENU_FIN2_AR' },
    { label: t('home.bizAp', '应付'), icon: CreditCard,       accent: '#A855F7', href: '/finance2/ap',           sub: t('home.bizApSub', '账期 · 付款'),  perm: 'MENU_FIN2_AP' },
  ];
  const cards = allCards.filter(c => hasPermission(c.perm, "V") || (c.altPerms?.some(p => hasPermission(p, "V")) ?? false));
  if (cards.length === 0) return null;
  return (
    <div style={{ ...cockpitCard, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--status-success)', color: 'var(--text-on-dark, white)',
        }}>
          <TrendingUp size={14} />
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('home.bizOverview', '经营概览')}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>· {t('home.bizPanorama', '业务全景')}（{cards.length}）</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cards.length, 5)}, 1fr)`, gap: 10 }}>
        {cards.map((c, i) => (
          <Link key={i} href={c.href} style={{
            position: 'relative', padding: 14, borderRadius: 12,
            background: 'var(--bg-page)', border: '1px solid var(--border)',
            textDecoration: 'none',
            display: 'flex', flexDirection: 'column', gap: 8,
            overflow: 'hidden',
          }}>
            <span aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.accent,
            }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.accent }}>
              <c.icon size={14} />
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.label}</strong>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 数据质量评分（环形）
// ══════════════════════════════════════════════════════
function QualityScoreCard({ score, masterDataScore }: { score: number; masterDataScore: number }) {
  const { t } = useLanguage();
  const tone = score >= 90 ? 'var(--status-success)'
             : score >= 75 ? 'var(--color-primary)'
             : score >= 60 ? 'var(--status-warning)'
             : 'var(--status-danger)';
  const toneLabel = score >= 90 ? t('home.excellent', '优秀') : score >= 75 ? t('home.good', '良好') : score >= 60 ? t('home.pass', '及格') : t('home.needFix', '需整改');
  return (
    <Link href="/data-quality" style={{ ...cockpitCard, padding: 14, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: tone, color: 'var(--text-on-dark, white)',
        }}>
          <ShieldAlert size={14} />
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('home.dataQuality', '数据质量驾驶舱')}</h3>
        <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <RingProgress value={score} max={100} color={tone} size={92} thickness={8} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('home.compositeScore', '综合评分')}</span>
          <span style={{ fontSize: 14, color: tone, fontWeight: 700 }}>{toneLabel} · {t('home.sevenDimWeighted', '7 维加权')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('home.masterDataHealth', '主数据健康')} {masterDataScore}/100</span>
        </div>
      </div>
    </Link>
  );
}

function RingProgress({ value, max, color, size, thickness }: { value: number; max: number; color: string; size: number; thickness: number }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={thickness} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: size * 0.28, fontWeight: 800, fill: color }}>{value}</text>
      <text x="50%" y={size * 0.72} dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: 10, fill: 'var(--text-secondary)' }}>/ {max}</text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════
// 风险预警 banner
// ══════════════════════════════════════════════════════
function RiskAlertBanner({ highAlertCount, totalAlertCount }: { highAlertCount: number; totalAlertCount: number }) {
  const { t } = useLanguage();
  return (
    <Link href="/data-quality" style={{
      ...cockpitCard,
      padding: 16, textDecoration: 'none',
      background: 'linear-gradient(135deg, var(--status-danger-bg-faint) 0%, var(--bg-card) 60%)',
      border: '1px solid var(--status-danger)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, borderRadius: '50%',
        background: 'var(--status-danger)', color: 'var(--text-on-dark, white)',
        boxShadow: '0 0 0 6px var(--status-danger-bg-light)',
      }}>
        <AlertTriangle size={18} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-danger)' }}>{t('home.needAttention', '需立即关注')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          <strong style={{ color: 'var(--status-danger)' }}>{highAlertCount}</strong> {t('home.highAlertsUnit', '项高危告警')} · {t('home.total', '共')} <strong>{totalAlertCount}</strong> {t('home.itemUnit', '条')}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--status-danger)' }} />
    </Link>
  );
}

// ══════════════════════════════════════════════════════
// 主数据健康度
// ══════════════════════════════════════════════════════
function HealthCard({ healthScore, totalObjects, totalRisk }: { healthScore: number; totalObjects: number; totalRisk: number }) {
  const { t } = useLanguage();
  const tone = healthScore >= 90 ? 'var(--status-success)' : healthScore >= 75 ? 'var(--color-primary)' : healthScore >= 60 ? 'var(--status-warning)' : 'var(--status-danger)';
  return (
    <Link href="/master-data" style={{ ...cockpitCard, padding: 14, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--bg-muted)', color: tone }}>
          <Zap size={14} />
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('home.masterDataHealthScore', '主数据健康度')}</h3>
        <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ fontSize: 36, fontWeight: 800, color: tone, lineHeight: 1, letterSpacing: -1 }}>{healthScore}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>/ 100</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-muted)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${healthScore}%`, background: tone, opacity: 0.85, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
        <span>{t('home.managed', '在管')} <strong style={{ color: 'var(--text-primary)' }}>{totalObjects}</strong> {t('home.itemUnit', '条')}</span>
        <span>{t('home.risk', '风险')} <strong style={{ color: totalRisk > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>{totalRisk}</strong> {t('home.itemUnit', '条')}</span>
      </div>
    </Link>
  );
}

// ══════════════════════════════════════════════════════
// 8 大业务中心 tile 阵列
// ══════════════════════════════════════════════════════
function ShortcutsGrid({ hasPermission }: { hasPermission: PermissionChecker }) {
  const { t } = useLanguage();
  // G11：按权限过滤业务中心 — 无权访问的不显示
  const visible = SHORTCUTS.filter(s => {
    const href = s.groupId ? getFirstAccessiblePath(hasPermission, s.groupId) : s.href;
    return Boolean(href) && (hasPermission(s.perm, "V") || (s.altPerms?.some(p => hasPermission(p, "V")) ?? false));
  });
  if (visible.length === 0) return null;
  return (
    <div style={{ ...cockpitCard, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--color-primary)', color: 'var(--text-on-dark, white)',
        }}>
          <Sparkles size={14} />
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t('home.bizCenter', '业务中心')}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>· {t('home.oneClick', '一键直达')}（{visible.length}）</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {visible.map(s => {
          const href = s.groupId ? (getFirstAccessiblePath(hasPermission, s.groupId) || '') : s.href;
          if (!href) return null;
          return (
          <Link key={s.key} href={href} style={{
            position: 'relative', overflow: 'hidden',
            padding: 12, borderRadius: 10,
            background: `${s.gradient}, var(--bg-page)`,
            border: '1px solid var(--border)',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: s.accent, color: 'var(--text-on-dark, white)',
              flexShrink: 0,
            }}>
              <s.icon size={16} />
            </span>
            <strong style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{t(`home.shortcut.${s.key}`, s.label)}</strong>
            <ArrowRight size={12} style={{ color: s.accent }} />
          </Link>
          );
        })}
      </div>
    </div>
  );
}
