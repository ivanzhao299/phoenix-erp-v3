"use client";

/**
 * 仓库看板 — g200e 全面重构(2026-06-20)
 * ============================================
 * 治理项(按 [feedback_open_new_drawer_audit] + [feedback_avoid_emoji_color_card]):
 * 1. KPI 4 卡:s.statCard 老类 → kpiCardCompact(tone) + MONO 数字 + 单位同行
 * 2. 库区状态 ZoneCard:老 css module → detailInfoBox + progress 进度条
 * 3. 快捷入口 QuickEntryCard → 全局 NavCard + description 副标
 * 4. 今日动态:s.card + text-overflow:ellipsis → actionGroupBox + recordRow(tone)
 * 5. 本月汇总:4 行裸文本 → 4 kpiCardCompact 'sm' 小卡
 * 6. 右侧固定 320px → minmax(320,1fr) 弹性,避免文本截断
 * 7. 文案统一:PageHeader + breadcrumb 都用"仓库看板"
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { NavCard } from "@/components/ui/NavCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  PackagePlus, PackageMinus, ListChecks, Search, ArrowDown, ArrowUp,
  Package, AlertTriangle, RefreshCw, MoveHorizontal, MapPin, BookOpen,
} from "lucide-react";
import {
  MONO_FONT, kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionGroupBox, detailInfoBox, recordRow, inlineAlert,
  secondaryActionButton, moneyCell,
  statTile, statTileLabel, statTileValue,
} from "@/components/design-system/cockpit-styles";

interface Zone {
  id: number;
  zone_code: string;
  zone_name: string;
  zone_type: string;
  temp_range: string;
  used_capacity: number;
  total_capacity: number;
  status: string;
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

// ── 库区卡片 — g200e 重写,克制白底 + 进度条用 var(--status-*)
function ZoneCard({ zone, warningLabel }: { zone: Zone; warningLabel: string }) {
  const pct = zone.total_capacity > 0 ? Math.round((zone.used_capacity / zone.total_capacity) * 100) : 0;
  const isWarn = zone.status === "WARNING" || pct >= 85;
  const barColor = pct >= 85 ? "var(--status-danger)" : pct >= 60 ? "var(--status-warning)" : "var(--status-success)";
  return (
    <div style={{ ...detailInfoBox, background: "var(--bg-card)", padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{zone.zone_name}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {zone.zone_type}
            {zone.temp_range ? ` · ${zone.temp_range}` : ""}
          </div>
        </div>
        {isWarn && <span style={{ ...inlineAlert("warning"), padding: "2px 8px", fontSize: 11 }}>{warningLabel}</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, fontFamily: MONO_FONT }}>
        <span>{Number(zone.used_capacity).toLocaleString()} / {Number(zone.total_capacity).toLocaleString()}</span>
        <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg-muted)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width .3s" }} />
      </div>
    </div>
  );
}

export default function WarehouseDashboard() {
  const { t } = useLanguage();
  const { hasPermission, loading: authLoading } = useAuth();
  const canViewWarehouse = hasPermission("MENU_WMS_VIEW", "V");
  const canViewInout = hasPermission("MENU_WMS_INOUT", "V");
  const [zones, setZones] = useState<Zone[]>([]);
  const [inbounds, setInbounds] = useState<InboundRow[]>([]);
  const [outbounds, setOutbounds] = useState<OutboundRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [expiry, setExpiry] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    if (!canViewWarehouse) {
      setZones([]);
      setInbounds([]);
      setOutbounds([]);
      setBatches([]);
      setExpiry([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [zRes, ibRes, obRes, btRes] = await Promise.all([
      canViewInout
        ? crudApi.list<Zone>("wms_zones", { limit: 100 }).catch(() => ({ data: [] as Zone[], code: 0 }))
        : Promise.resolve({ data: [] as Zone[], code: 0 }),
      canViewInout
        ? crudApi.list<InboundRow>("wms_inbound", { limit: 200 }).catch(() => ({ data: [] as InboundRow[], code: 0 }))
        : Promise.resolve({ data: [] as InboundRow[], code: 0 }),
      canViewInout
        ? crudApi.list<OutboundRow>("wms_outbound", { limit: 200 }).catch(() => ({ data: [] as OutboundRow[], code: 0 }))
        : Promise.resolve({ data: [] as OutboundRow[], code: 0 }),
      crudApi.list<BatchRow>("inv_batches", { limit: 500 }).catch(() => ({ data: [] as BatchRow[], code: 0 })),
    ]);
    setZones(canViewInout ? (zRes.data ?? []) : []);
    setInbounds(canViewInout ? (ibRes.data ?? []) : []);
    setOutbounds(canViewInout ? (obRes.data ?? []) : []);
    setBatches(btRes.data ?? []);
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    setExpiry((btRes.data ?? []).filter((b: BatchRow) => b.expire_date && b.expire_date <= in14 && b.expire_date >= today && b.qty_available > 0));
    setLoading(false);
  }, [authLoading, canViewInout, canViewWarehouse]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const today = new Date().toISOString().slice(0, 10);
  const todayIn = useMemo(() => inbounds.filter(r => (r.date || r.created_at?.slice(0, 10)) === today), [inbounds, today]);
  const todayOut = useMemo(() => outbounds.filter(r => (r.date || r.created_at?.slice(0, 10)) === today), [outbounds, today]);
  const totalInQty = todayIn.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalOutQty = todayOut.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalStock = batches.reduce((s, b) => s + (Number(b.qty_available) || 0), 0);

  const activity = useMemo(() => {
    const inLabel = t("ui.入库", "入库");
    const outLabel = t("ui.出库", "出库");
    const itemLabel = t("ui.品目", "品目");
    const zoneLabel = t("ui.仓区", "仓区");
    const destLabel = t("ui.去向", "去向");
    const ib = inbounds.slice(0, 20).map(r => ({
      type: "in" as const,
      label: inLabel,
      desc: `${r.item || itemLabel} → ${r.warehouse_code || zoneLabel}`,
      qty: r.qty,
      date: r.date || r.created_at?.slice(0, 10) || "",
      time: r.created_at?.slice(11, 16) || "--:--",
    }));
    const ob = outbounds.slice(0, 20).map(r => ({
      type: "out" as const,
      label: outLabel,
      desc: `${r.item || itemLabel} → ${r.dest || destLabel}`,
      qty: r.qty,
      date: r.date || r.created_at?.slice(0, 10) || "",
      time: r.time || r.created_at?.slice(11, 16) || "--:--",
    }));
    return [...ib, ...ob].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 8);
  }, [inbounds, outbounds, t]);

  // g200e KPI 4 卡:kpiCardCompact(tone) 统一
  const KPIs = [
    { label: t("ui.库存总量", "库存总量"), value: loading ? "…" : totalStock.toLocaleString(),                  unit: t("ui.单位", "单位"), tone: "info"    as const, Icon: Package },
    { label: t("ui.今日入库", "今日入库"), value: loading ? "…" : canViewInout ? (totalInQty || todayIn.length).toString() : "—",    unit: canViewInout ? (totalInQty ? t("ui.枚", "枚") : t("ui.单", "单")) : t("ui.受限", "受限"), tone: "success" as const, Icon: ArrowDown },
    { label: t("ui.今日出库", "今日出库"), value: loading ? "…" : canViewInout ? (totalOutQty || todayOut.length).toString() : "—",  unit: canViewInout ? (totalOutQty ? t("ui.枚", "枚") : t("ui.单", "单")) : t("ui.受限", "受限"), tone: "danger"  as const, Icon: ArrowUp },
    { label: t("ui.临期批次", "临期批次"), value: loading ? "…" : expiry.length.toString(),                    unit: t("ui.批", "批"),  tone: "warning" as const, Icon: AlertTriangle },
  ];

  // g200e 快捷入口:全局 NavCard + description 副标
  const QUICK = [
    { path: "/warehouse/inbound",   Icon: PackagePlus,    label: t("ui.入库管理", "入库管理"), desc: t("ui.入库单创建", "入库单录入、扫码收货、批次台账上链。"),       accent: "green"  as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/outbound",  Icon: PackageMinus,   label: t("ui.出库管理", "出库管理"), desc: t("ui.出库单创建", "出库单录入、FIFO 出库、含调拨与销售出库。"), accent: "red"    as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/transfer",  Icon: MoveHorizontal, label: t("ui.库存调拨", "库存调拨"), desc: t("ui.库存调拨", "库间调拨,事务安全,源/目仓批次一致。"),         accent: "blue"   as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/stocktake", Icon: ListChecks,     label: t("ui.盘点管理", "盘点管理"), desc: t("ui.盘点单", "盘点单生成、差异比对、盘盈/盘亏入账。"),         accent: "amber"  as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/query",     Icon: Search,         label: t("ui.库存查询", "库存查询"), desc: t("ui.库存查询", "按批次/库位/品目/到期日多维查询。"),          accent: "violet" as const, perm: "MENU_WMS_VIEW" },
    { path: "/warehouse/expiry",    Icon: AlertTriangle,  label: t("ui.临期预警", "临期预警"), desc: t("ui.临期预警", "14 天内临期批次提示与紧急处置入口。"),        accent: "amber"  as const, perm: "MENU_WMS_VIEW" },
    { path: "/warehouse/locations", Icon: MapPin,         label: t("ui.库位管理", "库位管理"), desc: t("ui.库位管理", "库位档案、容量、温区,与库区联动。"),          accent: "blue"   as const, perm: "MENU_WMS_MASTER" },
    { path: "/warehouse/ledger",    Icon: BookOpen,       label: t("ui.库存台账", "库存台账"), desc: t("ui.库存台账", "inv_batches 唯一台账,所有动作全可追溯。"),     accent: "cyan"   as const, perm: "MENU_WMS_VIEW" },
  ];
  const warningLabel = t("ui.容量预警", "容量预警");

  const monthlyStats = [
    { label: t("ui.总入库单数", "总入库单数"),       value: canViewInout ? inbounds.length : "—",  tone: "success" as const },
    { label: t("ui.总出库单数", "总出库单数"),       value: canViewInout ? outbounds.length : "—", tone: "danger"  as const },
    { label: t("ui.库区满载预警", "库区满载预警"),   value: canViewInout ? zones.filter(z => z.status === "WARNING").length : "—", tone: "warning" as const },
    { label: t("ui.临期批次", "临期批次"),           value: expiry.length,    tone: "warning" as const },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.仓库看板", "仓库看板")}
        subtitle={`${t("ui.全仓储实时监控", "全仓储实时监控")} · ${zones.length} ${t("ui.个库区", "个库区")} · ${t("ui.实时库存数据", "实时库存数据")}`}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.仓库看板", "仓库看板")]}
        actions={
          <button type="button" style={{ ...secondaryActionButton, opacity: loading ? 0.5 : 1 }} onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* g200e KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        {KPIs.map(k => {
          const Icon = k.Icon;
          return (
            <div key={k.label} style={kpiCardCompact(k.tone)}>
              <div style={kpiCardCompactLabel}>
                <Icon size={13} /> {k.label}
              </div>
              <div style={{ ...kpiCardCompactValue(k.tone), display: "flex", alignItems: "baseline", gap: 4 }}>
                {k.value}
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 400 }}>{k.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 主内容区:库区 + 侧边栏 — 弹性 minmax 避免文本截断 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,2fr) minmax(320px,1fr)",
        gap: 20,
        alignItems: "start",
      }}>
        {/* 左:库区状态 + 快捷入口 */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
            {t("ui.库区状态", "库区状态")}
            {loading && <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 400, marginLeft: 8 }}>{t("common.loading", "加载中…")}</span>}
          </h3>
          {!loading && !canViewInout && (
            <div style={{ ...inlineAlert("info"), marginBottom: 24 }}>
              {t("ui.当前账号仅可查看库存总览出入库作业与库区容量已按权限隐藏", "当前账号仅可查看库存总览，出入库作业与库区容量已按权限隐藏。")}
            </div>
          )}
          {!loading && canViewInout && zones.length === 0 && (
            <div style={{ ...inlineAlert("warning"), marginBottom: 24 }}>
              {t("ui.暂无库区数据请先维护仓库库区档案", "暂无库区数据，请先维护仓库库区档案")}
            </div>
          )}
          {zones.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
              gap: 12,
              marginBottom: 24,
            }}>
              {zones.map(z => <ZoneCard key={z.zone_code || z.id} zone={z} warningLabel={warningLabel} />)}
            </div>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
            {t("ui.快捷入口", "快捷入口")}
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 12,
          }}>
            {QUICK.filter(q => hasPermission(q.perm, "V")).map(q => (
              <NavCard key={q.path} icon={q.Icon} title={q.label} description={q.desc} href={q.path} accent={q.accent} />
            ))}
          </div>
        </div>

        {/* 右:今日动态 + 本月汇总 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 今日出入库动态 — actionGroupBox 容器 + recordRow(tone) 行 */}
          <div style={{ ...actionGroupBox, background: "var(--bg-card)", padding: 14 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text-primary)" }}>
              {t("ui.今日出入库动态", "今日出入库动态")}
            </h4>
            {loading ? (
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
                {t("common.loading", "加载中…")}
              </div>
            ) : !canViewInout ? (
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
                {t("ui.需要出入库查看权限", "需要出入库查看权限")}
              </div>
            ) : activity.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
                {t("ui.今日暂无出入库记录", "今日暂无出入库记录")}
              </div>
            ) : (
              activity.map((a, i) => (
                <div key={i} style={recordRow(a.type === "in" ? "success" : "danger")}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: a.type === "in" ? "var(--status-success)" : "var(--status-danger)" }}>{a.label}</span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{a.date?.slice(5)} {a.time}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", wordBreak: "break-word" }}>{a.desc}</div>
                  </div>
                  <div style={moneyCell(a.type === "in" ? "success" : "danger", "md")}>{a.qty}</div>
                </div>
              ))
            )}
          </div>

          {/* 本月汇总 — g200e 改造(2026-06-20):去除 kpiCardCompact 重复,改紧凑 label-value 列表
              避免与顶部 KPI 同款,降低满屏卡片感。按 [feedback_one_kpi_style_per_page]。*/}
          <div style={{ ...actionGroupBox, background: "var(--bg-card)", padding: 14 }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {t("ui.本月汇总", "本月汇总")}
            </h4>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {monthlyStats.map((item, i) => {
                const toneColor =
                  item.tone === "success" ? "var(--status-success)" :
                  item.tone === "danger"  ? "var(--status-danger)"  :
                  item.tone === "warning" ? "var(--status-warning)" : "var(--text-primary)";
                return (
                  <div
                    key={item.label}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 0",
                      borderTop: i > 0 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO_FONT, color: toneColor }}>{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
