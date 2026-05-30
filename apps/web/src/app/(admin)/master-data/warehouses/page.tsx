"use client";
import { useState, useEffect, useCallback } from "react";
import { Warehouse, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — 仓库档案
 * 数据来源：WMS Inventory Runtime → GET /api/crud/wms_warehouses
 * 完整管理入口：/warehouse/warehouses
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "启用", color: "#10b981" },
  INACTIVE: { label: "停用", color: "#64748b" },
};

interface Warehouse_ {
  id?: string | number;
  warehouse_code: string;
  warehouse_name_zh?: string;
  warehouse_name_lo?: string;
  address?: string;
  manager?: string;
  status?: string;
}

export default function MdWarehousesPage() {
  const { canView } = usePermission("MENU_WMS_MASTER");
  const [items, setItems] = useState<Warehouse_[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crud/wms_warehouses?limit=200", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.data ?? data.rows ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-slate-500 dark:text-slate-400" style={{ padding: 40, textAlign: "center" }}>无权限查看仓库档案</div>
  );

  const filtered = items.filter(w =>
    !search || (w.warehouse_code ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (w.warehouse_name_zh ?? "").includes(search)
  );

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="仓库档案"
        subtitle="WMS 仓库主档 · 库区 · 库位"
        breadcrumb={["主数据中心", "仓库档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索仓库编码 / 名称..."
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={load} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/warehouse/warehouses" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#8b5cf6", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div className="text-slate-500 dark:text-slate-400" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{filtered.length}</span> 个仓库
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
                {["仓库编码", "仓库名称(中)", "仓库名称(老)", "地址", "负责人", "状态"].map(h => (
                  <th key={h} className="border-b border-slate-200 dark:border-slate-700" style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              ) : filtered.map((w, i) => {
                const st = STATUS_MAP[w.status ?? "ACTIVE"] ?? { label: w.status ?? "-", color: "#64748b" };
                return (
                  <tr key={w.id ?? i} className="border-b border-slate-100 dark:border-slate-800"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px", fontFamily: "monospace" }}>{w.warehouse_code}</td>
                    <td className="text-slate-800 dark:text-slate-200" style={{ padding: "10px 14px", fontWeight: 500 }}>{w.warehouse_name_zh ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{w.warehouse_name_lo ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{w.address ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{w.manager ?? "-"}</td>
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
