"use client";
import { useState, useCallback, useEffect } from "react";
import { Users, Layers, CreditCard, Plus, RefreshCw, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";

const API = "/api/v2/sales";

// ── 枚举常量 ──────────────────────────────────────────────────────────────────
const CUSTOMER_TYPES = [
  { value: "DIRECT_STORE", label: "直营店" },
  { value: "DISTRIBUTOR",  label: "经销商" },
  { value: "AGENT",        label: "代理商" },
  { value: "KEY_ACCOUNT",  label: "大客户" },
  { value: "RETAIL",       label: "散客零售" },
];
const RISK_LEVELS = [
  { value: "NORMAL",    label: "正常" },
  { value: "WATCH",     label: "观察" },
  { value: "BLACKLIST", label: "黑名单" },
];
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: "正常",  cls: s.badgeSuccess },
  FROZEN:    { label: "冻结",  cls: s.badgeWarning },
  BLACKLIST: { label: "黑名单", cls: s.badgeDanger ?? s.badgeNeutral },
};
const CHANNEL_TYPES = [
  { value: "DIRECT",      label: "直营" },
  { value: "DISTRIBUTOR", label: "经销" },
  { value: "AGENT",       label: "代理" },
  { value: "RETAIL",      label: "零售" },
];
const CHANNEL_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: "启用", cls: s.badgeSuccess },
  INACTIVE: { label: "停用", cls: s.badgeNeutral },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Tab IDs ───────────────────────────────────────────────────────────────────
type Tab = "customers" | "channels" | "credit";

