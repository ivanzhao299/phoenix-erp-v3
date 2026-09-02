"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import u from "@/styles/uix-utils.module.css";
import { Plus, RefreshCw, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { ModalV2 } from "@/components/design-system"; // G155：统一全局模态，替代本地手写 SimpleModal
import { actBtn, actBtnTone } from "../_shared/actionButtons"; // G159：操作列文字按钮
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from '@/contexts/LanguageContext';
import s from "@/components/ui/admin-ui.module.css";
import { SupplierSelector } from "@/components/shared-selectors/MasterDataSelectors"; // G4-B 主数据选择器（转单弹窗用）
import { useDictOptions } from '@/hooks/useDictOptions';

type TFn = (key: string, fallback: string) => string;

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
interface PageResult {
  items: PurchaseRequest[];
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
function buildStatusMap(t: TFn): Record<string, {
  label: string;
  cls: string;
}> {
  return {
    DRAFT: {
      label: t('prc2.status_draft', "草稿"),
      cls: "badgeNeutral"
    },
    SUBMITTED: {
      label: t('prc2.status_pending_approval', "待审批"),
      cls: "badgeInfo"
    },
    APPROVED: {
      label: t('prc2.status_approved', "已批准"),
      cls: "badgeSuccess"
    },
    REJECTED: {
      label: t('prc2.status_rejected', "已拒绝"),
      cls: "badgeDanger"
    },
    CANCELLED: {
      label: t('prc2.status_cancelled', "已取消"),
      cls: "badgeNeutral"
    },
    CONVERTED: {
      label: t('prc2.status_converted', "已转采购订单"),
      cls: "badgeSuccess"
    }
  };
}
function buildUrgencyMap(t: TFn): Record<string, {
  label: string;
  cls: string;
}> {
  return {
    NORMAL: {
      label: t('prc2.urgency_normal', "普通"),
      cls: "badgeNeutral"
    },
    URGENT: {
      label: t('prc2.urgency_urgent', "紧急"),
      cls: "badgeWarning"
    },
    CRITICAL: {
      label: t('prc2.urgency_critical', "特急"),
      cls: "badgeDanger"
    }
  };
}
function buildPurchaseTypeOpts(t: TFn) {
  return [{
    value: "MATERIAL",
    label: t('prc2.ptype_material', "原料/物料")
  }, {
    value: "CONSTRUCTION",
    label: t('prc2.ptype_construction', "装修/工程")
  }, {
    value: "EQUIPMENT",
    label: t('prc2.ptype_equipment', "设备/机械")
  }, {
    value: "SERVICE",
    label: t('prc2.ptype_service', "服务/外包")
  }, {
    value: "FIXED_ASSET",
    label: t('prc2.ptype_fixed_asset', "固定资产")
  }, {
    value: "OTHER",
    label: t('prc2.ptype_other', "其他")
  }];
}
function buildUrgencyOpts(t: TFn) {
  return [{
    value: "NORMAL",
    label: t('prc2.urgency_normal', "普通")
  }, {
    value: "URGENT",
    label: t('prc2.urgency_urgent', "紧急")
  }, {
    value: "CRITICAL",
    label: t('prc2.urgency_critical', "特急")
  }];
}
const API_BASE = "/api/v2/procurement/requests";
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

// ── 内联样式常量 ──────────────────────────────────────────────────────────────
const inlineInput: React.CSSProperties = {
  flex: "1 1 180px",
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
export default function PurchaseRequestsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const STATUS_MAP = buildStatusMap(t);
  const URGENCY_MAP = buildUrgencyMap(t);
  const { optionPairs: dictPurchaseTypes } = useDictOptions('PRC_PURCHASE_TYPE');
  const PURCHASE_TYPE_OPTS = dictPurchaseTypes.length ? dictPurchaseTypes : buildPurchaseTypeOpts(t);
  const URGENCY_OPTS = buildUrgencyOpts(t);
  const [data, setData] = useState<PageResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [fStatus, setFStatus] = useState("");
  const [fUrgency, setFUrgency] = useState("");
  const [fType, setFType] = useState("");
  const [fKeyword, setFKeyword] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<PurchaseRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 审批通过/驳回已收口至集团审批引擎，见 /workflow/todos
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<PurchaseRequest | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<PurchaseRequest | null>(null);
  const [submitComment, setSubmitComment] = useState("");
  const [submitCandidates, setSubmitCandidates] = useState<ApprovalCandidate[]>([]);
  const [submitApproverId, setSubmitApproverId] = useState("");
  const [submitCandidateLoading, setSubmitCandidateLoading] = useState(false);

  // 转采购订单
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(null);
  const [convertSupplierCode, setConvertSupplierCode] = useState("");
  const [convertSupplierName, setConvertSupplierName] = useState("");
  const [convertExpDate, setConvertExpDate] = useState("");
  const [convertPayDeadline, setConvertPayDeadline] = useState("");
  const [convertContractNo, setConvertContractNo] = useState("");
  const [convertRemark, setConvertRemark] = useState("");
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "" : "";
  const hdr = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // 加载
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: "20"
      });
      if (fStatus) params.set("status", fStatus);
      if (fUrgency) params.set("urgency", fUrgency);
      if (fType) params.set("purchaseType", fType);
      if (fKeyword) params.set("keyword", fKeyword);
      if (fDateFrom) params.set("expectedDateFrom", fDateFrom);
      if (fDateTo) params.set("expectedDateTo", fDateTo);
      const res = await fetch(`${API_BASE}?${params}`, {
        headers: hdr
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch {
      toast.error(t('prc2.load_failed', "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [page, fStatus, fUrgency, fType, fKeyword, fDateFrom, fDateTo, token]); // eslint-disable-line

  useEffect(() => {
    load(1);
    setPage(1);
  }, [fStatus, fUrgency, fType, fKeyword, fDateFrom, fDateTo]); // eslint-disable-line
  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line

  // 详情
  async function openDetail(row: PurchaseRequest) {
    setDetailData(row);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/${row.id}`, {
        headers: hdr
      });
      if (res.ok) setDetailData(await res.json());
    } catch {/* ignore */} finally {
      setDetailLoading(false);
    }
  }

  async function openSubmit(row: PurchaseRequest) {
    setSubmitTarget(row);
    setSubmitComment("");
    setSubmitApproverId("");
    setSubmitCandidates([]);
    setSubmitOpen(true);
    setSubmitCandidateLoading(true);
    try {
      const qs = new URLSearchParams({
        menuCode: "MENU_PRC2_REQUEST",
        requiredPerm: "E"
      });
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

  // 提交
  async function handleSubmit(approverUserId?: string) {
    if (!submitTarget) return;
    try {
      setActionSubmitting(true);
      const res = await fetch(`${API_BASE}/${submitTarget.id}/submit`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          comment: submitComment,
          approverUserId: approverUserId || undefined
        })
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

  function openCancel(row: PurchaseRequest) {
    setActionTarget(row);
    setActionComment("");
    setCancelOpen(true);
  }
  async function execAction(endpoint: string, comment: string, msg: string) {
    if (!actionTarget) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/${actionTarget.id}/${endpoint}`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          comment
        })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.action_failed', "操作失败"));
      }
      toast.success(msg);
      setCancelOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.action_failed', "操作失败"));
    } finally {
      setActionSubmitting(false);
    }
  }

  // 打开转单弹窗
  function openConvert(row: PurchaseRequest) {
    setConvertTarget(row);
    setConvertSupplierCode("");
    setConvertSupplierName("");
    setConvertExpDate("");
    setConvertPayDeadline("");
    setConvertContractNo("");
    setConvertRemark("");
    setConvertOpen(true);
  }

  // 执行转采购订单
  async function handleConvert() {
    if (!convertTarget) return;
    if (!convertSupplierCode.trim()) {
      toast.error(t('prc2.please_fill_supplier_code', "请填写供应商代码"));
      return;
    }
    if (!convertSupplierName.trim()) {
      toast.error(t('prc2.please_fill_supplier_name', "请填写供应商名称"));
      return;
    }
    setConvertSubmitting(true);
    try {
      const body: Record<string, string | boolean | undefined> = {
        supplierCode: convertSupplierCode.trim(),
        supplierName: convertSupplierName.trim(),
        contractNo: convertContractNo.trim() || undefined,
        expectedDate: convertExpDate || undefined,
        payDeadline: convertPayDeadline || undefined,
        remark: convertRemark.trim() || undefined
      };
      const res = await fetch(`/api/v2/procurement/requests/${convertTarget.id}/convert-to-order`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? t('prc2.convert_failed', "转单失败"));
      }
      const po = await res.json();
      toast.success(`${t('prc2.converted_to_po_prefix', "已转采购订单：")}${po.poNo ?? po.id}`);
      setConvertOpen(false);
      load(page);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('prc2.convert_failed', "转单失败"));
    } finally {
      setConvertSubmitting(false);
    }
  }
  const totalPages = Math.ceil(data.total / Math.max(1, data.pageSize));

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return <div className="animate-fade-in">
      <PageHeader title={t('prc2.bc_requests', "采购申请")} subtitle={`${t('prc2.subtitle_manage_all', "管理所有采购申请 · 共")} ${data.total} ${t('prc2.unit_rows', "条")}`} breadcrumb={[t('prc2.bc_procurement', "采购管理"), t('prc2.bc_requests', "采购申请")]} actions={<div style={{
      display: "flex",
      gap: 8
    }}>
            <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => load(page)} disabled={loading}>
              <RefreshCw size={14} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> {t('prc2.refresh', "刷新")}
            </button>
            <Link href="/procurement2/requests/new" className={`${s.btnPrimary} ${u.flexRow}`} style={{ textDecoration: "none" }}>
              <Plus size={14} /> {t('prc2.new_request', "新建申请")}
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
        <input value={fKeyword} onChange={e => setFKeyword(e.target.value)} placeholder={t('prc2.kw_placeholder', "关键字（申请号/主题/申请人）")} style={inlineInput} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_status', "全部状态")}</option>
          {Object.entries(STATUS_MAP).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </select>
        <select value={fUrgency} onChange={e => setFUrgency(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_urgency', "全部紧急度")}</option>
          {URGENCY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={inlineSelect}>
          <option value="">{t('prc2.filter_all_type', "全部类型")}</option>
          {PURCHASE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{
        fontSize: 12,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap"
      }}>{t('prc2.expected_arrival_colon', "期望到货：")}</span>
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
        <table className={s.table}>
          <thead>
            <tr>
              <th>{t('prc2.req_no', "申请单号")}</th>
              <th>{t('prc2.subject', "主题")}</th>
              <th>{t('prc2.company', "公司")}</th>
              <th>{t('prc2.project', "项目")}</th>
              <th>{t('prc2.type', "类型")}</th>
              <th>{t('prc2.urgency', "紧急度")}</th>
              <th>{t('prc2.requester', "申请人")}</th>
              <th>{t('prc2.estimated_amount', "预估金额")}</th>
              <th className={u.tac}>{t('prc2.row_count', "行数")}</th>
              <th>{t('prc2.expected_arrival', "期望到货")}</th>
              <th>{t('prc2.status', "状态")}</th>
              <th style={{
              width: 160
            }}>{t('prc2.action', "操作")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={12} className={u.emptyCenter}>{t('prc2.loading', "加载中…")}</td></tr> : data.items.length === 0 ? <tr><td colSpan={12} className={u.emptyCenter}>{t('prc2.empty_no_data', "暂无数据")}</td></tr> : data.items.map(row => {
            const st = STATUS_MAP[row.status] ?? {
              label: row.status,
              cls: "badgeNeutral"
            };
            const ug = URGENCY_MAP[row.urgency] ?? {
              label: row.urgency,
              cls: "badgeNeutral"
            };
            const typeLabel = PURCHASE_TYPE_OPTS.find(o => o.value === row.purchaseType)?.label ?? row.purchaseType ?? "—";
            return <tr key={row.id}>
                  <td style={{
                fontFamily: "monospace",
                fontSize: 11,
                whiteSpace: "nowrap"
              }}>{row.reqNo}</td>
                  <td style={{
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
                    {row.subject}
                  </td>
                  <td>{row.companyCode}</td>
                  <td style={{
                maxWidth: 100,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
                    {row.projectCode ?? "—"}
                  </td>
                  <td>{typeLabel}</td>
                  <td><span className={`${s.badge} ${s[ug.cls]}`}>{ug.label}</span></td>
                  <td>{row.requesterName ?? "—"}</td>
                  <td style={{
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums"
              }}>
                    {fmtAmt(row.estimatedAmount, row.currencyCode ?? "LAK")}
                  </td>
                  <td className={u.tac}>{row.itemCount ?? "—"}</td>
                  <td>{fmtDate(row.expectedDate)}</td>
                  <td><span className={`${s.badge} ${s[st.cls]}`}>{st.label}</span></td>
                  <td>
                    <div style={{
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap"
                }}>
                      <button style={actBtn} onClick={() => openDetail(row)}>{t('prc2.view', "查看")}</button>
                      {row.status === "DRAFT" && <>
                          <Link href={`/procurement2/requests/${row.id}/edit`} style={{ ...actBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{t('prc2.edit', "编辑")}</Link>
                          <button style={actBtnTone("success")} onClick={() => openSubmit(row)}>{t('prc2.submit_approval', "提交审批")}</button>
                        </>}
                      {row.status === "SUBMITTED" && <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title={t('prc2.go_approve_title', "审批请前往『工作流·待办』")}>{t('prc2.go_approve', "前往审批")}</Link>}
                      {(row.status === "DRAFT" || row.status === "SUBMITTED") && <button style={actBtnTone("danger")} onClick={() => openCancel(row)}>{t('prc2.cancel', "取消")}</button>}
                      {row.status === "APPROVED" && <button style={actBtnTone("primary")} onClick={() => openConvert(row)}>{t('prc2.convert_to_po', "转采购订单")}</button>}
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
          <span className={u.muted12}>{t('prc2.total_prefix', "共")} {data.total} {t('prc2.unit_rows', "条")}</span>
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

      {/* ── 详情抽屉 ─────���───────────────────────────────────────────────────── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={detailData ? `${t('prc2.request_detail_prefix', "申请详情：")}${detailData.reqNo}` : t('prc2.detail', "详情")} width={660}>
        {detailLoading ? <div className={u.emptyCenter}>{t('prc2.loading', "加载中…")}</div> : detailData ? <div style={{
        padding: "0 4px"
      }}>
            <div className={s.formSection}>{t('prc2.basic_info', "基础信息")}</div>
            {[{
          label: t('prc2.req_no', "申请单号"),
          value: detailData.reqNo,
          mono: true
        }, {
          label: t('prc2.subject', "主题"),
          value: detailData.subject
        }, {
          label: t('prc2.company', "公司"),
          value: `${detailData.companyCode}  ${detailData.companyName ?? ""}`
        }, {
          label: t('prc2.project', "项目"),
          value: detailData.projectCode ? `${detailData.projectCode} ${detailData.projectName ?? ""}` : "—"
        }, {
          label: t('prc2.estimated_amount', "预估金额"),
          value: fmtAmt(detailData.estimatedAmount, detailData.currencyCode ?? "LAK")
        }, {
          label: t('prc2.requester', "申请人"),
          value: detailData.requesterName ?? "—"
        }, {
          label: t('prc2.expected_arrival', "期望到货"),
          value: fmtDate(detailData.expectedDate)
        }, {
          label: t('prc2.reason', "原因"),
          value: detailData.reason ?? "—"
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
              <span className={`${s.badge} ${s[URGENCY_MAP[detailData.urgency]?.cls ?? "badgeNeutral"]}`}>
                {URGENCY_MAP[detailData.urgency]?.label ?? detailData.urgency}
              </span>
              <span className={`${s.badge} ${s.badgeNeutral}`}>
                {PURCHASE_TYPE_OPTS.find(o => o.value === detailData.purchaseType)?.label ?? detailData.purchaseType ?? "—"}
              </span>
            </div>

            {/* 明细行 */}
            {detailData.items && detailData.items.length > 0 && <>
                <div className={s.formSection} style={{
            marginTop: 20
          }}>
                  {t('prc2.purchase_detail', "采购明细")}（{detailData.items.length} {t('prc2.rows_unit', "行")}）
                </div>
                <div style={{
            overflowX: "auto",
            border: "1px solid var(--border)",
            borderRadius: 6
          }}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>{t('prc2.item_name', "物料名称")}</th>
                        <th>{t('prc2.spec', "规格")}</th>
                        <th className={u.tar}>{t('prc2.qty', "数量")}</th>
                        <th>{t('prc2.unit', "单位")}</th>
                        <th className={u.tar}>{t('prc2.unit_price', "单价")}</th>
                        <th className={u.tar}>{t('prc2.subtotal', "小计")}</th>
                        <th>{t('prc2.warehouse', "仓库")}</th>
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
                  }}>{it.estimatedUnitPrice ?? "—"}</td>
                          <td style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums"
                  }}>
                            {it.estimatedAmount ? Number(it.estimatedAmount).toLocaleString("zh-CN") : "—"}
                          </td>
                          <td>{it.warehouseCode ?? "—"}</td>
                        </tr>)}
                    </tbody>
                  </table>
                </div>
              </>}

            {/* 审批日志 */}
            {detailData.approvals && detailData.approvals.length > 0 && <>
                <div className={s.formSection} style={{
            marginTop: 20
          }}>{t('prc2.approval_log', "审批日志")}</div>
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
                        <span className={`${s.badge} ${s[actionBadgeCls(log.action)]}`}>{actionLabel(t, log.action)}</span>
                        <span style={{
                  fontWeight: 600,
                  fontSize: 13
                }}>{log.approverName ?? t('prc2.system', "系统")}</span>
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

      {/* 审批通过/驳回已收口至集团审批引擎，请前往『工作流·待办』(/workflow/todos) 处理 */}

      {/* ── 提交审批：选择下一审批人 ───────────────────────────────────────── */}
      <SimpleModal open={submitOpen} onClose={() => setSubmitOpen(false)} title={t('prc2.submit_approval_pick_next', "提交审批 · 选择下一审批人")}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
          <div>{t('prc2.request_colon', "申请：")}<strong style={{ color: "var(--text-primary)" }}>{submitTarget?.reqNo ?? submitTarget?.subject}</strong></div>
          <div>{t('prc2.candidate_filter_note', "候选人已按采购权限、公司/项目数据域过滤。选择后会指定给该审批人；也可按审批规则提交。")}</div>
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
          <textarea className={s.textarea} rows={3} value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder={t('prc2.submit_note_placeholder', "可填写采购背景、紧急原因或注意事项")} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className={s.btnSecondary} onClick={() => setSubmitOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnSecondary} disabled={actionSubmitting} onClick={() => handleSubmit(undefined)}>
            {t('prc2.submit_by_rule', "按审批规则提交")}
          </button>
          <button type="button" className={s.btnPrimary} disabled={actionSubmitting || !submitApproverId} onClick={() => handleSubmit(submitApproverId)}>
            {actionSubmitting ? t('prc2.submitting', "提交中…") : t('prc2.submit_to_selected', "提交给所选审批人")}
          </button>
        </div>
      </SimpleModal>

      {/* ── 取消对话框 ─────────────────────────────────────────────────────────── */}
      <SimpleModal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('prc2.cancel_request_title', "取消采购申请")}>
        <p style={{
        fontSize: 13,
        margin: "8px 0"
      }}>
          {t('prc2.confirm_cancel_prefix', "确认取消")} <strong>{actionTarget?.reqNo}</strong>{t('prc2.confirm_cancel_suffix', "？此操作不可逆。")}
        </p>
        <textarea className={s.textarea} rows={2} placeholder={t('prc2.cancel_reason_placeholder', "取消原因（可选）")} value={actionComment} onChange={e => setActionComment(e.target.value)} />
        <div style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 12
      }}>
          <button type="button" className={s.btnSecondary} onClick={() => setCancelOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnDanger} disabled={actionSubmitting} onClick={() => execAction("cancel", actionComment, t('prc2.cancelled_done', "已取消"))}>
            {actionSubmitting ? t('prc2.processing', "处理中…") : t('prc2.confirm_cancel', "确认取消")}
          </button>
        </div>
      </SimpleModal>

      {/* ── 转采购订单对话框 ──────────────────────────────────────────────────── */}
      <SimpleModal open={convertOpen} onClose={() => setConvertOpen(false)} title={t('prc2.convert_pr_to_po_title', "从采购申请转采购订单")}>
        <p style={{
        fontSize: 13,
        margin: "8px 0 12px",
        color: "var(--text-secondary)"
      }}>
          PR：<strong style={{
          color: "var(--text-primary)"
        }}>{convertTarget?.reqNo}</strong>
          　{convertTarget?.subject}
        </p>
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}>
          {/* G95：供应商占整行——选中即得，名称由 onPick 后台带出，去掉冗余只读名称框 */}
          <div className={s.field}>
            <label className={s.lbl}>{t('prc2.supplier', "供应商")} *</label>
            {/* G4-B：供应商主数据(仅 ACTIVE)，自动带出名称 */}
            <SupplierSelector value={convertSupplierCode} onChange={setConvertSupplierCode} onPick={o => setConvertSupplierName(o?.raw?.name ?? o?.label ?? "")} />
          </div>
          <div className={s.fieldRow} style={{
          gap: 8
        }}>
            <div className={s.field}>
              <label className={s.lbl}>{t('prc2.expected_arrival_date', "期望到货日")}</label>
              <input type="date" className={s.inp} value={convertExpDate} onChange={e => setConvertExpDate(e.target.value)} />
            </div>
            <div className={s.field}>
              <label className={s.lbl}>{t('prc2.pay_deadline', "付款截止日")}</label>
              <input type="date" className={s.inp} value={convertPayDeadline} onChange={e => setConvertPayDeadline(e.target.value)} />
            </div>
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('prc2.contract_no_optional', "合同号（可选）")}</label>
            <input className={s.inp} value={convertContractNo} onChange={e => setConvertContractNo(e.target.value)} placeholder="HT-2026-XXXXX" />
          </div>
          <div className={s.field}>
            <label className={s.lbl}>{t('prc2.remark', "备注")}</label>
            <textarea className={s.textarea} rows={2} value={convertRemark} onChange={e => setConvertRemark(e.target.value)} placeholder={t('prc2.optional_remark', "可选备注")} />
          </div>
        </div>
        <div style={{
        display: "flex",
        gap: 8,
        justifyContent: "flex-end",
        marginTop: 14
      }}>
          <button type="button" className={s.btnSecondary} onClick={() => setConvertOpen(false)}>{t('prc2.cancel', "取消")}</button>
          <button type="button" className={s.btnPrimary} disabled={convertSubmitting} onClick={handleConvert}>
            {convertSubmitting ? t('prc2.processing', "处理中…") : t('prc2.confirm_convert', "确认转单")}
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
    APPROVE: t('prc2.act_approve', "批准"),
    REJECT: t('prc2.act_reject', "拒绝"),
    CANCEL: t('prc2.act_cancel', "取消"),
    COMMENT: t('prc2.act_comment', "备注")
  } as Record<string, string>)[a] ?? a;
}
function actionBadgeCls(a: string) {
  return ({
    SUBMIT: "badgeInfo",
    APPROVE: "badgeSuccess",
    REJECT: "badgeDanger",
    CANCEL: "badgeNeutral",
    COMMENT: "badgeInfo"
  } as Record<string, string>)[a] ?? "badgeNeutral";
}
