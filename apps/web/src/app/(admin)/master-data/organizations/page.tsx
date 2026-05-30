"use client";
import { useState, useEffect, useCallback } from "react";
import { Network, Search, RefreshCw, ExternalLink, Inbox } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

/**
 * 主数据中心 — 组织架构
 * 数据来源：RBAC Org Runtime → GET /api/org/organizations
 * 完整管理入口：/settings/organizations
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

// 类型徽章：使用语义色 token，深色浅色均自动适配
const ORG_TYPE_MAP: Record<string, { label: string; cls: string }> = {
  GROUP:   { label: "集团", cls: "text-brand    bg-brand/10    border-brand/20" },
  COMPANY: { label: "公司", cls: "text-info     bg-info/10     border-info/20"  },
  FACTORY: { label: "工厂", cls: "text-success  bg-success/10  border-success/20" },
  FARM:    { label: "农场", cls: "text-success  bg-success/10  border-success/20" },
  STORE:   { label: "门店", cls: "text-warning  bg-warning/10  border-warning/20" },
  DEPT:    { label: "部门", cls: "text-danger   bg-danger/10   border-danger/20"  },
  REGION:  { label: "区域", cls: "text-info     bg-info/10     border-info/20"    },
  PROJECT: { label: "项目", cls: "text-brand    bg-brand/10    border-brand/20"   },
  WAREHOUSE:{ label:"仓库", cls: "text-warning  bg-warning/10  border-warning/20" },
  OTHER:   { label: "其他", cls: "text-text-muted bg-bg-muted  border-border"    },
};

interface OrgItem {
  id: string | number;
  orgCode?: string;
  orgName?: string;
  orgType?: string;
  parentName?: string;
  status?: string;
  description?: string;
  remark?: string;
}

export default function MdOrganizationsPage() {
  const { canView } = usePermission("MENU_SYS_ORG");
  const [items, setItems]       = useState<OrgItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
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
    <div className="flex items-center justify-center py-24 text-text-dim text-sm">
      无权限查看组织架构
    </div>
  );

  const filtered = items.filter(o => {
    const matchSearch = !search
      || (o.orgName ?? "").includes(search)
      || (o.orgCode ?? "").includes(search);
    const matchType = !typeFilter || o.orgType === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      <PageHeader
        title="组织架构"
        subtitle="集团 / 公司 / 农场 / 门店 / 部门 层级管理"
        breadcrumb={["主数据中心", "组织架构"]}
      />

      {/* ── 工具栏 ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        {/* 搜索框 */}
        <div className="relative flex-none w-60">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索组织名称 / 编码..."
            className={cn(
              "w-full pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none",
              "bg-bg-muted border border-border text-text",
              "placeholder:text-text-dim focus:border-brand/50 transition-colors",
            )}
          />
        </div>

        {/* 类型筛选 */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg cursor-pointer",
            "bg-bg-muted border border-border text-text-muted",
          )}
        >
          <option value="">全部类型</option>
          {Object.entries(ORG_TYPE_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* 刷新 */}
        <button
          onClick={load}
          disabled={loading}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg",
            "bg-bg-muted border border-border text-text-muted",
            "hover:bg-bg-card disabled:opacity-50 transition-colors cursor-pointer",
          )}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          刷新
        </button>

        <div className="flex-1" />

        {/* 完整管理跳转 */}
        <Link
          href="/settings/organizations"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 transition-opacity"
        >
          <ExternalLink size={13} />
          完整管理
        </Link>
      </div>

      {/* 条数统计 */}
      <p className="text-xs text-text-dim mb-3">
        共 <span className="font-semibold text-text-muted">{filtered.length}</span> 个组织单元
      </p>

      {/* ── 表格卡片 ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-text-dim">
            <RefreshCw size={24} className="animate-spin opacity-40" />
            <span className="text-sm">加载中…</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-danger">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-muted/40">
                  {["组织编码", "组织名称", "类型", "上级组织", "描述"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-text-dim">
                        <Inbox size={32} className="opacity-40" />
                        <span className="text-sm">暂无数据</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((o, i) => {
                  const tp = ORG_TYPE_MAP[o.orgType ?? "OTHER"] ?? ORG_TYPE_MAP.OTHER;
                  return (
                    <tr
                      key={o.id ?? i}
                      className={cn(
                        "border-b border-border/30 hover:bg-bg-muted/30 transition-colors",
                        i === filtered.length - 1 ? "border-b-0" : "",
                        i % 2 !== 0 ? "bg-bg-muted/15" : "",
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">{o.orgCode ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-text">{o.orgName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          tp.cls,
                        )}>
                          {tp.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{o.parentName ?? "—"}</td>
                      <td className="px-4 py-3 text-text-muted max-w-[220px] truncate">
                        {o.description ?? o.remark ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
