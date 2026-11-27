"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import request from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { NavCard } from "@/components/ui/NavCard";
import { useAuth } from "@/contexts/AuthContext";
import { getWarehouseDashboardAccess } from "@/lib/warehouse-dashboard-access";
import styles from "./warehouse.module.css";
import {
  PackagePlus, PackageMinus, ListChecks, Search, ArrowDown, ArrowUp,
  Package, AlertTriangle, RefreshCw, MoveHorizontal, MapPin, BookOpen,
} from "lucide-react";
import {
  MONO_FONT, kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionGroupBox, recordRow, inlineAlert,
  secondaryActionButton,
} from "@/components/design-system/cockpit-styles";

type DashboardDocuments = {
  today_in: number; today_out: number; month_in: number; month_out: number;
  activity: Array<{ kind: 'in' | 'out'; number: string; warehouse_code: string; day: string; updated_at: string }>;
};
type DashboardStock = {
  available_count: number; expiring_count: number;
  units: Array<{ unit: string | null; count: number; available: string }>;
};

export default function WarehouseDashboard() {
  const { t } = useLanguage();
  const { hasPermission, loading: authLoading } = useAuth();
  const {
    canViewInout,
    canLoadBatches,
  } = useMemo(() => getWarehouseDashboardAccess(hasPermission), [hasPermission]);
  const [documents, setDocuments] = useState<DashboardDocuments | null>(null);
  const [stock, setStock] = useState<DashboardStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setLoadError(null);
    const outcomes = await Promise.allSettled([
      canViewInout ? request<{ data: DashboardDocuments }>('/inventory/dashboard/documents', { silent: true }) : null,
      canLoadBatches ? request<{ data: DashboardStock }>('/inventory/batches/query', { silent: true }) : null,
    ]);
    const [documentResult, stockResult] = outcomes;
    setDocuments(documentResult.status === 'fulfilled' ? documentResult.value?.data ?? null : null);
    setStock(stockResult.status === 'fulfilled' ? stockResult.value?.data ?? null : null);
    if (outcomes.some(outcome => outcome.status === 'rejected')) {
      setLoadError(t('ui.部分仓储看板数据加载失败请刷新或联系管理员', '部分仓储看板数据加载失败，请刷新或联系管理员。'));
    }
    setLoading(false);
  }, [authLoading, canLoadBatches, canViewInout, t]);
  useEffect(() => { void loadAll(); }, [loadAll]);

  const stockByUnit = (stock?.units ?? []).map(group => ({
    unit: group.unit ?? t('ui.单位待核', '单位待核'), quantity: Number(group.available), batchCount: group.count,
  }));
  const activity = (documents?.activity ?? []).map(row => ({
    type: row.kind, date: row.day, time: row.updated_at?.slice(11,16) ?? '',
    desc: row.number + ' · ' + row.warehouse_code,
    label: row.kind === 'in' ? t('ui.入库', '入库') : t('ui.出库', '出库'),
  }));

  // g200e KPI 4 卡:kpiCardCompact(tone) 统一
  const KPIs = [
    { label: t("ui.可用库存批次", "可用库存批次"), value: loading ? "…" : stock?.available_count.toLocaleString() ?? "—", unit: t("ui.批", "批"), tone: "info" as const, Icon: Package },
    { label: t("ui.今日入库单", "今日入库单"), value: loading ? "…" : documents?.today_in.toString() ?? "—", unit: canViewInout ? t("ui.单", "单") : t("ui.受限", "受限"), tone: "success" as const, Icon: ArrowDown },
    { label: t("ui.今日出库单", "今日出库单"), value: loading ? "…" : documents?.today_out.toString() ?? "—", unit: canViewInout ? t("ui.单", "单") : t("ui.受限", "受限"), tone: "danger" as const, Icon: ArrowUp },
    { label: t("ui.临期批次", "临期批次"), value: loading ? "…" : stock?.expiring_count.toString() ?? "—",                    unit: t("ui.批", "批"),  tone: "warning" as const, Icon: AlertTriangle },
  ];

  // g200e 快捷入口:全局 NavCard + description 副标
  const QUICK = [
    { path: "/warehouse/inbound",   Icon: PackagePlus,    label: t("ui.入库管理", "入库管理"), desc: t("ui.入库单创建", "入库单录入、扫码收货、批次台账上链。"),       accent: "green"  as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/outbound",  Icon: PackageMinus,   label: t("ui.出库管理", "出库管理"), desc: t("ui.出库单创建", "出库单录入、FIFO 出库、含调拨与销售出库。"), accent: "red"    as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/issues",    Icon: PackageMinus,   label: t("ui.生产与内部领用", "生产与内部领用"), desc: t("ui.生产与内部领用说明", "饲料、兽药、包材、配件、后勤和维修领用，按用途与领用对象归集。"), accent: "amber" as const, perm: "MENU_WMS_ISSUE" },
    { path: "/warehouse/transfer",  Icon: MoveHorizontal, label: t("ui.库存调拨", "库存调拨"), desc: t("ui.库存调拨", "库间调拨,事务安全,源/目仓批次一致。"),         accent: "blue"   as const, perm: "MENU_INV_BATCH" },
    { path: "/warehouse/stocktake", Icon: ListChecks,     label: t("ui.盘点管理", "盘点管理"), desc: t("ui.盘点单", "盘点单生成、差异比对、盘盈/盘亏入账。"),         accent: "amber"  as const, perm: "MENU_WMS_INOUT" },
    { path: "/warehouse/query",     Icon: Search,         label: t("ui.库存查询", "库存查询"), desc: t("ui.库存查询", "按批次/库位/品目/到期日多维查询。"),          accent: "violet" as const, perm: "MENU_WMS_VIEW" },
    { path: "/warehouse/expiry",    Icon: AlertTriangle,  label: t("ui.临期预警", "临期预警"), desc: t("ui.临期预警", "14 天内临期批次提示与紧急处置入口。"),        accent: "amber"  as const, perm: "MENU_WMS_VIEW" },
    { path: "/warehouse/locations", Icon: MapPin,         label: t("ui.库位管理", "库位管理"), desc: t("ui.库位管理", "库位档案、容量、温区,与库区联动。"),          accent: "blue"   as const, perm: "MENU_WMS_MASTER" },
    { path: "/warehouse/ledger",    Icon: BookOpen,       label: t("ui.库存台账", "库存台账"), desc: t("ui.库存台账", "inv_batches 唯一台账,所有动作全可追溯。"),     accent: "cyan"   as const, perm: "MENU_WMS_VIEW" },
  ];

  const monthlyStats = [
    { label: t("ui.总入库单数", "总入库单数"),       value: documents?.month_in ?? "—",  tone: "success" as const },
    { label: t("ui.总出库单数", "总出库单数"),       value: documents?.month_out ?? "—", tone: "danger"  as const },
    { label: t("ui.临期批次", "临期批次"),           value: stock?.expiring_count ?? "—",    tone: "warning" as const },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("ui.仓库看板", "仓库看板")}
        subtitle={t("ui.实时库存数据", "实时库存数据")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.仓库看板", "仓库看板")]}
        actions={
          <button type="button" style={{ ...secondaryActionButton, opacity: loading ? 0.5 : 1 }} onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {t("common.refresh", "刷新")}
          </button>
        }
      />
      {loadError && (
        <div style={{ ...inlineAlert("warning"), marginBottom: 16 }}>
          {loadError}
        </div>
      )}

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

      {!loading && stockByUnit.length > 0 && (
        <div style={{ ...actionGroupBox, marginBottom: 20, padding: "12px 14px", background: "var(--bg-card)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 }}>
            {t("ui.库存按计量单位汇总", "库存按计量单位汇总")}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {stockByUnit.map((group) => (
              <div key={group.unit} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontFamily: MONO_FONT, fontSize: 18, color: "var(--text-primary)" }}>
                  {group.quantity.toLocaleString()}
                </strong>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                  {group.unit} · {group.batchCount} {t("ui.批", "批")}
                </span>
              </div>
            ))}
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 8 }}>
            {t("ui.不同计量单位不合并相加", "不同计量单位不合并相加，避免把枚、kg、件等形成无业务意义的总数。")}
          </div>
        </div>
      )}

      {/* 主内容区:库区 + 侧边栏 — 弹性 minmax 避免文本截断 */}
      <div className={styles.dashboardGrid}>
        <div>
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
        <div className={styles.dashboardAside}>
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
