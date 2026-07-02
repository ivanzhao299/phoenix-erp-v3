"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { Building, Search, RefreshCw, ExternalLink, Pencil, Save } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import { DataTableV3 } from "@/components/design-system";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { primaryActionButton, secondaryActionButton, inputField, inlineBadge } from "@/components/design-system/cockpit-styles";
import { useLanguage } from "@/contexts/LanguageContext";
import { RightDrawer } from "@/components/ui/RightDrawer";

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
  parentCode?: string;
  companyCode?: string;
  orgShortName?: string;
  managerName?: string;
  description?: string;
  remark?: string;
  status?: string;
}

interface CompanyEditForm {
  orgName: string;
  orgShortName: string;
  companyCode: string;
  managerName: string;
  remark: string;
}

const companyFieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14
};

const companyFieldFull: React.CSSProperties = { gridColumn: "1 / -1" };

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-secondary)"
};

const helperText: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.6,
  color: "var(--text-secondary)"
};

function valueOrPending(value?: string | number | null) {
  const s = String(value ?? "").trim();
  return s || "待补充";
}

function companyProfileScore(o: OrgItem) {
  return [o.orgName, o.orgShortName, o.companyCode ?? o.orgCode, o.managerName, o.remark ?? o.description].filter(Boolean).length;
}

function DetailRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  const pending = !String(value ?? "").trim();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 14,
        fontWeight: pending ? 500 : 700,
        color: pending ? "var(--text-tertiary)" : "var(--text-primary)",
        fontFamily: mono && !pending ? "monospace" : undefined,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }}>
        {valueOrPending(value)}
      </div>
    </div>
  );
}

