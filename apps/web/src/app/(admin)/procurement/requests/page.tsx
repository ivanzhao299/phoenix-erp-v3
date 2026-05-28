"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, RefreshCw, Send, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { FileUploadInput } from "@/components/ui/FileUploadInput";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { crudApi } from "@/lib/api-client";
import s from "@/components/ui/admin-ui.module.css";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";

// 正式流程表：prc_purchase_requests
// 状态机：DRAFT → PENDING → APPROVED → CONVERTED
//                         → REJECTED

interface PR {
  id: number;
  req_no: string;
  subject?: string;
  category?: string;
  dept?: string;
  urgency?: string;
  item?: string;
  qty?: string;
  unit?: string;
  budget_amount?: number;
  currency_code?: string;
  expected_date?: string;
  supplier_name?: string;
  supplier_code?: string;
  applicant?: string;
  reason?: string;
  status: string;
  approved_by?: string;
  approved_at?: string;
  reject_note?: string;
  po_no?: string;
  created_at?: string;
}

interface Supplier { id: number; supplier_code: string; supplier_name: string; supplier_type: string; }

interface Form {
  req_no: string;
  subject: string;
  category: string;
  dept: string;
  urgency: string;
  item: string;
  qty: string;
  unit: string;
  budget_amount: string;
  currency_code: string;
  expected_date: string;
  supplier_name: string;
  supplier_code: string;
  reason: string;
  attachment_url: string;
}

const CATEGORY_OPTS = [
  { value: "FEED",      label: "饲料原料" },
  { value: "MEDICINE",  label: "兽药疫苗" },
  { value: "PACKAGING", label: "包装耗材" },
  { value: "EQUIPMENT", label: "设备配件" },
  { value: "OTHER",     label: "其他" },
];

const DEPT_OPTS = ["养殖部", "分级包装部", "物流配送部", "财务部", "行政人力", "信息技术部"];

// ── 标准状态枚举（与 procurement.service.ts 保持一致） ──────────────────────────
// 写入值：DRAFT / PENDING / APPROVED / CONVERTED / REJECTED
// 历史兼容展示（只读）：SUBMITTED → "待处理"、PO_CREATED → "已转PO"
const STATUS_CFG: Record<string, { label: string; cls: string; color: string }> = {
  DRAFT:            { label: "草稿",   cls: "badgeNeutral",  color: "#6b7280" },
  PENDING:          { label: "待处理", cls: "badgeWarning",  color: "#f59e0b" },
  APPROVED:         { label: "已审批", cls: "badgeSuccess",  color: "#10b981" },
  CONVERTED:        { label: "已转PO", cls: "badgeInfo",     color: "#3b82f6" },
  REJECTED:         { label: "已驳回", cls: "badgeDanger",   color: "#ef4444" },
  // ── 历史只读兼容（不再写入这些值）──
  SUBMITTED:        { label: "待处理", cls: "badgeWarning",  color: "#f59e0b" },
  PO_CREATED:       { label: "已转PO", cls: "badgeInfo",     color: "#3b82f6" },
};

const APPROVER_ROLES = ["ROLE_ADMIN", "ROLE_CEO", "ROLE_FARM_MGR"];
const BUYER_ROLES    = ["ROLE_ADMIN", "ROLE_PRC_BUYER"];

const DEF: Form = {
  req_no: "", subject: "", category: "FEED", dept: DEPT_OPTS[0],
  urgency: "NORMAL", item: "", qty: "", unit: "袋",
  budget_amount: "0", currency_code: "LAK", expected_date: "",
  supplier_name: "", supplier_code: "", reason: "", attachment_url: "",
};

