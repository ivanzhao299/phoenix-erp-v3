"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, FileText, CheckCircle, XCircle, Trash2, Send,
  Eye, ChevronLeft, ChevronRight, Pencil, GitMerge, Clock, AlertTriangle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface OrderItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  qty: number | string;
  unit?: string;
  unitPrice: number | string;
  amount?: number | string;
  warehouseCode?: string;
  usageDesc?: string;
  projectCode?: string;
  projectName?: string;
}
interface ApLedger {
  id: string;
  apNo: string;
  amountOriginal: number | string;
  paidAmountOriginal: number | string;
  balanceAmountOriginal: number | string;
  status: string;
  dueDate?: string;
  currencyCode?: string;
}
interface Approval {
  id: string;
  action: string;
  approvalNode: string;
  approverName?: string;
  comment?: string;
  createdAt: string;
}
interface PurchaseOrder {
  id: string;
  poNo: string;
  subject: string;
  status: string;
  approvalStatus: string;
  companyCode: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  supplierCode: string;
  supplierName?: string;
  purchaseType?: string;
  crossBorderFlag?: boolean;
  currencyCode?: string;
  totalAmount?: number | string;
  planQty?: number | string;
  receivedQty?: number | string;
  expectedDate?: string;
  payDeadline?: string;
  sourceReqNo?: string;
  contractNo?: string;
  contractUrl?: string;
  contractNote?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: OrderItem[];
  approvals?: Approval[];
  apLedger?: ApLedger | null;
}
interface PageResult { items: PurchaseOrder[]; total: number; page: number; pageSize: number; }
interface ApprovedPR {
  id: string;
  reqNo: string;
  subject: string;
  companyCode: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  estimatedAmount?: number | string;
  currencyCode?: string;
  purchaseType?: string;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:             { label: "草稿",   cls: "badgeNeutral" },
  SUBMITTED:         { label: "待审批", cls: "badgeInfo"    },
  APPROVED:          { label: "已批准", cls: "badgeSuccess" },
  REJECTED:          { label: "已拒绝", cls: "badgeDanger"  },
  CANCELLED:         { label: "已取消", cls: "badgeNeutral" },
  PARTIALLY_PAID:    { label: "部分付款", cls: "badgeWarning" },
  PAID:              { label: "已付款", cls: "badgeSuccess" },
  IN_TRANSIT:        { label: "运输中", cls: "badgeInfo"    },
  PARTIALLY_RECEIVED:{ label: "部分收货", cls: "badgeWarning" },
  RECEIVED:          { label: "已收货", cls: "badgeSuccess" },
  CLOSED:            { label: "已关闭", cls: "badgeNeutral" },
};
const PURCHASE_TYPE_OPTS = [
  { value: "MATERIAL",    label: "原料/物料" },
  { value: "EQUIPMENT",   label: "设备/机械" },
  { value: "SERVICE",     label: "服务/外包" },
  { value: "FIXED_ASSET", label: "固定资产"  },
  { value: "OTHER",       label: "其他"      },
];
const CURRENCY_OPTS = ["LAK", "CNY", "THB", "USD"];
const COUNTRY_OPTS = [
  { value: "LA", label: "老挝" }, { value: "CN", label: "中国" },
  { value: "TH", label: "泰国" }, { value: "VN", label: "越南" },
  { value: "US", label: "美国" }, { value: "OTHER", label: "其他" },
];
const API_ORDERS = "/api/v2/procurement/orders";
const API_REQUESTS = "/api/v2/procurement/requests";

const emptyItem = (): OrderItem => ({ itemName: "", qty: "", unit: "kg", unitPrice: "", amount: "" });

function fmtAmt(v?: number | string, currency = "LAK") {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d?: string) { return d ? d.slice(0, 10) : "—"; }

