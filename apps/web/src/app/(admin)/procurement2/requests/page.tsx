"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, FileText, CheckCircle, XCircle,
  ChevronLeft, ChevronRight, Pencil, Trash2, Send,
  Eye, Clock, AlertTriangle, ArrowRight,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { DictSelect } from "@/components/shared-selectors/DictSelect"; // G2 字典
import {
  CompanySelector, ProjectSelector, SupplierSelector,
  WarehouseSelector, SkuSelector,
} from "@/components/shared-selectors/MasterDataSelectors"; // G4-B 主数据选择器

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface ReqItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  qty: number | string;
  unit?: string;
  estimatedUnitPrice?: number | string;
  estimatedAmount?: number | string;
  warehouseCode?: string;
  usageDesc?: string;
  projectCode?: string;
  projectName?: string;
}
interface Approval {
  id: string;
  action: string;
  approvalNode: string;
  approverName?: string;
  comment?: string;
  createdAt: string;
}
interface PurchaseRequest {
  id: string;
  reqNo: string;
  subject: string;
  status: string;
  urgency: string;
  purchaseType?: string;
  companyCode: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  currencyCode?: string;
  estimatedAmount?: number | string;
  requesterName?: string;
  deptCode?: string;
  expectedDate?: string;
  reason?: string;
  attachmentUrl?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: ReqItem[];
  approvals?: Approval[];
}
interface PageResult { items: PurchaseRequest[]; total: number; page: number; pageSize: number; }

// ── 常量 ──────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: "草稿",   cls: "badgeNeutral" },
  SUBMITTED: { label: "待审批", cls: "badgeInfo"    },
  APPROVED:  { label: "已批准", cls: "badgeSuccess" },
  REJECTED:  { label: "已拒绝", cls: "badgeDanger"  },
  CANCELLED: { label: "已取消", cls: "badgeNeutral" },
  CONVERTED: { label: "已转采购订单", cls: "badgeSuccess" },
};
const URGENCY_MAP: Record<string, { label: string; cls: string }> = {
  NORMAL:   { label: "普通", cls: "badgeNeutral" },
  URGENT:   { label: "紧急", cls: "badgeWarning" },
  CRITICAL: { label: "特急", cls: "badgeDanger"  },
};
const PURCHASE_TYPE_OPTS = [
  { value: "MATERIAL",    label: "原料/物料" },
  { value: "EQUIPMENT",   label: "设备/机械" },
  { value: "SERVICE",     label: "服务/外包" },
  { value: "FIXED_ASSET", label: "固定资产"  },
  { value: "OTHER",       label: "其他"      },
];
const URGENCY_OPTS = [
  { value: "NORMAL",   label: "普通" },
  { value: "URGENT",   label: "紧急" },
  { value: "CRITICAL", label: "特急" },
];
const CURRENCY_OPTS = ["LAK", "CNY", "THB", "USD"];
const API_BASE = "/api/v2/procurement/requests";

const emptyItem = (): ReqItem => ({ itemName: "", qty: "", unit: "kg", estimatedUnitPrice: "", estimatedAmount: "" });

function fmtAmt(v?: number | string, currency = "LAK") {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d?: string) { return d ? d.slice(0, 10) : "—"; }