export default function RequestsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();

  const userRole  = user?.role || "";
  const userName  = user?.name || user?.username || "";
  const canApprove = APPROVER_ROLES.includes(userRole);
  const canBuy     = BUYER_ROLES.includes(userRole);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [list,       setList]       = useState<PR[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [catFilter,  setCatFilter]  = useState("");
  const [stFilter,   setStFilter]   = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailRow,  setDetailRow]  = useState<PR | null>(null);
  const [editing,    setEditing]    = useState<PR | null>(null);
  const [form,       setForm]       = useState<Form>(DEF);
  const [saving,     setSaving]     = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState<PR | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      crudApi.list<PR>("prc_purchase_requests", { limit: 300 }),
      crudApi.list<Supplier>("prc_suppliers", { limit: 200 }),
    ]).then(([pr, sp]) => {
      setList(pr.data || []);
      setSuppliers(sp.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => list.filter(r => {
    if (search && !(r.req_no || "").includes(search) && !(r.subject || "").includes(search) && !(r.item || "").includes(search)) return false;
    if (catFilter && r.category !== catFilter) return false;
    if (stFilter) {
      // PENDING 筛选同时匹配历史 SUBMITTED 记录
      if (stFilter === "PENDING" && r.status !== "PENDING" && r.status !== "SUBMITTED") return false;
      else if (stFilter !== "PENDING" && r.status !== stFilter) return false;
    }
    return true;
  }), [list, search, catFilter, stFilter]);

  const counts = useMemo(() => ({
    draft:     list.filter(r => r.status === "DRAFT").length,
    pending:   list.filter(r => r.status === "PENDING" || r.status === "SUBMITTED").length,
    approved:  list.filter(r => r.status === "APPROVED").length,
    total:     list.length,
  }), [list]);

  function genReqNo() {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `REQ-${d}-${Date.now().toString().slice(-4)}`;
  }

  function openNew() {
    setEditing(null); setDetailRow(null);
    setForm({ ...DEF, req_no: genReqNo(), applicant: userName } as Form & { applicant: string });
    setDrawerOpen(true);
  }
  function openEdit(row: PR) {
    setEditing(row); setDetailRow(null);
    setForm({
      req_no: row.req_no, subject: row.subject || "", category: row.category || "FEED",
      dept: row.dept || DEPT_OPTS[0], urgency: row.urgency || "NORMAL",
      item: row.item || "", qty: row.qty || "", unit: row.unit || "袋",
      budget_amount: String(row.budget_amount || 0), currency_code: row.currency_code || "LAK",
      expected_date: row.expected_date?.slice(0, 10) || "",
      supplier_name: row.supplier_name || "", supplier_code: row.supplier_code || "",
      reason: row.reason || "", attachment_url: (row as any).attachment_url || "",
    });
    setDrawerOpen(true);
  }
  function openDetail(row: PR) {
    setDetailRow(row); setEditing(null); setDrawerOpen(true);
  }

  const setF = (k: keyof Form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.subject || !form.item) {
      toast.error("采购主题和物料名称为必填项"); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        budget_amount: Number(form.budget_amount) || 0,
        applicant: userName,
        status: "DRAFT",
        attachment_url: form.attachment_url || null,
      };
      if (editing?.id) {
        await fetch(`/api/crud/prc_purchase_requests/${editing.id}`, { method: "PUT", headers: hdr, body: JSON.stringify(payload) });
        toast.success("申请已更新");
      } else {
        await fetch("/api/crud/prc_purchase_requests", { method: "POST", headers: hdr, body: JSON.stringify(payload) });
        toast.success("采购申请已保存");
      }
      setDrawerOpen(false); setEditing(null); load();
    } catch { toast.error("操作失败"); } finally { setSaving(false); }
  };

  const submitForApproval = async (row: PR) => {
    // 与 backend service 对齐：提交后状态为 PENDING（移动端采购审核可见）
    await fetch(`/api/crud/prc_purchase_requests/${row.id}`, {
      method: "PUT", headers: hdr, body: JSON.stringify({ status: "PENDING" }),
    });
    toast.success("已提交，等待采购员/场长审批");
    load();
  };

  const approve = async (row: PR) => {
    await fetch(`/api/crud/prc_purchase_requests/${row.id}`, {
      method: "PUT", headers: hdr,
      body: JSON.stringify({ status: "APPROVED", approved_by: userName, approved_at: new Date().toISOString() }),
    });
    toast.success("已审批通过");
    load();
  };

  const reject = async () => {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) { toast.error("请填写驳回原因"); return; }
    await fetch(`/api/crud/prc_purchase_requests/${rejectTarget.id}`, {
      method: "PUT", headers: hdr,
      body: JSON.stringify({ status: "REJECTED", approved_by: userName, reject_note: rejectNote }),
    });
    toast.success("已驳回");
    setRejectTarget(null); setRejectNote(""); load();
  };

  const convertToPO = async (row: PR) => {
    // 前置校验：预算金额 > 0（后端也有同样校验）
    if (!(Number(row.budget_amount) > 0)) {
      toast.error("预算金额必须大于 0 才能转为采购单，请先编辑申请填写金额");
      return;
    }
    setSaving(true);
    try {
      // 走 Service 端点，由后端生成合同号（HT-YYYY-NNNNN）并设状态 DRAFT
      const resp = await fetch(`/api/procurement/purchase-requests/${row.id}/convert`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          supplier_code:  row.supplier_code  || "",
          supplier_name:  row.supplier_name  || "",
          total_amount:   Number(row.budget_amount) || 0,
          currency_code:  row.currency_code  || "LAK",
          expected_date:  row.expected_date  || undefined,
        }),
      });
      const result = await resp.json();
      if (result.code !== 200) throw new Error(result.msg || "转单失败");
      const poNo = result.po?.po_no || "—";
      const contractNo = result.po?.contract_no || "";
      toast.success(`已转采购单 ${poNo}${contractNo ? `（合同号 ${contractNo}）` : ""}`);
      setDrawerOpen(false);
      load();
    } catch (e: any) { toast.error(e.message || "转单失败"); } finally { setSaving(false); }
  };

  const delDraft = async (row: PR) => {
    if (row.status !== "DRAFT") {
      toast.error("只有草稿状态的申请可以删除");
      return;
    }
    if (!confirm(`确认删除草稿申请 ${row.req_no}？此操作不可撤销。`)) return;
    await fetch(`/api/crud/prc_purchase_requests/${row.id}`, { method: "DELETE", headers: hdr });
    toast.success("已删除"); load();
  };

  const catLabel = (c?: string) => CATEGORY_OPTS.find(o => o.value === c)?.label || c || "—";

  const inp = {
    padding: "8px 10px", background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 13,
    outline: "none", width: "100%", boxSizing: "border-box" as const,
  };
  const lbl = { fontSize: 13, color: "var(--text-secondary)", display: "block" as const, marginBottom: 4 };

  return (
    <div className="animate-fade-in">
      {/* [LEGACY] Phase 2B — 旧采购页面已冻结 */}
      <LegacyFreezeBanner message="当前模块已冻结，仅保留历史查询，请使用新版采购管理。" newPath="/procurement2/requests" newModuleName="新版采购管理" />
      <PageHeader
        title="采购申请"
        subtitle="提交采购需求 · 场长/CEO审批 · 采购员转PO"
        breadcrumb={["采购管理", "采购申请"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={load} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> 新增申请
            </button>
          </div>
        }
      />

      {/* KPI */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "草稿",   value: counts.draft,    color: "#6b7280", st: "DRAFT" },
          { label: "待处理", value: counts.pending,  color: "#f59e0b", st: "PENDING" },
          { label: "已审批", value: counts.approved, color: "#10b981", st: "APPROVED" },
          { label: "全部",   value: counts.total,    color: "var(--color-primary)", st: "" },
        ].map(k => (
          <button key={k.label} type="button" onClick={() => setStFilter(stFilter === k.st ? "" : k.st)}
            style={{
              background: "var(--bg-card)", border: `1px solid var(--border)`,
              borderLeft: `3px solid ${stFilter === k.st ? k.color : k.color}`,
              borderRadius: "var(--radius-md)", padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              opacity: stFilter && stFilter !== k.st ? 0.6 : 1,
            }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.label}</span>
          </button>
        ))}
      </div>

      {/* 过滤栏 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索申请编号 / 主题 / 物料…"
          style={{ flex: 1, minWidth: 160, ...inp }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inp, width: "auto" }}>
          <option value="">全部品类</option>
          {CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 表格 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-page)", borderBottom: "1px solid var(--border)" }}>
              {["申请编号", "主题/物料", "品类", "部门", "预算", "期望到货", "状态", "操作"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-secondary)" }}>暂无采购申请</td></tr>}
            {!loading && filtered.map((row, i) => {
              const st = row.status || "DRAFT";
              const cfg = STATUS_CFG[st] || STATUS_CFG.DRAFT;
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                  <td style={{ padding: "9px 12px" }}>
                    <button type="button" onClick={() => openDetail(row)}
                      style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontWeight: 700, fontFamily: "monospace", fontSize: 11, padding: 0 }}>
                      {row.req_no}
                    </button>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{row.subject || "—"}</div>
                    {row.item && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{row.item} × {row.qty}{row.unit}</div>}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--bg-page)", border: "1px solid var(--border)" }}>
                      {catLabel(row.category)}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-secondary)" }}>{row.dept || "—"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700 }}>
                    {row.currency_code || "LAK"} {Number(row.budget_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 11 }}>{row.expected_date?.slice(0, 10) || "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span className={`${s.badge} ${s[cfg.cls]}`}>{cfg.label}</span>
                    {(st === "CONVERTED" || st === "PO_CREATED") && row.po_no && (
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2, fontFamily: "monospace" }}>{row.po_no}</div>
                    )}
                    {st === "REJECTED" && row.reject_note && (
                      <div style={{ fontSize: 10, color: "#ef4444", marginTop: 2 }} title={row.reject_note}>驳回：{row.reject_note.slice(0, 20)}</div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <button type="button" className={s.btnSecondary} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => openDetail(row)}>详情</button>
                      {st === "DRAFT" && <>
                        <button type="button" className={s.btnSecondary} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => openEdit(row)}>编辑</button>
                        <button type="button" className={s.btnSuccess} style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => submitForApproval(row)}><Send size={10} />提交审批</button>
                        <button type="button" className={s.btnDanger} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => delDraft(row)}>删除</button>
                      </>}
                      {/* PENDING / SUBMITTED：场长/CEO 可审批；采购员可直接转单或驳回 */}
                      {(st === "PENDING" || st === "SUBMITTED") && canApprove && !canBuy && <>
                        <button type="button" className={s.btnSuccess} style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => approve(row)}><CheckCircle size={10} />审批通过</button>
                        <button type="button" className={s.btnDanger} style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => { setRejectTarget(row); setRejectNote(""); }}><XCircle size={10} />驳回</button>
                      </>}
                      {/* APPROVED：场长已审批，采购员转单 */}
                      {(st === "APPROVED" || ((st === "PENDING" || st === "SUBMITTED") && canBuy)) && (
                        <button type="button" className={s.btnPrimary} style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => convertToPO(row)} disabled={saving}><ArrowRight size={10} />转采购单</button>
                      )}
                      {/* 采购员还可以直接驳回 PENDING */}
                      {(st === "PENDING" || st === "SUBMITTED") && canBuy && (
                        <button type="button" className={s.btnDanger} style={{ padding: "4px 8px", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}
                          onClick={() => { setRejectTarget(row); setRejectNote(""); }}><XCircle size={10} />驳回</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 驳回对话框 */}
      {rejectTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 24, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>驳回申请 — {rejectTarget.req_no}</div>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              placeholder="请填写驳回原因（必填）"
              style={{ ...inp, resize: "vertical", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className={s.btnSecondary} style={{ flex: 1 }} onClick={() => setRejectTarget(null)}>取消</button>
              <button type="button" className={s.btnDanger} style={{ flex: 1 }} onClick={reject}>确认驳回</button>
            </div>
          </div>
        </div>
      )}

      {/* 详情 Drawer */}
      <RightDrawer open={drawerOpen && !!detailRow} title={`申请详情 — ${detailRow?.req_no || ""}`}
        onClose={() => { setDrawerOpen(false); setDetailRow(null); }}>
        {detailRow && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "申请编号", value: detailRow.req_no, mono: true },
              { label: "主题",     value: detailRow.subject },
              { label: "品类",     value: catLabel(detailRow.category) },
              { label: "物料",     value: `${detailRow.item || "—"} × ${detailRow.qty || 0} ${detailRow.unit || ""}` },
              { label: "预算",     value: `${detailRow.currency_code || "LAK"} ${Number(detailRow.budget_amount || 0).toLocaleString()}` },
              { label: "部门",     value: detailRow.dept },
              { label: "申请人",   value: detailRow.applicant },
              { label: "意向供应商", value: detailRow.supplier_name || detailRow.supplier_code || "—" },
              { label: "期望到货", value: detailRow.expected_date?.slice(0, 10) || "—" },
              { label: "申请理由", value: detailRow.reason || "—" },
              { label: "审批人",   value: detailRow.approved_by || "—" },
              { label: "审批时间", value: detailRow.approved_at?.slice(0, 16) || "—" },
              { label: "驳回原因", value: detailRow.reject_note || "—" },
              { label: "关联PO",   value: detailRow.po_no || "—", mono: true },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", gap: 10 }}>
                <span style={{ width: 80, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: r.mono ? "monospace" : "inherit" }}>{r.value || "—"}</span>
              </div>
            ))}
            <div style={{ marginTop: 4 }}>
              <span style={{ width: 80, fontSize: 12, color: "var(--text-secondary)" }}>状态 </span>
              <span className={`${s.badge} ${s[STATUS_CFG[detailRow.status]?.cls || "badgeNeutral"]}`}>
                {STATUS_CFG[detailRow.status]?.label || detailRow.status}
              </span>
            </div>
            {/* 附件预览 */}
            {(detailRow as any).attachment_url && (
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <span style={{ width: 80, fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>附件</span>
                <FileUploadInput
                  value={(detailRow as any).attachment_url}
                  onChange={() => {}}
                  disabled={true}
                />
              </div>
            )}
            {/* 详情页操作 */}
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {(detailRow.status === "PENDING" || detailRow.status === "SUBMITTED") && canApprove && !canBuy && <>
                <button type="button" className={s.btnSuccess} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => { approve(detailRow); setDrawerOpen(false); }}>
                  <CheckCircle size={14} /> 审批通过
                </button>
                <button type="button" className={s.btnDanger} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => { setRejectTarget(detailRow); setRejectNote(""); setDrawerOpen(false); }}>
                  <XCircle size={14} /> 驳回
                </button>
              </>}
              {(detailRow.status === "APPROVED" || ((detailRow.status === "PENDING" || detailRow.status === "SUBMITTED") && canBuy)) && (
                <button type="button" className={s.btnPrimary} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => convertToPO(detailRow)} disabled={saving}>
                  <ArrowRight size={14} /> 转为采购单
                </button>
              )}
              {(detailRow.status === "PENDING" || detailRow.status === "SUBMITTED") && canBuy && (
                <button type="button" className={s.btnDanger} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => { setRejectTarget(detailRow); setRejectNote(""); setDrawerOpen(false); }}>
                  <XCircle size={14} /> 驳回
                </button>
              )}
            </div>
          </div>
        )}
      </RightDrawer>

      {/* 新增/编辑 Drawer */}
      <RightDrawer open={drawerOpen && !detailRow} title={editing ? "编辑采购申请" : "新增采购申请"}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>申请编号</label>
              <input value={form.req_no} readOnly style={{ ...inp, background: "var(--bg-page)", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 12 }} />
            </div>
            <div>
              <label style={lbl}>紧急程度</label>
              <select value={form.urgency} onChange={e => setF("urgency", e.target.value)} style={inp}>
                <option value="NORMAL">普通</option>
                <option value="URGENT">加急</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>采购主题 <span className={s.textDanger}>*</span></label>
            <input value={form.subject} onChange={e => setF("subject", e.target.value)} placeholder="例：2026年6月饲料补库采购" style={inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>采购品类 <span className={s.textDanger}>*</span></label>
              <select value={form.category} onChange={e => setF("category", e.target.value)} style={inp}>
                {CATEGORY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>申请部门</label>
              <select value={form.dept} onChange={e => setF("dept", e.target.value)} style={inp}>
                {DEPT_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>物料名称 <span className={s.textDanger}>*</span></label>
              <input value={form.item} onChange={e => setF("item", e.target.value)} placeholder="例：玉米饲料（50kg/袋）" style={inp} />
            </div>
            <div>
              <label style={lbl}>数量</label>
              <input type="number" value={form.qty} onChange={e => setF("qty", e.target.value)} min="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>单位</label>
              <input value={form.unit} onChange={e => setF("unit", e.target.value)} placeholder="袋/箱/件" style={inp} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>预算金额</label>
              <input type="number" value={form.budget_amount} onChange={e => setF("budget_amount", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>结算币种</label>
              <select value={form.currency_code} onChange={e => setF("currency_code", e.target.value)} style={inp}>
                {["LAK", "CNY", "THB", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>期望到货日期</label>
            <input type="date" value={form.expected_date} onChange={e => setF("expected_date", e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>意向供应商（可选）</label>
            <select value={form.supplier_code}
              onChange={e => {
                const sup = suppliers.find(s => s.supplier_code === e.target.value);
                setF("supplier_code", e.target.value);
                setF("supplier_name", sup?.supplier_name || "");
              }} style={inp}>
              <option value="">— 待采购确认 —</option>
              {suppliers.map(sp => (
                <option key={sp.supplier_code} value={sp.supplier_code}>
                  [{CATEGORY_OPTS.find(c => c.value === sp.supplier_type)?.label || sp.supplier_type}] {sp.supplier_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>申请理由</label>
            <textarea value={form.reason} onChange={e => setF("reason", e.target.value)} rows={3}
              placeholder="说明采购原因、用途或库存不足背景" style={{ ...inp, resize: "vertical" }} />
          </div>
          <div>
            <label style={lbl}>附件（报价单 / 合同 / 实物图片，PDF 或图片 ≤ 15MB）</label>
            <FileUploadInput
              value={form.attachment_url}
              onChange={url => setF("attachment_url", url)}
            />
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex: 1 }} onClick={() => { setDrawerOpen(false); setEditing(null); }}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex: 2 }} disabled={saving} onClick={save}>{saving ? "保存中…" : "保存草稿"}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
