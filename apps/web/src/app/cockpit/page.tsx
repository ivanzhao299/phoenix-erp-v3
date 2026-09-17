"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Egg,
  Factory,
  Fullscreen,
  Gauge,
  Layers3,
  PackageCheck,
  RefreshCw,
  Route,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Warehouse,
  Wheat,
  X,
  Thermometer,
  Droplets,
  Wind,
  Radio,
  Wifi,
  Bird,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./cockpit.module.css";

type TrendPoint = { date: string; value: number };
type DashboardData = {
  kpis: {
    eggs_30d: number;
    today_inbound_qty: number;
    today_outbound_qty: number;
    stock_batches: number;
    pending_orders: number;
    expiry_batches: number;
  };
  production_trend: TrendPoint[];
  outbound_trend: TrendPoint[];
  alerts: {
    expiry_batches: Array<{ sku_code?: string; qty_available?: number; expire_date?: string }>;
    pending_orders: Array<{ customer_name?: string; total_amount?: number }>;
    mortality_30d: number;
  };
};

type ExecutiveKpi = {
  stats?: {
    eggs?: { value?: string; unit?: string };
    stock?: { value?: string; unit?: string };
    salesPos?: { value?: string; unit?: string };
    salesFarm?: { value?: string; unit?: string };
    alerts?: { value?: string; unit?: string };
  };
  chartData?: Array<{ day: string; prod: number; sales: number; farmSales?: number }>;
  deviceStats?: { activeAlerts?: number; offlineHouses?: number; hottestHouse?: string | null; hottestTemp?: number | string | null };
  isGroupView?: boolean;
  scopeCode?: string | null;
  meta?: { todayLayRate?: number | null; posTxnCount?: number; stockAvailableTotal?: number; stockAvailableBatchCount?: number };
};

type IotHouse = {
  houseCode: string;
  houseName: string;
  hasData?: boolean;
  dataFreshness?: string;
  alarmCount?: number;
  onlineRate?: number;
  avgTemp?: number | null;
  avgHumidity?: number | null;
  co2?: number | null;
  ammonia?: number | null;
  feedToday?: number | null;
  waterToday?: number | null;
};

type IotData = {
  summary?: {
    totalHouses?: number;
    activeHouses?: number;
    totalAlarms?: number;
    alarmHouses?: number;
    onlineSensorCnt?: number;
    totalSensorCnt?: number;
    diagnosticCode?: string;
    diagnosticReason?: string;
  };
  houses?: IotHouse[];
};

type DataSourceState = "idle" | "loading" | "online" | "unauthorized" | "forbidden" | "error";
type DataSourceKey = "analytics" | "executive" | "iot";
type DataSourceStates = Record<DataSourceKey, DataSourceState>;

const EMPTY: DashboardData = {
  kpis: { eggs_30d: 0, today_inbound_qty: 0, today_outbound_qty: 0, stock_batches: 0, pending_orders: 0, expiry_batches: 0 },
  production_trend: [],
  outbound_trend: [],
  alerts: { expiry_batches: [], pending_orders: [], mortality_30d: 0 },
};

const DESIGN_WIDTH = 3840;
const DESIGN_HEIGHT = 2160;

const processNodes = [
  { label: "饲料采购", sub: "供应商 · 到货 · 检验", Icon: Wheat, tone: "cyan" },
  { label: "养殖生产", sub: "鸡群 · 鸡舍 · 日报", Icon: Factory, tone: "blue" },
  { label: "集蛋分级", sub: "集蛋 · 质检 · 分级", Icon: Egg, tone: "amber" },
  { label: "包装入库", sub: "批次 · 包装 · 追溯", Icon: PackageCheck, tone: "green" },
  { label: "仓储调拨", sub: "库存 · 调拨 · 盘点", Icon: Warehouse, tone: "violet" },
  { label: "销售履约", sub: "订单 · 信用 · 配送", Icon: ShoppingCart, tone: "pink" },
  { label: "门店零售", sub: "POS · 客户 · 退货", Icon: Store, tone: "cyan" },
  { label: "财务闭环", sub: "收付 · 对账 · 报表", Icon: BadgeDollarSign, tone: "amber" },
] as const;

