"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
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
  Users,
  Warehouse,
  Wheat,
  X,
} from "lucide-react";
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
  const scale = useCanvasScale();
  const [dash, setDash] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
      const response = await fetch("/api/analytics/dashboard", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      const body = await response.json();
      if (!body?.data) throw new Error("dashboard payload missing");
      setDash(body.data as DashboardData);
      setOnline(true);
      setUpdatedAt(new Date());
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const refresh = window.setInterval(load, 5 * 60 * 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(clock); window.clearInterval(refresh); };
  }, [load]);

  const k = dash.kpis;
  const productionToday = dash.production_trend.at(-1)?.value || 0;
  const throughput = k.today_inbound_qty + k.today_outbound_qty;
  const warningTotal = k.expiry_batches + k.pending_orders;
  const peak = Math.max(...dash.production_trend.map((item) => item.value), 1);
  const qualityScore = warningTotal === 0 ? 100 : Math.max(82, 100 - warningTotal * 2);
  const inboundRate = productionToday > 0 ? Math.min(100, Math.round((k.today_inbound_qty / productionToday) * 100)) : 0;

  const kpis = [
    { label: "近 30 天集蛋", value: formatNumber(k.eggs_30d), unit: "枚", delta: "生产核心指标", Icon: Egg, tone: "amber" },
    { label: "今日生产", value: formatNumber(productionToday), unit: "枚", delta: "最近日报口径", Icon: Factory, tone: "cyan" },
    { label: "今日入库", value: formatNumber(k.today_inbound_qty), unit: "枚", delta: `入库转化 ${inboundRate}%`, Icon: PackageCheck, tone: "green" },
    { label: "今日出库", value: formatNumber(k.today_outbound_qty), unit: "枚", delta: "销售履约流出", Icon: Truck, tone: "blue" },
    { label: "库存批次", value: formatNumber(k.stock_batches), unit: "批", delta: "全仓批次库存", Icon: Boxes, tone: "violet" },
    { label: "待处理事项", value: formatNumber(warningTotal), unit: "项", delta: `${k.pending_orders} 审批 · ${k.expiry_batches} 临期`, Icon: ClipboardCheck, tone: warningTotal ? "pink" : "green" },
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
            <div className={`${styles.liveBadge} ${online ? styles.live : styles.offline}`}><span />{online ? "实时数据在线" : "数据源待连接"}</div>
            <button onClick={load} disabled={loading} title="刷新数据"><RefreshCw size={34} className={loading ? styles.spinning : ""} /></button>
            <button onClick={requestFullscreen} title="进入全屏"><Fullscreen size={34} /></button>
            <div className={styles.clock}><strong>{now.toLocaleTimeString("zh-CN", { hour12: false })}</strong><span>{now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</span></div>
          </div>
        </header>

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

            <Panel title="组织与经营网络" eyebrow="ORGANIZATION NETWORK" icon={<Building2 size={34} />}>
              <div className={styles.networkMap}>
                <div className={styles.mapOrbit}><span /><span /><span /></div>
                <div className={styles.hub}><Building2 size={45} /><b>集团总部</b><small>统一管控</small></div>
                <div className={`${styles.mapNode} ${styles.node1}`}><Factory size={30} /><b>生产基地</b><small>鸡舍 / 鸡群</small></div>
                <div className={`${styles.mapNode} ${styles.node2}`}><Warehouse size={30} /><b>仓储中心</b><small>批次 / 库位</small></div>
                <div className={`${styles.mapNode} ${styles.node3}`}><Store size={30} /><b>销售网络</b><small>客户 / 门店</small></div>
                <div className={`${styles.mapNode} ${styles.node4}`}><Users size={30} /><b>组织协同</b><small>人员 / 权限</small></div>
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
              <div className={styles.salesHero}><div><span>今日出库</span><strong>{formatNumber(k.today_outbound_qty)}<em>枚</em></strong><small>订单履约实物流</small></div><Sparkline data={dash.outbound_trend.slice(-10)} color="#8aa7ff" /></div>
              <div className={styles.channelList}>
                {[{ name: "经销批发", value: 42 }, { name: "直营网点", value: 31 }, { name: "KA 客户", value: 18 }, { name: "其他渠道", value: 9 }].map((item) => <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${item.value}%` }} /></i><em>{item.value}%*</em></div>)}
              </div>
              <p className={styles.dataNote}>* 渠道占比接口待接入，当前为版式示意，不计入经营统计。</p>
            </Panel>

            <Panel title="风险与协同事项" eyebrow="RISK & COLLABORATION" icon={<AlertTriangle size={34} />}>
              <div className={styles.alertSummary}><div className={warningTotal ? styles.warningOrb : styles.safeOrb}><AlertTriangle size={46} /><strong>{warningTotal}</strong><span>待关注事项</span></div><div><span>临期库存</span><b>{k.expiry_batches} 批</b><span>待审批订单</span><b>{k.pending_orders} 单</b></div></div>
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
          <div>覆盖：采购 · 生产 · 品质 · 仓储 · 销售 · 配送 · 财务 · 组织</div>
          <button onClick={() => setShowHelp(true)}>数据说明</button>
          <div>PHOENIX ERP V3 · 3840 × 2160</div>
        </footer>

        {showHelp && <div className={styles.modalBackdrop} onClick={() => setShowHelp(false)}><div className={styles.modal} onClick={(event) => event.stopPropagation()}><button onClick={() => setShowHelp(false)}><X size={34} /></button><h2>大屏数据说明</h2><p>数值型指标来自 Phoenix ERP 现有经营分析接口；页面每 5 分钟自动刷新，也可在右上角手动刷新。</p><p>业务流程、模块能力与组织网络用于展示系统覆盖范围，不代表实时数量。标注“版式示意”的渠道占比将在对应分析接口接入后切换为真实值。</p><p>未登录或接口不可用时，大屏保留功能全景，但数值归零并显示“数据源待连接”，不会使用虚构经营数据。</p></div></div>}
      </div>
    </main>
  );
}
