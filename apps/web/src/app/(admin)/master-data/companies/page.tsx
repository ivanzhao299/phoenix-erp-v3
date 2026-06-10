"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { Building, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { primaryActionButton, secondaryActionButton, inputField, inlineBadge } from "@/components/design-system/cockpit-styles";
import { companyConfig } from "@/components/master-data/detail-configs";

/**
 * 主数据中心 — 公司档案
 * 数据来源：Org Runtime → GET /api/org/organizations（筛选 orgType=COMPANY）
 * 完整管理入口：/settings/organizations
 */

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${tok()}`
});
interface OrgItem {
  id: string | number;
  orgCode?: string;
  orgName?: string;
  orgType?: string;
  parentName?: string;
  description?: string;
  status?: string;
}
export default function MdCompaniesPage() {
  const {
    canView
  } = usePermission("MENU_MASTER");
  const [items, setItems] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/org/organizations", {
        headers: hdr()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const all: OrgItem[] = Array.isArray(data) ? data : data.data ?? data.orgs ?? data.items ?? [];
      // 筛选公司类型（COMPANY / GROUP）
      const companies = all.filter(o => ["COMPANY", "GROUP"].includes(o.orgType ?? ""));
      setItems(companies.length > 0 ? companies : all); // 若无分类则展示全部
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  if (!canView) return <div className="text-text-muted" style={{
    padding: 40,
    textAlign: "center"
  }}>无权限查看公司档案</div>;
  const filtered = items.filter(o => !search || (o.orgName ?? "").includes(search) || (o.orgCode ?? "").includes(search));
  return <div className="animate-fade-in" style={{
    padding: "24px 32px"
  }}>
      <PageHeader title="公司中心" subtitle="集团 / 子公司 / 法人实体 · 业务归属 · 资产覆盖 · 点击编码查看公司全景" breadcrumb={["主数据中心", "公司中心"]} />
      <MasterDataCenterStrip type="company" />

      {/* 数据来源说明 */}
      <div style={{
      marginBottom: 20,
      padding: "10px 14px",
      background: "var(--bg-card)",
      border: "1px solid var(--color-accent)44",
      borderRadius: 8,
      fontSize: 12,
      color: "var(--color-accent)"
    }}>
        💡 公司档案来源于组织架构（Org Runtime），如需添加公司请前往 <Link href="/settings/organizations" style={{
        color: "var(--color-accent)"
      }}>组织架构管理</Link>
      </div>

      <div style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 18,
      flexWrap: "wrap"
    }}>
        <div style={{
        position: "relative",
        flex: "0 0 260px"
      }}>
          <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-secondary)"
        }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索公司名称 / 编码..." style={{
          ...inputField,
          width: "100%",
          padding: "7px 10px 7px 32px"
        }} />
        </div>
        <button onClick={load} style={secondaryActionButton}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div className={u.flex1} />
        <Link href="/settings/organizations" style={{ ...primaryActionButton, textDecoration: "none" }}>
          <ExternalLink size={13} /> 组织架构管理
        </Link>
      </div>

      <div className="text-text-muted" style={{
      marginBottom: 12,
      fontSize: 12
    }}>
        共 <span className={u.fw600}>{filtered.length}</span> 家公司
      </div>

      {loading ? <div style={{
      padding: 60,
      textAlign: "center",
      color: "var(--text-secondary)"
    }}>加载中...</div> : error ? <div style={{
      padding: 40,
      textAlign: "center",
      color: "var(--status-danger)"
    }}>{error}</div> : <div className="bg-bg-muted border border-border" style={{
      borderRadius: 10,
      overflow: "auto"
    }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["公司编码", "公司名称", "类型", "上级", "描述"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={5} className={u.emptyPad40}>
                  暂无公司数据
                  <div style={{
                marginTop: 8,
                fontSize: 12
              }}>
                    <Link href="/settings/organizations" style={{
                  color: "var(--color-accent)"
                }}>前往组织架构管理 →</Link>
                  </div>
                </td></tr> : filtered.map((o, i) => <tr key={o.id ?? i} className="border-b border-border/30" onMouseEnter={e => e.currentTarget.style.background = "rgba(148,163,184,0.08)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ fontFamily: "monospace" }}>
                    {o.orgCode ? (
                      <button
                        type="button"
                        onClick={() => setDetailCode(o.orgCode ?? null)}
                        style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer", padding: 0, fontFamily: "monospace", fontSize: "inherit", textDecoration: "underline" }}
                      >{o.orgCode}</button>
                    ) : "-"}
                  </td>
                  <td className="text-text">{o.orgName ?? "-"}</td>
                  <td>
                    <span style={inlineBadge('default')}>
                      {o.orgType === "GROUP" ? "集团" : "公司"}
                    </span>
                  </td>
                  <td className="text-text-muted">{o.parentName ?? "-"}</td>
                  <td className="text-text-muted" style={{
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>{o.description ?? "-"}</td>
                </tr>)}
            </tbody>
          </table>
        </div>}
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={companyConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>;
}