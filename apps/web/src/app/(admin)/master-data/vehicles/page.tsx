"use client";
import { useState, useEffect, useCallback } from "react";
import { Car, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — 车辆档案
 * 数据来源：Sales V2 Delivery Runtime → GET /api/v2/sales/delivery/vehicles
 * 完整管理入口：/sales2/delivery
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:     { label: "正常",   color: "#10b981" },
  INACTIVE:   { label: "停用",   color: "#64748b" },
  REPAIR:     { label: "维修",   color: "#f59e0b" },
  RETIRED:    { label: "报废",   color: "#ef4444" },
};

interface Vehicle {
  id: string | number;
  plateNo?: string;
  vehicleType?: string;
  brand?: string;
  capacity?: number;
  loadCapacity?: number;
  status?: string;
  driverName?: string;
  companyCode?: string;
}

export default function MdVehiclesPage() {
  const { canView } = usePermission("MENU_SALES2_DELIVERY");
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/sales/delivery/vehicles", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.data ?? data.items ?? data.vehicles ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-slate-500 dark:text-slate-400" style={{ padding: 40, textAlign: "center" }}>无权限查看车辆档案</div>
  );

  const filtered = items.filter(v =>
    !search || (v.plateNo ?? "").toLowerCase().includes(search.toLowerCase()) || (v.vehicleType ?? "").includes(search)
  );

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="车辆档案"
        subtitle="配送管理 · 车辆主档"
        breadcrumb={["主数据中心", "车辆档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索车牌 / 车型..."
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={load} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/sales2/delivery" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#f97316", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 配送管理
        </Link>
      </div>

      <div className="text-slate-500 dark:text-slate-400" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{filtered.length}</span> 辆车辆
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>{error}</div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" style={{ borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400" style={{ fontSize: 12 }}>
                {["车牌号", "车型", "品牌", "载重(吨)", "常用司机", "状态"].map(h => (
                  <th key={h} className="border-b border-slate-200 dark:border-slate-700" style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              ) : filtered.map((v, i) => {
                const st = STATUS_MAP[v.status ?? "ACTIVE"] ?? { label: v.status ?? "-", color: "#64748b" };
                return (
                  <tr key={v.id ?? i} className="border-b border-slate-100 dark:border-slate-800"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-slate-800 dark:text-slate-200" style={{ padding: "10px 14px", fontWeight: 600, fontFamily: "monospace" }}>{v.plateNo ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{v.vehicleType ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{v.brand ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{v.loadCapacity ?? v.capacity ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{v.driverName ?? "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${st.color}22`, color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