const capabilityGroups = [
  { title: "生产经营", items: ["养殖生产", "集蛋分级", "包装管理", "质量追溯"], Icon: Factory },
  { title: "供应链", items: ["采购协同", "仓储 WMS", "库存调拨", "配送履约"], Icon: Route },
  { title: "销售渠道", items: ["销售订单", "客户信用", "门店 POS", "价格体系"], Icon: ShoppingCart },
  { title: "经营管控", items: ["财务核算", "审批流程", "股东权益", "经营分析"], Icon: Gauge },
  { title: "企业底座", items: ["组织架构", "主数据", "权限审计", "系统监控"], Icon: Database },
] as const;

function useCanvasScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function Sparkline({ data, color = "#4deeea" }: { data: TrendPoint[]; color?: string }) {
  const points = useMemo(() => {
    if (!data.length) return "0,98 55,84 110,90 165,58 220,66 275,34 330,42 385,18";
    const values = data.map((item) => Number(item.value || 0));
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    return values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 385},${98 - ((value - min) / range) * 80}`).join(" ");
  }, [data]);
  return (
    <svg className={styles.sparkline} viewBox="0 0 385 110" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`fade-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".42" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,110 ${points} 385,110`} fill={`url(#fade-${color.replace("#", "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ value, label, color }: { value: number; label: string; color: string }) {
  const safe = Math.max(0, Math.min(value, 100));
  return (
    <div className={styles.ringWrap}>
      <div className={styles.ring} style={{ background: `conic-gradient(${color} ${safe * 3.6}deg, rgba(255,255,255,.07) 0deg)` }}>
        <div><strong>{safe}%</strong><span>{label}</span></div>
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, icon, children, className = "" }: { title: string; eyebrow: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}>{icon}</span>
        <div><span>{eyebrow}</span><h2>{title}</h2></div>
        <i />
      </div>
      {children}
    </section>
  );
}

export default function EnterpriseCockpit() {
  const { token, loading: authLoading } = useAuth();
  const scale = useCanvasScale();
  const [dash, setDash] = useState<DashboardData>(EMPTY);
  const [executive, setExecutive] = useState<ExecutiveKpi>({});
  const [iot, setIot] = useState<IotData>({});
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [showHelp, setShowHelp] = useState(false);
  const [sourceStates, setSourceStates] = useState<DataSourceStates>({ analytics: "idle", executive: "idle", iot: "idle" });

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!token) {
      setOnline(false);
      setLoading(false);
      setSourceStates({ analytics: "unauthorized", executive: "unauthorized", iot: "unauthorized" });
      window.location.replace(`/login?return=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setLoading(true);
    setSourceStates({ analytics: "loading", executive: "loading", iot: "loading" });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const options: RequestInit = { headers };
    const read = async (url: string) => {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = new Error(`${url} ${response.status}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return response.json();
    };
    try {
      const [analyticsResult, executiveResult, iotResult] = await Promise.allSettled([
        read("/api/analytics/dashboard"),
        read("/api/dashboard/kpi"),
        read("/api/v3/iot/devices/all-summary"),
      ]);
      const results = { analytics: analyticsResult, executive: executiveResult, iot: iotResult };
      const nextStates = Object.fromEntries(Object.entries(results).map(([key, result]) => {
        if (result.status === "fulfilled" && result.value?.data) return [key, "online"];
        const status = result.status === "rejected" ? (result.reason as { status?: number })?.status : undefined;
        if (status === 401) return [key, "unauthorized"];
        if (status === 403) return [key, "forbidden"];
        return [key, "error"];
      })) as DataSourceStates;
      setSourceStates(nextStates);
      let connected = false;
      if (analyticsResult.status === "fulfilled" && analyticsResult.value?.data) {
        setDash(analyticsResult.value.data as DashboardData);
        connected = true;
      }
      if (executiveResult.status === "fulfilled" && executiveResult.value?.data) {
        setExecutive(executiveResult.value.data as ExecutiveKpi);
        connected = true;
      }
      if (iotResult.status === "fulfilled" && iotResult.value?.data) {
        setIot(iotResult.value.data as IotData);
        connected = true;
      }
      setOnline(connected);
      if (!connected) throw new Error("all cockpit data sources unavailable");
      setUpdatedAt(new Date());
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [authLoading, token]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const refresh = window.setInterval(load, 5 * 60 * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(clock); window.clearInterval(refresh); };
  }, [load]);

  const k = dash.kpis;
  const parseMetric = (value?: string) => Number(String(value || "0").replace(/,/g, "")) || 0;
  const productionToday = parseMetric(executive.stats?.eggs?.value) || dash.production_trend.at(-1)?.value || 0;
  const layingStock = parseMetric(executive.stats?.stock?.value);
  const posSales = parseMetric(executive.stats?.salesPos?.value);
  const farmSales = parseMetric(executive.stats?.salesFarm?.value);
  const totalSales = posSales + farmSales;
  const deviceSummary = iot.summary || {};
  const houses = iot.houses || [];
  const deviceAlerts = Number(deviceSummary.totalAlarms || executive.deviceStats?.activeAlerts || 0);
  const onlineSensors = Number(deviceSummary.onlineSensorCnt || 0);
  const totalSensors = Number(deviceSummary.totalSensorCnt || 0);
  const sensorOnlineRate = totalSensors ? Math.round((onlineSensors / totalSensors) * 100) : 0;
  const throughput = k.today_inbound_qty + k.today_outbound_qty;
  const warningTotal = k.expiry_batches + k.pending_orders + deviceAlerts;
  const peak = Math.max(...dash.production_trend.map((item) => item.value), 1);
  const qualityScore = warningTotal === 0 ? 100 : Math.max(82, 100 - warningTotal * 2);
  const inboundRate = productionToday > 0 ? Math.min(100, Math.round((k.today_inbound_qty / productionToday) * 100)) : 0;
  const onlineSourceCount = Object.values(sourceStates).filter((state) => state === "online").length;
  const forbiddenSourceCount = Object.values(sourceStates).filter((state) => state === "forbidden").length;
  const sourceLabel = authLoading || loading
    ? "数据连接中"
    : onlineSourceCount === 3
      ? "实时数据在线"
      : onlineSourceCount > 0
        ? `${onlineSourceCount}/3 数据源在线`
        : forbiddenSourceCount > 0
          ? "数据权限不足"
          : "数据源连接失败";

  const kpis = [
    { label: "今日产蛋", value: formatNumber(productionToday), unit: "枚", delta: executive.meta?.todayLayRate != null ? `产蛋率 ${executive.meta.todayLayRate}%` : "养殖日报口径", Icon: Egg, tone: "amber" },
    { label: "当前存栏", value: formatNumber(layingStock), unit: "羽", delta: "产蛋鸡群实时汇总", Icon: Bird, tone: "cyan" },
    { label: "今日入库", value: formatNumber(k.today_inbound_qty), unit: "枚", delta: `入库转化 ${inboundRate}%`, Icon: PackageCheck, tone: "green" },
    { label: "今日出库", value: formatNumber(k.today_outbound_qty), unit: "枚", delta: "销售履约流出", Icon: Truck, tone: "blue" },
    { label: "今日销售", value: formatNumber(totalSales), unit: "LAK", delta: `${executive.meta?.posTxnCount || 0} 笔 POS · 含农场直销`, Icon: BadgeDollarSign, tone: "violet" },
    { label: "设备在线", value: formatNumber(onlineSensors), unit: `/${totalSensors || 0}`, delta: `${sensorOnlineRate}% 在线 · ${deviceAlerts} 告警`, Icon: Radio, tone: deviceAlerts ? "pink" : "green" },
  ];

  const bars = dash.production_trend.length ? dash.production_trend.slice(-7) : Array.from({ length: 7 }, (_, i) => ({ date: `D${i + 1}`, value: 0 }));

  const requestFullscreen = () => document.documentElement.requestFullscreen?.();

  return (
    <main className={styles.viewport}>
      <div className={styles.canvas} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={styles.gridGlow} />
        <header className={styles.header}>
          <div className={styles.brandMark}><Egg size={62} strokeWidth={1.6} /><span /></div>
          <div className={styles.brandCopy}><span>PHOENIX ERP · DIGITAL OPERATIONS</span><strong>金凤凰企业全链路数字化经营中心</strong></div>
          <div className={styles.headerCenter}><i /><b>生产 · 销售 · 流通 · 财务</b><i /></div>
          <div className={styles.headerStatus}>
            <div className={`${styles.liveBadge} ${online ? styles.live : styles.offline}`} title={`经营分析：${sourceStates.analytics}；经营 KPI：${sourceStates.executive}；设备：${sourceStates.iot}`}><span />{sourceLabel}</div>
            <button onClick={load} disabled={loading} title="刷新数据"><RefreshCw size={34} className={loading ? styles.spinning : ""} /></button>
            <button onClick={requestFullscreen} title="进入全屏"><Fullscreen size={34} /></button>
            <div className={styles.clock}><strong>{now.toLocaleTimeString("zh-CN", { hour12: false })}</strong><span>{now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</span></div>
          </div>
        </header>

        <nav className={styles.sectionNav} aria-label="经营大屏分页导航">
          <Link className={styles.navActive} href="/cockpit"><Gauge size={26} />综合总览</Link>
          <Link href="/analytics/production"><Factory size={26} />生产态势</Link>
          <Link href="/sales2/reports"><ShoppingCart size={26} />销售经营</Link>
          <Link href="/breeding/device"><Radio size={26} />设备监控</Link>
          <Link href="/sales2/delivery"><Truck size={26} />物流履约</Link>
        </nav>

        <section className={styles.kpiRow}>
          {kpis.map(({ label, value, unit, delta, Icon, tone }) => (
            <article key={label} className={`${styles.kpiCard} ${styles[`tone_${tone}`]}`}>
              <div className={styles.kpiIcon}><Icon size={44} /></div>
              <div><span>{label}</span><strong>{loading ? "—" : value}<em>{unit}</em></strong><small>{delta}</small></div>
              <div className={styles.kpiPulse} />
            </article>
          ))}
        </section>

        <div className={styles.dashboardGrid}>
          <div className={styles.leftColumn}>
            <Panel title="生产态势总览" eyebrow="PRODUCTION OVERVIEW" icon={<Factory size={34} />}>
              <div className={styles.productionHero}>
                <div><span>今日产出</span><strong>{formatNumber(productionToday)}</strong><small>枚 · 峰值 {formatNumber(peak)}</small></div>
                <Sparkline data={dash.production_trend.slice(-10)} />
              </div>
              <div className={styles.miniStats}>
                <div><span>30 日累计</span><b>{formatNumber(k.eggs_30d)}</b><small>枚</small></div>
                <div><span>死淘记录</span><b>{formatNumber(dash.alerts.mortality_30d)}</b><small>只 / 30日</small></div>
                <div><span>入库转化</span><b>{inboundRate}</b><small>%</small></div>
              </div>
              <div className={styles.barChart}>
                {bars.map((item, index) => <div key={`${item.date}-${index}`}><i style={{ height: `${Math.max(5, (item.value / peak) * 100)}%` }} /><span>{item.date.slice(5) || item.date}</span></div>)}
              </div>
            </Panel>

            <Panel title="鸡舍设备实时监控" eyebrow="IOT DEVICE MONITOR" icon={<Radio size={34} />}>
              <div className={styles.deviceSummary}>
                <div><Wifi size={30} /><span>在线传感器</span><b>{onlineSensors}/{totalSensors}</b></div>
                <div><Building2 size={30} /><span>接入鸡舍</span><b>{deviceSummary.activeHouses || 0}/{deviceSummary.totalHouses || 0}</b></div>
                <div><AlertTriangle size={30} /><span>设备告警</span><b>{deviceAlerts}</b></div>
              </div>
              <div className={styles.houseGrid}>
                {houses.length ? houses.slice(0, 6).map((house) => <article key={house.houseCode} className={house.alarmCount ? styles.houseAlarm : ""}>
                  <div><span className={house.dataFreshness === "normal" ? styles.deviceOnline : styles.deviceOffline} /><b>{house.houseName || house.houseCode}</b><em>{Math.round((house.onlineRate || 0) * 100)}%</em></div>
                  <small>{house.houseCode} · {house.dataFreshness === "normal" ? "数据正常" : house.dataFreshness === "delayed" ? "数据延迟" : "离线/无数据"}</small>
                  <ul>
                    <li><Thermometer size={18} />{house.avgTemp != null ? `${house.avgTemp.toFixed(1)}℃` : "--"}</li>
                    <li><Droplets size={18} />{house.avgHumidity != null ? `${house.avgHumidity.toFixed(0)}%` : "--"}</li>
                    <li><Wind size={18} />{house.co2 != null ? `${house.co2.toFixed(0)} ppm` : "--"}</li>
                  </ul>
                </article>) : <div className={styles.deviceEmpty}><Radio size={58} /><b>设备数据等待接入</b><span>{deviceSummary.diagnosticReason || "登录后读取 ERP 鸡舍设备实时数据"}</span></div>}
              </div>
            </Panel>
          </div>

          <div className={styles.centerColumn}>
            <section className={styles.flowPanel}>
              <div className={styles.flowTitle}><span>END-TO-END DIGITAL OPERATIONS</span><h1>企业生产经营全流程数字化链路</h1><p>一物一码 · 一批一档 · 业务财务一体 · 全程可追溯</p></div>
              <div className={styles.flowLine}>
                {processNodes.map(({ label, sub, Icon, tone }, index) => (
                  <div className={styles.flowItem} key={label}>
                    <div className={`${styles.processNode} ${styles[`tone_${tone}`]}`}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={52} /><b>{label}</b><small>{sub}</small></div>
                    {index < processNodes.length - 1 && <div className={styles.connector}><i /><span>›</span></div>}
                  </div>
                ))}
              </div>
              <div className={styles.flowMetrics}>
                <div><Activity size={38} /><span>今日业务吞吐</span><strong>{formatNumber(throughput)}</strong><em>枚</em></div>
                <div><ShieldCheck size={38} /><span>流程闭环度</span><strong>{online ? 100 : 0}</strong><em>%</em></div>
                <div><Clock3 size={38} /><span>数据更新时间</span><strong>{updatedAt ? updatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong><em>自动 5 分钟</em></div>
                <div><Layers3 size={38} /><span>覆盖业务域</span><strong>5</strong><em>大领域</em></div>
              </div>
            </section>

            <Panel title="企业数字能力全景" eyebrow="DIGITAL CAPABILITY MAP" icon={<Layers3 size={34} />} className={styles.capabilityPanel}>
              <div className={styles.capabilityGrid}>
                {capabilityGroups.map(({ title, items, Icon }) => <article key={title}><div><Icon size={36} /><b>{title}</b><span>已纳入平台</span></div><ul>{items.map((item) => <li key={item}><CheckCircle2 size={20} />{item}</li>)}</ul></article>)}
              </div>
            </Panel>
          </div>

          <div className={styles.rightColumn}>
            <Panel title="仓储与履约" eyebrow="WAREHOUSE & DELIVERY" icon={<Truck size={34} />}>
              <div className={styles.ringRow}>
                <Ring value={qualityScore} label="健康度" color="#4deeea" />
                <Ring value={inboundRate} label="入库转化" color="#7ef29a" />
                <Ring value={warningTotal ? Math.max(0, 100 - warningTotal * 5) : 100} label="履约就绪" color="#8aa7ff" />
              </div>
              <div className={styles.stockLines}>
                <div><span>库存批次</span><b>{formatNumber(k.stock_batches)} 批</b><i style={{ width: `${Math.min(100, k.stock_batches * 4)}%` }} /></div>
                <div><span>今日入库</span><b>{formatNumber(k.today_inbound_qty)} 枚</b><i style={{ width: `${productionToday ? Math.min(100, (k.today_inbound_qty / productionToday) * 100) : 0}%` }} /></div>
                <div><span>今日出库</span><b>{formatNumber(k.today_outbound_qty)} 枚</b><i style={{ width: `${throughput ? Math.min(100, (k.today_outbound_qty / throughput) * 100) : 0}%` }} /></div>
              </div>
            </Panel>

            <Panel title="销售与渠道动向" eyebrow="SALES & CHANNEL" icon={<ShoppingCart size={34} />}>
              <div className={styles.salesHero}><div><span>今日销售收入</span><strong>{formatNumber(totalSales)}<em>LAK</em></strong><small>{executive.meta?.posTxnCount || 0} 笔 POS 交易</small></div><Sparkline data={(executive.chartData || []).map(item => ({ date: item.day, value: item.sales + (item.farmSales || 0) }))} color="#8aa7ff" /></div>
              <div className={styles.channelList}>
                {[{ name: "门店 POS", value: posSales }, { name: "农场直销", value: farmSales }].map((item) => {
                  const percent = totalSales ? Math.round((item.value / totalSales) * 100) : 0;
                  return <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${percent}%` }} /></i><em>{formatNumber(item.value)} LAK</em></div>;
                })}
              </div>
              <p className={styles.dataNote}>销售数据来自 ERP 门店收银与农场直销订单，按当前登录账号数据域统计。</p>
            </Panel>

            <Panel title="风险与协同事项" eyebrow="RISK & COLLABORATION" icon={<AlertTriangle size={34} />}>
              <div className={styles.alertSummary}><div className={warningTotal ? styles.warningOrb : styles.safeOrb}><AlertTriangle size={46} /><strong>{warningTotal}</strong><span>待关注事项</span></div><div><span>临期库存</span><b>{k.expiry_batches} 批</b><span>待审批订单</span><b>{k.pending_orders} 单</b><span>设备告警</span><b>{deviceAlerts} 条</b></div></div>
              <div className={styles.alertList}>
                {(dash.alerts.expiry_batches.length ? dash.alerts.expiry_batches.slice(0, 3).map((item, index) => ({ title: item.sku_code || `临期批次 ${index + 1}`, meta: `${formatNumber(item.qty_available || 0)} · ${item.expire_date || "日期待确认"}`, level: "warning" })) : [
                  { title: online ? "当前无临期批次明细" : "经营数据源尚未连接", meta: online ? "库存风险处于正常区间" : "登录后可读取实时经营数据", level: online ? "safe" : "warning" },
                  { title: "系统运行监控", meta: online ? "分析服务响应正常" : "等待数据源恢复", level: online ? "safe" : "warning" },
                ]).map((item) => <div key={item.title} className={item.level === "safe" ? styles.safeItem : styles.warningItem}><span /><div><b>{item.title}</b><small>{item.meta}</small></div></div>)}
              </div>
            </Panel>
          </div>
        </div>

        <footer className={styles.footer}>
          <div><span className={online ? styles.dotLive : styles.dotOff} />数据口径：Phoenix ERP 经营分析接口</div>
          <div>覆盖：采购 · 生产 · 设备 · 品质 · 仓储 · 销售 · 配送 · 财务 · 组织</div>
          <button onClick={() => setShowHelp(true)}>数据说明</button>
          <div>PHOENIX ERP V3 · 3840 × 2160</div>
        </footer>

        {showHelp && <div className={styles.modalBackdrop} onClick={() => setShowHelp(false)}><div className={styles.modal} onClick={(event) => event.stopPropagation()}><button onClick={() => setShowHelp(false)}><X size={34} /></button><h2>大屏数据说明</h2><p>数值型指标来自 Phoenix ERP 现有经营分析接口；页面每 5 分钟自动刷新，也可在右上角手动刷新。</p><p>业务流程、模块能力与组织网络用于展示系统覆盖范围，不代表实时数量。标注“版式示意”的渠道占比将在对应分析接口接入后切换为真实值。</p><p>未登录或接口不可用时，大屏保留功能全景，但数值归零并显示“数据源待连接”，不会使用虚构经营数据。</p></div></div>}
      </div>
    </main>
  );
}
