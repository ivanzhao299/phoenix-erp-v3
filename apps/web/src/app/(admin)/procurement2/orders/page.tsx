"use client";

// G158：新建/编辑下沉为独立整页（orders/new、orders/[id]/edit），本列表页瘦身——
//   只保留列表/筛选/详情抽屉/转单/取消等列表态操作；新建=Link→/new，编辑=Link→/[id]/edit。
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import u from "@/styles/uix-utils.module.css";
import { Plus, RefreshCw, ChevronLeft, ChevronRight, GitMerge, Clock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { ModalV2 } from "@/components/design-system"; // G155 全局模态

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface OrderItem {
  id?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  productCode?: string;   // G85-C SKU 带出（成本按产品归集）
  gradeCode?: string;     // G85-C SKU 带出（成本按等级归集）
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
interface PageResult {
  items: PurchaseOrder[];
  total: number;
  page: number;
  pageSize: number;
}
interface ApprovalCandidate {
  userId: string;
  displayName: string;
  roleNameZh?: string | null;
}
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
const STATUS_MAP: Record<string, {
  label: string;
  cls: string;
}> = {
  DRAFT: {
    label: "草稿",
    cls: "badgeNeutral"
  },
  SUBMITTED: {
    label: "待审批",
    cls: "badgeInfo"
  },
  PENDING_APPROVAL: {       // G135：后端 submit 实际置此状态（原映射只有 SUBMITTED → 详情显示裸英文）
    label: "待审批",
    cls: "badgeInfo"
  },
  APPROVED: {
    label: "已批准",
    cls: "badgeSuccess"
  },
  REJECTED: {
    label: "已拒绝",
    cls: "badgeDanger"
  },
  CANCELLED: {
    label: "已取消",
    cls: "badgeNeutral"
  },
  PARTIALLY_PAID: {
    label: "部分付款",
    cls: "badgeWarning"
  },
  PAID: {
    label: "已付款",
    cls: "badgeSuccess"
  },
  IN_TRANSIT: {
    label: "运输中",
    cls: "badgeInfo"
  },
  PARTIALLY_RECEIVED: {
    label: "部分收货",
    cls: "badgeWarning"
  },
  RECEIVED: {
    label: "已收货",
    cls: "badgeSuccess"
  },
  CLOSED: {
    label: "已关闭",
    cls: "badgeNeutral"
  },
  COMPLETED: {              // G135：历史完结单状态（原映射缺 → 列表/详情显示裸 COMPLETED）
    label: "已完成",
    cls: "badgeSuccess"
  }
};
const PURCHASE_TYPE_OPTS = [{
  value: "MATERIAL",
  label: "原料/物料"
}, {
  value: "EQUIPMENT",
  label: "设备/机械"
}, {
  value: "SERVICE",
  label: "服务/外包"
}, {
  value: "CONSTRUCTION",       // G136：装修/工程类采购（与 PRC_PURCHASE_TYPE 字典对应）
  label: "装修/工程"
}, {
  value: "FIXED_ASSET",
  label: "固定资产"
}, {
  value: "OTHER",
  label: "其他"
}];
const API_ORDERS = "/api/v2/procurement/orders";
const API_REQUESTS = "/api/v2/procurement/requests";
function fmtAmt(v?: number | string, currency = "LAK") {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2
  })}`;
}
function fmtDate(d?: string) {
  return d ? d.slice(0, 10) : "—";
}
// G154：操作列改「文字按钮」——企业级运营场景要直观清晰，禁纯图标(看不出含义)。
const actBtn: React.CSSProperties = {
  padding: "3px 10px", fontSize: 12, lineHeight: 1.6, borderRadius: 6, whiteSpace: "nowrap",
  border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-primary)",
  cursor: "pointer",
};
const actBtnTone = (tone: "success" | "info" | "danger"): React.CSSProperties => {
  const c = tone === "success" ? "var(--status-success)" : tone === "danger" ? "var(--status-danger)" : "var(--status-info, var(--color-primary))";
  return { ...actBtn, borderColor: c, color: c };
};
const inlineInput: React.CSSProperties = {
  flex: "1 1 160px",
  padding: "8px 12px",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none"
};
const inlineSelect: React.CSSProperties = {
  ...inlineInput,
  flex: "0 0 auto"
};

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const toast = useToast();
  const [data, setData] = useState<PageResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // 筛选
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fCross, setFCross] = useState("");
  const [fKeyword, setFKeyword] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<PurchaseOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // G142 采购全流程日志（申请→订单→收货→付款 时间线）
  const [procLog, setProcLog] = useState<{ time: string; docType: string; docNo: string; action: string; operator: string; comment: string }[]>([]);

  // 操作对话框（审批通过/驳回已收口至集团审批引擎，见 /workflow/todos）
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<PurchaseOrder | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<PurchaseOrder | null>(null);
  const [submitComment, setSubmitComment] = useState("");
  const [submitCandidates, setSubmitCandidates] = useState<ApprovalCandidate[]>([]);
  const [submitApproverId, setSubmitApproverId] = useState("");
  const [submitCandidateLoading, setSubmitCandidateLoading] = useState(false);

  // PR 转 PO 弹窗
  const [convertOpen, setConvertOpen] = useState(false);
  const [approvedPRs, setApprovedPRs] = useState<ApprovedPR[]>([]);
  const [selectedPRId, setSelectedPRId] = useState("");
  const [convSupplierCode, setConvSupplierCode] = useState("");
  const [convSupplierName, setConvSupplierName] = useState("");
  const [convExpDate, setConvExpDate] = useState("");
  const [convPayDeadline, setConvPayDeadline] = useState("");
  const [convCrossBorder, setConvCrossBorder] = useState(false);
  const [convRemark, setConvRemark] = useState("");
  const [converting, setConverting] = useState(false);
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: "20"
      });
      if (fStatus) params.set("status", fStatus);
      if (fType) params.set("purchaseType", fType);
      if (fCross) params.set("crossBorderFlag", fCross);
      if (fKeyword) params.set("keyword", fKeyword);
      if (fDateFrom) params.set("expectedDateFrom", fDateFrom);
      if (fDateTo) params.set("expectedDateTo", fDateTo);
      const res = await fetch(`${API_ORDERS}?${params}`, {
        headers: hdr
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch {
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, fStatus, fType, fCross, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => {
    load(1);
    setPage(1);
  }, [fStatus, fType, fCross, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line

  async function openDetail(row: PurchaseOrder) {
    setDetailData(row);
    setDetailOpen(true);
    setDetailLoading(true);
    setProcLog([]);
    try {
      const [res, plRes] = await Promise.all([
        fetch(`${API_ORDERS}/${row.id}`, { headers: hdr }),
        fetch(`${API_ORDERS}/${row.id}/process-log`, { headers: hdr }).catch(() => null),
      ]);
      if (res.ok) setDetailData(await res.json());
      if (plRes && plRes.ok) { const pl = await plRes.json(); setProcLog(Array.isArray(pl?.timeline) ? pl.timeline : []); }
    } catch {/* ignore */} finally {
      setDetailLoading(false);
    }
  }
  async function openSubmit(row: PurchaseOrder) {
    setSubmitTarget(row);
    setSubmitComment("");
    setSubmitApproverId("");
    setSubmitCandidates([]);
    setSubmitOpen(true);
    setSubmitCandidateLoading(true);
    try {
      const qs = new URLSearchParams({ menuCode: "MENU_PRC2_ORDER", requiredPerm: "E" });
      if (row.companyCode) qs.set("companyCode", row.companyCode);
      if (row.projectCode) qs.set("projectCode", row.projectCode);
      const res = await fetch(`/api/approval/eligible-approvers?${qs}`, { headers: hdr });
      const json = res.ok ? await res.json().catch(() => []) : [];
      const list = Array.isArray(json) ? json : [];
      setSubmitCandidates(list);
      if (list[0]?.userId) setSubmitApproverId(list[0].userId);
    } catch {
      setSubmitCandidates([]);
    } finally {
      setSubmitCandidateLoading(false);
    }
  }

  async function handleSubmit(approverUserId?: string) {
    if (!submitTarget) return;
    try {
      setActionSubmitting(true);
      const res = await fetch(`${API_ORDERS}/${submitTarget.id}/submit`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          comment: submitComment,
          approverUserId: approverUserId || undefined
        })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "提交失败");
      }
      toast.success("已提交审批");
      setSubmitOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setActionSubmitting(false);
    }
  }
  function openCancel(row: PurchaseOrder) {
    setActionTarget(row);
    setActionComment("");
    setCancelOpen(true);
  }
  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_ORDERS}/${actionTarget.id}/${endpoint}`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          comment
        })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "操作失败");
      }
      toast.success(msg);
      setCancelOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setActionSubmitting(false);
    }
  }

  // ── PR 转 PO ──────────────────────────────────────────────────────────────
  async function openConvert() {
    setConvSupplierCode("");
    setConvSupplierName("");
    setConvExpDate("");
    setConvPayDeadline("");
    setConvCrossBorder(false);
    setConvRemark("");
    setSelectedPRId("");
    setConvertOpen(true);
    try {
      const res = await fetch(`${API_REQUESTS}?status=APPROVED&pageSize=50`, {
        headers: hdr
      });
      if (res.ok) {
        const d = await res.json();
        setApprovedPRs(d.items ?? []);
      }
    } catch {/* ignore */}
  }
  async function handleConvert() {
    if (!selectedPRId) {
      toast.error("请选择采购申请");
      return;
    }
    if (!convSupplierCode.trim()) {
      toast.error("请填写供应商代码");
      return;
    }
    if (!convSupplierName.trim()) {
      toast.error("请填写供应商名称");
      return;
    }
    setConverting(true);
    try {
      const res = await fetch(`${API_REQUESTS}/${selectedPRId}/convert-to-order`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          supplierCode: convSupplierCode.trim(),
          supplierName: convSupplierName.trim(),
          expectedDate: convExpDate || undefined,
          payDeadline: convPayDeadline || undefined,
          crossBorderFlag: convCrossBorder,
          remark: convRemark.trim() || undefined
        })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "转换失败");
      }
      const po: PurchaseOrder = await res.json();
      toast.success(`已转采购订单：${po.poNo}`);
      setConvertOpen(false);
      load(1);
      setPage(1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "转换失败");
    } finally {
      setConverting(false);
    }
  }
  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));
  return <div className="animate-fade-in">
      <PageHeader title="采购订单" subtitle={`管理所有采购订单 · 共 ${data.total} 条`} breadcrumb={["采购管理", "采购订单"]} actions={<div style={{
      display: "flex",
      gap: 8
    }}>
            <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={openConvert}>
              <GitMerge size={14} /> 从采购申请转单
            </button>
            <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => load(page)} disabled={loading}>
              <RefreshCw size={14} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> 刷新
            </button>
            <Link href="/procurement2/orders/new" className={`${s.btnPrimary} ${u.flexRow}`} style={{ textDecoration: "none" }}>
              <Plus size={14} /> 新建采购订单
            </Link>
          </div>} />

      {/* 筛选栏 */}
      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 14,
      flexWrap: "wrap",
      alignItems: "center"
    }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)} placeholder="关键字（采购订单号/主题/供应商）" style={inlineInput} />
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
        <span style={{
        fontSize: 12,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap"
      }}>期望到货：</span>
        <input type="date" style={{
        ...inlineSelect,
        flex: "0 0 130px"
      }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
        <span className={u.muted12}>~</span>
        <input type="date" style={{
        ...inlineSelect,
        flex: "0 0 130px"
      }} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
      </div>

      {/* 表格 */}
      <div style={{
      overflowX: "auto",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      background: "var(--bg-card)"
    }}>
        {/* G164：table-layout:fixed + width:100% —— 整页内完整呈现、永不横向滚动；
            列宽由 colgroup 按比例分配，中文按列宽自动换行（不再逐字竖排）。去掉冗余「币种」列。 */}
        <table className={s.table} style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "9%" }} />{/* 订单号 */}
            <col style={{ width: "15%" }} />{/* 主题 */}
            <col style={{ width: "13%" }} />{/* 公司 */}
            <col style={{ width: "11%" }} />{/* 供应商 */}
            <col style={{ width: "8%" }} />{/* 类型 */}
            <col style={{ width: "6%" }} />{/* 跨境 */}
            <col style={{ width: "12%" }} />{/* 合同金额 */}
            <col style={{ width: "5%" }} />{/* 行数 */}
            <col style={{ width: "8%" }} />{/* 期望到货 */}
            <col style={{ width: "8%" }} />{/* 付款截止 */}
            <col style={{ width: "7%" }} />{/* 状态 */}
            <col style={{ width: "120px" }} />{/* 操作 */}
          </colgroup>
          <thead>
            <tr>
              <th>采购订单号</th>
              <th>主题</th>
              <th>公司</th>
              <th>供应商</th>
              <th>类型</th>
              <th className={u.tac}>跨境</th>
              <th className={u.tar}>合同金额</th>
              <th className={u.tac}>行数</th>
              <th>期望到货</th>
              <th>付款截止</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={12} className={u.emptyCenter}>加载中…</td></tr> : data.items.length === 0 ? <tr><td colSpan={12} className={u.emptyCenter}>暂无数据</td></tr> : data.items.map(row => {
            const st = STATUS_MAP[row.status] ?? {
              label: row.status,
              cls: "badgeNeutral"
            };
            const typeLabel = PURCHASE_TYPE_OPTS.find(o => o.value === row.purchaseType)?.label ?? row.purchaseType ?? "—";
            return <tr key={row.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{row.poNo}</td>
                  <td style={{ wordBreak: "break-word" }}>{row.subject}</td>
                  {/* G154：公司显示中文名（无名称才回退编码）；G164：按列宽自动换行 */}
                  <td style={{ wordBreak: "break-word" }}>{row.companyName || row.companyCode}</td>
                  <td style={{ wordBreak: "break-word" }}>{row.supplierName ?? row.supplierCode}</td>
                  <td>{typeLabel}</td>
                  <td className={u.tac}>
                    {row.crossBorderFlag ? <span className={`${s.badge} ${s.badgeInfo}`}>跨境</span> : <span className={`${s.badge} ${s.badgeNeutral}`}>本地</span>}
                  </td>
                  <td className={u.tar} style={{ fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>
                    {fmtAmt(row.totalAmount, row.currencyCode ?? "LAK")}
                  </td>
                  <td className={u.tac}>{row.itemCount ?? "—"}</td>
                  <td>{fmtDate(row.expectedDate)}</td>
                  <td>{fmtDate(row.payDeadline)}</td>
                  <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
                  <td>
                    <div style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap"
                }}>
                      <button style={actBtn} onClick={() => openDetail(row)}>查看</button>
                      {row.status === "DRAFT" && <>
                          <Link href={`/procurement2/orders/${row.id}/edit`} style={{ ...actBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>编辑</Link>
                          <button style={actBtnTone("success")} onClick={() => openSubmit(row)}>提交审批</button>
                        </>}
                      {(row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL") && (
                        <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title="审批请前往『工作流·待办』">前往审批</Link>
                      )}
                      {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL") && (
                        <button style={actBtnTone("danger")} onClick={() => openCancel(row)}>取消</button>
                      )}
                    </div>
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      justifyContent: "flex-end"
    }}>
          <span className={u.muted12}>共 {data.total} 条</span>
          <button className={s.btnIcon} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{
        fontSize: 12,
        minWidth: 60,
        textAlign: "center"
      }}>{page} / {totalPages}</span>
          <button className={s.btnIcon} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>}

      {/* ── 详情抽屉 ─────────────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={detailData ? `采购订单详情：${detailData.poNo}` : "详情"} width={700}>
        {detailLoading ? <div className={u.emptyCenter}>加载中…</div> : detailData ? <div style={{
        padding: "0 4px"
      }}>
            <div className={s.formSection}>订单信息</div>
            {[{
          label: "采购订单号",
          value: detailData.poNo,
          mono: true
        }, {
          label: "主题",
          value: detailData.subject
        }, {
          label: "公司",
          value: `${detailData.companyCode}  ${detailData.companyName ?? ""}`
        }, {
          label: "供应商",
          value: `${detailData.supplierCode}  ${detailData.supplierName ?? ""}`
        }, {
          label: "项目",
          value: detailData.projectCode ? `${detailData.projectCode} ${detailData.projectName ?? ""}` : "—"
        }, {
          label: "合同金额",
          value: fmtAmt(detailData.totalAmount, detailData.currencyCode ?? "LAK")
        }, {
          label: "期望到货",
          value: fmtDate(detailData.expectedDate)
        }, {
          label: "付款截止",
          value: fmtDate(detailData.payDeadline)
        }, {
          label: "来源申请",
          value: detailData.sourceReqNo ?? "直接创建"
        }, {
          label: "合同号",
          value: detailData.contractNo ?? "—"
        }].map(r => <div key={r.label} style={{
          display: "flex",
          padding: "5px 0",
          borderBottom: "1px solid var(--border)",
          fontSize: 13
        }}>
                <span style={{
            width: 80,
            flexShrink: 0,
            color: "var(--text-secondary)",
            fontSize: 12
          }}>{r.label}</span>
                <span style={{
            flex: 1,
            fontFamily: r.mono ? "monospace" : undefined
          }}>{r.value}</span>
              </div>)}
            <div style={{
          display: "flex",
          gap: 8,
          marginTop: 6
        }}>
              <span className={`${s.badge} ${s[STATUS_MAP[detailData.status]?.cls ?? "badgeNeutral"]}`}>
                {STATUS_MAP[detailData.status]?.label ?? detailData.status}
              </span>
              {detailData.crossBorderFlag && <span className={`${s.badge} ${s.badgeInfo}`}>跨境</span>}
              <span className={`${s.badge} ${s.badgeNeutral}`}>
                {PURCHASE_TYPE_OPTS.find(o => o.value === detailData.purchaseType)?.label ?? detailData.purchaseType ?? "—"}
              </span>
            </div>

            {/* 明细行 */}
            {detailData.items && detailData.items.length > 0 && <>
                <div className={s.formSection} style={{
            marginTop: 20
          }}>采购明细（{detailData.items.length} 行）</div>
                <div style={{
            overflowX: "auto",
            border: "1px solid var(--border)",
            borderRadius: 6
          }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>物料名称</th>
                        <th>规格</th>
                        <th className={u.tar}>数量</th>
                        <th>单位</th>
                        <th className={u.tar}>单价</th>
                        <th className={u.tar}>小计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.items.map((it, i) => <tr key={i}>
                          <td>{it.itemName}</td>
                          <td>{it.spec ?? "—"}</td>
                          <td style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums"
                  }}>{it.qty}</td>
                          <td>{it.unit ?? "—"}</td>
                          <td style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums"
                  }}>{it.unitPrice ?? "—"}</td>
                          <td style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums"
                  }}>
                            {it.amount ? Number(it.amount).toLocaleString("zh-CN") : "—"}
                          </td>
                        </tr>)}
                    </tbody>
                  </table>
                </div>
              </>}

            {/* AP 台账 */}
            {detailData.apLedger && <>
                <div className={s.formSection} style={{
            marginTop: 20
          }}>应付账款台账</div>
                <div style={{
            background: "var(--bg-muted)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13
          }}>
                  {[{
              label: "应付编号",
              value: detailData.apLedger.apNo
            }, {
              label: "应付金额",
              value: fmtAmt(detailData.apLedger.amountOriginal, detailData.apLedger.currencyCode ?? "LAK")
            }, {
              label: "已付金额",
              value: fmtAmt(detailData.apLedger.paidAmountOriginal, detailData.apLedger.currencyCode ?? "LAK")
            }, {
              label: "待付余额",
              value: fmtAmt(detailData.apLedger.balanceAmountOriginal, detailData.apLedger.currencyCode ?? "LAK")
            }, {
              label: "到期日",
              value: fmtDate(detailData.apLedger.dueDate)
            }].map(r => <div key={r.label} style={{
              display: "flex",
              padding: "3px 0"
            }}>
                      <span style={{
                width: 80,
                flexShrink: 0,
                color: "var(--text-secondary)",
                fontSize: 12
              }}>{r.label}</span>
                      <span className={u.flex1}>{r.value}</span>
                    </div>)}
                  <div style={{
              marginTop: 6
            }}>
                    <span className={`${s.badge} ${detailData.apLedger.status === "OPEN" ? s.badgeWarning : s.badgeSuccess}`}>
                      {detailData.apLedger.status === "OPEN" ? "待付款" : detailData.apLedger.status}
                    </span>
                  </div>
                </div>
              </>}

            {/* G142 全流程日志（申请→订单→收货→付款 一条时间线，跨单据） */}
            {procLog.length > 0 && <>
                <div className={s.formSection} style={{ marginTop: 20 }}>全流程日志</div>
                <div style={{ position: "relative", paddingLeft: 18 }}>
                  <div style={{ position: "absolute", left: 5, top: 4, bottom: 4, width: 2, background: "var(--border)" }} />
                  {procLog.map((ev, i) => <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                    <div style={{ position: "absolute", left: -16, top: 4, width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", border: "2px solid var(--bg-card)" }} />
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 13 }}>
                      <span className={`${s.badge} ${s.badgeNeutral}`} style={{ fontSize: 11 }}>{ev.docType}</span>
                      <span style={{ fontWeight: 600 }}>{ev.action}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{ev.docNo}</span>
                      {ev.operator && <span style={{ color: "var(--text-secondary)" }}>· {ev.operator}</span>}
                      <span style={{ marginLeft: "auto", color: "var(--text-disabled)", fontSize: 12 }}>{ev.time ? new Date(ev.time).toLocaleString("zh-CN") : ""}</span>
                    </div>
                    {ev.comment && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{ev.comment}</div>}
                  </div>)}
                </div>
              </>}

            {/* 审批日志（仅本单） */}
            {detailData.approvals && detailData.approvals.length > 0 && <>
                <div className={s.formSection} style={{
            marginTop: 20
          }}>审批日志</div>
                <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}>
                  {detailData.approvals.map(log => <div key={log.id} style={{
              background: "var(--bg-muted)",
              borderRadius: 6,
              padding: "8px 12px",
              border: "1px solid var(--border)"
            }}>
                      <div className={u.flexRow8}>
                        <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(log.action)}</span>
                        <span style={{
                  fontWeight: 600,
                  fontSize: 13
                }}>{log.approverName ?? "系统"}</span>
                        <span style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginLeft: "auto"
                }}>
                          <Clock size={10} style={{
                    verticalAlign: "middle",
                    marginRight: 2
                  }} />
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {log.comment && <div style={{
                marginTop: 4,
                fontSize: 12,
                color: "var(--text-secondary)"
              }}>{log.comment}</div>}
                    </div>)}
                </div>
              </>}
          </div> : null}
      </RightDrawer>

      {/* ── PR 转 PO 对话框 ────────────────────────────────────────────────── */}
      <SimpleModal open={convertOpen} onClose={() => setConvertOpen(false)} title="从已审批采购申请转采购订单">
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "8px 0"
      }}>
          <div>
            <label className={s.lbl}>选择已审批的采购申请 *</label>
            <select className={s.inp} value={selectedPRId} onChange={e => setSelectedPRId(e.target.value)}>
              <option value="">-- 请选择 --</option>
              {approvedPRs.map(pr => <option key={pr.id} value={pr.id}>
                  {pr.reqNo} — {pr.subject} ({pr.companyCode})
                </option>)}
            </select>
            {approvedPRs.length === 0 && <div style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginTop: 4
          }}>暂无已审批的采购申请</div>}
          </div>
          <div className={s.fieldRow}>
            <div className={s.field}>
              <label className={s.lbl}>供应商代码 *</label>
              <input className={s.inp} value={convSupplierCode} onChange={e => setConvSupplierCode(e.target.value)} placeholder="供应商代码" />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>供应商名称 *</label>
              <input className={s.inp} value={convSupplierName} onChange={e => setConvSupplierName(e.target.value)} placeholder="供应商名称" />
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
            <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer"
          }}>
              <input type="checkbox" checked={convCrossBorder} onChange={e => setConvCrossBorder(e.target.checked)} />
              跨境采购
            </label>
          </div>
          <div>
            <label className={s.lbl}>备注</label>
            <textarea className={s.textarea} rows={2} value={convRemark} onChange={e => setConvRemark(e.target.value)} />
          </div>
        </div>
        <div style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 12
      }}>
          <button type="button" className={s.btnSecondary} onClick={() => setConvertOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={converting} onClick={handleConvert}>
            {converting ? "转换中…" : "确认转换"}
          </button>
        </div>
      </SimpleModal>

      {/* 审批通过/驳回已收口至集团审批引擎，请前往『工作流·待办』(/workflow/todos) 处理 */}

      <SimpleModal open={submitOpen} onClose={() => setSubmitOpen(false)} title="提交采购订单 · 选择下一审批人">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
          <div>订单：<strong style={{ color: "var(--text-primary)" }}>{submitTarget?.poNo ?? submitTarget?.subject}</strong></div>
          <div>候选人已按采购订单权限、公司/项目数据域过滤。选择后会指定给该审批人；也可按审批规则提交。</div>
        </div>
        <div className={s.field}>
          <label className={s.lbl}>下一审批人</label>
          {submitCandidateLoading ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>正在加载可审批人员…</div>
            : submitCandidates.length === 0 ? <div style={{ padding: 18, textAlign: "center", color: "var(--status-warning)", fontSize: 13, lineHeight: 1.7 }}>未找到可指定审批人，可按审批规则提交；若规则也未配置，后端会阻止提交。</div>
            : <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                {submitCandidates.map(candidate => (
                  <button key={candidate.userId} type="button" onClick={() => setSubmitApproverId(candidate.userId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${submitApproverId === candidate.userId ? "var(--color-primary)" : "var(--border)"}`,
                      background: submitApproverId === candidate.userId ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "var(--bg-card)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "left"
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: submitApproverId === candidate.userId ? "var(--color-primary)" : "var(--border)", flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>{candidate.displayName}</span>
                    {candidate.roleNameZh && <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)" }}>{candidate.roleNameZh}</span>}
                  </button>
                ))}
              </div>}
        </div>
        <div className={s.field} style={{ marginTop: 12 }}>
          <label className={s.lbl}>提交说明</label>
          <textarea className={s.textarea} rows={3} value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="可填写合同、交付、付款或跨境采购注意事项" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className={s.btnSecondary} onClick={() => setSubmitOpen(false)}>取消</button>
          <button type="button" className={s.btnSecondary} disabled={actionSubmitting} onClick={() => handleSubmit(undefined)}>按审批规则提交</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting || !submitApproverId} onClick={() => handleSubmit(submitApproverId)}>
            {actionSubmitting ? "提交中…" : "提交给所选审批人"}
          </button>
        </div>
      </SimpleModal>

      {/* ── 取消对话框 ─────────────────────────────────────────────────────── */}
      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消采购订单">
        <p style={{
        fontSize: 13,
        margin: "8px 0"
      }}>确认取消 <strong>{actionTarget?.poNo}</strong>？</p>
        <textarea className={s.textarea} rows={2} placeholder="取消原因（可选）" value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 12
      }}>
          <button type="button" className={s.btnSecondary} onClick={() => setCancelOpen(false)}>取消</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting} onClick={() => execAction("cancel", actionComment, "已取消")}>
            {actionSubmitting ? "处理中…" : "确认取消"}
          </button>
        </div>
      </SimpleModal>
    </div>;
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────
// G155：本地手写 SimpleModal 下沉到全局 ModalV2（统一遮罩/头部/关闭/ESC/动画）。
const SimpleModal = ModalV2;
function actionLabel(a: string) {
  return ({
    SUBMIT: "提交",
    APPROVE: "批准",
    REJECT: "拒绝",
    CANCEL: "取消",
    CONVERT_TO_PO: "转采购订单",
    COMMENT: "备注"
  } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({
    SUBMIT: "badgeInfo",
    APPROVE: "badgeSuccess",
    REJECT: "badgeDanger",
    CANCEL: "badgeNeutral",
    CONVERT_TO_PO: "badgeInfo",
    COMMENT: "badgeInfo"
  } as Record<string, string>)[a] ?? "badgeNeutral";
}
