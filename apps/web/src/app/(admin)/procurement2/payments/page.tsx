"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, FileText, CheckCircle, XCircle, Trash2, Send,
  Eye, Clock, AlertTriangle, ChevronLeft, ChevronRight, Pencil,
  DollarSign, CreditCard, PlayCircle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface ApLedger {
  id: string; apNo: string; poNo?: string;
  supplierName?: string; currencyCode?: string;
  amountOriginal: number; paidAmountOriginal: number; balanceAmountOriginal: number;
  status: string; dueDate?: string;
  companyCode?: string; projectCode?: string;
}
interface Allocation {
  id?: string; poId?: string; poNo?: string; apId?: string; apNo?: string;
  companyCode?: string; companyName?: string;
  projectCode?: string; projectName?: string;
  allocatedAmountOriginal: number | string; allocatedAmountBase?: number | string;
  remark?: string;
}
interface Approval {
  id: string; action: string; approvalNode: string;
  approverName?: string; comment?: string; createdAt: string;
}
interface Payment {
  id: string; payNo: string; paymentDate?: string;
  companyCode?: string; companyName?: string;
  projectCode?: string; projectName?: string;
  payerType: string; payerName: string; payerAccount?: string;
  payeeName?: string;
  currencyCode: string; amountOriginal: number | string;
  exchangeRate: number | string; amountBase?: number | string; baseCurrency?: string;
  paymentMethod?: string; fundNature?: string;
  isShareholderPayment?: boolean;
  shareholderId?: string; shareholderName?: string;
  status: string; voucherUrl?: string; remark?: string;
  createdAt: string; allocations?: Allocation[]; approvals?: Approval[];
}
interface PageResult { items: Payment[]; total: number; page: number; pageSize: number; }

// ── 常量 ──────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: "草稿",   cls: "badgeNeutral" },
  SUBMITTED: { label: "待审批", cls: "badgeInfo"    },
  APPROVED:  { label: "已审批", cls: "badgeWarning" },
  PAID:      { label: "已付款", cls: "badgeSuccess" },
  CANCELLED: { label: "已取消", cls: "badgeNeutral" },
};
const PAYER_TYPE_OPTS  = ["COMPANY","SHAREHOLDER","BORROW","INTERNAL"];
const PAY_METHOD_OPTS  = ["BANK","CASH","TRANSFER","ALIPAY","WECHAT"];
const FUND_NATURE_OPTS = ["INVESTMENT","LOAN","ADVANCE","NORMAL"];
const CURRENCY_OPTS    = ["CNY","LAK","THB","USD"];
const API_PAY = "/api/v2/procurement/payments";

const emptyAlloc = (): Allocation => ({
  allocatedAmountOriginal: "", allocatedAmountBase: "",
  poNo: "", apId: "", apNo: "",
});

