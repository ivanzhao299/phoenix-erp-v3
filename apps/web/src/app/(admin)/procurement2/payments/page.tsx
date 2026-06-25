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
import s from "@/components/ui/admin-ui.module.css";

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
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  DRAFT:            { label: "草稿",   cls: "badgeNeutral" },
  SUBMITTED:        { label: "待审批", cls: "badgeInfo" },
  PENDING_APPROVAL: { label: "待审批", cls: "badgeInfo" },   // G147：后端 submit 实际置此状态
  APPROVED:         { label: "已审批", cls: "badgeWarning" },
  PAID:             { label: "已付款", cls: "badgeSuccess" },
  REJECTED:         { label: "已驳回", cls: "badgeDanger" },
  CANCELLED:        { label: "已取消", cls: "badgeNeutral" },
};
const PAYER_TYPE_OPTS: { value: string; label: string }[] = [
  { value: "COMPANY", label: "公司" },
  { value: "SHAREHOLDER", label: "股东" },
  { value: "BORROW", label: "借款" },
  { value: "INTERNAL", label: "内部" },
];
// G148/G149：付款方/付款方式/资金性质枚举的中文映射——界面统一显示中文（与 sys_dict
//   FIN_PAYER_TYPE / PRC_PAYMENT_METHOD / FIN_FUND_NATURE 一致）。英文码留在数据层，等国际化再切。
const PAYER_TYPE_LABEL: Record<string, string> = Object.fromEntries(PAYER_TYPE_OPTS.map(t => [t.value, t.label]));
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK: "银行转账", TRANSFER: "转账", CASH: "现金", ALIPAY: "支付宝", WECHAT: "微信",
};
const FUND_NATURE_LABEL: Record<string, string> = {
  INVESTMENT: "投资款", LOAN: "借款", ADVANCE: "预付款", NORMAL: "正常款项",
};

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
      toast.error("加载失败");
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
        throw new Error(e.message ?? "操作失败");
      }
      toast.success(msg);
      setPayOpen(false);
      setCancelOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setActionSubmitting(false);
    }
  }

  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return <div className="animate-fade-in">
      <PageHeader title="付款管理" subtitle={`采购资金付款台账 · 共 ${data.total} 条`} breadcrumb={["采购管理", "付款管理"]} actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> 刷新
          </button>
          {/* G149：新建改为独立整页（抽屉放不下数据多的表单） */}
          <Link href="/procurement2/payments/new" className={`${s.btnPrimary} ${u.flexRow}`}>
            <Plus size={14} /> 新建付款单
          </Link>
        </div>} />

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)} placeholder="付款单号 / 付款人 / 备注" style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fPayerType} onChange={e => setFPayerType(e.target.value)} style={inlineSelect}>
          <option value="">全部付款方</option>
          {PAYER_TYPE_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={fCurrency} onChange={e => setFCurrency(e.target.value)} style={inlineSelect}>
          <option value="">全部货币</option>
          {["CNY", "LAK", "THB", "USD"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>付款日：</span>
        <input type="date" style={{ ...inlineSelect, flex: "0 0 130px" }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
        <span className={u.muted12}>~</span>
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
              <th className={u.tar}>付款金额</th>
              <th>汇率</th>
              <th>方式</th>
              <th>状态</th>
              <th style={{ width: 168 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className={u.emptyCenter}>加载中…</td></tr>
            ) : data.items.length === 0 ? (
              <tr><td colSpan={10} className={u.emptyCenter}>暂无付款单</td></tr>
            ) : data.items.map(row => {
              const st = STATUS_MAP[row.status] ?? { label: row.status, cls: "badgeNeutral" };
              return <tr key={row.id}>
                <td style={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{row.payNo}</td>
                <td className={u.nowrap}>{fmtDate(row.paymentDate)}</td>
                {/* G149：公司显示中文名（无名称时回退编码） */}
                <td>{row.companyName || row.companyCode || "—"}</td>
                <td className={u.fs11}>
                  <span className={`${s.badge} ${s.badgeNeutral}`}>{PAYER_TYPE_LABEL[row.payerType] ?? row.payerType}</span>
                  {row.isShareholderPayment && <span className={`${s.badge} ${s.badgeWarning}`} style={{ marginLeft: 4 }}>代付</span>}
                </td>
                <td>{row.payerName}</td>
                {/* G149：金额已含币种前缀，去掉冗余「货币」列以收窄表格 */}
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtAmt(row.amountOriginal, row.currencyCode)}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{row.exchangeRate}</td>
                <td>{row.paymentMethod ? (PAYMENT_METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod) : "—"}</td>
                <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={actBtn} onClick={() => openDetail(row)}>查看</button>
                    {row.status === "DRAFT" && <>
                      <Link href={`/procurement2/payments/${row.id}/edit`} style={{ ...actBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>编辑</Link>
                      <button style={actBtnTone("success")} onClick={() => openSubmit(row)}>提交审批</button>
                    </>}
                    {(row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL") && (
                      <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title="审批请前往『工作流·待办』">前往审批</Link>
                    )}
                    {row.status === "APPROVED" && (
                      <button style={actBtnTone("primary")} onClick={() => openPay(row)}>确认付款</button>
                    )}
                    {(row.status === "DRAFT" || row.status === "SUBMITTED" || row.status === "PENDING_APPROVAL" || row.status === "APPROVED") && (
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
      {totalPages > 1 && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <span className={u.muted12}>共 {data.total} 条</span>
        <button className={s.btnIcon} disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, minWidth: 60, textAlign: "center" }}>{page} / {totalPages}</span>
        <button className={s.btnIcon} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
      </div>}

      {/* ── 详情抽屉 ──────────────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={detailData ? `付款详情：${detailData.payNo}` : "详情"} width={680}>
        {detailLoading ? <div className={u.emptyCenter}>加载中…</div> : detailData ? <div style={{ padding: "0 4px" }}>
          <div className={s.formSection}>基础信息</div>
          {[
            { label: "付款单号", value: detailData.payNo, mono: true },
            { label: "付款日期", value: fmtDate(detailData.paymentDate) },
            { label: "公司", value: detailData.companyName || detailData.companyCode || "—" },
            { label: "付款方", value: `${PAYER_TYPE_LABEL[detailData.payerType] ?? detailData.payerType} / ${detailData.payerName}` },
            { label: "收款方", value: detailData.payeeName ?? "—" },
            { label: "金额", value: fmtAmt(detailData.amountOriginal, detailData.currencyCode) },
            { label: "汇率", value: `${detailData.exchangeRate} → CNY ${fmtAmt(detailData.amountBase, "CNY")}` },
            { label: "方式", value: detailData.paymentMethod ? (PAYMENT_METHOD_LABEL[detailData.paymentMethod] ?? detailData.paymentMethod) : "—" },
            { label: "备注", value: detailData.remark ?? "—" },
          ].map(r => <div key={r.label} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <span style={{ width: 72, flexShrink: 0, color: "var(--text-secondary)", fontSize: 12 }}>{r.label}</span>
            <span style={{ flex: 1, fontFamily: r.mono ? "monospace" : undefined }}>{r.value}</span>
          </div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span className={`${s.badge} ${s[STATUS_MAP[detailData.status]?.cls ?? "badgeNeutral"]}`}>{STATUS_MAP[detailData.status]?.label ?? detailData.status}</span>
            {detailData.isShareholderPayment && <span className={`${s.badge} ${s.badgeWarning}`}>股东代付</span>}
            {detailData.fundNature && <span className={`${s.badge} ${s.badgeInfo}`}>{FUND_NATURE_LABEL[detailData.fundNature] ?? detailData.fundNature}</span>}
          </div>

          {/* 分摊明细 */}
          {detailData.allocations && detailData.allocations.length > 0 && <>
            <div className={s.formSection} style={{ marginTop: 20 }}>应付分摊明细（{detailData.allocations.length} 条）</div>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
              <table className={s.table}>
                <thead>
                  <tr><th>应付单号</th><th>采购订单号</th><th>项目</th><th className={u.tar}>分摊金额</th><th className={u.tar}>折算 CNY</th></tr>
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
            <div className={s.formSection} style={{ marginTop: 20 }}>审批日志</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detailData.approvals.map(log => <div key={log.id} style={{ background: "var(--bg-muted)", borderRadius: 6, padding: "8px 12px", border: "1px solid var(--border)" }}>
                <div className={u.flexRow8}>
                  <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(log.action)}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{log.approverName ?? "系统"}</span>
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
      <SimpleModal open={submitOpen} onClose={() => setSubmitOpen(false)} title="提交付款审批 · 选择下一审批人">
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
          <div>付款单：<strong style={{ color: "var(--text-primary)" }}>{submitTarget?.payNo}</strong></div>
          <div>候选人已按付款审批权限、公司/项目数据域过滤。付款审批涉及资金出款，请确认下一审批人。</div>
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
          <textarea className={s.textarea} rows={3} value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="可填写付款背景、合同依据或资金安排说明" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className={s.btnSecondary} onClick={() => setSubmitOpen(false)}>取消</button>
          <button type="button" className={s.btnSecondary} disabled={actionSubmitting} onClick={() => handleSubmit(undefined)}>按审批规则提交</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting || !submitApproverId} onClick={() => handleSubmit(submitApproverId)}>
            {actionSubmitting ? "提交中…" : "提交给所选审批人"}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={payOpen} onClose={() => setPayOpen(false)} title="确认付款">
        <p style={{ fontSize: 13, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} color="var(--status-warning)" />
          执行付款 <strong>{actionTarget?.payNo}</strong>（{fmtAmt(actionTarget?.amountOriginal, actionTarget?.currencyCode)}）
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px" }}>付款后将自动核销对应应付单，此操作不可撤销。</p>
        <textarea className={s.textarea} rows={2} placeholder="付款备注（可选）" value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setPayOpen(false)}>取消</button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting} style={{ background: "var(--color-purple-500)" }} onClick={() => execAction("pay", actionComment, "付款执行成功，应付已核销")}>
            {actionSubmitting ? "处理中…" : "确认付款"}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title="取消付款单">
        <p style={{ fontSize: 13, margin: "8px 0" }}>确认取消 <strong>{actionTarget?.payNo}</strong>？</p>
        <textarea className={s.textarea} rows={2} placeholder="取消原因（可选）" value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className={s.btnSecondary} onClick={() => setCancelOpen(false)}>取消</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting} onClick={() => execAction("cancel", actionComment, "已取消")}>
            {actionSubmitting ? "处理中…" : "确认取消"}
          </button>
        </div>
      </SimpleModal>
    </div>;
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
// G155：本地手写 SimpleModal 下沉到全局 ModalV2（统一遮罩/头部/关闭/ESC/动画）。
const SimpleModal = ModalV2;
function actionLabel(a: string) {
  return ({ SUBMIT: "提交", APPROVE: "通过", REJECT: "拒绝", CANCEL: "取消", PAY: "付款" } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({ SUBMIT: "badgeInfo", APPROVE: "badgeSuccess", REJECT: "badgeDanger", CANCEL: "badgeNeutral", PAY: "badgeSuccess" } as Record<string, string>)[a] ?? "badgeNeutral";
}
