"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
import { QuickEntryCard } from "@/components/ui/QuickEntryCard";
import type { AccentColor } from "@/lib/design-tokens";
import { PackagePlus, PackageMinus, ListChecks, Search, ArrowDown, ArrowUp, Package, AlertTriangle, RefreshCw, MoveHorizontal, MapPin } from "lucide-react";
import u from "@/styles/uix-utils.module.css";
interface Zone {
  id: number;
  zone_code: string;
  zone_name: string;
  zone_type: string;
  temp_range: string;
  used_capacity: number;
  total_capacity: number;
  status: string;
  item_count?: number;
}
interface InboundRow {
  id: number;
  inbound_no: string;
  item: string;
  qty: number;
  warehouse_code: string;
  date: string;
  created_at: string;
}
interface OutboundRow {
  id: number;
  outbound_no: string;
  item: string;
  qty: number;
  dest: string;
  date: string;
  time?: string;
  created_at: string;
}
interface BatchRow {
  id: number;
  batch_no: string;
  expire_date: string;
  qty_available: number;
}

// 库区进度条卡片 — 纯 CSS 类，无 inline 颜色
function ZoneCard({
  zone,
  warningLabel
}: {
  zone: Zone;
  warningLabel: string;
}) {
  const pct = zone.total_capacity > 0 ? Math.round(zone.used_capacity / zone.total_capacity * 100) : 0;
  const isWarn = zone.status === 'WARNING' || pct >= 85;
  const cardBorderCls = isWarn ? s.statCardWarning : s.statCardPrimary;
  const barCls = pct >= 85 ? s.progressBarDanger : pct >= 60 ? s.progressBarWarning : s.progressBarSuccess;
  const pctCls = pct >= 85 ? s.textDanger : pct >= 60 ? s.textWarning : s.textInfo;
  return <div className={`${s.card} ${cardBorderCls}`} style={{
    padding: '16px'
  }}>
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8
    }}>
        <div>
          <div style={{
          fontWeight: 700,
          fontSize: 14
        }}>{zone.zone_name}</div>
          <div style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 2
        }}>
            {zone.zone_type}{zone.temp_range ? ` · ${zone.temp_range}` : ''}
          </div>
        </div>
        {isWarn && <span className={`${s.badge} ${s.badgeWarning}`}>{warningLabel}</span>}
      </div>
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 12,
      color: 'var(--text-secondary)',
      marginBottom: 6
    }}>
        <span>{Number(zone.used_capacity).toLocaleString()} / {Number(zone.total_capacity).toLocaleString()}</span>
        <span className={`${pctCls} ${u.fw700}`}>{pct}%</span>
      </div>
      <div className={s.progressWrap} style={{
      height: 8
    }}>
        <div className={`${s.progressBar} ${barCls}`} style={{
        width: `${pct}%`
      }} />
      </div>
    </div>;
}
export default function WarehouseDashboard() {
  const {
    t
  } = useLanguage();
  const [zones, setZones] = useState<Zone[]>([]);
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [outbounds, setOutbounds] = useState<OutboundRow[]>([]);
  const [expiry, setExpiry] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [zRes, ibRes, obRes, btRes] = await Promise.all([crudApi.list<Zone>("wms_zones", {
      limit: 100
    }).catch(() => ({
      data: [] as Zone[],
      code: 0
    })), crudApi.list<InboundRow>("wms_inbound", {
      limit: 200
    }).catch(() => ({
      data: [] as InboundRow[],
      code: 0
    })), crudApi.list<OutboundRow>("wms_outbound", {
      limit: 200
    }).catch(() => ({
      data: [] as OutboundRow[],
      code: 0
    })), crudApi.list<BatchRow>("inv_batches", {
      limit: 500
    }).catch(() => ({
      data: [] as BatchRow[],
      code: 0
    }))]);
    setZones(zRes.data ?? []);
    setInbounds(ibRes.data ?? []);
    setOutbounds(obRes.data ?? []);

    // 14 天内临期批次
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    setExpiry((btRes.data ?? []).filter((b: BatchRow) => b.expire_date && b.expire_date <= in14 && b.expire_date >= today && b.qty_available > 0));
    setLoading(false);
  }, []);
  useEffect(() => {
    loadAll();
  }, [loadAll]);
  const today = new Date().toISOString().slice(0, 10);
  const todayIn = useMemo(() => inbounds.filter(r => (r.date || r.created_at?.slice(0, 10)) === today), [inbounds, today]);
  const todayOut = useMemo(() => outbounds.filter(r => (r.date || r.created_at?.slice(0, 10)) === today), [outbounds, today]);
  const totalInQty = todayIn.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalOutQty = todayOut.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalStock = zones.reduce((s, z) => s + (Number(z.used_capacity) || 0), 0);

  // 最近出入库动态 — 用 CSS 类名替代 hex/var 颜色
  const activity = useMemo(() => {
    const inLabel = t("ui.入库", "入库");
    const outLabel = t("ui.出库", "出库");
    const itemLabel = t("ui.品目", "品目");
    const zoneLabel = t("ui.仓区", "仓区");
    const destLabel = t("ui.去向", "去向");
    const ib = inbounds.slice(0, 20).map(r => ({
      type: 'in',
      label: inLabel,
      cls: s.textSuccess,
      desc: `${r.item || itemLabel} → ${r.warehouse_code || zoneLabel}`,
      qty: r.qty,
      date: r.date || r.created_at?.slice(0, 10) || '',
      time: r.created_at?.slice(11, 16) || '--:--'
    }));
    const ob = outbounds.slice(0, 20).map(r => ({
      type: 'out',
      label: outLabel,
      cls: s.textDanger,
      desc: `${r.item || itemLabel} → ${r.dest || destLabel}`,
      qty: r.qty,
      date: r.date || r.created_at?.slice(0, 10) || '',
      time: r.time || r.created_at?.slice(11, 16) || '--:--'
    }));
    return [...ib, ...ob].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 8);
  }, [inbounds, outbounds, t]);
  const KPIs = [{
    label: t("ui.库存总量", "库存总量"),
    value: loading ? '…' : totalStock.toLocaleString(),
    unit: t("ui.单位", "单位"),
    cardCls: s.statCardPrimary,
    valCls: "",
    icon: <Package size={20} />
  }, {
    label: t("ui.今日入库", "今日入库"),
    value: loading ? '…' : (totalInQty || todayIn.length).toString(),
    unit: totalInQty ? t("ui.枚", "枚") : t("ui.单", "单"),
    cardCls: s.statCardSuccess,
    valCls: s.textSuccess,
    icon: <ArrowDown size={20} />
  }, {
    label: t("ui.今日出库", "今日出库"),
    value: loading ? '…' : (totalOutQty || todayOut.length).toString(),
    unit: totalOutQty ? t("ui.枚", "枚") : t("ui.单", "单"),
    cardCls: s.statCardDanger,
    valCls: s.textDanger,
    icon: <ArrowUp size={20} />
  }, {
    label: t("ui.临期批次", "临期批次"),
    value: loading ? '…' : expiry.length.toString(),
    unit: t("ui.批次", "批次"),
    cardCls: s.statCardWarning,
    valCls: s.textWarning,
    icon: <AlertTriangle size={20} />
  }];
  const QUICK = [{
    path: '/warehouse/inbound',
    Icon: PackagePlus,
    label: t("ui.入库管理", "入库管理"),
    accent: 'green'
  }, {
    path: '/warehouse/outbound',
    Icon: PackageMinus,
    label: t("ui.出库管理", "出库管理"),
    accent: 'red'
  }, {
    path: '/warehouse/transfer',
    Icon: MoveHorizontal,
    label: t("ui.库存调拨", "库存调拨"),
    accent: 'blue'
  }, {
    path: '/warehouse/stocktake',
    Icon: ListChecks,
    label: t("ui.盘点管理", "盘点管理"),
    accent: 'amber'
  }, {
    path: '/warehouse/query',
    Icon: Search,
    label: t("ui.库存查询", "库存查询"),
    accent: 'violet'
  }, {
    path: '/warehouse/expiry',
    Icon: AlertTriangle,
    label: t("ui.临期预警", "临期预警"),
    accent: 'amber'
  }, {
    path: '/warehouse/locations',
    Icon: MapPin,
    label: t("ui.库位管理", "库位管理"),
    accent: 'blue'
  }, {
    path: '/warehouse/ledger',
    Icon: Package,
    label: t("ui.库存台账", "库存台账"),
    accent: 'cyan'
  }];
  const warningLabel = t("ui.容量预警", "容量预警");
  return <div className="animate-fade-in">
      <PageHeader title={t("ui.仓库看板", "仓库看板")} subtitle={`${t("ui.全仓储实时监控", "全仓储实时监控")} · ${zones.length} ${t("ui.个库区", "个库区")} · ${t("ui.实时库存数据", "实时库存数据")}`} breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.仓库看板", "仓库看板")]} actions={<button type="button" className={s.btnSecondary} onClick={loadAll} disabled={loading}>
            <RefreshCw size={14} style={{
        animation: loading ? 'spin 1s linear infinite' : 'none'
      }} />
            {t("common.refresh", "刷新")}
          </button>} />

      {/* KPI 卡片 */}
      <div className={`${s.statsRow} ${u.mb20}`}>
        {KPIs.map(k => <div key={k.label} className={`${s.statCard} ${k.cardCls}`}>
            <div className={`${s.statValue} ${k.valCls}`}>{k.value}</div>
            <div className={s.statLabel}>{k.label}</div>
            <div className={s.statSub}>{k.unit}</div>
          </div>)}
      </div>

      {/* 主内容区：库区 + 侧边栏 */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: 20,
      alignItems: 'start'
    }}>

        {/* 左：库区状态 */}
        <div>
          <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--text-primary)'
        }}>
            {t("ui.库区状态", "库区状态")}
            {loading && <span style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontWeight: 400,
            marginLeft: 8
          }}>{t("common.loading", "加载中…")}</span>}
          </h3>
          {!loading && zones.length === 0 && <div className={s.emptyState}>{t("ui.暂无库区数据请先维护仓库库区档案", "暂无库区数据，请先维护仓库库区档案")}</div>}
          <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 24
        }}>
            {zones.map(z => <ZoneCard key={z.zone_code || z.id} zone={z} warningLabel={warningLabel} />)}
          </div>

          {/* 快捷入口 */}
          <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--text-primary)'
        }}>{t("ui.快捷入口", "快捷入口")}</h3>
          <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12
        }}>
            {QUICK.map(q => <QuickEntryCard key={q.path} icon={q.Icon} label={q.label} href={q.path} accent={q.accent as AccentColor} />)}
          </div>
        </div>

        {/* 右：动态 + 月度汇总 */}
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
          {/* 今日出入库动态 */}
          <div className={s.card}>
            <h4 style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 12
          }}>{t("ui.今日出入库动态", "今日出入库动态")}</h4>
            {loading ? <div style={{
            padding: '20px 0',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>{t("common.loading", "加载中…")}</div> : activity.length === 0 ? <div style={{
            padding: '20px 0',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>{t("ui.今日暂无出入库记录", "今日暂无出入库记录")}</div> : activity.map((a, i) => <div key={i} style={{
            padding: '10px 0',
            borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none'
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 3
            }}>
                  <span className={a.cls} style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'inline-block',
                background: 'currentColor'
              }} />
                  <span className={a.cls} style={{
                fontSize: 11,
                fontWeight: 700
              }}>{a.label}</span>
                  <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--color-primary)',
                marginLeft: 'auto'
              }}>{a.qty}</span>
                  <span style={{
                fontSize: 11,
                color: 'var(--text-secondary)'
              }}>{a.date?.slice(5)} {a.time}</span>
                </div>
                <p style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              paddingLeft: 14,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>{a.desc}</p>
              </div>)}
          </div>

          {/* 本月汇总 */}
          <div className={s.card}>
            <h4 style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 10
          }}>{t("ui.本月汇总", "本月汇总")}</h4>
            {[{
            label: t("ui.总入库单数", "总入库单数"),
            val: `${inbounds.length} ${t("ui.单", "单")}`,
            cls: s.textSuccess
          }, {
            label: t("ui.总出库单数", "总出库单数"),
            val: `${outbounds.length} ${t("ui.单", "单")}`,
            cls: s.textDanger
          }, {
            label: t("ui.库区满载预警", "库区满载预警"),
            val: `${zones.filter(z => z.status === 'WARNING').length} ${t("ui.区", "区")}`,
            cls: s.textWarning
          }, {
            label: t("ui.临期批次", "临期批次"),
            val: `${expiry.length} ${t("ui.批", "批")}`,
            cls: s.textDanger
          }].map(item => <div key={item.label} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}>
                <span className={u.muted12}>{item.label}</span>
                <span className={item.cls} style={{
              fontSize: 13,
              fontWeight: 700
            }}>{item.val}</span>
              </div>)}
          </div>
        </div>
      </div>
    </div>;
}