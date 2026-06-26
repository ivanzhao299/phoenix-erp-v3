"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { Building, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import { DataTableV3 } from "@/components/design-system";
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
  } = usePermission("MENU_MD_COMPANY");
  const orgPerm = usePermission("MENU_MD_ORG");
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
        💡 公司档案来源于组织架构（Org Runtime）
        {orgPerm.canCreate || orgPerm.canEdit ? <>，如需添加公司请前往 <Link href="/master-data/organizations" style={{
        color: "var(--color-accent)"
      }}>组织架构管理</Link></> : "。"}
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
        {(orgPerm.canCreate || orgPerm.canEdit) && (
          <Link href="/master-data/organizations" style={{ ...primaryActionButton, textDecoration: "none" }}>
            <ExternalLink size={13} /> 组织架构管理
          </Link>
        )}
      </div>

      <div className="text-text-muted" style={{
      marginBottom: 12,
      fontSize: 12
    }}>
        共 <span className={u.fw600}>{filtered.length}</span> 家公司
      </div>

      {error ? <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div> : (
        <DataTableV3<OrgItem>
          rows={filtered}
          loading={loading}
          rowKey={(o, i) => o.id ?? i}
          emptyText="暂无公司数据（请前往组织架构管理添加）"
          columns={[
            { key: "orgCode", title: "公司编码", render: (o) => o.orgCode ? (
              <button type="button" onClick={() => setDetailCode(o.orgCode ?? null)} style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer", padding: 0, fontFamily: "monospace", fontSize: "inherit", textDecoration: "underline" }}>{o.orgCode}</button>
            ) : "-" },
            { key: "orgName", title: "公司名称", render: (o) => o.orgName ?? "-" },
            { key: "orgType", title: "类型", render: (o) => <span style={inlineBadge('default')}>{o.orgType === "GROUP" ? "集团" : "公司"}</span> },
            { key: "parentName", title: "上级", render: (o) => o.parentName ?? "-" },
            { key: "description", title: "描述", render: (o) => <span style={{ display: "block", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>{o.description ?? "-"}</span> },
          ]}
        />
      )}
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={companyConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>;
}
