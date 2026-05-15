"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import s from "@/components/ui/admin-ui.module.css";
import {
  PackagePlus, PackageMinus, ListChecks, Search,
  ArrowDown, ArrowUp, Package, AlertTriangle, RefreshCw,
  MoveHorizontal, MapPin
} from "lucide-react";

interface Zone { id: number; zone_code: string; zone_name: string; zone_type: string; temp_range: string; used_capacity: number; total_capacity: number; status: string; item_count?: number; }
interface InboundRow  { id: number; inbound_no: string; item: string; qty: number; warehouse_code: string; date: string; created_at: string; }
interface OutboundRow { id: number; outbound_no: string; item: string; qty: number; dest: string; date: string; time?: string; created_at: string; }
interface BatchRow    { id: number; batch_no: string; expire_date: string; qty_available: number; }

// 库区进度条卡片 — 纯 CSS 类，无 inline 颜色
function ZoneCard({ zone }: { zone: Zone }) {
  const pct = zone.total_capacity > 0 ? Math.round((zone.used_capacity / zone.total_capacity) * 100) : 0;
  const isWarn = zone.status === 'WARNING' || pct >= 85;
  const cardBorderCls = isWarn ? s.statCardWarning : s.statCardPrimary;
  const barCls        = pct >= 85 ? s.progressBarDanger : pct >= 60 ? s.progressBarWarning : s.progressBarSuccess;
  const pctCls        = pct >= 85 ? s.textDanger : pct >= 60 ? s.textWarning : s.textInfo;
  return (
    <div className={`${s.card} ${cardBorderCls}`} style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{zone.zone_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {zone.zone_type}{zone.temp_range ? ` · ${zone.temp_range}` : ''}
          </div>
        </div>
        {isWarn && <span className={`${s.badge} ${s.badgeWarning}`}>容量预警</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <span>{Number(zone.used_capacity).toLocaleString()} / {Number(zone.total_capacity).toLocaleString()}</span>
        <span className={pctCls} style={{ fontWeight: 700 }}>{pct}%</span>
      </div>
      <div className={s.progressWrap} style={{ height: 8 }}>
        <div className={`${s.progressBar} ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function WarehouseDashboard() {
  const [zones,     setZones]     = useState<Zone[]>([]);
  const [inbounds,  setInbounds]  = useState<InboundRow[]>([]);
  const [outbounds, setOutbounds] = useState<OutboundRow[]>([]);
  const [expiry,    setExpiry]    = useState<BatchRow[]>([]);
  const [loading,   setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [zRes, ibRes, obRes, btRes] = await Promise.all([
      crudApi.list("wms_zones",    { limit: 100 } as any).catch(() => ({ data: [] })),
      crudApi.list("wms_inbound",  { limit: 200 } as any).catch(() => ({ data: [] })),
      crudApi.list("wms_outbound", { limit: 200 } as any).catch(() => ({ data: [] })),
      crudApi.list("inv_batches",  { limit: 500 } as any).catch(() => ({ data: [] })),
    ]);
    setZones((zRes as any).data ?? []);
    setInbounds((ibRes as any).data ?? []);
    setOutbounds((obRes as any).data ?? []);

    // 14 天内临期批次
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    setExpiry(((btRes as any).data ?? []).filter((b: BatchRow) =>
      b.expire_date && b.expire_date <= in14 && b.expire_date >= today && b.qty_available > 0
    ));
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const today = new Date().toISOString().slice(0, 10);
  const todayIn  = useMemo(() => inbounds.filter(r => (r.date || r.created_at?.slice(0,10)) === today), [inbounds, today]);
  const todayOut = useMemo(() => outbounds.filter(r => (r.date || r.created_at?.slice(0,10)) === today), [outbounds, today]);
  const totalInQty  = todayIn.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalOutQty = todayOut.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalStock  = zones.reduce((s, z) => s + (Number(z.used_capacity) || 0), 0);

  // 最近出入库动态 — 用 CSS 类名替代 hex/var 颜色
  const activity = useMemo(() => {
    const ib = inbounds.slice(0, 20).map(r => ({ type: 'in',  label: '入库', cls: s.textSuccess, desc: `${r.item || '品目'} → ${r.warehouse_code || '仓区'}`, qty: r.qty, date: r.date || r.created_at?.slice(0,10) || '', time: r.created_at?.slice(11,16) || '--:--' }));
    const ob = outbounds.slice(0, 20).map(r => ({ type: 'out', label: '出库', cls: s.textDanger,  desc: `${r.item || '品目'} → ${r.dest || '去向'}`,           qty: r.qty, date: r.date || r.created_at?.slice(0,10) || '', time: r.time || r.created_at?.slice(11,16) || '--:--' }));
    return [...ib, ...ob].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 8);
  }, [inbounds, outbounds]);

  const KPIs = [
    { label: '库存总量',   value: loading ? '…' : totalStock.toLocaleString(), unit: '单位', cardCls: s.statCardPrimary, valCls: "",            icon: <Package size={20} /> },
    { label: '今日入库',   value: loading ? '…' : (totalInQty || todayIn.length).toString(), unit: totalInQty ? '枚' : '单', cardCls: s.statCardSuccess, valCls: s.textSuccess, icon: <ArrowDown size={20} /> },
    { label: '今日出库',   value: loading ? '…' : (totalOutQty || todayOut.length).toString(), unit: totalOutQty ? '枚' : '单', cardCls: s.statCardDanger,  valCls: s.textDanger,  icon: <ArrowUp size={20} /> },
    { label: '临期批次',   value: loading ? '…' : expiry.length.toString(), unit: '批次', cardCls: s.statCardWarning, valCls: s.textWarning, icon: <AlertTriangle size={20} /> },
  ];

  const QUICK = [
    { path: '/warehouse/inbound',  Icon: PackagePlus,      label: '入库管理',  cardCls: s.statCardSuccess },
    { path: '/warehouse/outbound', Icon: PackageMinus,     label: '出库管理',  cardCls: s.statCardDanger  },
    { path: '/warehouse/transfer', Icon: MoveHorizontal,   label: '库存调拨',  cardCls: s.statCardPrimary },
    { path: '/warehouse/stocktake',Icon: ListChecks,       label: '盘点管理',  cardCls: s.statCardWarning },
    { path: '/warehouse/query',    Icon: Search,           label: '库存查询',  cardCls: s.statCardPurple  },
    { path: '/warehouse/expiry',   Icon: AlertTriangle,    label: '临期预警',  cardCls: s.statCardWarning },
    { path: '/warehouse/locations',Icon: MapPin,           label: '库位管理',  cardCls: s.statCardPrimary },
    { path: '/warehouse/ledger',   Icon: Package,          label: '库存台账',  cardCls: s.statCardInfo    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="仓库看板"
        subtitle={`全仓储实时监控 · ${zones.length} 个库区 · 实时库存数据`}
        breadcrumb={['仓储管理', '仓库看板']}
        actions={
          <button type="button" className={s.btnSecondary} onClick={loadAll} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
        }
      />

      {/* KPI 卡片 */}
      <div className={s.statsRow} style={{ marginBottom: 20 }}>
        {KPIs.map(k => (
          <div key={k.label} className={`${s.statCard} ${k.cardCls}`}>
            <div className={`${s.statValue} ${k.valCls}`}>{k.value}</div>
            <div className={s.statLabel}>{k.label}</div>
            <div className={s.statSub}>{k.unit}</div>
          </div>
        ))}
      </div>

      {/* 主内容区：库区 + 侧边栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* 左：库区状态 */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
            库区状态
            {loading && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>加载中…</span>}
          </h3>
          {!loading && zones.length === 0 && (
            <div className={s.emptyState}>暂无库区数据，请先维护仓库库区档案</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
            {zones.map(z => <ZoneCard key={z.zone_code || z.id} zone={z} />)}
          </div>

          {/* 快捷入口 */}
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>快捷入口</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {QUICK.map(q => (
              /* ✅ 用 zoneCard CSS 类替代 inline border/bg/color + 移除 onMouseEnter/Leave */
              <Link key={q.path} href={q.path}
                className={`${s.zoneCardLow} ${q.cardCls}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '14px 8px', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
              >
                <q.Icon size={22} />
                {q.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 右：动态 + 月度汇总 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 今日出入库动态 */}
          <div className={s.card}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>今日出入库动态</h4>
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>加载中…</div>
            ) : activity.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>今日暂无出入库记录</div>
            ) : activity.map((a, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  {/* ✅ a.cls 替代 a.color 内联 */}
                  <span className={a.cls} style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: 'currentColor' }} />
                  <span className={a.cls} style={{ fontSize: 11, fontWeight: 700 }}>{a.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', marginLeft: 'auto' }}>{a.qty}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{a.date?.slice(5)} {a.time}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.desc}</p>
              </div>
            ))}
          </div>

          {/* 本月汇总 */}
          <div className={s.card}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>本月汇总</h4>
            {[
              { label: '总入库单数',   val: `${inbounds.length} 单`,  cls: s.textSuccess },
              { label: '总出库单数',   val: `${outbounds.length} 单`, cls: s.textDanger  },
              { label: '库区满载预警', val: `${zones.filter(z => z.status === 'WARNING').length} 区`, cls: s.textWarning },
              { label: '临期批次',     val: `${expiry.length} 批`,    cls: s.textDanger  },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.label}</span>
                <span className={item.cls} style={{ fontSize: 13, fontWeight: 700 }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
