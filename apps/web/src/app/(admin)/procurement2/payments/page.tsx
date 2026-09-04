"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import Link from "next/link";
import { Plus, RefreshCw, Clock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { ModalV2 } from "@/components/design-system"; // G155：统一全局模态，替代本地手写 SimpleModal
import { actBtn, actBtnTone } from "../_shared/actionButtons"; // G159：操作列文字按钮
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from '@/contexts/LanguageContext';
import s from "@/components/ui/admin-ui.module.css";
import { invalidateCashAccountLookups } from "@/lib/request-cache";

// ── 类型 ──────────────────────────────────────────────────────────────────────
interface Allocation {
  id?: string;
  poNo?: string;
  apNo?: string;
  projectCode?: string;
  allocatedAmountOriginal: number | string;
  allocatedAmountBase?: number | string;
}
interface Approval {
  id: string;
  action: string;
  approvalNode: string;
  approverName?: string;
  comment?: string;
  createdAt: string;
}
interface Payment {
  id: string;
  payNo: string;
  paymentDate?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  payerType: string;
  payerName: string;
  payerAccount?: string;
  payeeName?: string;
  currencyCode: string;
  amountOriginal: number | string;
  exchangeRate: number | string;
  amountBase?: number | string;
  baseCurrency?: string;
  paymentMethod?: string;
  fundNature?: string;
  isShareholderPayment?: boolean;
  shareholderId?: string;
  shareholderName?: string;
  status: string;
  voucherUrl?: string;
  remark?: string;
  createdAt: string;
  allocations?: Allocation[];
  approvals?: Approval[];
}
interface PageResult {
  items: Payment[];
  total: number;
  page: number;
  pageSize: number;
}
interface ApprovalCandidate {
  userId: string;
  displayName: string;
  roleNameZh?: string | null;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────
type TFn = (key: string, fallback: string) => string;
const buildStatusMap = (t: TFn): Record<string, { label: string; cls: string }> => ({
  DRAFT:            { label: t('prc2.status_draft', "草稿"),   cls: "badgeNeutral" },
  SUBMITTED:        { label: t('prc2.status_pending_approval', "待审批"), cls: "badgeInfo" },
  PENDING_APPROVAL: { label: t('prc2.status_pending_approval', "待审批"), cls: "badgeInfo" },   // G147：后端 submit 实际置此状态
  APPROVED:         { label: t('prc2.status_approved_pay', "已审批"), cls: "badgeWarning" },
  PAID:             { label: t('prc2.status_paid', "已付款"), cls: "badgeSuccess" },
  REJECTED:         { label: t('prc2.status_rejected_done', "已驳回"), cls: "badgeDanger" },
  CANCELLED:        { label: t('prc2.status_cancelled', "已取消"), cls: "badgeNeutral" },
});
const buildPayerTypeOpts = (t: TFn): { value: string; label: string }[] => [
  { value: "COMPANY", label: t('prc2.payer_company', "公司") },
  { value: "SHAREHOLDER", label: t('prc2.payer_shareholder', "股东") },
  { value: "BORROW", label: t('prc2.payer_borrow', "借款") },
  { value: "INTERNAL", label: t('prc2.payer_internal', "内部") },
];
// G148/G149：付款方/付款方式/资金性质枚举的中文映射——界面统一显示中文（与 sys_dict
//   FIN_PAYER_TYPE / PRC_PAYMENT_METHOD / FIN_FUND_NATURE 一致）。英文码留在数据层，等国际化再切。
const buildPayerTypeLabel = (t: TFn): Record<string, string> => Object.fromEntries(buildPayerTypeOpts(t).map(o => [o.value, o.label]));
const buildPaymentMethodLabel = (t: TFn): Record<string, string> => ({
  BANK: t('prc2.method_bank', "银行转账"), TRANSFER: t('prc2.method_transfer', "转账"), CASH: t('prc2.method_cash', "现金"), ALIPAY: t('prc2.method_alipay', "支付宝"), WECHAT: t('prc2.method_wechat', "微信"),
});
const buildFundNatureLabel = (t: TFn): Record<string, string> => ({
  INVESTMENT: t('prc2.nature_investment', "投资款"), LOAN: t('prc2.nature_loan', "借款"), ADVANCE: t('prc2.nature_advance', "预付款"), NORMAL: t('prc2.nature_normal', "正常款项"),
});

const API_PAY = "/api/v2/procurement/payments";
function fmtAmt(v?: number | string, cur = "CNY") {
  if (v === undefined || v === null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return `${cur} ${n.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d?: string) { return d ? d.slice(0, 10) : "—"; }
const inlineInput: React.CSSProperties = {
  flex: "1 1 180px", padding: "8px 12px", background: "var(--bg-card)",
  border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
  color: "var(--text-primary)", fontSize: 13, outline: "none",
};
const inlineSelect: React.CSSProperties = { ...inlineInput, flex: "0 0 auto" };

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const STATUS_MAP = buildStatusMap(t);
  const PAYER_TYPE_OPTS = buildPayerTypeOpts(t);
  const PAYER_TYPE_LABEL = buildPayerTypeLabel(t);
  const PAYMENT_METHOD_LABEL = buildPaymentMethodLabel(t);
  const FUND_NATURE_LABEL = buildFundNatureLabel(t);
  const [data, setData] = useState<PageResult>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [fStatus, setFStatus] = useState("");
  const [fPayerType, setFPayerType] = useState("");
  const [fCurrency, setFCurrency] = useState("");
  const [fKeyword, setFKeyword] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  // 详情抽屉
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<Payment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作弹窗（审批通过/驳回已收口至集团审批引擎，见 /workflow/todos）
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<Payment | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<Payment | null>(null);
  const [submitComment, setSubmitComment] = useState("");
  const [submitCandidates, setSubmitCandidates] = useState<ApprovalCandidate[]>([]);
  const [submitApproverId, setSubmitApproverId] = useState("");
  const [submitCandidateLoading, setSubmitCandidateLoading] = useState(false);

  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 加载列表
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (fStatus) params.set("status", fStatus);
      if (fPayerType) params.set("payerType", fPayerType);
      if (fCurrency) params.set("currencyCode", fCurrency);
      if (fKeyword) params.set("keyword", fKeyword);
      if (fDateFrom) params.set("paymentDateFrom", fDateFrom);
      if (fDateTo) params.set("paymentDateTo", fDateTo);
      const res = await fetch(`${API_PAY}?${params}`, { headers: hdr });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch {
      toast.error(t('prc2.load_failed', "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [page, fStatus, fPayerType, fCurrency, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => { load(1); setPage(1); }, [fStatus, fPayerType, fCurrency, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  // 详情
  async function openDetail(row: Payment) {
    setDetailData(row);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_PAY}/${row.id}`, { headers: hdr });
      if (res.ok) setDetailData(await res.json());
    } catch {/* ignore */} finally {
      setDetailLoading(false);
    }
  }

  // 提交审批
  async function openSubmit(row: Payment) {
    setSubmitTarget(row);
    setSubmitComment("");
    setSubmitApproverId("");
    setSubmitCandidates([]);
    setSubmitOpen(true);
    setSubmitCandidateLoading(true);
    try {
      const qs = new URLSearchParams({ menuCode: "MENU_PRC2_PAYMENT", requiredPerm: "E" });
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
      const res = await fetch(`${API_PAY}/${submitTarget.id}/submit`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ comment: submitComment, approverUserId: approverUserId || undefined })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.submit_failed', "提交失败"));
      }
      toast.success(t('prc2.submitted_approval', "已提交审批"));
      setSubmitOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.submit_failed', "提交失败"));
    } finally {
      setActionSubmitting(false);
    }
  }

  // 操作弹窗
  function openPay(row: Payment) { setActionTarget(row); setActionComment(""); setPayOpen(true); }
  function openCancel(row: Payment) { setActionTarget(row); setActionComment(""); setCancelOpen(true); }
  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_PAY}/${actionTarget.id}/${endpoint}`, { method: "POST", headers: hdr, body: JSON.stringify({ comment }) });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.action_failed', "操作失败"));
      }
      toast.success(msg);
      if (endpoint === "pay") invalidateCashAccountLookups();
      setPayOpen(false);
      setCancelOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.action_failed', "操作失败"));
    } finally {
      setActionSubmitting(false);
    }
  }

  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return <div className="animate-fade-in">
      <PageHeader title={t('prc2.bc_payments', "付款管理")} subtitle={`${t('prc2.payments_subtitle', "采购资金付款台账")} · ${t('prc2.total_count', "共")} ${data.total} ${t('prc2.unit_records', "条")}`} breadcrumb={[t('prc2.bc_procurement', "采购管理"), t('prc2.bc_payments', "付款管理")]} actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> {t('prc2.refresh', "刷新")}
          </button>
          {/* G149：新建改为独立整页（抽屉放不下数据多的表单） */}
          <Link href="/procurement2/payments/new" className={`${s.btnPrimary} ${u.flexRow}`}>
            <Plus size={14} /> {t('prc2.new_payment', "新建付款单")}
          </Link>
        </div>} />

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)} placeholder={t('prc2.search_payment_ph', "付款单号 / 付款人 / 备注")} style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_status', "全部状态")}</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fPayerType} onChange={e => setFPayerType(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_payer', "全部付款方")}</option>
          {PAYER_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_currency', "全部货币")}</option>
          {["CNY", "LAK", "THB", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{t('prc2.payment_date_filter', "付款日：")}</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
        <span className={u.muted12}>~</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
      </div>

      {/* 列表 */}
      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{t('prc2.pay_no', "付款单号")}</th>
              <th>{t('prc2.payment_date', "付款日期")}</th>
              <th>{t('prc2.company', "公司")}</th>
              <th>{t('prc2.payer', "付款方")}</th>
              <th>{t('prc2.payer_name_label', "付款人")}</th>
              <th className={u.tar}>{t('prc2.pay_amount', "付款金额")}</th>
              <th>{t('prc2.exchange_rate', "汇率")}</th>
              <th>{t('prc2.method', "方式")}</th>
              <th>{t('prc2.status', "状态")}</th>
              <th style={{ width: 168 }}>{t('prc2.action', "操作")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className={u.emptyCenter}>{t('prc2.loading', "加载中…")}</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={10} className={u.emptyCenter}>{t('prc2.empty_no_payment', "暂无付款单")}</td></tr>
            ) : data.items.map(row => {
              const st = STATUS_MAP[row.status] ?? { label: row.status, cls: "badgeNeutral" };
              return <tr key={row.id}>
                <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.payNo}</td>
                <td className={u.nowrap}>{fmtDate(row.paymentDate)}</td>
                {/* G149：公司显示中文名（无名称时回退编码） */}
                <td>{row.companyName || row.companyCode || "—"}</td>
                <td className={u.fs11}>
                  <span className={`${s.badge} ${s.badgeNeutral}`}>{PAYER_TYPE_LABEL[row.payerType] ?? row.payerType}</span>
                  {row.isShareholderPayment && <span className={`${s.badge} ${s.badgeWarning}`} style={{ marginLeft: 4 }}>{t('prc2.proxy_pay', "代付")}</span>}
                </td>
                <td>{row.payerName}</td>
                {/* G149：金额已含币种前缀，去掉冗余「货币」列以收窄表格 */}
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtAmt(row.amountOriginal, row.currencyCode)}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{row.exchangeRate}</td>
                <td>{row.paymentMethod ? (PAYMENT_METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod) : "—"}</td>
                <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={actBtn} onClick={() => openDetail(row)}>{t('prc2.view', "查看")}</button>
                    {row.status === "DRAFT" && <>
                      <Link href={`/procurement2/payments/${row.id}/edit`} style={{ ...actBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{t('prc2.edit', "编辑")}</Link>
                      <button style={actBtnTone("success")} onClick={() => openSubmit(row)}>{t('prc2.submit_approval', "提交审批")}</button>
                    </>}
                    {(row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL") && (
                      <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title={t('prc2.go_approve_title', "审批请前往『工作流·待办』")}>{t('prc2.go_approve', "前往审批")}</Link>
                    )}
                    {row.status === "APPROVED" && (
                      <button style={actBtnTone("primary")} onClick={() => openPay(row)}>{t('prc2.confirm_pay', "确认付款")}</button>
                    )}
                    {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL" || row.status === "APPROVED") && (
                      <button style={actBtnTone("danger")} onClick={() => openCancel(row)}>{t('prc2.cancel', "取消")}</button>
                    )}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <span className={u.muted12}>{t('prc2.total_count', "共")} {data.total} {t('prc2.unit_records', "条")}</span>
        <button className={s.btnIcon} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, minWidth: 60, textAlign: "center" }}>{page} / {totalPages}</span>
        <button className={s.btnIcon} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
      </div>}

      {/* ── 详情抽屉 ──────────────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={detailData ? `${t('prc2.payment_detail', "付款详情")}：${detailData.payNo}` : t('prc2.detail', "详情")} width={680}>
        {detailLoading ? <div className={u.emptyCenter}>{t('prc2.loading', "加载中…")}</div> : detailData ? <div style={{ padding: "0 4px" }}>
          <div className={s.formSection}>{t('prc2.basic_info', "基础信息")}</div>
          {[
            { label: t('prc2.pay_no', "付款单号"), value: detailData.payNo, mono: true },
            { label: t('prc2.payment_date', "付款日期"), value: fmtDate(detailData.paymentDate) },
            { label: t('prc2.company', "公司"), value: detailData.companyName || detailData.companyCode || "—" },
            { label: t('prc2.payer', "付款方"), value: `${PAYER_TYPE_LABEL[detailData.payerType] ?? detailData.payerType} / ${detailData.payerName}` },
            { label: t('prc2.payee', "收款方"), value: detailData.payeeName ?? "—" },
            { label: t('prc2.amount', "金额"), value: fmtAmt(detailData.amountOriginal, detailData.currencyCode) },
            { label: t('prc2.exchange_rate', "汇率"), value: `${detailData.exchangeRate} → CNY ${fmtAmt(detailData.amountBase, "CNY")}` },
            { label: t('prc2.method', "方式"), value: detailData.paymentMethod ? (PAYMENT_METHOD_LABEL[detailData.paymentMethod] ?? detailData.paymentMethod) : "—" },
            { label: t('prc2.remark', "备注"), value: detailData.remark ?? "—" },
          ].map(r => <div key={r.label} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <span style={{ width: 72, flexShrink: 0, color: "var(--text-secondary)", fontSize: 12 }}>{r.label}</span>
            <span style={{ flex: 1, fontFamily: r.mono ? "monospace" : undefined }}>{r.value}</span>
          </div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span className={`${s.badge} ${s[STATUS_MAP[detailData.status]?.cls ?? "badgeNeutral"]}`}>{STATUS_MAP[detailData.status]?.label ?? detailData.status}</span>
            {detailData.isShareholderPayment && <span className={`${s.badge} ${s.badgeWarning}`}>{t('prc2.shareholder_proxy', "股东代付")}</span>}
            {detailData.fundNature && <span className={`${s.badge} ${s.badgeInfo}`}>{FUND_NATURE_LABEL[detailData.fundNature] ?? detailData.fundNature}</span>}
          </div>

          {/* 分摊明细 */}
          {detailData.allocations && detailData.allocations.length > 0 && <>
            <div className={s.formSection} style={{ marginTop: 20 }}>{t('prc2.ap_alloc_detail', "应付分摊明细")}（{detailData.allocations.length} {t('prc2.unit_records', "条")}）</div>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
              <table className={s.table}>
                <thead>
                  <tr><th>{t('prc2.ap_no', "应付单号")}</th><th>{t('prc2.po_no', "采购订单号")}</th><th>{t('prc2.project', "项目")}</th><th className={u.tar}>{t('prc2.alloc_amount', "分摊金额")}</th><th className={u.tar}>{t('prc2.convert_cny', "折算 CNY")}</th></tr>
                </thead>
                <tbody>
                  {detailData.allocations.map((a, i) => <tr key={i}>
                    <td>{a.apNo ?? "—"}</td>
                    <td>{a.poNo ?? "—"}</td>
                    <td>{a.projectCode ?? "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(a.allocatedAmountOriginal).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{Number(a.allocatedAmountBase ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </>}

          {/* 审批日志 */}
          {detailData.approvals && detailData.approvals.length > 0 && <>
            <div className={s.formSection} style={{ marginTop: 20 }}>{t('prc2.approval_log', "审批日志")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detailData.approvals.map(log => <div key={log.id} style={{ background: "var(--bg-muted)", borderRadius: 6, padding: "8px 12px", border: "1px solid var(--border)" }}>
                <div className={u.flexRow8}>
                  <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(t, log.action)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{log.approverName ?? t('prc2.system', "系统")}</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
                    <Clock size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                {log.comment && <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{log.comment}</div>}
              </div>)}
            </div>
          </>}
        </div> : null}
      </RightDrawer>

      {/* ── 操作弹窗 ──────────────────────────────────────────────────────────── */}
      <SimpleModal open={submitOpen} onClose={() => setSubmitOpen(false)} title={t('prc2.submit_pay_approval_title', "提交付款审批 · 选择下一审批人")}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
          <div>{t('prc2.payment_label', "付款单")}：<strong style={{ color: "var(--text-primary)" }}>{submitTarget?.payNo}</strong></div>
          <div>{t('prc2.submit_pay_hint', "候选人已按付款审批权限、公司/项目数据域过滤。付款审批涉及资金出款，请确认下一审批人。")}</div>
        </div>
        <div className={s.field}>
          <label className={s.lbl}>{t('prc2.next_approver', "下一审批人")}</label>
          {submitCandidateLoading ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>{t('prc2.loading_approvers', "正在加载可审批人员…")}</div>
            : submitCandidates.length === 0 ? <div style={{ padding: 18, textAlign: "center", color: "var(--status-warning)", fontSize: 13, lineHeight: 1.7 }}>{t('prc2.no_approver_found', "未找到可指定审批人，可按审批规则提交；若规则也未配置，后端会阻止提交。")}</div>
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
          <label className={s.lbl}>{t('prc2.submit_note', "提交说明")}</label>
          <textarea className={s.textarea} rows={3} value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder={t('prc2.submit_note_ph', "可填写付款背景、合同依据或资金安排说明")} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className={s.btnSecondary} onClick={() => setSubmitOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnSecondary} disabled={actionSubmitting} onClick={() => handleSubmit(undefined)}>{t('prc2.submit_by_rule', "按审批规则提交")}</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting || !submitApproverId} onClick={() => handleSubmit(submitApproverId)}>
            {actionSubmitting ? t('prc2.submitting', "提交中…") : t('prc2.submit_to_selected', "提交给所选审批人")}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={payOpen} onClose={() => setPayOpen(false)} title={t('prc2.confirm_pay', "确认付款")}>
        <p style={{ fontSize: 13, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} color="var(--status-warning)" />
          {t('prc2.exec_pay', "执行付款")} <strong>{actionTarget?.payNo}</strong>（{fmtAmt(actionTarget?.amountOriginal, actionTarget?.currencyCode)}）
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px" }}>{t('prc2.pay_irreversible_hint', "付款后将自动核销对应应付单，此操作不可撤销。")}</p>
        <textarea className={s.textarea} rows={2} placeholder={t('prc2.pay_remark_ph', "付款备注（可选）")} value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setPayOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting} style={{ background: "var(--color-purple-500)" }} onClick={() => execAction("pay", actionComment, t('prc2.pay_success', "付款执行成功，应付已核销"))}>
            {actionSubmitting ? t('prc2.processing', "处理中…") : t('prc2.confirm_pay', "确认付款")}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('prc2.cancel_payment_title', "取消付款单")}>
        <p style={{ fontSize: 13, margin: "8px 0" }}>{t('prc2.confirm_cancel_q', "确认取消")} <strong>{actionTarget?.payNo}</strong>？</p>
        <textarea className={s.textarea} rows={2} placeholder={t('prc2.cancel_reason_ph', "取消原因（可选）")} value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setCancelOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting} onClick={() => execAction("cancel", actionComment, t('prc2.cancelled_done', "已取消"))}>
            {actionSubmitting ? t('prc2.processing', "处理中…") : t('prc2.confirm_cancel', "确认取消")}
          </button>
        </div>
      </SimpleModal>
    </div>;
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
// G155：本地手写 SimpleModal 下沉到全局 ModalV2（统一遮罩/头部/关闭/ESC/动画）。
const SimpleModal = ModalV2;
function actionLabel(t: TFn, a: string) {
  return ({
    SUBMIT: t('prc2.act_submit', "提交"),
    APPROVE: t('prc2.act_approve_pass', "通过"),
    REJECT: t('prc2.act_reject', "拒绝"),
    CANCEL: t('prc2.act_cancel', "取消"),
    PAY: t('prc2.act_pay', "付款"),
  } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({ SUBMIT: "badgeInfo", APPROVE: "badgeSuccess", REJECT: "badgeDanger", CANCEL: "badgeNeutral", PAY: "badgeSuccess" } as Record<string, string>)[a] ?? "badgeNeutral";
}
