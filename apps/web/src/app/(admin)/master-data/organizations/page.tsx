"use client";
import { useState, useEffect, useCallback } from "react";
import { Network, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — 组织架构
 * 数据来源：RBAC Org Runtime → GET /api/org/organizations
 * 完整管理入口：/settings/organizations
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const ORG_TYPE_MAP: Record<string, { label: string; color: string }> = {
  GROUP:   { label: "集团",   color: "#6366f1" },
  COMPANY: { label: "公司",   color: "#3b82f6" },
  FARM:    { label: "农场",   color: "#10b981" },
  STORE:   { label: "门店",   color: "#f59e0b" },
  DEPT:    { label: "部门",   color: "#ec4899" },
  REGION:  { label: "区域",   color: "#14b8a6" },
  OTHER:   { label: "其他",   color: "#64748b" },
};

interface OrgItem {
  id: string | number;
  orgCode?: string;
  orgName?: string;
  orgNameEn?: string;
  orgType?: string;
  parentId?: string | number;
  parentName?: string;
  status?: string;
  description?: string;
}

export default function MdOrganizationsPage() {
  const { canView } = usePermission("MENU_SYS_ORG");
  const [items, setItems] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/org/organizations", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.data ?? data.orgs ?? data.items ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div className="text-slate-500 dark:text-slate-400" style={{ padding: 40, textAlign: "center" }}>无权限查看组织架构</div>
  );

  const filtered = items.filter(o => {
    const matchSearch = !search || (o.orgName ?? "").includes(search) || (o.orgCode ?? "").includes(search);
    const matchType = !typeFilter || o.orgType === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="组织架构"
        subtitle="集团 / 公司 / 农场 / 门店 / 部门 层级管理"
        breadcrumb={["主数据中心", "组织架构"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索组织名称 / 编码..."
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          style={{ padding: "7px 12px", borderRadius: 7, fontSize: 13 }}>
          <option value="">全部类型</option>
          {Object.entries(ORG_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div style={{ flex: 1 }} />
        <Link href="/settings/organizations" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#ec4899", border: "none", borderRadius: 7, color: "#fff", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div className="text-slate-500 dark:text-slate-400" style={{ marginBottom: 12, fontSize: 12 }}>
        共 <span style={{ fontWeight: 600 }}>{filtered.length}</span> 个组织单元
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
                {["组织编码", "组织名称", "类型", "上级组织", "描述"].map(h => (
                  <th key={h} className="border-b border-slate-200 dark:border-slate-700" style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              ) : filtered.map((o, i) => {
                const tp = ORG_TYPE_MAP[o.orgType ?? "OTHER"] ?? ORG_TYPE_MAP.OTHER;
                return (
                  <tr key={o.id ?? i} className="border-b border-slate-100 dark:border-slate-800"
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(148,163,184,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px", fontFamily: "monospace" }}>{o.orgCode ?? "-"}</td>
                    <td className="text-slate-800 dark:text-slate-200" style={{ padding: "10px 14px", fontWeight: 500 }}>{o.orgName ?? "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${tp.color}22`, color: tp.color, fontSize: 11, fontWeight: 600 }}>{tp.label}</span>
                    </td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px" }}>{o.parentName ?? "-"}</td>
                    <td className="text-slate-500 dark:text-slate-400" style={{ padding: "10px 14px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{o.description ?? "-"}</td>
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