function fmtAmt(v?: number | string, cur = "CNY") {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${cur} ${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d?: string) { return d ? d.slice(0, 10) : "—"; }

const inlineInput: React.CSSProperties = {
  flex: "1 1 180px", padding: "8px 12px",
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 13, outline: "none",
};
const inlineSelect: React.CSSProperties = { ...inlineInput, flex: "0 0 auto" };
const thStyle: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "5px 8px", verticalAlign: "middle", fontSize: 12 };
const cellInp: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 4,
  background: "var(--bg-input,var(--bg-card))", color: "var(--text-primary)",
  padding: "3px 6px", fontSize: 12, outline: "none",
};

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const toast = useToast();

  const [data, setData]       = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  const [fStatus, setFStatus]           = useState("");
  const [fPayerType, setFPayerType]     = useState("");
  const [fCurrency, setFCurrency]       = useState("");
  const [fKeyword, setFKeyword]         = useState("");
  const [fDateFrom, setFDateFrom]       = useState("");
  const [fDateTo, setFDateTo]           = useState("");

  // 新建/编辑抽屉
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [editing, setEditing]           = useState<Payment | null>(null);
  const [saving, setSaving]             = useState(false);

  // 表单字段
  const [formDate, setFormDate]         = useState("");
  const [formCompCode, setFormCompCode] = useState("");
  const [formCompName, setFormCompName] = useState("");
  const [formProjCode, setFormProjCode] = useState("");
  const [formProjName, setFormProjName] = useState("");
  const [formPayerType, setFormPayerType] = useState("COMPANY");
  const [formPayerName, setFormPayerName] = useState("");
  const [formPayerAccount, setFormPayerAccount] = useState("");
  const [formPayeeName, setFormPayeeName] = useState("");
  const [formCurrency, setFormCurrency] = useState("CNY");
  const [formExchangeRate, setFormExchangeRate] = useState("1");
  const [formMethod, setFormMethod]     = useState("BANK");
  const [formNature, setFormNature]     = useState("NORMAL");
  const [formIsShareholder, setFormIsShareholder] = useState(false);
  const [formShareholderId, setFormShareholderId] = useState("");
  const [formShareholderName, setFormShareholderName] = useState("");
  const [formVoucherUrl, setFormVoucherUrl] = useState("");
  const [formRemark, setFormRemark]     = useState("");
  const [formAllocs, setFormAllocs]     = useState<Allocation[]>([emptyAlloc()]);

  // 详情抽屉
  const [detailOpen, setDetailOpen]     = useState(false);
  const [detailData, setDetailData]     = useState<Payment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作弹窗
  const [approveOpen, setApproveOpen]   = useState(false);
  const [payOpen, setPayOpen]           = useState(false);
  const [rejectOpen, setRejectOpen]     = useState(false);
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [actionTarget, setActionTarget] = useState<Payment | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // AP 选择弹窗
  const [apModalOpen, setApModalOpen]   = useState(false);
  const [apList, setApList]             = useState<ApLedger[]>([]);
  const [apAllocIdx, setApAllocIdx]     = useState(0);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 加载列表
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (fStatus)   params.set("status",          fStatus);
      if (fPayerType) params.set("payerType",       fPayerType);
      if (fCurrency) params.set("currencyCode",     fCurrency);
      if (fKeyword)  params.set("keyword",          fKeyword);
      if (fDateFrom) params.set("paymentDateFrom",  fDateFrom);
      if (fDateTo)   params.set("paymentDateTo",    fDateTo);
      const res = await fetch(`${API_PAY}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [page, fStatus, fPayerType, fCurrency, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [fStatus, fPayerType, fCurrency, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  // 打开新建
  function openNew() {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setFormDate(today); setFormCompCode(""); setFormCompName("");
    setFormProjCode(""); setFormProjName("");
    setFormPayerType("COMPANY"); setFormPayerName(""); setFormPayerAccount("");
    setFormPayeeName(""); setFormCurrency("CNY"); setFormExchangeRate("1");
    setFormMethod("BANK"); setFormNature("NORMAL");
    setFormIsShareholder(false); setFormShareholderId(""); setFormShareholderName("");
    setFormVoucherUrl(""); setFormRemark("");
    setFormAllocs([emptyAlloc()]);
    setDrawerOpen(true);
  }

  // 打开编辑
  async function openEdit(row: Payment) {
    setEditing(row);
    setFormDate(row.paymentDate ?? ""); setFormCompCode(row.companyCode ?? "");
    setFormCompName(row.companyName ?? ""); setFormProjCode(row.projectCode ?? "");
    setFormProjName(row.projectName ?? ""); setFormPayerType(row.payerType ?? "COMPANY");
    setFormPayerName(row.payerName ?? ""); setFormPayerAccount(row.payerAccount ?? "");
    setFormPayeeName(row.payeeName ?? ""); setFormCurrency(row.currencyCode ?? "CNY");
    setFormExchangeRate(String(row.exchangeRate ?? "1"));
    setFormMethod(row.paymentMethod ?? "BANK"); setFormNature(row.fundNature ?? "NORMAL");
    setFormIsShareholder(row.isShareholderPayment ?? false);
    setFormShareholderId(row.shareholderId ?? ""); setFormShareholderName(row.shareholderName ?? "");
    setFormVoucherUrl(row.voucherUrl ?? ""); setFormRemark(row.remark ?? "");
    try {
      const res = await fetch(`${API_PAY}/${row.id}`, { headers: hdr });
      if (res.ok) {
        const d: Payment = await res.json();
        setFormAllocs(d.allocations?.length ? d.allocations.map(a => ({ ...a })) : [emptyAlloc()]);
      }
    } catch { setFormAllocs([emptyAlloc()]); }
    setDrawerOpen(true);
  }

  // 分摊行操作
  function setAllocField(idx: number, field: keyof Allocation, value: string) {
    setFormAllocs(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  }
  function addAllocRow() { setFormAllocs(p => [...p, emptyAlloc()]); }
  function removeAllocRow(idx: number) {
    setFormAllocs(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p);
  }
  const totalAllocOriginal = formAllocs.reduce((s, a) => s + (parseFloat(String(a.allocatedAmountOriginal)) || 0), 0);

  // 保存
  async function handleSave() {
    if (!formDate)            { toast.error("请选择付款日期"); return; }
    if (!formPayerName.trim()) { toast.error("请填写付款人"); return; }
    if (!formCurrency)        { toast.error("请选择货币"); return; }
    if (formAllocs.some(a => !a.allocatedAmountOriginal || parseFloat(String(a.allocatedAmountOriginal)) <= 0))
      { toast.error("每条分摊金额必须 > 0"); return; }

    setSaving(true);
    try {
      const rate = parseFloat(formExchangeRate) || 1;
      const body = {
        paymentDate: formDate,
        companyCode: formCompCode.trim() || undefined,
        companyName: formCompName.trim() || undefined,
        projectCode: formProjCode.trim() || undefined,
        projectName: formProjName.trim() || undefined,
        payerType: formPayerType, payerName: formPayerName.trim(),
        payerAccount: formPayerAccount.trim() || undefined,
        payeeName: formPayeeName.trim() || undefined,
        currencyCode: formCurrency, exchangeRate: rate,
        paymentMethod: formMethod, fundNature: formNature,
        isShareholderPayment: formIsShareholder,
        shareholderId:   formIsShareholder ? formShareholderId.trim() || undefined : undefined,
        shareholderName: formIsShareholder ? formShareholderName.trim() || undefined : undefined,
        voucherUrl: formVoucherUrl.trim() || undefined,
        remark: formRemark.trim() || undefined,
        allocations: formAllocs.map(a => ({
          poId:  a.poId  || undefined, poNo:  a.poNo  || undefined,
          apId:  a.apId  || undefined, apNo:  a.apNo  || undefined,
          projectCode: a.projectCode || undefined, projectName: a.projectName || undefined,
          allocatedAmountOriginal: parseFloat(String(a.allocatedAmountOriginal)),
          allocatedAmountBase: parseFloat(String(a.allocatedAmountOriginal)) * rate,
          remark: a.remark || undefined,
        })),
      };
      const url    = editing ? `${API_PAY}/${editing.id}` : API_PAY;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: hdr, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "保存失败"); }
      toast.success(editing ? "保存成功" : "付款单已创建");
      setDrawerOpen(false); load(editing ? page : 1); if (!editing) setPage(1);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  // 详情
  async function openDetail(row: Payment) {
    setDetailData(row); setDetailOpen(true); setDetailLoading(true);
    try {
      const res = await fetch(`${API_PAY}/${row.id}`, { headers: hdr });
      if (res.ok) setDetailData(await res.json());
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  // 提交
  async function handleSubmit(row: Payment) {
    try {
      const res = await fetch(`${API_PAY}/${row.id}/submit`, { method: "POST", headers: hdr, body: JSON.stringify({}) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "提交失败"); }
      toast.success("已提交审批"); load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "提交失败"); }
  }

  // 操作弹窗
  function openApprove(row: Payment) { setActionTarget(row); setActionComment(""); setApproveOpen(true); }
  function openPay(row: Payment)     { setActionTarget(row); setActionComment(""); setPayOpen(true); }
  function openReject(row: Payment)  { setActionTarget(row); setActionComment(""); setRejectOpen(true); }
  function openCancel(row: Payment)  { setActionTarget(row); setActionComment(""); setCancelOpen(true); }

  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_PAY}/${actionTarget.id}/${endpoint}`, {
        method: "POST", headers: hdr, body: JSON.stringify({ comment }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "操作失败"); }
      toast.success(msg);
      setApproveOpen(false); setPayOpen(false); setRejectOpen(false); setCancelOpen(false);
      load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "操作失败"); }
    finally { setActionSubmitting(false); }
  }

  // 加载未核销 AP
  async function openApModal(idx: number) {
    setApAllocIdx(idx);
    try {
      const res = await fetch(`/api/v2/procurement/ap-ledger/open`, { headers: hdr });
      if (res.ok) setApList(await res.json());
    } catch { setApList([]); }
    setApModalOpen(true);
  }

  function selectAp(ap: ApLedger) {
    setFormAllocs(prev => prev.map((a, i) => i === apAllocIdx ? {
      ...a,
      apId: ap.id, apNo: ap.apNo,
      poNo: ap.poNo ?? "",
      projectCode: ap.projectCode ?? "",
      allocatedAmountOriginal: String(ap.balanceAmountOriginal),
    } : a));
    setApModalOpen(false);
  }

  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="付款管理"
        subtitle={`采购资金付款台账 · 共 ${data.total} 条`}
        breadcrumb={["采购 V2", "付款管理"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={() => load(page)} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> 新建付款单
            </button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)}
          placeholder="付款单号 / 付款人 / 备注" style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fPayerType} onChange={e => setFPayerType(e.target.value)} style={inlineSelect}>
          <option value="">全部付款方</option>
          {PAYER_TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={inlineSelect}>
          <option value="">全部货币</option>
          {CURRENCY_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>付款日：</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>~</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
      </div>

      {/* 列表 */}
      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>付款单号</th>
              <th>付款日期</th>
              <th>公司</th>
              <th>付款方</th>
              <th>付款人</th>
              <th>货币</th>
              <th style={{ textAlign: "right" }}>付款金额</th>
              <th>汇率</th>
              <th>方式</th>
              <th>状态</th>
              <th style={{ textAlign: "center" }}>股东代付</th>
              <th style={{ width: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无数据</td></tr>
            ) : data.items.map(row => {
              const st = STATUS_MAP[row.status] ?? { label: row.status, cls: "badgeNeutral" };
              return (
                <tr key={row.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.payNo}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(row.paymentDate)}</td>
                  <td>{row.companyCode ?? "—"}</td>
                  <td style={{ fontSize: 11 }}>
                    <span className={`${s.badge} ${s.badgeNeutral}`}>{row.payerType}</span>
                  </td>
                  <td>{row.payerName}</td>
                  <td>{row.currencyCode}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtAmt(row.amountOriginal, row.currencyCode)}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{row.exchangeRate}</td>
                  <td>{row.paymentMethod ?? "—"}</td>
                  <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
                  <td style={{ textAlign: "center" }}>
                    {row.isShareholderPayment && (
                      <span className={`${s.badge} ${s.badgeWarning}`}>股东</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button className={s.btnIcon} title="查看详情" onClick={() => openDetail(row)}>
                        <Eye size={13} />
                      </button>
                      {row.status === "DRAFT" && (
                        <>
                          <button className={s.btnIcon} title="编辑" onClick={() => openEdit(row)}>
                            <Pencil size={13} />
                          </button>
                          <button className={s.btnIcon} title="提交审批"
                            style={{ borderColor: "#22c55e", color: "#22c55e" }}
                            onClick={() => handleSubmit(row)}>
                            <Send size={13} />
                          </button>
                        </>
                      )}
                      {row.status === "SUBMITTED" && (
                        <>
                          <button className={s.btnIcon} title="审批通过"
                            style={{ borderColor: "#22c55e", color: "#22c55e" }}
                            onClick={() => openApprove(row)}>
                            <CheckCircle size={13} />
                          </button>
                          <button className={s.btnIconDanger} title="拒绝" onClick={() => openReject(row)}>
                            <XCircle size={13} />
                          </button>
                        </>
                      )}
                      {row.status === "APPROVED" && (
                        <button className={s.btnIcon} title="确认付款"
                          style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }}
                          onClick={() => openPay(row)}>
                          <PlayCircle size={13} />
                        </button>
                      )}
                      {(row.status === "DRAFT" || row.status === "SUBMITTED") && (
                        <button className={s.btnIconDanger} title="取消" onClick={() => openCancel(row)}>
                          <Trash2 size={13} />
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

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>共 {data.total} 条</span>
          <button className={s.btnIcon} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 12, minWidth: 60, textAlign: "center" }}>{page} / {totalPages}</span>
          <button className={s.btnIcon} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
        </div>
      )}

      {/* ── 新建/编辑抽屉 ───────────────────────────────────────────────────── */}
      <RightDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={editing ? `编辑付款单：${editing.payNo}` : "新建付款单"} width={800}>
        <div style={{ padding: "0 4px 80px" }}>

          {/* 基础信息 */}
          <div className={s.formSection}>基础信息</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>付款日期 *</label>
              <input type="date" className={s.inp} value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>货币 *</label>
              <select className={s.inp} value={formCurrency} onChange={e => setFormCurrency(e.target.value)}>
                {CURRENCY_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>公司代码</label>
              <input className={s.inp} value={formCompCode} onChange={e => setFormCompCode(e.target.value)} placeholder="PHX_AGRI" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>公司名称</label>
              <input className={s.inp} value={formCompName} onChange={e => setFormCompName(e.target.value)} />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>项目编码</label>
              <input className={s.inp} value={formProjCode} onChange={e => setFormProjCode(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>项目名称</label>
              <input className={s.inp} value={formProjName} onChange={e => setFormProjName(e.target.value)} />
            </div>
          </div>

          {/* 付款方信息 */}
          <div className={s.formSection} style={{ marginTop: 20 }}>付款方信息</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>付款方类型</label>
              <select className={s.inp} value={formPayerType} onChange={e => { setFormPayerType(e.target.value); setFormIsShareholder(e.target.value === "SHAREHOLDER"); }}>
                {PAYER_TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.lbl}>付款人 *</label>
              <input className={s.inp} value={formPayerName} onChange={e => setFormPayerName(e.target.value)} placeholder="付款人姓名/账户名" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>付款账户</label>
              <input className={s.inp} value={formPayerAccount} onChange={e => setFormPayerAccount(e.target.value)} placeholder="银行账号/支付宝" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>收款方</label>
              <input className={s.inp} value={formPayeeName} onChange={e => setFormPayeeName(e.target.value)} placeholder="收款方名称（供应商）" />
            </div>
          </div>

          {/* 金额 & 方式 */}
          <div className={s.formSection} style={{ marginTop: 20 }}>金额 &amp; 方式</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>汇率（对 CNY）</label>
              <input type="number" step="0.0001" min="0" className={s.inp} value={formExchangeRate} onChange={e => setFormExchangeRate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>付款方式</label>
              <select className={s.inp} value={formMethod} onChange={e => setFormMethod(e.target.value)}>
                {PAY_METHOD_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>资金性质</label>
              <select className={s.inp} value={formNature} onChange={e => setFormNature(e.target.value)}>
                {FUND_NATURE_OPTS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.lbl}>凭证 URL</label>
              <input className={s.inp} value={formVoucherUrl} onChange={e => setFormVoucherUrl(e.target.value)} placeholder="付款凭证图片链接" />
            </div>
          </div>

          {/* 股东代付 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
            <input type="checkbox" id="isShareholder" checked={formIsShareholder}
              onChange={e => setFormIsShareholder(e.target.checked)} />
            <label htmlFor="isShareholder" style={{ fontSize: 13, cursor: "pointer" }}>
              股东代付（自动记录股东资金池）
            </label>
          </div>
          {formIsShareholder && (
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>股东 ID</label>
                <input className={s.inp} value={formShareholderId} onChange={e => setFormShareholderId(e.target.value)} />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>股东姓名</label>
                <input className={s.inp} value={formShareholderName} onChange={e => setFormShareholderName(e.target.value)} />
              </div>
            </div>
          )}

          <div className={s.field}>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={1} value={formRemark} onChange={e => setFormRemark(e.target.value)} />
          </div>

          {/* 分摊行 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 20 }}>
            <span className={s.formSection} style={{ margin: 0 }}>AP 分摊明细（{formAllocs.length} 行）</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className={s.btnSecondary}
                style={{ padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                onClick={addAllocRow}><Plus size={12} /> 添加行</button>
            </div>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-subtle,var(--bg-muted))" }}>
                  <th style={thStyle}>AP 编号</th>
                  <th style={thStyle}>PO 编号</th>
                  <th style={thStyle}>项目</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>分摊金额（{formCurrency}）</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>折算 CNY</th>
                  <th style={thStyle}>备注</th>
                  <th style={{ ...thStyle, width: 50 }}>AP</th>
                  <th style={{ ...thStyle, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {formAllocs.map((alloc, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <input style={{ ...cellInp, background: "var(--bg-muted)", cursor: "default" }} value={alloc.apNo ?? ""} readOnly placeholder="—" />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInp, width: 120 }} value={alloc.poNo ?? ""}
                        onChange={e => setAllocField(idx, "poNo", e.target.value)} placeholder="PO2-..." />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInp, width: 80 }} value={alloc.projectCode ?? ""}
                        onChange={e => setAllocField(idx, "projectCode", e.target.value)} placeholder="项目" />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInp, width: 100, textAlign: "right" }} type="number" min="0"
                        value={alloc.allocatedAmountOriginal}
                        onChange={e => setAllocField(idx, "allocatedAmountOriginal", e.target.value)} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>
                      {((parseFloat(String(alloc.allocatedAmountOriginal)) || 0) * (parseFloat(formExchangeRate) || 1)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInp, width: 80 }} value={alloc.remark ?? ""}
                        onChange={e => setAllocField(idx, "remark", e.target.value)} placeholder="备注" />
                    </td>
                    <td style={tdStyle}>
                      <button type="button" className={s.btnIcon} style={{ fontSize: 11, padding: "2px 6px" }}
                        onClick={() => openApModal(idx)} title="从未核销 AP 选择">
                        <CreditCard size={11} />
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444" }}
                        onClick={() => removeAllocRow(idx)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: 12 }}>合计</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formCurrency} {totalAllocOriginal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                    CNY {(totalAllocOriginal * (parseFloat(formExchangeRate) || 1)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={s.drawerFooter}>
            <button type="button" className={s.btnSecondary} onClick={() => setDrawerOpen(false)}>取消</button>
            <button type="button" className={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存草稿"}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 详情抽屉 ──────────────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)}
        title={detailData ? `付款详情：${detailData.payNo}` : "详情"} width={680}>
        {detailLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</div>
        ) : detailData ? (
          <div style={{ padding: "0 4px" }}>
            <div className={s.formSection}>基础信息</div>
            {[
              { label: "付款单号", value: detailData.payNo, mono: true },
              { label: "付款日期", value: fmtDate(detailData.paymentDate) },
              { label: "公司",     value: detailData.companyCode ? `${detailData.companyCode} ${detailData.companyName ?? ""}` : "—" },
              { label: "付款方",  value: `${detailData.payerType} / ${detailData.payerName}` },
              { label: "收款方",  value: detailData.payeeName ?? "—" },
              { label: "金额",    value: fmtAmt(detailData.amountOriginal, detailData.currencyCode) },
              { label: "汇率",    value: `${detailData.exchangeRate} → CNY ${fmtAmt(detailData.amountBase, "CNY")}` },
              { label: "方式",    value: detailData.paymentMethod ?? "—" },
              { label: "备注",    value: detailData.remark ?? "—" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ width: 72, flexShrink: 0, color: "var(--text-secondary)", fontSize: 12 }}>{r.label}</span>
                <span style={{ flex: 1, fontFamily: r.mono ? "monospace" : undefined }}>{r.value}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <span className={`${s.badge} ${s[STATUS_MAP[detailData.status]?.cls ?? "badgeNeutral"]}`}>
                {STATUS_MAP[detailData.status]?.label ?? detailData.status}
              </span>
              {detailData.isShareholderPayment && <span className={`${s.badge} ${s.badgeWarning}`}>股东代付</span>}
              {detailData.fundNature && <span className={`${s.badge} ${s.badgeInfo}`}>{detailData.fundNature}</span>}
            </div>

            {/* 分摊明细 */}
            {detailData.allocations && detailData.allocations.length > 0 && (
              <>
                <div className={s.formSection} style={{ marginTop: 20 }}>AP 分摊明细（{detailData.allocations.length} 条）</div>
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-muted)" }}>
                        <th style={thStyle}>AP 编号</th>
                        <th style={thStyle}>PO 编号</th>
                        <th style={thStyle}>项目</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>分摊金额</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>折算 CNY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.allocations.map((a, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={tdStyle}>{a.apNo ?? "—"}</td>
                          <td style={tdStyle}>{a.poNo ?? "—"}</td>
                          <td style={tdStyle}>{a.projectCode ?? "—"}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {Number(a.allocatedAmountOriginal).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                            {Number(a.allocatedAmountBase ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 审批日志 */}
            {detailData.approvals && detailData.approvals.length > 0 && (
              <>
                <div className={s.formSection} style={{ marginTop: 20 }}>审批日志</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detailData.approvals.map(log => (
                    <div key={log.id} style={{
                      background: "var(--bg-muted)", borderRadius: 6, padding: "8px 12px", border: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(log.action)}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{log.approverName ?? "系统"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
                          <Clock size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {log.comment && <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{log.comment}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </RightDrawer>

      {/* ── AP 选择弹窗 ────────────────────────────────────────────────────────── */}
      {apModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setApModalOpen(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 20, width: 640, maxHeight: "70vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              <DollarSign size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />选择未核销 AP
            </div>
            {apList.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)" }}>暂无未核销 AP</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-muted)" }}>
                    <th style={thStyle}>AP 编号</th>
                    <th style={thStyle}>PO 编号</th>
                    <th style={thStyle}>供应商</th>
                    <th style={thStyle}>币种</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>应付</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>余额</th>
                    <th style={thStyle}>到期日</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {apList.map(ap => (
                    <tr key={ap.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={tdStyle}>{ap.apNo}</td>
                      <td style={tdStyle}>{ap.poNo ?? "—"}</td>
                      <td style={tdStyle}>{ap.supplierName ?? "—"}</td>
                      <td style={tdStyle}>{ap.currencyCode ?? "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{Number(ap.amountOriginal).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#f59e0b", fontWeight: 600 }}>
                        {Number(ap.balanceAmountOriginal).toLocaleString()}
                      </td>
                      <td style={tdStyle}>{fmtDate(ap.dueDate)}</td>
                      <td style={tdStyle}>
                        <button className={s.btnPrimary} style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => selectAp(ap)}>选择</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── 操作弹窗 ──────────────────────────────────────────────────────────── */}
      <SimpleModal open={approveOpen} onClose={() => setApproveOpen(false)} title="审批通过">
        <p style={{ fontSize: 13, margin: "8px 0" }}>确认审批通过 <strong>{actionTarget?.payNo}</strong>？</p>
        <textarea className={s.textarea} rows={2} placeholder="审批意见（可选）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setApproveOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting}
            onClick={() => execAction("approve", actionComment, "审批通过")}>
            {actionSubmitting ? "处理中…" : "确认通过"}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={payOpen} onClose={() => setPayOpen(false)} title="确认付款">
        <p style={{ fontSize: 13, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} color="#f59e0b" />
          执行付款 <strong>{actionTarget?.payNo}</strong>（{fmtAmt(actionTarget?.amountOriginal, actionTarget?.currencyCode)}）
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px" }}>
          付款后将自动核销对应 AP，此操作不可撤销。
        </p>
        <textarea className={s.textarea} rows={2} placeholder="付款备注（可选）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setPayOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting}
            style={{ background: "#8b5cf6" }}
            onClick={() => execAction("pay", actionComment, "付款执行成功，AP 已核销")}>
            {actionSubmitting ? "处理中…" : "确认付款"}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={rejectOpen} onClose={() => setRejectOpen(false)} title="拒绝付款审批">
        <textarea className={s.textarea} rows={3} placeholder="拒绝原因（必填）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setRejectOpen(false)}>取消</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting || !actionComment.trim()}
            onClick={() => execAction("cancel", actionComment, "已取消（审批拒绝）")}>
            {actionSubmitting ? "处理中…" : "确认拒绝"}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消付款单">
        <p style={{ fontSize: 13, margin: "8px 0" }}>确认取消 <strong>{actionTarget?.payNo}</strong>？</p>
        <textarea className={s.textarea} rows={2} placeholder="取消原因（可选）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setCancelOpen(false)}>取消</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting}
            onClick={() => execAction("cancel", actionComment, "已取消")}>
            {actionSubmitting ? "处理中…" : "确认取消"}
          </button>
        </div>
      </SimpleModal>
    </div>
  );
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
function SimpleModal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 20, width: 460, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={16} /> {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function actionLabel(a: string) {
  return ({ SUBMIT: "提交", APPROVE: "通过", REJECT: "拒绝", CANCEL: "取消", PAY: "付款" } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({ SUBMIT: "badgeInfo", APPROVE: "badgeSuccess", REJECT: "badgeDanger", CANCEL: "badgeNeutral", PAY: "badgeSuccess" } as Record<string, string>)[a] ?? "badgeNeutral";
}
