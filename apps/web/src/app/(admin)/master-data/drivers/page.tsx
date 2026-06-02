"use client";
import { useState, useEffect, useCallback } from "react";
import { UserCheck, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 司机档案
 * 数据来源：Sales V2 Delivery Runtime → GET /api/v2/sales/delivery/drivers
 * 完整管理入口：/sales2/delivery
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "在职",   color: "var(--status-success)" },
  INACTIVE: { label: "离职",   color: "var(--text-secondary)" },
  ON_LEAVE: { label: "请假",   color: "var(--status-warning)" },
};

interface Driver {
  id: string | number;
  name?: string;
  driverName?: string;
  phone?: string;
  licenseNo?: string;
  licenseType?: string;
  status?: string;
  companyCode?: string;
}

export default function MdDriversPage() {
  const { canView } = usePermission("MENU_SALES2_DELIVERY");
  const [items, setItems] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/sales/delivery/drivers", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? data.drivers ?? []);
      // 后端 SELECT * 返回 snake_case，归一化为页面所需字段（兼容 camel）
      setItems(raw.map((r: any) => ({
        id: r.id,
        driverCode: r.driver_code ?? r.driverCode,
        name: r.driver_name ?? r.name ?? r.driverName,
        driverName: r.driver_name ?? r.driverName,
        phone: r.phone ?? r.driverPhone,
        licenseNo: r.license_no ?? r.licenseNo,
        licenseType: r.license_type ?? r.licenseType,
        status: r.status,
        companyCode: r.company_code ?? r.companyCode,
      })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看司机档案</div>
  );

  const filtered = items.filter(d => {
    const name = d.name ?? d.driverName ?? "";
    return !search || name.toLowerCase().includes(search.toLowerCase()) || (d.phone ?? "").includes(search);
  });

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="司机档案"
        subtitle="配送管理 · 司机主档"
        breadcrumb={["主数据中心", "司机档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名 / 电话..."
            className="bg-bg-muted border border-border text-text"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={load} className="bg-bg-muted border border-border text-text-muted" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/sales2/delivery" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--status-warning)", border: "none", borderRadius: 7, color: "var(--text-on-dark)", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 配送管理
        </Link>
      </div>

      <div className="text-text-muted" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{filtered.length}</span> 名司机
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "auto" }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["姓名", "电话", "驾照号", "驾照类型", "状态"].map(h => (
                  <th key={h} style={{ whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
              ) : filtered.map((d, i) => {
                const st = STATUS_MAP[d.status ?? "ACTIVE"] ?? { label: d.status ?? "-", color: "var(--text-secondary)" };
                return (
                  <tr key={d.id ?? i} className="border-b border-border/30"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-text">{d.name ?? d.driverName ?? "-"}</td>
                    <td className="text-text-muted">{d.phone ?? "-"}</td>
                    <td className="text-text-muted" style={{ fontFamily: "monospace" }}>{d.licenseNo ?? "-"}</td>
                    <td className="text-text-muted">{d.licenseType ?? "-"}</td>
                    <td>
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
