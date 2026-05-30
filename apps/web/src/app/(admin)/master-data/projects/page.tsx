"use client";
import { useState, useEffect, useCallback } from "react";
import { FolderKanban, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — 项目档案
 * 数据来源：Procurement V2 Project Runtime → GET /api/v2/procurement/projects
 * 完整管理入口：/procurement2/projects
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: "进行中", color: "#10b981" },
  CLOSED:    { label: "已关闭", color: "#64748b" },
  PLANNING:  { label: "规划中", color: "#3b82f6" },
  SUSPENDED: { label: "暂停",   color: "#f59e0b" },
};

interface Project {
  id: string | number;
  projectCode?: string;
  projectName: string;
  ownerCompanyCode?: string;
  ownerCompanyName?: string;
  managerName?: string;
  budget?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

export default function MdProjectsPage() {
  const { canView } = usePermission("MENU_PRC2_MASTER");
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v2/procurement/projects?limit=100", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr: Project[] = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
      setItems(arr);
      setTotal(typeof data.total === "number" ? data.total : arr.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>无权限查看项目档案</div>
  );

  const filtered = items.filter(p =>
    !search || (p.projectName ?? "").includes(search) || (p.projectCode ?? "").includes(search)
  );

  return (
    <div style={{ padding: "24px 32px", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      <PageHeader
        title="项目档案"
        subtitle="项目主档 · 采购项目 · 预算归属"
        breadcrumb={["主数据中心", "项目档案"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索项目名称 / 编码..." style={{ width: "100%", padding: "7px 10px 7px 32px", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/procurement2/projects" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#14b8a6", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div style={{ marginBottom: 12, color: "#64748b", fontSize: 12 }}>
        共 <span style={{ color: "#94a3b8", fontWeight: 600 }}>{filtered.length}</span> 个项目
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>{error}</div>
      ) : (
        <div style={{ background: "#1e293b", borderRadius: 10, border: "1px solid #334155", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#64748b", fontSize: 12 }}>
                {["项目编码", "项目名称", "归属公司", "负责人", "预算", "货币", "状态"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid #334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              ) : filtered.map((p, i) => {
                const st = STATUS_MAP[p.status ?? "ACTIVE"] ?? { label: p.status ?? "-", color: "#64748b" };
                return (
                  <tr key={p.id ?? i} style={{ borderBottom: "1px solid #1e293b" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#162032")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "10px 14px", color: "#94a3b8", fontFamily: "monospace" }}>{p.projectCode ?? "-"}</td>
                    <td style={{ padding: "10px 14px", color: "#f1f5f9", fontWeight: 500 }}>{p.projectName}</td>
                    <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{p.ownerCompanyName ?? p.ownerCompanyCode ?? "-"}</td>
                    <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{p.managerName ?? "-"}</td>
                    <td style={{ padding: "10px 14px", color: "#e2e8f0" }}>{p.budget != null ? p.budget.toLocaleString() : "-"}</td>
                    <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{p.currency ?? "-"}</td>
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