export default function SalesV2CustomersPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("customers");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="客户档案"
        subtitle="统一客户主档 · 渠道管理 · 按公司隔离数据"
        breadcrumb={["销售系统", "客户档案"]}
      />

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {([
          { id: "customers", label: "客户主档", icon: <Users size={14} /> },
          { id: "channels",  label: "渠道管理", icon: <Layers size={14} /> },
          { id: "credit",    label: "信用概览", icon: <CreditCard size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: tab === id ? "var(--color-primary)" : "var(--text-secondary)",
              borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "customers" && <CustomersTab />}
      {tab === "channels"  && <ChannelsTab />}
      {tab === "credit"    && <CreditTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 客户主档 Tab
// ══════════════════════════════════════════════════════════════════════════════
function CustomersTab() {
  const [rows, setRows]         = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [keyword, setKeyword]   = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]         = useState(1);
  const limit = 20;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<any | null>(null);
  const [saving, setSaving]         = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg]   = useState("");
  const [confirmFn, setConfirmFn]     = useState<() => Promise<void>>(() => async () => {});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword)      params.set("keyword",      keyword);
      if (typeFilter)   params.set("customerType", typeFilter);
      if (statusFilter) params.set("status",       statusFilter);
      const res = await apiFetch(`${API}/customers?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page, keyword, typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (row: any) => { setEditing(row); setDrawerOpen(true); };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/customers/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) });
      } else {
        await apiFetch(`${API}/customers`, { method: "POST", body: JSON.stringify(values) });
      }
      setDrawerOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const askConfirm = (msg: string, fn: () => Promise<void>) => {
    setConfirmMsg(msg);
    setConfirmFn(() => fn);
    setConfirmOpen(true);
  };

  const doFreeze = (row: any) =>
    askConfirm(`冻结客户「${row.customer_name}」？`, async () => {
      await apiFetch(`${API}/customers/${row.id}/freeze`, { method: "POST", body: "{}" });
      load();
    });

  const doActivate = (row: any) =>
    askConfirm(`解冻客户「${row.customer_name}」？`, async () => {
      await apiFetch(`${API}/customers/${row.id}/activate`, { method: "POST" });
      load();
    });

  const doBlacklist = (row: any) =>
    askConfirm(`将「${row.customer_name}」加入黑名单？此操作需管理员权限。`, async () => {
      await apiFetch(`${API}/customers/${row.id}/blacklist`, { method: "POST", body: "{}" });
      load();
    });

  const FIELDS: FormField[] = [
    { key: "customerName",    label: "客户名称", type: "text",   required: true },
    { key: "customerType",    label: "客户类型", type: "select", required: true, options: CUSTOMER_TYPES },
    { key: "companyCode",     label: "公司编码", type: "text",   required: true, placeholder: "DataScope 归属" },
    { key: "companyName",     label: "公司名称", type: "text" },
    { key: "channelCode",     label: "渠道编码", type: "text" },
    { key: "regionCode",      label: "区域编码", type: "text" },
    { key: "creditLimit",     label: "信用额度", type: "number" },
    { key: "paymentTerms",    label: "账期（天）", type: "number" },
    { key: "riskLevel",       label: "风险等级", type: "select", options: RISK_LEVELS },
    { key: "salesRepName",    label: "销售员",  type: "text" },
    { key: "contactName",     label: "联系人",  type: "text" },
    { key: "contactPhone",    label: "联系电话", type: "text" },
    { key: "deliveryAddress", label: "配送地址", type: "text" },
    { key: "remark",          label: "备注",   type: "text" },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            style={{ paddingLeft: 32, height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, width: "100%", background: "var(--bg-card)" }}
            placeholder="搜索客户名称 / 编号 / 联系人…"
            value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
          />
          {keyword && <button type="button" onClick={() => { setKeyword(""); setPage(1); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}><X size={13} /></button>}
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)" }}>
          <option value="">全部类型</option>
          {CUSTOMER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)" }}>
          <option value="">全部状态</option>
          <option value="ACTIVE">正常</option>
          <option value="FROZEN">冻结</option>
          <option value="BLACKLIST">黑名单</option>
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
        <button type="button" className={s.btnPrimary} onClick={openNew}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34 }}>
          <Plus size={13} /> 新建客户
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["客户编号","客户名称","类型","渠道","信用额度","已用额度","账期","风险","状态","操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} className={s.emptyState}>暂无客户数据</td></tr>
            )}
            {rows.map((row, i) => {
              const st = STATUS_MAP[row.status] ?? { label: row.status, cls: s.badgeNeutral };
              const risk = RISK_LEVELS.find(r => r.value === row.risk_level);
              const type = CUSTOMER_TYPES.find(t => t.value === row.customer_type);
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{row.customer_no}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "9px 12px" }}><span className={`${s.badge} ${s.badgeInfo}`}>{type?.label ?? row.customer_type}</span></td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.channel_code ?? "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{Number(row.credit_limit).toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{Number(row.credit_used).toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{row.payment_terms}天</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span className={`${s.badge} ${risk?.value === "BLACKLIST" ? s.badgeDanger ?? s.badgeNeutral : risk?.value === "WATCH" ? s.badgeWarning : s.badgeSuccess}`}>
                      {risk?.label ?? row.risk_level}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px" }}><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className={s.btnSecondary} onClick={() => openEdit(row)}
                        style={{ padding: "2px 8px", fontSize: 11 }}>编辑</button>
                      {row.status === "ACTIVE" && (
                        <button type="button" className={s.btnSecondary} onClick={() => doFreeze(row)}
                          style={{ padding: "2px 8px", fontSize: 11 }}>冻结</button>
                      )}
                      {row.status === "FROZEN" && (
                        <button type="button" className={s.btnSecondary} onClick={() => doActivate(row)}
                          style={{ padding: "2px 8px", fontSize: 11 }}>解冻</button>
                      )}
                      {row.status !== "BLACKLIST" && (
                        <button type="button" onClick={() => doBlacklist(row)}
                          style={{ padding: "2px 8px", fontSize: 11, background: "none", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "var(--radius)", cursor: "pointer" }}>
                          黑名单
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {/* Drawer */}
      <RightDrawer open={drawerOpen} title={editing ? "编辑客户" : "新建客户"} onClose={() => setDrawerOpen(false)}>
        <CrudForm
          fields={FIELDS}
          initialValues={editing ? {
            customerName:    editing.customer_name,
            customerType:    editing.customer_type,
            companyCode:     editing.company_code,
            companyName:     editing.company_name,
            channelCode:     editing.channel_code,
            regionCode:      editing.region_code,
            creditLimit:     editing.credit_limit,
            paymentTerms:    editing.payment_terms,
            riskLevel:       editing.risk_level,
            salesRepName:    editing.sales_rep_name,
            contactName:     editing.contact_name,
            contactPhone:    editing.contact_phone,
            deliveryAddress: editing.delivery_address,
            remark:          editing.remark,
          } : {}}
          onSubmit={handleSave}
          onCancel={() => setDrawerOpen(false)}
          loading={saving}
        />
      </RightDrawer>

      {/* Confirm */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认操作"
        message={confirmMsg}
        onConfirm={async () => { await confirmFn(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 渠道管理 Tab
// ══════════════════════════════════════════════════════════════════════════════
function ChannelsTab() {
  const [rows, setRows]       = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage]       = useState(1);
  const limit = 20;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<any | null>(null);
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set("keyword", keyword);
      const res = await apiFetch(`${API}/channels?${params}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page, keyword]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (row: any) => { setEditing(row); setDrawerOpen(true); };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/channels/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) });
      } else {
        await apiFetch(`${API}/channels`, { method: "POST", body: JSON.stringify(values) });
      }
      setDrawerOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const toggleStatus = async (row: any) => {
    const action = row.status === "ACTIVE" ? "deactivate" : "activate";
    await apiFetch(`${API}/channels/${row.id}/${action}`, { method: "POST" });
    load();
  };

  const FIELDS: FormField[] = [
    { key: "channelCode",  label: "渠道编码", type: "text",   required: true, placeholder: "唯一编码，如 CH-DIRECT-001" },
    { key: "channelName",  label: "渠道名称", type: "text",   required: true },
    { key: "channelType",  label: "渠道类型", type: "select", required: true, options: CHANNEL_TYPES },
    { key: "companyCode",  label: "公司编码", type: "text",   required: true },
    { key: "companyName",  label: "公司名称", type: "text" },
    { key: "remark",       label: "备注",   type: "text" },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            style={{ paddingLeft: 32, height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, width: "100%", background: "var(--bg-card)" }}
            placeholder="搜索渠道名称 / 编码…"
            value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
          />
        </div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
        <button type="button" className={s.btnPrimary} onClick={openNew}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34 }}>
          <Plus size={13} /> 新建渠道
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["渠道编码","渠道名称","类型","公司","状态","操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className={s.emptyState}>暂无渠道数据</td></tr>}
            {rows.map((row, i) => {
              const st = CHANNEL_STATUS_MAP[row.status] ?? { label: row.status, cls: s.badgeNeutral };
              const ct = CHANNEL_TYPES.find(t => t.value === row.channel_type);
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{row.channel_code}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.channel_name}</td>
                  <td style={{ padding: "9px 12px" }}><span className={`${s.badge} ${s.badgeInfo}`}>{ct?.label ?? row.channel_type}</span></td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.company_code}</td>
                  <td style={{ padding: "9px 12px" }}><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className={s.btnSecondary} onClick={() => openEdit(row)}
                        style={{ padding: "2px 8px", fontSize: 11 }}>编辑</button>
                      <button type="button" className={s.btnSecondary} onClick={() => toggleStatus(row)}
                        style={{ padding: "2px 8px", fontSize: 11 }}>
                        {row.status === "ACTIVE" ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>共 {total} 条</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      <RightDrawer open={drawerOpen} title={editing ? "编辑渠道" : "新建渠道"} onClose={() => setDrawerOpen(false)}>
        <CrudForm
          fields={FIELDS}
          initialValues={editing ? {
            channelCode: editing.channel_code,
            channelName: editing.channel_name,
            channelType: editing.channel_type,
            companyCode: editing.company_code,
            companyName: editing.company_name,
            remark:      editing.remark,
          } : {}}
          onSubmit={handleSave}
          onCancel={() => setDrawerOpen(false)}
          loading={saving}
        />
      </RightDrawer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 信用概览 Tab
// ══════════════════════════════════════════════════════════════════════════════
function CreditTab() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage]       = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set("keyword", keyword);
      params.set("status", "ACTIVE");
      const res = await apiFetch(`${API}/customers?${params}`);
      setRows(res.data ?? []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page, keyword]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input
            style={{ paddingLeft: 32, height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, width: "100%", background: "var(--bg-card)" }}
            placeholder="搜索客户名称…"
            value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
          />
        </div>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 34 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["客户名称","信用额度","已用额度","可用额度","使用率","账期","风险"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: h.includes("额度") || h === "使用率" ? "right" : "left", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className={s.emptyState}>暂无数据</td></tr>}
            {rows.map((row, i) => {
              const limit = Number(row.credit_limit);
              const used  = Number(row.credit_used);
              const avail = limit - used;
              const pct   = limit > 0 ? Math.round((used / limit) * 100) : 0;
              const risk  = RISK_LEVELS.find(r => r.value === row.risk_level);
              const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.customer_name}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{limit.toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>{used.toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: avail < 0 ? "#ef4444" : "inherit" }}>{avail.toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <div style={{ width: 60, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: barColor, fontWeight: 600 }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{row.payment_terms}天</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span className={`${s.badge} ${risk?.value === "BLACKLIST" ? s.badgeDanger ?? s.badgeNeutral : risk?.value === "WATCH" ? s.badgeWarning : s.badgeSuccess}`}>
                      {risk?.label ?? row.risk_level}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