// ── 内联样式常量 ──────────────────────────────────────────────────────────────
const inlineInput: React.CSSProperties = {
  flex: "1 1 180px", padding: "8px 12px",
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: 13, outline: "none",
};
const inlineSelect: React.CSSProperties = { ...inlineInput, flex: "0 0 auto" };
const cellInpStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 4,
  background: "var(--bg-input,var(--bg-card))", color: "var(--text-primary)",
  padding: "3px 6px", fontSize: 12, outline: "none",
};
const thStyle: React.CSSProperties = {
  padding: "5px 6px", textAlign: "left", fontWeight: 600,
  fontSize: 11, color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "4px 6px", verticalAlign: "middle" };

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function PurchaseRequestsPage() {
  const toast = useToast();

  const [data, setData]         = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);

  const [fStatus, setFStatus]   = useState("");
  const [fUrgency, setFUrgency] = useState("");
  const [fType, setFType]       = useState("");
  const [fKeyword, setFKeyword] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo]   = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<PurchaseRequest | null>(null);
  const [saving, setSaving]         = useState(false);
  const [formSubject, setFormSubject] = useState("");
  const [formCompanyCode, setFormCompanyCode] = useState("");
  const [formCompanyName, setFormCompanyName] = useState("");
  const [formProjectCode, setFormProjectCode] = useState("");
  const [formProjectName, setFormProjectName] = useState("");
  const [formType, setFormType]     = useState("MATERIAL");
  const [formUrgency, setFormUrgency] = useState("NORMAL");
  const [formCurrency, setFormCurrency] = useState("LAK");
  const [formDept, setFormDept]     = useState("");
  const [formExpDate, setFormExpDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formRemark, setFormRemark] = useState("");
  const [formItems, setFormItems]   = useState<ReqItem[]>([emptyItem()]);

  const [detailOpen, setDetailOpen]     = useState(false);
  const [detailData, setDetailData]     = useState<PurchaseRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [cancelOpen, setCancelOpen]   = useState(false);
  const [actionTarget, setActionTarget] = useState<PurchaseRequest | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // 转采购订单
  const [convertOpen, setConvertOpen]       = useState(false);
  const [convertTarget, setConvertTarget]   = useState<PurchaseRequest | null>(null);
  const [convertSupplierCode, setConvertSupplierCode] = useState("");
  const [convertSupplierName, setConvertSupplierName] = useState("");
  const [convertExpDate, setConvertExpDate] = useState("");
  const [convertPayDeadline, setConvertPayDeadline] = useState("");
  const [convertContractNo, setConvertContractNo]   = useState("");
  const [convertRemark, setConvertRemark]   = useState("");
  const [convertSubmitting, setConvertSubmitting] = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "") : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 加载
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (fStatus)   params.set("status",          fStatus);
      if (fUrgency)  params.set("urgency",          fUrgency);
      if (fType)     params.set("purchaseType",     fType);
      if (fKeyword)  params.set("keyword",          fKeyword);
      if (fDateFrom) params.set("expectedDateFrom", fDateFrom);
      if (fDateTo)   params.set("expectedDateTo",   fDateTo);
      const res = await fetch(`${API_BASE}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch { toast.error("加载失败"); }
    finally { setLoading(false); }
  }, [page, fStatus, fUrgency, fType, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [fStatus, fUrgency, fType, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  // 打开新建
  function openNew() {
    setEditing(null);
    setFormSubject(""); setFormCompanyCode(""); setFormCompanyName("");
    setFormProjectCode(""); setFormProjectName("");
    setFormType("MATERIAL"); setFormUrgency("NORMAL"); setFormCurrency("LAK");
    setFormDept(""); setFormExpDate(""); setFormReason(""); setFormRemark("");
    setFormItems([emptyItem()]);
    setDrawerOpen(true);
  }

  // 打开编辑
  async function openEdit(row: PurchaseRequest) {
    setEditing(row);
    setFormSubject(row.subject ?? "");
    setFormCompanyCode(row.companyCode ?? "");
    setFormCompanyName(row.companyName ?? "");
    setFormProjectCode(row.projectCode ?? "");
    setFormProjectName(row.projectName ?? "");
    setFormType(row.purchaseType ?? "MATERIAL");
    setFormUrgency(row.urgency ?? "NORMAL");
    setFormCurrency(row.currencyCode ?? "LAK");
    setFormDept(row.deptCode ?? "");
    setFormExpDate(row.expectedDate ?? "");
    setFormReason(row.reason ?? "");
    setFormRemark(row.remark ?? "");
    // 加载明细行
    try {
      const res = await fetch(`${API_BASE}/${row.id}`, { headers: hdr });
      if (res.ok) {
        const d: PurchaseRequest = await res.json();
        setFormItems(d.items?.length ? d.items.map(i => ({ ...i })) : [emptyItem()]);
      } else {
        setFormItems([emptyItem()]);
      }
    } catch { setFormItems([emptyItem()]); }
    setDrawerOpen(true);
  }

  // 明细行
  function setItemField(idx: number, field: keyof ReqItem, value: string) {
    setFormItems(prev => {
      const next = prev.map((it, i) => i === idx ? { ...it, [field]: value } : it);
      if (field === "qty" || field === "estimatedUnitPrice") {
        const it = next[idx];
        const qty   = parseFloat(String(it.qty)) || 0;
        const price = parseFloat(String(it.estimatedUnitPrice)) || 0;
        next[idx] = { ...it, estimatedAmount: String(Math.round(qty * price * 100) / 100) };
      }
      return next;
    });
  }
  function addItemRow() { setFormItems(prev => [...prev, emptyItem()]); }
  function removeItemRow(idx: number) {
    setFormItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  // 保存
  async function handleSave() {
    if (!formSubject.trim())     { toast.error("请填写申请主题"); return; }
    if (!formCompanyCode.trim()) { toast.error("请填写公司代码"); return; }
    if (!formCompanyName.trim()) { toast.error("请填写公司名称"); return; }
    if (formItems.some(it => !it.itemName.trim()))               { toast.error("物品名称不能为空"); return; }
    if (formItems.some(it => !it.qty || parseFloat(String(it.qty)) <= 0)) { toast.error("数量必须大于 0"); return; }

    setSaving(true);
    try {
      const body = {
        subject: formSubject.trim(), companyCode: formCompanyCode.trim(), companyName: formCompanyName.trim(),
        projectCode: formProjectCode.trim() || undefined, projectName: formProjectName.trim() || undefined,
        purchaseType: formType, urgency: formUrgency, currencyCode: formCurrency,
        deptCode: formDept.trim() || undefined, expectedDate: formExpDate || undefined,
        reason: formReason.trim() || undefined, remark: formRemark.trim() || undefined,
        items: formItems.map(it => ({
          itemCode:           it.itemCode?.trim() || undefined,
          itemName:           it.itemName.trim(),
          spec:               it.spec?.trim() || undefined,
          qty:                parseFloat(String(it.qty)),
          unit:               it.unit?.trim() || undefined,
          estimatedUnitPrice: parseFloat(String(it.estimatedUnitPrice)) || 0,
          estimatedAmount:    parseFloat(String(it.estimatedAmount))    || 0,
          warehouseCode:      it.warehouseCode?.trim() || undefined,
          usageDesc:          it.usageDesc?.trim() || undefined,
        })),
      };
      const url    = editing ? `${API_BASE}/${editing.id}` : API_BASE;
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: hdr, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "保存失败"); }
      toast.success(editing ? "保存成功" : "采购申请已创建");
      setDrawerOpen(false);
      load(editing ? page : 1);
      if (!editing) setPage(1);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  // 详情
  async function openDetail(row: PurchaseRequest) {
    setDetailData(row); setDetailOpen(true); setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${row.id}`, { headers: hdr });
      if (res.ok) setDetailData(await res.json());
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }

  // 提交
  async function handleSubmit(row: PurchaseRequest) {
    try {
      const res = await fetch(`${API_BASE}/${row.id}/submit`, {
        method: "POST", headers: hdr, body: JSON.stringify({ comment: "" }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "提交失败"); }
      toast.success("已提交审批"); load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "提交失败"); }
  }

  // 审批操作
  function openApprove(row: PurchaseRequest) { setActionTarget(row); setActionComment(""); setApproveOpen(true); }
  function openReject(row: PurchaseRequest)  { setActionTarget(row); setActionComment(""); setRejectOpen(true); }
  function openCancel(row: PurchaseRequest)  { setActionTarget(row); setActionComment(""); setCancelOpen(true); }

  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/${actionTarget.id}/${endpoint}`, {
        method: "POST", headers: hdr, body: JSON.stringify({ comment }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "操作失败"); }
      toast.success(msg);
      setApproveOpen(false); setRejectOpen(false); setCancelOpen(false);
      load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "操作失败"); }
    finally { setActionSubmitting(false); }
  }

  // 打开转单弹窗
  function openConvert(row: PurchaseRequest) {
    setConvertTarget(row);
    setConvertSupplierCode(""); setConvertSupplierName("");
    setConvertExpDate(""); setConvertPayDeadline("");
    setConvertContractNo(""); setConvertRemark("");
    setConvertOpen(true);
  }

  // 执行转采购订单
  async function handleConvert() {
    if (!convertTarget) return;
    if (!convertSupplierCode.trim()) { toast.error("请填写供应商代码"); return; }
    if (!convertSupplierName.trim()) { toast.error("请填写供应商名称"); return; }
    setConvertSubmitting(true);
    try {
      const body: Record<string, string | boolean | undefined> = {
        supplierCode: convertSupplierCode.trim(),
        supplierName: convertSupplierName.trim(),
        contractNo:   convertContractNo.trim() || undefined,
        expectedDate: convertExpDate || undefined,
        payDeadline:  convertPayDeadline || undefined,
        remark:       convertRemark.trim() || undefined,
      };
      const res = await fetch(`/api/v2/procurement/requests/${convertTarget.id}/convert-to-order`, {
        method: "POST", headers: hdr, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "转单失败");
      }
      const po = await res.json();
      toast.success(`已转采购订单：${po.poNo ?? po.id}`);
      setConvertOpen(false);
      load(page);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "转单失败"); }
    finally { setConvertSubmitting(false); }
  }

  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="采购申请"
        subtitle={`管理所有采购申请 · 共 ${data.total} 条`}
        breadcrumb={["采购管理", "采购申请"]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={() => load(page)} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
            </button>
            <button type="button" className={s.btnPrimary} onClick={openNew}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> 新建申请
            </button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)}
          placeholder="关键字（申请号/主题/申请人）" style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fUrgency} onChange={e => setFUrgency(e.target.value)} style={inlineSelect}>
          <option value="">全部紧急度</option>
          {URGENCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={inlineSelect}>
          <option value="">全部类型</option>
          {PURCHASE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <th>申请单号</th>
              <th>主题</th>
              <th>公司</th>
              <th>项目</th>
              <th>类型</th>
              <th>紧急度</th>
              <th>申请人</th>
              <th>预估金额</th>
              <th style={{ textAlign: "center" }}>行数</th>
              <th>期望到货</th>
              <th>状态</th>
              <th style={{ width: 160 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无数据</td></tr>
            ) : data.items.map(row => {
              const st = STATUS_MAP[row.status]  ?? { label: row.status,  cls: "badgeNeutral" };
              const ug = URGENCY_MAP[row.urgency] ?? { label: row.urgency, cls: "badgeNeutral" };
              const typeLabel = PURCHASE_TYPE_OPTS.find(o => o.value === row.purchaseType)?.label ?? row.purchaseType ?? "—";
              return (
                <tr key={row.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.reqNo}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.subject}
                  </td>
                  <td>{row.companyCode}</td>
                  <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.projectCode ?? "—"}
                  </td>
                  <td>{typeLabel}</td>
                  <td><span className={`${s.badge} ${s[ug.cls]}`}>{ug.label}</span></td>
                  <td>{row.requesterName ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {fmtAmt(row.estimatedAmount, row.currencyCode ?? "LAK")}
                  </td>
                  <td style={{ textAlign: "center" }}>{row.itemCount ?? "—"}</td>
                  <td>{fmtDate(row.expectedDate)}</td>
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
                          <button className={s.btnIcon} title="批准"
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
                      {row.status === "APPROVED" && (
                        <button className={s.btnIcon} title="转采购订单"
                          style={{ borderColor: "#8b5cf6", color: "#8b5cf6" }}
                          onClick={() => openConvert(row)}>
                          <ArrowRight size={13} />
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
      <RightDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? `编辑申请：${editing.reqNo}` : "新建采购申请"}
        width={720}
      >
        <div style={{ padding: "0 4px 80px" }}>
          {/* 基础信息 */}
          <div className={s.formSection}>基础信息</div>
          <div className={s.fieldRow}>
            <div className={s.field} style={{ gridColumn: "1 / -1" }}>
              <label className={s.lbl}>申请主题 *</label>
              <input className={s.inp} value={formSubject}
                onChange={e => setFormSubject(e.target.value)} placeholder="请输入采购主题" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>公司 *</label>
              {/* G4-B：公司主数据(org_units COMPANY)，DataScope 自动过滤 */}
              <CompanySelector value={formCompanyCode}
                onChange={setFormCompanyCode}
                onPick={o => setFormCompanyName(o?.label ?? "")}
                disabled={!!editing} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>公司名称 *</label>
              <input className={s.inp} value={formCompanyName} readOnly
                style={{ background: "var(--bg-muted)", color: "var(--text-secondary)", cursor: "not-allowed" }}
                placeholder="由公司选择自动带出" />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>项目</label>
              {/* G4-B：项目主数据(shr_projects)，仅 ACTIVE，自动带出项目名称 */}
              <ProjectSelector value={formProjectCode}
                onChange={setFormProjectCode}
                onPick={o => setFormProjectName(o?.raw?.project_name ?? o?.raw?.projectName ?? o?.label ?? "")} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>项目名称</label>
              <input className={s.inp} value={formProjectName} readOnly
                style={{ background: "var(--bg-muted)", color: "var(--text-secondary)", cursor: "not-allowed" }}
                placeholder="由项目选择自动带出" />
            </div>
          </div>

          {/* 采购属性 */}
          <div className={s.formSection} style={{ marginTop: 20 }}>采购属性</div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>采购类型</label>
              {/* G4-B：采购类型枚举来自 sys_dict(PRC_PURCHASE_TYPE) */}
              <DictSelect dictType="PRC_PURCHASE_TYPE" value={formType} onChange={setFormType} allowEmpty={false} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>紧急程度</label>
              {/* G4-B：紧急程度枚举来自 sys_dict(PRC_URGENCY) */}
              <DictSelect dictType="PRC_URGENCY" value={formUrgency} onChange={setFormUrgency} allowEmpty={false} />
            </div>
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>货币</label>
              {/* G4-B：货币枚举来自 sys_dict(SYS_CURRENCY) */}
              <DictSelect dictType="SYS_CURRENCY" value={formCurrency} onChange={setFormCurrency} allowEmpty={false} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>期望到货日</label>
              <input type="date" className={s.inp} value={formExpDate}
                onChange={e => setFormExpDate(e.target.value)} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>申请原因</label>
            <textarea className={s.textarea} rows={2} value={formReason}
              onChange={e => setFormReason(e.target.value)} placeholder="请说明采购原因" />
          </div>
          <div className={s.field}>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={1} value={formRemark}
              onChange={e => setFormRemark(e.target.value)} />
          </div>

          {/* 明细行 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 20 }}>
            <span className={s.formSection} style={{ margin: 0 }}>
              采购明细（{formItems.length} 行）
            </span>
            <button type="button" className={s.btnSecondary}
              style={{ padding: "3px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              onClick={addItemRow}>
              <Plus size={12} /> 添加行
            </button>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-subtle,var(--bg-muted))" }}>
                  <th style={thStyle}>物品名称 *</th>
                  <th style={thStyle}>规格</th>
                  <th style={thStyle}>数量 *</th>
                  <th style={thStyle}>单位</th>
                  <th style={thStyle}>估算单价</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>小计</th>
                  <th style={thStyle}>仓库</th>
                  <th style={{ ...thStyle, width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      {/* G4-B：物料从 SKU 主数据选择，自动带出 sku_code/name/spec/unit */}
                      <SkuSelector value={it.itemCode ?? ""}
                        onChange={code => setItemField(idx, "itemCode", code)}
                        onPick={o => {
                          setItemField(idx, "itemName", o?.raw?.sku_name ?? o?.raw?.product_name ?? "");
                          setItemField(idx, "spec",     o?.raw?.spec_code ?? "");
                        }}
                        style={{ minWidth: 200, fontSize: 12, padding: "3px 6px" }} />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInpStyle, width: 80, background: "var(--bg-muted)" }} value={it.spec ?? ""}
                        readOnly placeholder="由 SKU 自动带出" />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInpStyle, width: 70 }} type="number" min="0"
                        value={it.qty}
                        onChange={e => setItemField(idx, "qty", e.target.value)} />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInpStyle, width: 50 }} value={it.unit ?? ""}
                        onChange={e => setItemField(idx, "unit", e.target.value)} placeholder="kg" />
                    </td>
                    <td style={tdStyle}>
                      <input style={{ ...cellInpStyle, width: 90 }} type="number" min="0"
                        value={it.estimatedUnitPrice ?? ""}
                        onChange={e => setItemField(idx, "estimatedUnitPrice", e.target.value)} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                      {it.estimatedAmount ? Number(it.estimatedAmount).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td style={tdStyle}>
                      {/* G4-B：仓库主数据(wms_warehouses)，按当前公司过滤 */}
                      <WarehouseSelector value={it.warehouseCode ?? ""}
                        onChange={code => setItemField(idx, "warehouseCode", code)}
                        companyCode={formCompanyCode}
                        style={{ minWidth: 150, fontSize: 12, padding: "3px 6px" }} />
                    </td>
                    <td style={tdStyle}>
                      <button type="button"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger,#ef4444)", padding: "0 2px" }}
                        onClick={() => removeItemRow(idx)} title="删除行">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ textAlign: "right", padding: "6px 8px", fontSize: 12, fontWeight: 600 }}>
                    合计（{formCurrency}）
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formItems.reduce((s, it) => s + (parseFloat(String(it.estimatedAmount)) || 0), 0).toLocaleString("zh-CN")}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 抽屉底部按钮 */}
          <div className={s.drawerFooter}>
            <button type="button" className={s.btnSecondary} onClick={() => setDrawerOpen(false)}>取消</button>
            <button type="button" className={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "保存草稿"}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── 详情抽屉 ─────���───────────────────────────────────────────────────── */}
      <RightDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailData ? `申请详情：${detailData.reqNo}` : "详情"}
        width={660}
      >
        {detailLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</div>
        ) : detailData ? (
          <div style={{ padding: "0 4px" }}>
            <div className={s.formSection}>基础信息</div>
            {[
              { label: "申请单号", value: detailData.reqNo, mono: true },
              { label: "主题",     value: detailData.subject },
              { label: "公司",     value: `${detailData.companyCode}  ${detailData.companyName ?? ""}` },
              { label: "项目",     value: detailData.projectCode ? `${detailData.projectCode} ${detailData.projectName ?? ""}` : "—" },
              { label: "预估金额", value: fmtAmt(detailData.estimatedAmount, detailData.currencyCode ?? "LAK") },
              { label: "申请人",   value: detailData.requesterName ?? "—" },
              { label: "期望到货", value: fmtDate(detailData.expectedDate) },
              { label: "原因",     value: detailData.reason ?? "—" },
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
              <span className={`${s.badge} ${s[URGENCY_MAP[detailData.urgency]?.cls ?? "badgeNeutral"]}`}>
                {URGENCY_MAP[detailData.urgency]?.label ?? detailData.urgency}
              </span>
              <span className={`${s.badge} ${s.badgeNeutral}`}>
                {PURCHASE_TYPE_OPTS.find(o => o.value === detailData.purchaseType)?.label ?? detailData.purchaseType ?? "—"}
              </span>
            </div>

            {/* 明细行 */}
            {detailData.items && detailData.items.length > 0 && (
              <>
                <div className={s.formSection} style={{ marginTop: 20 }}>
                  采购明细（{detailData.items.length} 行）
                </div>
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
                        <th>仓库</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.itemName}</td>
                          <td>{it.spec ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.qty}</td>
                          <td>{it.unit ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.estimatedUnitPrice ?? "—"}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {it.estimatedAmount ? Number(it.estimatedAmount).toLocaleString("zh-CN") : "—"}
                          </td>
                          <td>{it.warehouseCode ?? "—"}</td>
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

      {/* ── 批准对话框 ─────────────────────────────────────────────────────────── */}
      <SimpleModal open={approveOpen} onClose={() => setApproveOpen(false)} title="批准采购申请">
        <p style={{ fontSize: 13, margin: "8px 0" }}>
          确认批准 <strong>{actionTarget?.reqNo}</strong>？
        </p>
        <textarea className={s.textarea} rows={2} placeholder="审批意见（可选）"
          value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setApproveOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting}
            onClick={() => execAction("approve", actionComment, "已批准")}>
            {actionSubmitting ? "处理中…" : "确认批准"}
          </button>
        </div>
      </SimpleModal>

      {/* ── 拒绝对话框 ─────────────────────────────────────────────────────────── */}
      <SimpleModal open={rejectOpen} onClose={() => setRejectOpen(false)} title="拒绝采购申请">
        <p style={{ fontSize: 13, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} color="#f59e0b" />
          拒绝 <strong>{actionTarget?.reqNo}</strong>，请填写原因：
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

      {/* ── 取消对话框 ─────────────────────────────────────────────────────────── */}
      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消采购申请">
        <p style={{ fontSize: 13, margin: "8px 0" }}>
          确认取消 <strong>{actionTarget?.reqNo}</strong>？此操作不可逆。
        </p>
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

      {/* ── 转采购订单对话框 ──────────────────────────────────────────────────── */}
      <SimpleModal open={convertOpen} onClose={() => setConvertOpen(false)} title="从采购申请转采购订单">
        <p style={{ fontSize: 13, margin: "8px 0 12px", color: "var(--text-secondary)" }}>
          PR：<strong style={{ color: "var(--text-primary)" }}>{convertTarget?.reqNo}</strong>
          　{convertTarget?.subject}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={s.fieldRow} style={{ gap: 8 }}>
            <div className={s.field}>
              <label className={s.lbl}>供应商 *</label>
              {/* G4-B：供应商主数据(仅 ACTIVE)，自动带出名称 */}
              <SupplierSelector value={convertSupplierCode}
                onChange={setConvertSupplierCode}
                onPick={o => setConvertSupplierName(o?.raw?.name ?? o?.label ?? "")} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>供应商名称</label>
              <input className={s.inp} value={convertSupplierName} readOnly
                style={{ background: "var(--bg-muted)", color: "var(--text-secondary)", cursor: "not-allowed" }}
                placeholder="由供应商选择自动带出" />
            </div>
          </div>
          <div className={s.fieldRow} style={{ gap: 8 }}>
            <div className={s.field}>
              <label className={s.lbl}>期望到货日</label>
              <input type="date" className={s.inp} value={convertExpDate}
                onChange={e => setConvertExpDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>付款截止日</label>
              <input type="date" className={s.inp} value={convertPayDeadline}
                onChange={e => setConvertPayDeadline(e.target.value)} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>合同号（可选）</label>
            <input className={s.inp} value={convertContractNo}
              onChange={e => setConvertContractNo(e.target.value)} placeholder="HT-2026-XXXXX" />
          </div>
          <div className={s.field}>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={2} value={convertRemark}
              onChange={e => setConvertRemark(e.target.value)} placeholder="可选备注" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setConvertOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={convertSubmitting}
            onClick={handleConvert}>
            {convertSubmitting ? "处理中…" : "确认转单"}
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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 10, padding: 20,
        width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
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
  return ({ SUBMIT: "提交", APPROVE: "批准", REJECT: "拒绝", CANCEL: "取消", COMMENT: "备注" } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({ SUBMIT: "badgeInfo", APPROVE: "badgeSuccess", REJECT: "badgeDanger", CANCEL: "badgeNeutral", COMMENT: "badgeInfo" } as Record<string, string>)[a] ?? "badgeNeutral";
}
