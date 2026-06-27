"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Package, AlertTriangle, TrendingUp, RefreshCw,
  PackageOpen, Archive, ClipboardList, RefreshCcw,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { crudApi } from "@/lib/api-client";
import {
  secondaryActionButton, actionPill,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// B1 + 子修：pos_sales 真实列 net_amount；store_receiving PK 是 order_no（无 id）；
//             inv_batches 没有 qty_available（用 qty 替代）
interface PosSale {
  id: number;
  created_at?: string;
  total_amount?: number;
  net_amount?: number;
}
interface StoreRecv {
  order_no: string;
  wave_no?: string;
  status?: string;
  created_at?: string;
  store_code?: string;
  operator?: string;
}
interface InvBatch {
  id: number;
  qty?: number;
  expire_date?: string;
}
export default function StorePage() {
  const router = useRouter();
  const {
    t
  } = useLanguage();
  const [sales, setSales] = useState<PosSale[]>([]);
  const [receiving, setReceiving] = useState<StoreRecv[]>([]);
  const [batches, setBatches] = useState<InvBatch[]>([]);
  const [loading, setLoading] = useState(true);
  /* g200k(2026-06-20):emoji 📦🗃️📋🔄⚠️ → lucide 图标(PackageOpen/Archive/
     ClipboardList/RefreshCcw/AlertTriangle),按 [feedback_avoid_emoji_color_card]
     消灭 emoji-color anti-pattern */
  const QUICK: { path: string; Icon: typeof Package; label: string; desc: string; tone: Tone }[] = [
    { path: "/store/receiving", Icon: PackageOpen,    label: t("ui.门店收货", "门店收货"),   desc: t("ui.核收来自仓库的补货", "核收来自仓库的补货"),     tone: "info"    },
    { path: "/store/inventory", Icon: Archive,        label: t("ui.门店库存", "门店库存"),   desc: t("ui.本店当前库存状态",   "本店当前库存状态"),       tone: "success" },
    { path: "/store/daily",     Icon: ClipboardList,  label: t("ui.日结作业", "日结作业"),   desc: t("ui.当日营业汇总结账",   "当日营业汇总结账"),       tone: "warning" },
    { path: "/store/replenish", Icon: RefreshCcw,     label: t("ui.补货申请", "补货申请"),   desc: t("ui.向仓库发起补货请求", "向仓库发起补货请求"),     tone: "brand"   },
    { path: "/store/losses",    Icon: AlertTriangle,  label: t("ui.损耗上报", "损耗上报"),   desc: t("ui.破损临期损耗记录",   "破损·临期损耗记录"),       tone: "danger"  },
  ];
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([crudApi.list<PosSale>("pos_sales", {
      limit: 200
    }), crudApi.list<StoreRecv>("store_receiving", {
      limit: 100
    }), crudApi.list<InvBatch>("inv_batches", {
      limit: 300
    })]).then(([s, r, b]) => {
      setSales(s.data || []);
      setReceiving(r.data || []);
      setBatches(b.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const todaySales = useMemo(() => sales.filter(s => (s.created_at || "").slice(0, 10) === today), [sales, today]);
  // B1: 优先 net_amount (实收) 兜底 total_amount；旧 amount 字段 DB 不存在
  const todayRevenue = useMemo(() => todaySales.reduce((sum, s) => sum + (Number(s.net_amount) || Number(s.total_amount) || 0), 0), [todaySales]);
  const pendingRecv = useMemo(() => receiving.filter(r => r.status === "PENDING").length, [receiving]);
  const lowStock = useMemo(() => batches.filter(b => Number(b.qty || 0) < 50).length, [batches]);
  const nearExpiry = useMemo(() => batches.filter(b => b.expire_date && b.expire_date <= in7 && b.expire_date >= today).length, [batches, in7, today]);
  const kpis: { label: string; value: string; unit?: string; tone: Tone; Icon: typeof TrendingUp }[] = [
    { label: t("ui.今日销售额", "今日销售额"), value: loading ? "…" : `¥${todayRevenue.toLocaleString()}`, tone: "success", Icon: TrendingUp   },
    { label: t("ui.今日单数",   "今日单数"),   value: loading ? "…" : String(todaySales.length),         unit: t("ui.单", "单"), tone: "info",    Icon: ShoppingCart },
    { label: t("ui.待收货",     "待收货"),     value: loading ? "…" : String(pendingRecv),               unit: t("ui.批", "批"), tone: "warning", Icon: Package      },
    { label: t("ui.近效期库存", "近效期库存"), value: loading ? "…" : String(nearExpiry),                unit: t("ui.批", "批"), tone: "danger",  Icon: AlertTriangle },
  ];
  const recentRecv = useMemo(() => [...receiving].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 5), [receiving]);
  return <div className="animate-fade-in">
      <PageHeader
        title={t("ui.门店工作台", "门店工作台")}
        subtitle={t("ui.收货库存日结补货损耗", "收货·库存·日结·补货·损耗")}
        breadcrumb={[t("ui.门店管理", "门店管理")]}
        actions={
          <button type="button" onClick={load} disabled={loading} style={{ ...secondaryActionButton, opacity: loading ? 0.5 : 1 }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> {t("common.refresh", "刷新")}
          </button>
        }
      />

      {/* g200k KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 24 }}>
        {kpis.map(k => {
          const Icon = k.Icon;
          return (
            <div key={k.label} style={kpiCardCompact(k.tone)}>
              <div style={kpiCardCompactLabel}><Icon size={13} /> {k.label}</div>
              <div style={{ ...kpiCardCompactValue(k.tone), display: "flex", alignItems: "baseline", gap: 4 }}>
                {k.value}
                {k.unit && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>{k.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 280px",
      gap: 20
    }}>
        {/* 功能入口 */}
        <div>
          <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: "var(--color-primary)"
        }}>{t("ui.门店功能入口", "门店功能入口")}</h3>
          <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10
        }}>
            {QUICK.map(q => {
              const Icon = q.Icon;
              const toneVar =
                q.tone === "info"    ? "var(--status-info)"    :
                q.tone === "success" ? "var(--status-success)" :
                q.tone === "warning" ? "var(--status-warning)" :
                q.tone === "danger"  ? "var(--status-danger)"  : "var(--color-primary)";
              return (
                <button
                  key={q.path}
                  type="button"
                  onClick={() => router.push(q.path)}
                  style={{
                    background: "var(--bg-card)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    borderTop: `3px solid ${toneVar}`,
                    padding: 14,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ marginBottom: 6, color: toneVar }}>
                    <Icon size={20} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{q.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{q.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 近期收货动态 */}
        <div>
          <h3 style={{
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          color: "var(--color-primary)"
        }}>{t("ui.近期收货动态", "近期收货动态")}</h3>
          <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden"
        }}>
            {recentRecv.length === 0 && !loading && <div className={s.emptyState}>{t("ui.暂无收货记录", "暂无收货记录")}</div>}
            {recentRecv.map((r, i) => {
            const isPending = r.status === "PENDING";
            return <div key={r.order_no} style={{
              padding: "10px 14px",
              borderBottom: i < recentRecv.length - 1 ? "1px solid var(--border)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
                  <Package size={14} color="var(--text-secondary)" />
                  <div className={u.flex1}>
                    <div style={{
                  fontSize: 12,
                  fontWeight: 700
                }}>{t("ui.收货单", "收货单")} {r.order_no}</div>
                    <div style={{
                  fontSize: 11,
                  color: "var(--text-secondary)"
                }}>{(r.created_at || "—").slice(0, 10)} · {r.wave_no || r.store_code || "—"}</div>
                  </div>
                  <span style={actionPill(isPending ? "warning" : "success")}>
                    {isPending ? t("status.pending", "待确认") : t("status.done", "已完成")}
                  </span>
                </div>;
          })}
          </div>
        </div>
      </div>
    </div>;
}