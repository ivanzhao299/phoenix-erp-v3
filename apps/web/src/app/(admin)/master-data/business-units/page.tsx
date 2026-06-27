"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { CompanySelector } from "@/components/shared-selectors/MasterDataSelectors";
import { ConfirmDialogV2 } from "@/components/design-system/dialogs/ConfirmDialogV2";
import { usePermission } from "@/hooks/usePermission";

// ── 事业群（业务维度）管理 + 经营概览 ─────────────────────────────────────────
// G110/S5：法人树 ⟂ 事业群解耦——事业群跨公司，由 biz_bu_membership 承载，不参与权限。

interface BuMember {
  id: string; bu_code: string; org_code: string; org_type: string;
  weight_pct: number; is_primary: boolean; org_name?: string; org_name_cn?: string;
}
interface BuOverview {
  bu_code: string; bu_name: string; bu_short_name?: string;
  company_count: number; site_count: number; store_count: number;
  members: BuMember[];
}

function tok() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/business-units${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(init?.headers || {}) },
  });
  return res.json();
}

export default function BusinessUnitsPage() {
  const { canView, canEdit } = usePermission("MENU_MD_BUSINESS_UNIT");
  const [data, setData] = useState<BuOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await api("/overview");
      setData(j.code === 200 ? (j.data ?? []) : []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const addCompanyMember = async (buCode: string) => {
    if (!newCompany) return;
    const j = await api("/members", { method: "POST", body: JSON.stringify({ bu_code: buCode, org_code: newCompany, org_type: "COMPANY", weight_pct: 100, is_primary: true }) });
    if (j.code === 200) { setAddingTo(null); setNewCompany(""); await load(); }
    else alert(j.msg || j.data?.message || "添加失败");
  };
  const removeMember = (id: string) => { setPendingRemoveId(id); };
  const doRemoveMember = async () => {
    if (!pendingRemoveId) return;
    const j = await api(`/members/${pendingRemoveId}`, { method: "DELETE" });
    if (j.code === 200) await load();
    setPendingRemoveId(null);
  };

  const TYPE_ZH: Record<string, string> = { COMPANY: "公司", SITE: "场站" };

  if (!canView) {
    return <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看事业群</div>;
  }

  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="事业群（业务维度）"
        subtitle="法人树管权限 · 事业群管经营 · 可跨公司归类（biz_bu_membership）"
        breadcrumb={["主数据中心", "事业群"]}
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>加载中…</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          暂无事业群数据（部署 g110 迁移后生效）。
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 16 }}>
          {data.map((bu) => (
            <div key={bu.bu_code} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18, background: "var(--bg-card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{bu.bu_name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{bu.bu_code}</div>
              </div>

              {/* 经营规模统计 */}
              <div style={{ display: "flex", gap: 18, margin: "12px 0", fontSize: 13 }}>
                <span>公司 <b>{bu.company_count}</b></span>
                <span>场站 <b>{bu.site_count}</b></span>
                <span>门店 <b>{bu.store_count}</b></span>
              </div>

              {/* 成员经营单元 */}
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>归属经营单元</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bu.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "var(--bg-muted)" }}>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{m.org_name_cn || m.org_name || m.org_code}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}>
                        {TYPE_ZH[m.org_type] || m.org_type}{m.weight_pct !== 100 ? ` · ${m.weight_pct}%` : ""}{m.is_primary ? " · 主" : ""}
                      </span>
                    </span>
                    {canEdit && <button onClick={() => void removeMember(m.id)} style={{ background: "none", border: "none", color: "var(--status-danger)", cursor: "pointer", fontSize: 12 }}>移除</button>}
                  </div>
                ))}
                {bu.members.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>（暂无成员）</div>}
              </div>

              {/* 添加公司成员 */}
              {canEdit && addingTo === bu.bu_code ? (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <div style={{ flex: 1 }}><CompanySelector value={newCompany} onChange={setNewCompany} /></div>
                  <button onClick={() => void addCompanyMember(bu.bu_code)} disabled={!newCompany} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--color-accent)", color: "#fff", fontSize: 12, cursor: "pointer" }}>添加</button>
                  <button onClick={() => { setAddingTo(null); setNewCompany(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-page)", fontSize: 12, cursor: "pointer" }}>取消</button>
                </div>
              ) : canEdit ? (
                <button onClick={() => setAddingTo(bu.bu_code)} style={{ marginTop: 10, fontSize: 12, color: "var(--color-accent)", background: "none", border: "1px dashed var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", width: "100%" }}>+ 添加公司到此事业群</button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: "var(--bg-muted)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        💡 事业群是「业务维度」，可横跨多家公司用于经营归类与汇总；权限隔离仍按公司/场站（DataScope），与此无关。
        一家公司也可按场站分归不同事业群（多业务线 P&L 拆分，后续可在此扩展场站级成员）。
      </div>

      <ConfirmDialogV2
        open={!!pendingRemoveId}
        title="移除经营单元"
        message="从该事业群移除此经营单元？"
        danger
        confirmLabel="移除"
        onConfirm={doRemoveMember}
        onCancel={() => setPendingRemoveId(null)}
      />
    </div>
  );
}