export default function MdCompaniesPage() {
  const { t } = useLanguage();
  const {
    canView
  } = usePermission("MENU_MD_COMPANY");
  const orgPerm = usePermission("MENU_MD_ORG");
  const [items, setItems] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [detailCompany, setDetailCompany] = useState<OrgItem | null>(null);
  const [editing, setEditing] = useState<OrgItem | null>(null);
  const [editForm, setEditForm] = useState<CompanyEditForm>({
    orgName: "",
    orgShortName: "",
    companyCode: "",
    managerName: "",
    remark: ""
  });
  const [saving, setSaving] = useState(false);
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
      setError(e instanceof Error ? e.message : t('md.loadFailed', '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const openEdit = (row: OrgItem) => {
    setDetailCompany(null);
    setEditing(row);
    setEditForm({
      orgName: row.orgName ?? "",
      orgShortName: row.orgShortName ?? "",
      companyCode: row.companyCode ?? row.orgCode ?? "",
      managerName: row.managerName ?? "",
      remark: row.remark ?? row.description ?? ""
    });
  };

  const saveCompanyProfile = async () => {
    if (!editing?.orgCode) return;
    if (!editForm.orgName.trim()) {
      setError(t('md.companyNameRequired', '公司名称不能为空'));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/organizations/${encodeURIComponent(editing.orgCode)}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          orgName: editForm.orgName.trim(),
          orgShortName: editForm.orgShortName.trim() || undefined,
          companyCode: editForm.companyCode.trim() || editing.orgCode,
          managerName: editForm.managerName.trim() || undefined,
          remark: editForm.remark.trim() || undefined
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message ?? `HTTP ${res.status}`);
      }
      setEditing(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('md.saveFailed', '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  if (!canView) return <div className="text-text-muted" style={{
    padding: 40,
    textAlign: "center"
  }}>{t('md.noPermCompany', '无权限查看公司档案')}</div>;
  const filtered = items.filter(o => !search || (o.orgName ?? "").includes(search) || (o.orgCode ?? "").includes(search));
  return <div className="animate-fade-in" style={{
    padding: "24px 32px"
  }}>
      <PageHeader title={t('md.companyCenter', '公司中心')} subtitle={t('md.companyCenterSub', '集团 / 子公司 / 法人实体 · 业务归属 · 资产覆盖 · 点击编码查看公司全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.companyCenter', '公司中心')]} />
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
        💡 {t('md.companySourceFromOrg', '公司档案来源于组织架构（Org Runtime）')}
        <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>
          {t('md.companyProfilePurpose', '本页用于查看和维护公司基础档案；法人证照、税号、注册地址、开户信息需后续建立公司扩展档案。')}
        </span>
        {orgPerm.canCreate || orgPerm.canEdit ? <>{t('md.companyAddHint', '，如需添加公司请前往 ')}<Link href="/master-data/organizations" style={{
        color: "var(--color-accent)"
      }}>{t('md.orgManage', '组织架构管理')}</Link></> : "。"}
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('md.searchCompanyPlaceholder', '搜索公司名称 / 编码...')} style={{
          ...inputField,
          width: "100%",
          padding: "7px 10px 7px 32px"
        }} />
        </div>
        <button onClick={load} style={secondaryActionButton}>
          <RefreshCw size={13} /> {t('md.refresh', '刷新')}
        </button>
        <div className={u.flex1} />
        {(orgPerm.canCreate || orgPerm.canEdit) && (
          <Link href="/master-data/organizations" style={{ ...primaryActionButton, textDecoration: "none" }}>
            <ExternalLink size={13} /> {t('md.orgManage', '组织架构管理')}
          </Link>
        )}
      </div>

      <div className="text-text-muted" style={{
      marginBottom: 12,
      fontSize: 12
    }}>
        {t('md.total', '共')} <span className={u.fw600}>{filtered.length}</span> {t('md.companiesUnit', '家公司')}
      </div>

      {error ? <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div> : (
        <DataTableV3<OrgItem>
          rows={filtered}
          loading={loading}
          rowKey={(o, i) => o.id ?? i}
          emptyText={t('md.companyEmpty', '暂无公司数据（请前往组织架构管理添加）')}
          columns={[
            { key: "orgCode", title: t('md.companyCode', '公司编码'), render: (o) => o.orgCode ? (
              <button type="button" onClick={() => setDetailCompany(o)} style={{ background: "transparent", border: "none", color: "var(--color-primary)", cursor: "pointer", padding: 0, fontFamily: "monospace", fontSize: "inherit", textDecoration: "underline" }}>{o.orgCode}</button>
            ) : "-" },
            { key: "orgName", title: t('md.companyName', '公司名称'), render: (o) => o.orgName ?? "-" },
            { key: "orgShortName", title: t('md.companyShortName', '简称'), render: (o) => o.orgShortName ?? "-" },
            { key: "orgType", title: t('md.type', '类型'), render: (o) => <span style={inlineBadge('default')}>{o.orgType === "GROUP" ? t('md.group', '集团') : t('md.companyShort', '公司')}</span> },
            { key: "parentName", title: t('md.parent', '上级'), render: (o) => o.parentName ?? "-" },
            { key: "managerName", title: t('md.manager', '负责人'), render: (o) => o.managerName ?? "-" },
            { key: "status", title: t('md.status', '状态'), render: (o) => <span style={inlineBadge(o.status === "ACTIVE" ? 'success' : 'default')}>{o.status ?? "-"}</span> },
            { key: "description", title: t('md.profileCompleteness', '档案完整度'), render: (o) => {
              const filled = companyProfileScore(o);
              return <span style={inlineBadge(filled >= 4 ? 'success' : 'warning')}>{filled}/5</span>;
            } },
            { key: "actions", title: t('md.actions', '操作'), render: (o) => (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setDetailCompany(o)} style={{ ...secondaryActionButton, padding: "5px 9px", fontSize: 12 }}>
                  {t('md.viewProfile', '查看')}
                </button>
                {orgPerm.canEdit && (
                  <button type="button" onClick={() => openEdit(o)} style={{ ...secondaryActionButton, padding: "5px 9px", fontSize: 12 }}>
                    <Pencil size={12} /> {t('md.editProfile', '编辑档案')}
                  </button>
                )}
              </div>
            ) },
          ]}
        />
      )}
      <RightDrawer
        open={detailCompany !== null}
        title={t('md.companyProfile', '公司档案')}
        width={560}
        onClose={() => setDetailCompany(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <Link href="/master-data/organizations" style={{ ...secondaryActionButton, textDecoration: "none" }}>
              <ExternalLink size={14} /> {t('md.orgManage', '组织架构管理')}
            </Link>
            {detailCompany && orgPerm.canEdit && (
              <button type="button" onClick={() => openEdit(detailCompany)} style={primaryActionButton}>
                <Pencil size={14} /> {t('md.editProfile', '编辑基础档案')}
              </button>
            )}
          </div>
        }
      >
        {detailCompany && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <section style={{
              padding: 16,
              borderRadius: 10,
              background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
              color: "var(--text-on-dark)",
              boxShadow: "var(--shadow-sm)"
            }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>{detailCompany.orgType === "GROUP" ? t('md.group', '集团') : t('md.companyShort', '公司')}</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25 }}>{detailCompany.orgName ?? detailCompany.orgCode}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
                <code style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,.16)", color: "inherit" }}>{detailCompany.orgCode}</code>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,.16)", fontSize: 12 }}>{detailCompany.status === "ACTIVE" ? t('md.active', '运行中') : detailCompany.status ?? "—"}</span>
                <span style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,.16)", fontSize: 12 }}>{t('md.profileCompleteness', '档案完整度')} {companyProfileScore(detailCompany)}/5</span>
              </div>
            </section>

            <section>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{t('md.basicProfile', '基础档案')}</h3>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-card)"
              }}>
                <DetailRow label={t('md.companyCode', '公司编码')} value={detailCompany.orgCode} mono />
                <DetailRow label={t('md.companyShortName', '简称')} value={detailCompany.orgShortName} />
                <DetailRow label={t('md.linkedCompanyCode', '关联公司编码')} value={detailCompany.companyCode ?? detailCompany.orgCode} mono />
                <DetailRow label={t('md.parent', '上级')} value={detailCompany.parentName ?? detailCompany.parentCode} />
                <DetailRow label={t('md.manager', '负责人')} value={detailCompany.managerName} />
                <DetailRow label={t('md.status', '状态')} value={detailCompany.status} />
                <div style={{ gridColumn: "1 / -1" }}>
                  <DetailRow label={t('md.remark', '备注')} value={detailCompany.remark ?? detailCompany.description} />
                </div>
              </div>
            </section>

            <section>
              <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{t('md.extendedProfile', '扩展档案')}</h3>
              <div style={{
                padding: 14,
                borderRadius: 10,
                border: "1px dashed var(--border)",
                background: "var(--bg-muted)",
                color: "var(--text-secondary)",
                fontSize: 13,
                lineHeight: 1.8
              }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{t('md.extendedProfilePending', '以下信息尚未建立结构化字段，不能在当前页伪造维护：')}</div>
                <div>{t('md.companyExtendedFields', '统一社会信用代码/税号、注册地址、法人代表、经营范围、证照附件、默认开票信息、默认银行账户。')}</div>
                <div style={{ marginTop: 8 }}>{t('md.companyExtendedPlan', '建议下一步建设“公司扩展档案”表和审批流，再开放这些字段的编辑。')}</div>
              </div>
            </section>
          </div>
        )}
      </RightDrawer>
      <RightDrawer
        open={editing !== null}
        title={t('md.editCompanyProfile', '编辑公司基础档案')}
        width={620}
        onClose={() => setEditing(null)}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => setEditing(null)} style={secondaryActionButton} disabled={saving}>
              {t('common.cancel', '取消')}
            </button>
            <button type="button" onClick={saveCompanyProfile} style={primaryActionButton} disabled={saving}>
              <Save size={14} /> {saving ? t('ui.保存中', '保存中...') : t('common.save', '保存')}
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-muted)",
            fontSize: 12,
            lineHeight: 1.7,
            color: "var(--text-secondary)"
          }}>
            {t('md.companyProfileEditScope', '当前可维护公司基础档案：名称、简称、关联公司编码、负责人、备注。税号、注册地址、证照、开户信息属于公司扩展档案，需后续单独建表后维护。')}
          </div>
          <div style={companyFieldGrid}>
            <label>
              <span style={fieldLabel}>{t('md.companyName', '公司名称')} *</span>
              <input
                value={editForm.orgName}
                onChange={e => setEditForm(f => ({ ...f, orgName: e.target.value }))}
                style={{ ...inputField, width: "100%" }}
              />
            </label>
            <label>
              <span style={fieldLabel}>{t('md.companyShortName', '简称')}</span>
              <input
                value={editForm.orgShortName}
                onChange={e => setEditForm(f => ({ ...f, orgShortName: e.target.value }))}
                style={{ ...inputField, width: "100%" }}
                placeholder={t('md.companyShortNamePlaceholder', '例如：老挝农业')}
              />
            </label>
            <label>
              <span style={fieldLabel}>{t('md.companyCode', '公司编码')}</span>
              <input value={editing?.orgCode ?? ""} readOnly style={{ ...inputField, width: "100%", background: "var(--bg-muted)", cursor: "not-allowed" }} />
              <div style={helperText}>{t('md.companyCodeReadonlyHint', '编码是系统主键，不在档案编辑中修改。')}</div>
            </label>
            <label>
              <span style={fieldLabel}>{t('md.linkedCompanyCode', '关联公司编码')}</span>
              <input
                value={editForm.companyCode}
                onChange={e => setEditForm(f => ({ ...f, companyCode: e.target.value }))}
                style={{ ...inputField, width: "100%" }}
                placeholder={editing?.orgCode ?? ""}
              />
              <div style={helperText}>{t('md.companyCodeDataScopeHint', '用于 DataScope 公司域，通常与公司编码保持一致。')}</div>
            </label>
            <label>
              <span style={fieldLabel}>{t('md.manager', '负责人')}</span>
              <input
                value={editForm.managerName}
                onChange={e => setEditForm(f => ({ ...f, managerName: e.target.value }))}
                style={{ ...inputField, width: "100%" }}
                placeholder={t('md.managerPlaceholder', '负责人姓名')}
              />
            </label>
            <label style={companyFieldFull}>
              <span style={fieldLabel}>{t('md.remark', '备注')}</span>
              <textarea
                value={editForm.remark}
                onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
                style={{ ...inputField, width: "100%", minHeight: 92, resize: "vertical" }}
                placeholder={t('md.companyRemarkPlaceholder', '经营范围、法人主体说明、档案待补事项等')}
              />
            </label>
          </div>
        </div>
      </RightDrawer>
    </div>;
}