const inlineInput: React.CSSProperties = {
  flex: "1 1 160px", padding: "8px 12px",
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 13, outline: "none",
};
const inlineSelect: React.CSSProperties = { ...inlineInput, flex: "0 0 auto" };
const thStyle: React.CSSProperties = {
  padding: "5px 6px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "4px 6px", verticalAlign: "middle" };
const cellInp: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 4,
  background: "var(--bg-card)", color: "var(--text-primary)", padding: "3px 6px", fontSize: 12, outline: "none",
};

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const toast = useToast();

  const [data, setData]       = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);

  // 筛选
  const [fStatus, setFStatus]     = useState("");
  const [fType, setFType]         = useState("");
  const [fCross, setFCross]       = useState("");
  const [fKeyword, setFKeyword]   = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo]     = useState("");

  // 新建/编辑 抽屉
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<PurchaseOrder | null>(null);
  const [saving, setSaving]         = useState(false);
  // 表单字段
  const [fSubject, setFSubject]   = useState("");
  const [fCompanyCode, setFCompanyCode] = useState("");
  const [fCompanyName, setFCompanyName] = useState("");
  const [fProjectCode, setFProjectCode] = useState("");
  const [fProjectName, setFProjectName] = useState("");
  const [fSupplierCode, setFSupplierCode] = useState("");
  const [fSupplierName, setFSupplierName] = useState("");
  const [fPurchaseType, setFPurchaseType] = useState("MATERIAL");
  const [fCurrencyCode, setFCurrencyCode] = useState("LAK");
  const [fExpDate, setFExpDate]   = useState("");
  const [fPayDeadline, setFPayDeadline] = useState("");
  const [fCrossBorder, setFCrossBorder] = useState(false);
  const [fOrigin, setFOrigin]     = useState("");
  const [fDest, setFDest]         = useState("LA");
  const [fContractNo, setFContractNo] = useState("");
  const [fContractUrl, setFContractUrl] = useState("");
  const [fContractNote, setFContractNote] = useState("");
  const [fRemark, setFRemark]     = useState("");
  const [formItems, setFormItems] = useState<OrderItem[]>([emptyItem()]);

  // 详情抽屉
  const [detailOpen, setDetailOpen]   = useState(false);
  const [detailData, setDetailData]   = useState<PurchaseOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作对话框
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [cancelOpen, setCancelOpen]   = useState(false);
  const [actionTarget, setActionTarget] = useState<PurchaseOrder | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // PR 转 PO 弹窗
  const [convertOpen, setConvertOpen] = useState(false);
  const [approvedPRs, setApprovedPRs] = useState<ApprovedPR[]>([]);
  const [selectedPRId, setSelectedPRId] = useState("");
  const [convSupplierCode, setConvSupplierCode] = useState("");
  const [convSupplierName, setConvSupplierName] = useState("");
  const [convExpDate, setConvExpDate] = useState("");
  const [convPayDeadline, setConvPayDeadline] = useState("");
  const [convCrossBorder, setConvCrossBorder] = useState(false);
  const [convRemark, setConvRemark]   = useState("");
  const [converting, setConverting]   = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (fStatus)   params.set("status",           fStatus);
      if (fType)     params.set("purchaseType",      fType);
      if (fCross)    params.set("crossBorderFlag",   fCross);
      if (fKeyword)  params.set("keyword",           fKeyword);
      if (fDateFrom) params.set("expectedDateFrom",  fDateFrom);
      if (fDateTo)   params.set("expectedDateTo",    fDateTo);
      const res = await fetch(`${API_ORDERS}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [page, fStatus, fType, fCross, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [fStatus, fType, fCross, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  function resetForm() {
    setFSubject(""); setFCompanyCode(""); setFCompanyName("");
    setFProjectCode(""); setFProjectName("");
    setFSupplierCode(""); setFSupplierName("");
    setFPurchaseType("MATERIAL"); setFCurrencyCode("LAK");
    setFExpDate(""); setFPayDeadline(""); setFCrossBorder(false);
    setFOrigin("CN"); setFDest("LA");
    setFContractNo(""); setFContractUrl(""); setFContractNote(""); setFRemark("");
    setFormItems([emptyItem()]);
  }

  function openNew() { setEditing(null); resetForm(); setDrawerOpen(true); }

  async function openEdit(row: PurchaseOrder) {
    setEditing(row);
    setFSubject(row.subject ?? "");
    setFCompanyCode(row.companyCode ?? "");
    setFCompanyName(row.companyName ?? "");
    setFProjectCode(row.projectCode ?? "");
    setFProjectName(row.projectName ?? "");
    setFSupplierCode(row.supplierCode ?? "");
    setFSupplierName(row.supplierName ?? "");
    setFPurchaseType(row.purchaseType ?? "MATERIAL");
    setFCurrencyCode(row.currencyCode ?? "LAK");
    setFExpDate(row.expectedDate ?? "");
    setFPayDeadline(row.payDeadline ?? "");
    setFCrossBorder(row.crossBorderFlag ?? false);
    setFContractNo(row.contractNo ?? "");
    setFContractUrl(row.contractUrl ?? "");
    setFContractNote(row.contractNote ?? "");
    setFRemark(row.remark ?? "");
    try {
      const res = await fetch(`${API_ORDERS}/${row.id}`, { headers: hdr });
      if (res.ok) {
        const d: PurchaseOrder = await res.json();
        setFormItems(d.items?.length ? d.items.map(i => ({ ...i })) : [emptyItem()]);
      }
    } catch { setFormItems([emptyItem()]); }
    setDrawerOpen(true);
  }

  function setItemField(idx: number, field: keyof OrderItem, value: string) {
    setFormItems(prev => {
      const next = prev.map((it, i) => i === idx ? { ...it, [field]: value } : it);
      if (field === "qty" || field === "unitPrice") {
        const it   = next[idx];
        const qty  = parseFloat(String(it.qty))       || 0;
        const price= parseFloat(String(it.unitPrice)) || 0;
        next[idx]  = { ...it, amount: String(Math.round(qty * price * 100) / 100) };
      }
      return next;
    });
  }

  async function handleSave() {
    if (!fSubject.trim())      { toast.error("请填写采购主题"); return; }
    if (!fCompanyCode.trim())  { toast.error("请填写公司代码"); return; }
    if (!fSupplierCode.trim()) { toast.error("请填写供应商代码"); return; }
    if (formItems.some(it => !it.itemName.trim())) { toast.error("物品名称不能为空"); return; }
    if (formItems.some(it => !it.qty || parseFloat(String(it.qty)) <= 0)) { toast.error("数量必须大于0"); return; }
    setSaving(true);
    try {
      const body = {
        subject: fSubject.trim(), companyCode: fCompanyCode.trim(), companyName: fCompanyName.trim(),
        projectCode: fProjectCode.trim() || undefined, projectName: fProjectName.trim() || undefined,
        supplierCode: fSupplierCode.trim(), supplierName: fSupplierName.trim(),
        purchaseType: fPurchaseType, currencyCode: fCurrencyCode,
        expectedDate: fExpDate || undefined, payDeadline: fPayDeadline || undefined,
        crossBorderFlag: fCrossBorder,
        originCountry: fCrossBorder ? fOrigin : undefined,
        destinationCountry: fCrossBorder ? fDest : undefined,
        contractNo: fContractNo.trim() || undefined, contractUrl: fContractUrl.trim() || undefined,
        contractNote: fContractNote.trim() || undefined, remark: fRemark.trim() || undefined,
        items: formItems.map(it => ({
          itemCode:    it.itemCode?.trim() || undefined,
          itemName:    it.itemName.trim(),
          spec:        it.spec?.trim() || undefined,
          qty:         parseFloat(String(it.qty)),
          unit:        it.unit?.trim() || undefined,
          unitPrice:   parseFloat(String(it.unitPrice)) || 0,
          amount:      parseFloat(String(it.amount))    || 0,
          warehouseCode: it.warehouseCode?.trim() || undefined,
        })),
      };
      const url    = editing ? `${API_ORDERS}/${editing.id}` : API_ORDERS;
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: hdr, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "保存失败"); }
      toast.success(editing ? "保存成功" : "采购订单已创建");
      setDrawerOpen(false);
      load(editing ? page : 1);
      if (!editing) setPage(1);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  async function openDetail(row: PurchaseOrder) {
    setDetailData(row); setDetailOpen(true); setDetailLoading(true);
    try {
      const res = await fetch(`${API_ORDERS}/${row.id}`, { headers: hdr });
      if (res.ok) setDetailData(await res.json());
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  async function handleSubmit(row: PurchaseOrder) {
    try {
      const res = await fetch(`${API_ORDERS}/${row.id}/submit`, {
        method: "POST", headers: hdr, body: JSON.stringify({ comment: "" }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "提交失败"); }
      toast.success("已提交审批"); load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "提交失败"); }
  }

  function openApprove(row: PurchaseOrder) { setActionTarget(row); setActionComment(""); setApproveOpen(true); }
  function openReject(row: PurchaseOrder)  { setActionTarget(row); setActionComment(""); setRejectOpen(true); }
  function openCancel(row: PurchaseOrder)  { setActionTarget(row); setActionComment(""); setCancelOpen(true); }

  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_ORDERS}/${actionTarget.id}/${endpoint}`, {
        method: "POST", headers: hdr, body: JSON.stringify({ comment }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "操作失败"); }
      toast.success(msg);
      setApproveOpen(false); setRejectOpen(false); setCancelOpen(false);
      load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "操作失败"); }
    finally { setActionSubmitting(false); }
  }

  // ── PR 转 PO ──────────────────────────────────────────────────────────────
  async function openConvert() {
    setConvSupplierCode(""); setConvSupplierName(""); setConvExpDate("");
    setConvPayDeadline(""); setConvCrossBorder(false); setConvRemark("");
    setSelectedPRId("");
    setConvertOpen(true);
    try {
      const res = await fetch(`${API_REQUESTS}?status=APPROVED&pageSize=50`, { headers: hdr });
      if (res.ok) {
        const d = await res.json();
        setApprovedPRs(d.items ?? []);
      }
    } catch { /* ignore */ }
  }

  async function handleConvert() {
    if (!selectedPRId)         { toast.error("请选择采购申请"); return; }
    if (!convSupplierCode.trim()) { toast.error("请填写供应商代码"); return; }
    if (!convSupplierName.trim()) { toast.error("请填写供应商名称"); return; }
    setConverting(true);
    try {
      const res = await fetch(`${API_REQUESTS}/${selectedPRId}/convert-to-order`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({
          supplierCode:    convSupplierCode.trim(),
          supplierName:    convSupplierName.trim(),
          expectedDate:    convExpDate || undefined,
          payDeadline:     convPayDeadline || undefined,
          crossBorderFlag: convCrossBorder,
          remark:          convRemark.trim() || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "转换失败"); }
      const po: PurchaseOrder = await res.json();
      toast.success(`已转采购订单：${po.poNo}`);
      setConvertOpen(false);
      load(1); setPage(1);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "转换失败"); }
    finally { setConverting(false); }
  }

  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="采购订单"
        subtitle={`管理所有采购订单 · 共 ${data.total} 条`}
        breadcrumb={["采购管理", "采购订单"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={openConvert}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <GitMerge size={14} /> 从采购申请转单
            </button>
            <button type="button" className={s.btnSecondary} onClick={() => load(page)} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> 新建采购订单
            </button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)}
          placeholder="关键字（采购订单号/主题/供应商）" style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={inlineSelect}>
          <option value="">全部类型</option>
          {PURCHASE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fCross} onChange={e => setFCross(e.target.value)} style={inlineSelect}>
          <option value="">全部来源</option>
          <option value="false">本地采购</option>
          <option value="true">跨境采购</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>期望到货：</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }}
          value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>~</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }}
          value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
      </div>

      {/* 表格 */}
      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>采购订单号</th>
              <th>主题</th>
              <th>公司</th>
              <th>供应商</th>
              <th>类型</th>
              <th style={{ textAlign: "center" }}>跨境</th>
              <th>币种</th>
              <th>合同金额</th>
              <th style={{ textAlign: "center" }}>行数</th>
              <th>期望到货</th>
              <th>付款截止</th>
              <th>状态</th>
              <th style={{ width: 170 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无数据</td></tr>
            ) : data.items.map(row => {
              const st = STATUS_MAP[row.status] ?? { label: row.status, cls: "badgeNeutral" };
              const typeLabel = PURCHASE_TYPE_OPTS.find(o => o.value === row.purchaseType)?.label ?? row.purchaseType ?? "—";
              return (
                <tr key={row.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.poNo}</td>
                  <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.subject}</td>
                  <td>{row.companyCode}</td>
                  <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.supplierName ?? row.supplierCode}
                  </td>
                  <td>{typeLabel}</td>
                  <td style={{ textAlign: "center" }}>
                    {row.crossBorderFlag
                      ? <span className={`${s.badge} ${s.badgeInfo}`}>跨境</span>
                      : <span className={`${s.badge} ${s.badgeNeutral}`}>本地</span>}
                  </td>
                  <td>{row.currencyCode ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {fmtAmt(row.totalAmount, row.currencyCode ?? "LAK")}
                  </td>
                  <td style={{ textAlign: "center" }}>{row.itemCount ?? "—"}</td>
                  <td>{fmtDate(row.expectedDate)}</td>
                  <td>{fmtDate(row.payDeadline)}</td>
                  <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
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
          <button className={s.btnIcon} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, minWidth: 60, textAlign: "center" }}>{page} / {totalPages}</span>
          <button className={s.btnIcon} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── 新建/编辑 抽屉 ─────────────────────────────────────────────────── */}
      <RightDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title={editing ? `编辑：${editing.poNo}` : "新建采购订单"} width={760}>
        <div style={{ padding: "0 4px 80px" }}>
          <div className={s.formSection}>基础信息</div>
          <div className={s.fieldRow}>
            <div className={s.field} style={{ gridColumn: "1 / -1" }}>
              <label className={s.lbl}>采购主题 *</label>
              <input className={s.inp} value={fSubject} onChange={e => setFSubject(e.target.value)} placeholder="采购主题" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>公司代码 *</label>
              <input className={s.inp} value={fCompanyCode} onChange={e => setFCompanyCode(e.target.value)}
                placeholder="如 PHX_AGRI" disabled={!!editing} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>公司名称 *</label>
              <input className={s.inp} value={fCompanyName} onChange={e => setFCompanyName(e.target.value)}
                placeholder="公司名称" disabled={!!editing} />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>项目编码</label>
              <input className={s.inp} value={fProjectCode} onChange={e => setFProjectCode(e.target.value)} placeholder="可选" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>项目名称</label>
              <input className={s.inp} value={fProjectName} onChange={e => setFProjectName(e.target.value)} placeholder="可选" />
            </div>
          </div>

          <div className={s.formSection} style={{ marginTop: 20 }}>供应商 & 采购属性</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>供应商代码 *</label>
              <input className={s.inp} value={fSupplierCode} onChange={e => setFSupplierCode(e.target.value)} placeholder="供应商代码" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>供应商名称 *</label>
              <input className={s.inp} value={fSupplierName} onChange={e => setFSupplierName(e.target.value)} placeholder="供应商名称" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>采购类型</label>
              <select className={s.inp} value={fPurchaseType} onChange={e => setFPurchaseType(e.target.value)}>
                {PURCHASE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.lbl}>货币</label>
              <select className={s.inp} value={fCurrencyCode} onChange={e => setFCurrencyCode(e.target.value)}>
                {CURRENCY_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>期望到货日</label>
              <input type="date" className={s.inp} value={fExpDate} onChange={e => setFExpDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>付款截止日</label>
              <input type="date" className={s.inp} value={fPayDeadline} onChange={e => setFPayDeadline(e.target.value)} />
            </div>
          </div>

          <div className={s.formSection} style={{ marginTop: 20 }}>物流信息（可选）</div>
          <div className={s.field}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={fCrossBorder} onChange={e => setFCrossBorder(e.target.checked)} />
              跨境采购
            </label>
          </div>
          {fCrossBorder && (
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>来源国家</label>
                <select className={s.inp} value={fOrigin} onChange={e => setFOrigin(e.target.value)}>
                  {COUNTRY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className={s.field}>
                <label className={s.lbl}>目的国家</label>
                <select className={s.inp} value={fDest} onChange={e => setFDest(e.target.value)}>
                  {COUNTRY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className={s.formSection} style={{ marginTop: 20 }}>合同信息（可选）</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>合同号</label>
              <input className={s.inp} value={fContractNo} onChange={e => setFContractNo(e.target.value)} placeholder="CT2-..." />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>合同文件 URL</label>
              <input className={s.inp} value={fContractUrl} onChange={e => setFContractUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>合同摘要</label>
            <textarea className={s.textarea} rows={2} value={fContractNote} onChange={e => setFContractNote(e.target.value)} />
          </div>
          <div className={s.field}>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={1} value={fRemark} onChange={e => setFRemark(e.target.value)} />
          </div>

          {/* 明细行 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8 }}>
            <span className={s.formSection} style={{ margin: 0 }}>采购明细（{formItems.length} 行）</span>
            <button type="button" className={s.btnSecondary}
              style={{ padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setFormItems(p => [...p, emptyItem()])}>
              <Plus size={12} /> 添加行
            </button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-muted)" }}>
                  <th style={thStyle}>物品名称 *</th>
                  <th style={thStyle}>规格</th>
                  <th style={thStyle}>数量 *</th>
                  <th style={thStyle}>单位</th>
                  <th style={thStyle}>单价 *</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>小计</th>
                  <th style={thStyle}>仓库</th>
                  <th style={{ ...thStyle, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdStyle}><input style={cellInp} value={it.itemName}
                      onChange={e => setItemField(idx, "itemName", e.target.value)} placeholder="物品名称" /></td>
                    <td style={tdStyle}><input style={{ ...cellInp, width: 80 }} value={it.spec ?? ""}
                      onChange={e => setItemField(idx, "spec", e.target.value)} /></td>
                    <td style={tdStyle}><input style={{ ...cellInp, width: 70 }} type="number" min="0" value={it.qty}
                      onChange={e => setItemField(idx, "qty", e.target.value)} /></td>
                    <td style={tdStyle}><input style={{ ...cellInp, width: 50 }} value={it.unit ?? ""}
                      onChange={e => setItemField(idx, "unit", e.target.value)} placeholder="kg" /></td>
                    <td style={tdStyle}><input style={{ ...cellInp, width: 90 }} type="number" min="0" value={it.unitPrice}
                      onChange={e => setItemField(idx, "unitPrice", e.target.value)} /></td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                      {it.amount ? Number(it.amount).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td style={tdStyle}><input style={{ ...cellInp, width: 70 }} value={it.warehouseCode ?? ""}
                      onChange={e => setItemField(idx, "warehouseCode", e.target.value)} /></td>
                    <td style={tdStyle}>
                      <button type="button"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", padding: "0 2px" }}
                        onClick={() => setFormItems(p => p.length > 1 ? p.filter((_, i) => i !== idx) : p)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ textAlign: "right", padding: "6px 8px", fontSize: 12, fontWeight: 600 }}>
                    合计（{fCurrencyCode}）
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formItems.reduce((sum, it) => sum + (parseFloat(String(it.amount)) || 0), 0).toLocaleString("zh-CN")}
                  </td>
                  <td colSpan={2}></td>
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

      {/* ── 详情抽屉 ─────────────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)}
        title={detailData ? `采购订单详情：${detailData.poNo}` : "详情"} width={700}>
        {detailLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</div>
        ) : detailData ? (
          <div style={{ padding: "0 4px" }}>
            <div className={s.formSection}>订单信息</div>
            {[
              { label: "采购订单号",  value: detailData.poNo, mono: true },
              { label: "主题",     value: detailData.subject },
              { label: "公司",     value: `${detailData.companyCode}  ${detailData.companyName ?? ""}` },
              { label: "供应商",   value: `${detailData.supplierCode}  ${detailData.supplierName ?? ""}` },
              { label: "项目",     value: detailData.projectCode ? `${detailData.projectCode} ${detailData.projectName ?? ""}` : "—" },
              { label: "合同金额", value: fmtAmt(detailData.totalAmount, detailData.currencyCode ?? "LAK") },
              { label: "期望到货", value: fmtDate(detailData.expectedDate) },
              { label: "付款截止", value: fmtDate(detailData.payDeadline) },
              { label: "来源申请", value: detailData.sourceReqNo ?? "直接创建" },
              { label: "合同号",   value: detailData.contractNo ?? "—" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ width: 80, flexShrink: 0, color: "var(--text-secondary)", fontSize: 12 }}>{r.label}</span>
                <span style={{ flex: 1, fontFamily: r.mono ? "monospace" : undefined }}>{r.value}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <span className={`${s.badge} ${s[STATUS_MAP[detailData.status]?.cls ?? "badgeNeutral"]}`}>
                {STATUS_MAP[detailData.status]?.label ?? detailData.status}
              </span>
              {detailData.crossBorderFlag && <span className={`${s.badge} ${s.badgeInfo}`}>跨境</span>}
              <span className={`${s.badge} ${s.badgeNeutral}`}>
                {PURCHASE_TYPE_OPTS.find(o => o.value === detailData.purchaseType)?.label ?? detailData.purchaseType ?? "—"}
              </span>
            </div>

            {/* 明细行 */}
            {detailData.items && detailData.items.length > 0 && (
              <>
                <div className={s.formSection} style={{ marginTop: 20 }}>采购明细（{detailData.items.length} 行）</div>
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>物品名称</th>
                        <th>规格</th>
                        <th style={{ textAlign: "right" }}>数量</th>
                        <th>单位</th>
                        <th style={{ textAlign: "right" }}>单价</th>
                        <th style={{ textAlign: "right" }}>小计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.itemName}</td>
                          <td>{it.spec ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.qty}</td>
                          <td>{it.unit ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.unitPrice ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {it.amount ? Number(it.amount).toLocaleString("zh-CN") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* AP 台账 */}
            {detailData.apLedger && (
              <>
                <div className={s.formSection} style={{ marginTop: 20 }}>应付账款（AP 台账）</div>
                <div style={{ background: "var(--bg-muted)", borderRadius: 6, padding: "10px 14px", fontSize: 13 }}>
                  {[
                    { label: "AP 编号",   value: detailData.apLedger.apNo },
                    { label: "应付金额",  value: fmtAmt(detailData.apLedger.amountOriginal, detailData.apLedger.currencyCode ?? "LAK") },
                    { label: "已付金额",  value: fmtAmt(detailData.apLedger.paidAmountOriginal, detailData.apLedger.currencyCode ?? "LAK") },
                    { label: "待付余额",  value: fmtAmt(detailData.apLedger.balanceAmountOriginal, detailData.apLedger.currencyCode ?? "LAK") },
                    { label: "到期日",    value: fmtDate(detailData.apLedger.dueDate) },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", padding: "3px 0" }}>
                      <span style={{ width: 80, flexShrink: 0, color: "var(--text-secondary)", fontSize: 12 }}>{r.label}</span>
                      <span style={{ flex: 1 }}>{r.value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <span className={`${s.badge} ${detailData.apLedger.status === "OPEN" ? s.badgeWarning : s.badgeSuccess}`}>
                      {detailData.apLedger.status === "OPEN" ? "待付款" : detailData.apLedger.status}
                    </span>
                  </div>
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
                      background: "var(--bg-muted)", borderRadius: 6, padding: "8px 12px",
                      border: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(log.action)}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{log.approverName ?? "系统"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
                          <Clock size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {log.comment && (
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{log.comment}</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </RightDrawer>

      {/* ── PR 转 PO 对话框 ────────────────────────────────────────────────── */}
      <SimpleModal open={convertOpen} onClose={() => setConvertOpen(false)} title="从已审批采购申请转采购订单">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          <div>
            <label className={s.lbl}>选择已审批的采购申请 *</label>
            <select className={s.inp} value={selectedPRId} onChange={e => setSelectedPRId(e.target.value)}>
              <option value="">-- 请选择 --</option>
              {approvedPRs.map(pr => (
                <option key={pr.id} value={pr.id}>
                  {pr.reqNo} — {pr.subject} ({pr.companyCode})
                </option>
              ))}
            </select>
            {approvedPRs.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>暂无已审批的采购申请</div>
            )}
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>供应商代码 *</label>
              <input className={s.inp} value={convSupplierCode}
                onChange={e => setConvSupplierCode(e.target.value)} placeholder="供应商代码" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>供应商名称 *</label>
              <input className={s.inp} value={convSupplierName}
                onChange={e => setConvSupplierName(e.target.value)} placeholder="供应商名称" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>期望到货日</label>
              <input type="date" className={s.inp} value={convExpDate} onChange={e => setConvExpDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>付款截止日</label>
              <input type="date" className={s.inp} value={convPayDeadline} onChange={e => setConvPayDeadline(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={convCrossBorder} onChange={e => setConvCrossBorder(e.target.checked)} />
              跨境采购
            </label>
          </div>
          <div>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={2} value={convRemark} onChange={e => setConvRemark(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setConvertOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={converting}
            onClick={handleConvert}>
            {converting ? "转换中…" : "确认转换"}
          </button>
        </div>
      </SimpleModal>

      {/* ── 批准对话框 ─────────────────────────────────────────────────────── */}
      <SimpleModal open={approveOpen} onClose={() => setApproveOpen(false)} title="审批通过">
        <p style={{ fontSize: 13, margin: "8px 0" }}>确认批准 <strong>{actionTarget?.poNo}</strong>？审批通过后将生成 AP 应付台账。</p>
        <textarea className={s.textarea} rows={2} placeholder="审批意见（可选）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setApproveOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting}
            onClick={() => execAction("approve", actionComment, "已批准，AP 台账已生成")}>
            {actionSubmitting ? "处理中…" : "确认批准"}
          </button>
        </div>
      </SimpleModal>

      {/* ── 拒绝对话框 ─────────────────────────────────────────────────────── */}
      <SimpleModal open={rejectOpen} onClose={() => setRejectOpen(false)} title="拒绝采购订单">
        <p style={{ fontSize: 13, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} color="#f59e0b" /> 拒绝 <strong>{actionTarget?.poNo}</strong>，请填写原因：
        </p>
        <textarea className={s.textarea} rows={3} placeholder="拒绝原因（必填）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setRejectOpen(false)}>取消</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting || !actionComment.trim()}
            onClick={() => execAction("reject", actionComment, "已拒绝")}>
            {actionSubmitting ? "处理中…" : "确认拒绝"}
          </button>
        </div>
      </SimpleModal>

      {/* ── 取消对话框 ─────────────────────────────────────────────────────── */}
      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消采购订单">
        <p style={{ fontSize: 13, margin: "8px 0" }}>确认取消 <strong>{actionTarget?.poNo}</strong>？</p>
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

// ── 辅助 ─────────────────────────────────────────────────────────────────────
function SimpleModal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 10, padding: 20, width: 480,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={16} /> {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function actionLabel(a: string) {
  return ({ SUBMIT: "提交", APPROVE: "批准", REJECT: "拒绝", CANCEL: "取消",
            CONVERT_TO_PO: "转采购订单", COMMENT: "备注" } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({ SUBMIT: "badgeInfo", APPROVE: "badgeSuccess", REJECT: "badgeDanger",
            CANCEL: "badgeNeutral", CONVERT_TO_PO: "badgeInfo", COMMENT: "badgeInfo" } as Record<string, string>)[a] ?? "badgeNeutral";
}
