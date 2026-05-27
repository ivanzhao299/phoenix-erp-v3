"use client";
import { useState, useCallback, useEffect } from "react";
import {
  BookOpen, List, Zap, AlertTriangle,
  Plus, RefreshCw, Search, X, ChevronDown,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";

const API = "/api/v2/sales/pricing";

// ── 枚举常量 ──────────────────────────────────────────────────────────────────
const BOOK_STATUSES: Record<string, { label: string; cls: string }> = {
  DRAFT:            { label: "草稿",   cls: s.badgeNeutral },
  PENDING_APPROVAL: { label: "审批中", cls: s.badgeWarning },
  APPROVED:         { label: "已批准", cls: s.badgeInfo    },
  ACTIVE:           { label: "生效中", cls: s.badgeSuccess },
  EXPIRED:          { label: "已失效", cls: s.badgeNeutral },
  CANCELLED:        { label: "已取消", cls: s.badgeNeutral },
};
const GRADE_NAMES: Record<string, string> = {
  "0": "0号蛋", "1": "1号蛋", "2": "2号蛋", "3": "3号蛋",
  "4": "4号蛋", "5": "5号蛋", "DIRTY": "脏蛋", "BROKEN": "破损蛋",
};
const GRADE_OPTIONS = Object.entries(GRADE_NAMES).map(([v, l]) => ({ value: v, label: l }));
const SPEC_OPTIONS = [
  { value: "LOOSE",        label: "散装" },
  { value: "30_PCS_TRAY",  label: "30枚/托" },
  { value: "360_PCS_CASE", label: "360枚/箱" },
];

type Tab = "books" | "items" | "current" | "anomaly";

async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("phoenix_token") || sessionStorage.getItem("phoenix_token") || "" : "";
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function SalesV2PricingPage() {
  const [tab, setTab] = useState<Tab>("books");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="价格管理"
        subtitle="价格册 · 价格明细 · 统一定价引擎 · 按公司隔离数据"
        breadcrumb={["销售系统", "价格管理"]}
      />

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {([
          { id: "books",   label: "价格册",     icon: <BookOpen size={14} /> },
          { id: "items",   label: "价格明细",   icon: <List size={14} /> },
          { id: "current", label: "当前生效价格", icon: <Zap size={14} /> },
          { id: "anomaly", label: "价格异常",   icon: <AlertTriangle size={14} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              color: tab === id ? "var(--color-primary)" : "var(--text-secondary)",
              borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {tab === "books"   && <PriceBooksTab />}
      {tab === "items"   && <PriceItemsTab />}
      {tab === "current" && <CurrentPricesTab />}
      {tab === "anomaly" && <AnomalyTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格册 Tab
// ══════════════════════════════════════════════════════════════════════════════
function PriceBooksTab() {
  const [rows, setRows]       = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]       = useState(1);
  const limit = 20;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<any | null>(null);
  const [saving, setSaving]         = useState(false);

  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [confirmMsg, setConfirmMsg]     = useState("");
  const [confirmFn, setConfirmFn]       = useState<() => Promise<void>>(() => async () => {});
  const [errorMsg, setErrorMsg]         = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErrorMsg("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword)      p.set("keyword", keyword);
      if (statusFilter) p.set("status", statusFilter);
      const res = await apiFetch(`${API}/books?${p}`);
      setRows(res.data ?? []); setTotal(res.total ?? 0);
    } catch (e: any) { setErrorMsg(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [page, keyword, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/books/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) });
      } else {
        await apiFetch(`${API}/books`, { method: "POST", body: JSON.stringify(values) });
      }
      setDrawerOpen(false); load();
    } catch (e: any) { setErrorMsg(e.message); }
    finally { setSaving(false); }
  };

  const ask = (msg: string, fn: () => Promise<void>) => {
    setConfirmMsg(msg); setConfirmFn(() => fn); setConfirmOpen(true);
  };

  const doAction = async (id: string, action: string, label: string) => {
    ask(`确认${label}此价格册？`, async () => {
      try { await apiFetch(`${API}/books/${id}/${action}`, { method: "POST", body: "{}" }); load(); }
      catch (e: any) { setErrorMsg(e.message); }
    });
  };

  const FIELDS: FormField[] = [
    { key: "priceBookName", label: "价格册名称", type: "text", required: true },
    { key: "companyCode",   label: "公司编码",   type: "text", required: true },
    { key: "companyName",   label: "公司名称",   type: "text" },
    { key: "channelCode",   label: "渠道编码（渠道价）", type: "text", placeholder: "留空=不限渠道" },
    { key: "customerCode",  label: "客户编码（专属价）", type: "text", placeholder: "留空=非专属" },
    { key: "priority",      label: "优先级（数字越小越优先）", type: "number" },
    { key: "effectiveFrom", label: "生效日期", type: "date" },
    { key: "effectiveTo",   label: "失效日期", type: "date" },
    { key: "remark",        label: "备注",      type: "text" },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {errorMsg && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13 }}>
          {errorMsg} <button type="button" onClick={() => setErrorMsg("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={12}/></button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}/>
          <input style={{ paddingLeft: 32, height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, width: "100%", background: "var(--bg-card)" }}
            placeholder="搜索价格册名称 / 编号…"
            value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}/>
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)" }}>
          <option value="">全部状态</option>
          {Object.entries(BOOK_STATUSES).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
        </button>
        <button type="button" className={s.btnPrimary} onClick={() => { setEditing(null); setDrawerOpen(true); }}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={13}/> 新建价格册
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["编号","名称","渠道","客户","优先级","生效日","失效日","状态","操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className={s.emptyState}>暂无价格册</td></tr>}
            {rows.map((row, i) => {
              const st = BOOK_STATUSES[row.status] ?? { label: row.status, cls: s.badgeNeutral };
              return (
                <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11 }}>{row.price_book_no}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{row.price_book_name}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.channel_code ?? "—"}</td>
                  <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{row.customer_code ?? "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{row.priority}</td>
                  <td style={{ padding: "9px 12px", fontSize: 11 }}>{row.effective_from ?? "—"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 11 }}>{row.effective_to ?? "—"}</td>
                  <td style={{ padding: "9px 12px" }}><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {row.status === "DRAFT" && (
                        <>
                          <button type="button" className={s.btnSecondary} onClick={() => { setEditing(row); setDrawerOpen(true); }}
                            style={{ padding: "2px 8px", fontSize: 11 }}>编辑</button>
                          <button type="button" className={s.btnSecondary} onClick={() => doAction(row.id, "submit", "提交审批")}
                            style={{ padding: "2px 8px", fontSize: 11 }}>提交审批</button>
                        </>
                      )}
                      {row.status === "APPROVED" && (
                        <button type="button" className={s.btnPrimary} onClick={() => doAction(row.id, "activate", "激活")}
                          style={{ padding: "2px 8px", fontSize: 11 }}>激活</button>
                      )}
                      {(row.status === "ACTIVE" || row.status === "APPROVED") && (
                        <button type="button" className={s.btnSecondary} onClick={() => doAction(row.id, "expire", "失效")}
                          style={{ padding: "2px 8px", fontSize: 11 }}>失效</button>
                      )}
                      {!["CANCELLED", "ACTIVE"].includes(row.status) && (
                        <button type="button" onClick={() => doAction(row.id, "cancel", "取消")}
                          style={{ padding: "2px 8px", fontSize: 11, background: "none", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: "var(--radius)", cursor: "pointer" }}>取消</button>
                      )}
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

      <RightDrawer open={drawerOpen} title={editing ? "编辑价格册" : "新建价格册"} onClose={() => setDrawerOpen(false)}>
        <CrudForm
          fields={FIELDS}
          initialValues={editing ? {
            priceBookName: editing.price_book_name,
            companyCode:   editing.company_code,
            companyName:   editing.company_name,
            channelCode:   editing.channel_code,
            customerCode:  editing.customer_code,
            priority:      editing.priority,
            effectiveFrom: editing.effective_from,
            effectiveTo:   editing.effective_to,
            remark:        editing.remark,
          } : {}}
          onSubmit={handleSave}
          onCancel={() => setDrawerOpen(false)}
          loading={saving}
        />
      </RightDrawer>

      <ConfirmDialog
        open={confirmOpen} title="确认操作" message={confirmMsg}
        onConfirm={async () => { await confirmFn(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格明细 Tab
// ══════════════════════════════════════════════════════════════════════════════
function PriceItemsTab() {
  const [rows, setRows]       = useState<any[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [bookId, setBookId]   = useState("");
  const [grade, setGrade]     = useState("");
  const [page, setPage]       = useState(1);
  const limit = 50;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<any | null>(null);
  const [saving, setSaving]         = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(limit), status: "ACTIVE" });
      if (bookId) p.set("priceBookId", bookId);
      if (grade)  p.set("gradeCode", grade);
      const res = await apiFetch(`${API}/items?${p}`);
      setRows(res.data ?? []); setTotal(res.total ?? 0);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [page, bookId, grade]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/items/${editing.id}`, { method: "PATCH", body: JSON.stringify(values) });
      } else {
        await apiFetch(`${API}/items`, { method: "POST", body: JSON.stringify(values) });
      }
      setDrawerOpen(false); load();
    } catch (e: any) { setErrorMsg(e.message); }
    finally { setSaving(false); }
  };

  const doDisable = async (id: string) => {
    try { await apiFetch(`${API}/items/${id}/disable`, { method: "POST" }); load(); }
    catch (e: any) { setErrorMsg(e.message); }
  };

  const FIELDS: FormField[] = [
    { key: "priceBookId",  label: "价格册 ID", type: "number", required: true },
    { key: "productCode",  label: "产品编码",  type: "text",   required: true, placeholder: "如 EGG" },
    { key: "gradeCode",    label: "品级",      type: "select", options: GRADE_OPTIONS, placeholder: "不限" },
    { key: "packagingSpec",label: "包装规格",  type: "select", options: SPEC_OPTIONS,  placeholder: "不限" },
    { key: "unitPrice",    label: "单价",      type: "number", required: true },
    { key: "floorPrice",   label: "底价（低于此须审批）", type: "number" },
    { key: "ceilingPrice", label: "最高价",   type: "number" },
    { key: "minQty",       label: "最小数量（阶梯）", type: "number" },
    { key: "maxQty",       label: "最大数量（阶梯）", type: "number" },
    { key: "currencyCode", label: "货币",      type: "text",   placeholder: "LAK" },
  ];

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {errorMsg && (
        <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: "var(--radius)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 12 }}>
          {errorMsg} <button type="button" onClick={() => setErrorMsg("")} style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><X size={11}/></button>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)", width: 140 }}
          placeholder="价格册 ID" value={bookId} onChange={e => { setBookId(e.target.value); setPage(1); }}/>
        <select value={grade} onChange={e => { setGrade(e.target.value); setPage(1); }}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)" }}>
          <option value="">全部品级</option>
          {GRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
        </button>
        <button type="button" className={s.btnPrimary} onClick={() => { setEditing(null); setDrawerOpen(true); }}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={13}/> 新建明细
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
              {["价格册","产品","品级","规格","单价","底价","最高价","数量范围","货币","操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={10} className={s.emptyState}>暂无价格明细（请输入价格册 ID 筛选）</td></tr>}
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11 }}>{row.price_book_no}</td>
                <td style={{ padding: "9px 12px" }}>{row.product_code}</td>
                <td style={{ padding: "9px 12px" }}>{GRADE_NAMES[row.grade_code] ?? row.grade_code ?? "—"}</td>
                <td style={{ padding: "9px 12px", fontSize: 11 }}>{row.packaging_spec ?? "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700 }}>{Number(row.unit_price).toLocaleString()}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", color: "#f59e0b" }}>
                  {row.floor_price != null ? Number(row.floor_price).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right" }}>
                  {row.ceiling_price != null ? Number(row.ceiling_price).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "9px 12px", fontSize: 11 }}>
                  {row.min_qty || row.max_qty
                    ? `${row.min_qty ?? 0} ~ ${row.max_qty ?? "∞"}`
                    : "不限"}
                </td>
                <td style={{ padding: "9px 12px" }}>{row.currency_code}</td>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" className={s.btnSecondary} onClick={() => { setEditing(row); setDrawerOpen(true); }}
                      style={{ padding: "2px 8px", fontSize: 11 }}>编辑</button>
                    <button type="button" onClick={() => doDisable(row.id)}
                      style={{ padding: "2px 8px", fontSize: 11, background: "none", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: "var(--radius)", cursor: "pointer" }}>停用</button>
                  </div>
                </td>
              </tr>
            ))}
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

      <RightDrawer open={drawerOpen} title={editing ? "编辑价格明细" : "新建价格明细"} onClose={() => setDrawerOpen(false)}>
        <CrudForm
          fields={FIELDS}
          initialValues={editing ? {
            priceBookId:   editing.price_book_id,
            productCode:   editing.product_code,
            gradeCode:     editing.grade_code,
            packagingSpec: editing.packaging_spec,
            unitPrice:     editing.unit_price,
            floorPrice:    editing.floor_price,
            ceilingPrice:  editing.ceiling_price,
            minQty:        editing.min_qty,
            maxQty:        editing.max_qty,
            currencyCode:  editing.currency_code,
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
// 当前生效价格 Tab
// ══════════════════════════════════════════════════════════════════════════════
function CurrentPricesTab() {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyCode, setCompanyCode] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (companyCode) p.set("companyCode", companyCode);
      const res = await apiFetch(`${API}/current?${p}`);
      setRows(Array.isArray(res) ? res : []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [companyCode]);

  useEffect(() => { load(); }, [load]);

  const filtered = gradeFilter ? rows.filter(r => r.gradeCode === gradeFilter) : rows;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)", width: 200 }}
          placeholder="公司编码（可选）" value={companyCode} onChange={e => setCompanyCode(e.target.value)}/>
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
          style={{ height: 34, border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, padding: "0 10px", background: "var(--bg-card)" }}>
          <option value="">全部品级</option>
          {GRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
          style={{ height: 34, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
        </button>
      </div>

      {/* 价格卡片 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>加载中…</div>
      ) : filtered.length === 0 ? (
        <div className={s.emptyState}>暂无生效价格（请先创建并激活价格册）</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {filtered.map((r, i) => (
            <div key={i} style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderLeft: "4px solid var(--color-primary)",
              borderRadius: "var(--radius-lg)", padding: "14px 16px",
            }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                {GRADE_NAMES[r.gradeCode] ?? r.gradeCode ?? "所有品级"}
                {r.packagingSpec ? ` · ${r.packagingSpec}` : ""}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-primary)" }}>
                {Number(r.unitPrice).toLocaleString()}
                <span style={{ fontSize: 11, marginLeft: 4, color: "var(--text-secondary)", fontWeight: 400 }}>{r.currencyCode}</span>
              </div>
              {r.floorPrice != null && (
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                  底价 {Number(r.floorPrice).toLocaleString()}
                </div>
              )}
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>{r.priceBookNo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格异常 Tab（预留：低于底价记录）
// ══════════════════════════════════════════════════════════════════════════════
function AnomalyTab() {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", opacity: 0.5 }}>
      <AlertTriangle size={36} style={{ margin: "0 auto 14px", color: "#f59e0b" }}/>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>价格异常监控</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        Phase 3（销售订单）完成后启用<br/>
        将展示：低于底价的历史成交记录、未走审批的价格异常、频繁报价异常客户
      </div>
    </div>
  );
}
