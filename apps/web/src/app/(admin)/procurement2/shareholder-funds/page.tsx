"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader"; // G157：统一全局页头
import { actBtn, actBtnTone } from "../_shared/actionButtons"; // G159：操作列文字按钮
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from '@/contexts/LanguageContext';
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { Search, RefreshCw, Eye, Plus, Send } from "lucide-react";
import { DictSelect } from "@/components/shared-selectors/DictSelect";
import { CompanySelector, ShareholderSelector, ProjectSelector } from "@/components/shared-selectors/MasterDataSelectors";
import { inputFieldClass } from "@/components/design-system/cockpit-styles";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FundRecord {
  id: string;
  fundNo: string;
  shareholderId: string;
  shareholderName: string;
  companyCode: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  sourceType: string;
  fundNature: string;
  currencyCode: string;
  amountOriginal: number;
  exchangeRate: number;
  amountBase: number;
  baseCurrency: string;
  relatedPaymentId: string;
  relatedPoId: string;
  relatedPoNo: string;
  occurredDate: string;
  status: string;
  remark: string;
  createdAt: string;
}
interface SummaryRow {
  fundNature: string;
  currencyCode: string;
  totalOriginal: string;
  totalBase: string;
}
interface ListResult {
  items: FundRecord[];
  total: number;
  page: number;
  pageSize: number;
  summary: SummaryRow[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

type TFn = (key: string, fallback: string) => string;
const buildFundNatureLabels = (t: TFn): Record<string, string> => ({
  INVESTMENT: t('prc2.nature_investment', "投资款"),
  LOAN: t('prc2.nature_loan', "借款"),
  ADVANCE: t('prc2.nature_advance_pay', "垫付"),
  NORMAL: t('prc2.nature_plain', "普通")
});
const buildStatusLabels = (t: TFn): Record<string, string> => ({
  DRAFT: t('prc2.status_draft', "草稿"),
  PENDING_APPROVAL: t('prc2.fstatus_pending', "审批中"),
  APPROVED: t('prc2.fstatus_approved', "已批准"),
  CONFIRMED: t('prc2.fstatus_confirmed', "已确认"),
  REJECTED: t('prc2.fstatus_rejected', "已拒绝"),
  CANCELLED: t('prc2.cancelled_done', "已取消"),
  SETTLED: t('prc2.fstatus_settled', "已结算"),
  VOID: t('prc2.fstatus_void', "已作废")
});
function getToken() {
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
function hdr() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`
  };
}
function fmtNum(v: number | string | undefined, decimals = 2) {
  const n = Number(v ?? 0);
  return isNaN(n) ? "0.00" : n.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function NatureBadge({
  nature
}: {
  nature: string;
}) {
  const { t } = useLanguage();
  const FUND_NATURE_LABELS = buildFundNatureLabels(t);
  const colorMap: Record<string, string> = {
    INVESTMENT: s.badgeInfo,
    LOAN: s.badgeWarning,
    ADVANCE: s.badgeNeutral,
    NORMAL: s.badgeSuccess
  };
  return <span className={`${s.badge} ${colorMap[nature] ?? s.badgeNeutral}`}>{FUND_NATURE_LABELS[nature] ?? nature}</span>;
}
// G160：改名 FundStatusBadge，消除与全局 design-system StatusBadge 的重名遮蔽
// （全局 StatusBadge 标签/配色无法与本页 FUND 状态完全一致，故保留本地实现）
function FundStatusBadge({
  status
}: {
  status: string;
}) {
  const { t } = useLanguage();
  const STATUS_LABELS = buildStatusLabels(t);
  const colorMap: Record<string, string> = {
    DRAFT: s.badgeNeutral,
    PENDING_APPROVAL: s.badgeWarning,
    APPROVED: s.badgeInfo,
    CONFIRMED: s.badgeSuccess,
    REJECTED: s.badgeDanger,
    CANCELLED: s.badgeNeutral,
    SETTLED: s.badgeInfo,
    VOID: s.badgeDanger
  };
  return <span className={`${s.badge} ${colorMap[status] ?? s.badgeNeutral}`}>{STATUS_LABELS[status] ?? status}</span>;
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCards({
  summary
}: {
  summary: SummaryRow[];
}) {
  const { t } = useLanguage();
  const FUND_NATURE_LABELS = buildFundNatureLabels(t);
  // Group by fundNature
  const byNature: Record<string, {
    totalOriginal: number;
    breakdown: {
      currency: string;
      amount: number;
    }[];
  }> = {};
  for (const row of summary) {
    if (!byNature[row.fundNature]) byNature[row.fundNature] = {
      totalOriginal: 0,
      breakdown: []
    };
    byNature[row.fundNature].totalOriginal += Number(row.totalOriginal);
    byNature[row.fundNature].breakdown.push({
      currency: row.currencyCode,
      amount: Number(row.totalOriginal)
    });
  }
  if (Object.keys(byNature).length === 0) return null;
  return <div style={{
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16
  }}>
      {Object.entries(byNature).map(([nature, data]) => <div key={nature} style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      padding: "12px 20px",
      minWidth: 180
    }}>
          <div style={{
        fontSize: 12,
        color: "var(--text-secondary)",
        marginBottom: 4
      }}>
            {FUND_NATURE_LABELS[nature] ?? nature}
          </div>
          {data.breakdown.map(b => <div key={b.currency} style={{
        fontSize: 16,
        fontWeight: 600,
        color: "var(--text-primary)"
      }}>
              {b.currency} {fmtNum(b.amount)}
            </div>)}
        </div>)}
    </div>;
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ShareholderFundsPage() {
  const toast = useToast();
  const { t } = useLanguage();
  const FUND_NATURE_LABELS = buildFundNatureLabels(t);
  const STATUS_LABELS = buildStatusLabels(t);

  // ── List state ────────────────────────────────────────────────────────────
  const [items, setItems] = useState<FundRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState("");
  const [fundNature, setFundNature] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [shareholderId, setShareholderId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<FundRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Create drawer ─────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    shareholderId: "",
    shareholderName: "",
    fundNature: "ADVANCE",
    currencyCode: "CNY",
    amountOriginal: "",
    exchangeRate: "1",
    companyCode: "",
    companyName: "",
    projectCode: "",
    projectName: "",
    occurredDate: "",
    remark: ""
  });

  // ── Load list ─────────────────────────────────────────────────────────────
  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize)
      });
      if (keyword) params.set("keyword", keyword);
      if (fundNature) params.set("fundNature", fundNature);
      if (currencyCode) params.set("currencyCode", currencyCode);
      if (shareholderId) params.set("shareholderId", shareholderId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/v2/procurement/shareholder-funds?${params}`, {
        headers: hdr()
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ListResult = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      setSummary(data.summary ?? []);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, fundNature, currencyCode, shareholderId, dateFrom, dateTo, toast]);
  useEffect(() => {
    loadList(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1);
    loadList(1);
  };
  const handleReset = () => {
    setKeyword("");
    setFundNature("");
    setCurrencyCode("");
    setShareholderId("");
    setDateFrom("");
    setDateTo("");
    setTimeout(() => loadList(1), 0);
  };
  const openDetail = (row: FundRecord) => {
    setDetail(row);
    setDetailOpen(true);
  };
  const handleCreate = async () => {
    if (!createForm.shareholderName.trim()) {
      toast.error(t('prc2.err_shareholder_required', "股东名称不能为空"));
      return;
    }
    if (!createForm.amountOriginal || Number(createForm.amountOriginal) <= 0) {
      toast.error(t('prc2.err_amount_gt_zero', "金额必须大于0"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v2/procurement/shareholder-funds", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          ...createForm,
          amountOriginal: Number(createForm.amountOriginal),
          exchangeRate: Number(createForm.exchangeRate)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? t('prc2.create_failed', "创建失败"));
        return;
      }
      toast.success(t('prc2.fund_created_draft', "已创建股东资金（草稿）"));
      setCreateOpen(false);
      setCreateForm({
        shareholderId: "",
        shareholderName: "",
        fundNature: "ADVANCE",
        currencyCode: "CNY",
        amountOriginal: "",
        exchangeRate: "1",
        companyCode: "",
        companyName: "",
        projectCode: "",
        projectName: "",
        occurredDate: "",
        remark: ""
      });
      loadList(1);
    } catch {
      toast.error(t('prc2.network_error', "网络错误"));
    } finally {
      setSubmitting(false);
    }
  };
  const handleSubmit = async (id: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/procurement/shareholder-funds/${id}/submit`, {
        method: "POST",
        headers: hdr()
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? t('prc2.submit_failed', "提交失败"));
        return;
      }
      toast.success(t('prc2.submitted_approval', "已提交审批"));
      setDetailOpen(false);
      loadList(1);
    } catch {
      toast.error(t('prc2.network_error', "网络错误"));
    } finally {
      setSubmitting(false);
    }
  };
  const totalPages = Math.ceil(total / pageSize);
  return <div style={{
    padding: 16
  }}>
      <PageHeader title={t('prc2.shareholder_fund_title', "股东资金")} subtitle={t('prc2.shareholder_fund_subtitle', "股东出资 / 代付资金池")} breadcrumb={[t('prc2.bc_procurement', "采购管理"), t('prc2.shareholder_fund_title', "股东资金")]} />
      {/* Summary cards */}
      <SummaryCards summary={summary} />

      {/* Filter bar */}
      <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 12,
      alignItems: "center"
    }}>
        <input placeholder={t('prc2.fund_search_ph', "搜索编号 / 股东姓名 / 采购订单号")} value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        width: 220,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }} />
        <select value={fundNature} onChange={e => setFundNature(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }}>
          <option value="">{t('prc2.filter_all_nature', "全部性质")}</option>
          <option value="INVESTMENT">{t('prc2.nature_investment', "投资款")}</option>
          <option value="LOAN">{t('prc2.nature_loan', "借款")}</option>
          <option value="ADVANCE">{t('prc2.nature_advance_pay', "垫付")}</option>
          <option value="NORMAL">{t('prc2.nature_plain', "普通")}</option>
        </select>
        <select value={currencyCode} onChange={e => setCurrencyCode(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }}>
          <option value="">{t('prc2.filter_all_currency', "全部币种")}</option>
          <option value="CNY">{t('prc2.ccy_cny', "CNY 人民币")}</option>
          <option value="LAK">{t('prc2.ccy_lak', "LAK 老挝基普")}</option>
          <option value="THB">{t('prc2.ccy_thb', "THB 泰铢")}</option>
          <option value="USD">{t('prc2.ccy_usd', "USD 美元")}</option>
        </select>
        <input placeholder={t('prc2.shareholder_id_ph', "股东ID")} value={shareholderId} onChange={e => setShareholderId(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        width: 100,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }} />
        <span className={u.muted12}>{t('prc2.date_to', "至")}</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }} />
        <button className={s.btnPrimary} onClick={handleSearch} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <Search size={13} /> {t('prc2.search', "查询")}
        </button>
        <button className={s.btnSecondary} onClick={handleReset} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <RefreshCw size={13} /> {t('prc2.reset', "重置")}
        </button>
        <span style={{
        marginLeft: "auto",
        fontSize: 12,
        color: "var(--text-secondary)"
      }}>{t('prc2.total_count_prefix', "共")} {total} {t('prc2.records_suffix', "条")}</span>
        <button className={s.btnPrimary} onClick={() => setCreateOpen(true)} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <Plus size={13} /> {t('prc2.new_fund', "新建资金")}
        </button>
      </div>

      {/* Table */}
      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{t('prc2.fund_no', "资金编号")}</th>
              <th>{t('prc2.shareholder_name', "股东姓名")}</th>
              <th>{t('prc2.fund_nature', "资金性质")}</th>
              <th>{t('prc2.currency_short', "币种")}</th>
              <th>{t('prc2.amount', "金额")}</th>
              <th>{t('prc2.exchange_rate', "汇率")}</th>
              <th>{t('prc2.cny_converted', "CNY换算")}</th>
              <th>{t('prc2.po_no_related', "关联PO")}</th>
              <th>{t('prc2.project', "项目")}</th>
              <th>{t('prc2.occurred_date', "发生日期")}</th>
              <th>{t('prc2.status', "状态")}</th>
              <th>{t('prc2.action', "操作")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className={u.emptyCenter}>{t('prc2.loading_dots3', "加载中...")}</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={12} className={u.emptyCenter}>{t('prc2.empty_no_data', "暂无数据")}</td></tr>}
            {!loading && items.map(row => <tr key={row.id}>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.fundNo}</td>
                <td>{row.shareholderName}</td>
                <td><NatureBadge nature={row.fundNature} /></td>
                <td>{row.currencyCode}</td>
                <td style={{
              textAlign: "right",
              fontWeight: 600
            }}>{fmtNum(row.amountOriginal)}</td>
                <td style={{
              textAlign: "right",
              fontSize: 12
            }}>{Number(row.exchangeRate).toFixed(4)}</td>
                <td style={{
              textAlign: "right",
              color: "var(--text-secondary)",
              fontSize: 12
            }}>
                  {row.baseCurrency} {fmtNum(row.amountBase)}
                </td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.relatedPoNo || "—"}</td>
                <td className={u.muted12}>{row.projectName || row.projectCode || "—"}</td>
                <td className={u.fs12}>{row.occurredDate || "—"}</td>
                <td><FundStatusBadge status={row.status} /></td>
                <td style={{
              display: "flex",
              gap: 4
            }}>
                  <button style={actBtn} onClick={() => openDetail(row)}>{t('prc2.view', "查看")}</button>
                  {row.status === "DRAFT" && <button style={actBtnTone("success")} onClick={() => handleSubmit(row.id)} disabled={submitting}>{t('prc2.submit_approval', "提交审批")}</button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      marginTop: 16
    }}>
          <button className={s.btnSecondary} disabled={page <= 1} onClick={() => {
        const p = page - 1;
        setPage(p);
        loadList(p);
      }}>{t('prc2.prev_page', "上一页")}</button>
          <span style={{
        lineHeight: "30px",
        fontSize: 13
      }}>{t('prc2.page_label', "第")} {page} / {totalPages} {t('prc2.page_unit', "页")}</span>
          <button className={s.btnSecondary} disabled={page >= totalPages} onClick={() => {
        const p = page + 1;
        setPage(p);
        loadList(p);
      }}>{t('prc2.next_page', "下一页")}</button>
        </div>}

      {/* Detail Drawer */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={`${t('prc2.fund_detail', "股东资金详情")} - ${detail?.fundNo ?? ""}`} width={560}>
        {detail && <div style={{
        padding: "0 24px 24px"
      }}>
            {/* Header summary */}
            <div style={{
          background: "var(--bg-highlight, var(--bg-card))",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
          border: "1px solid var(--border)"
        }}>
              <div style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 4
          }}>
                {detail.currencyCode} {fmtNum(detail.amountOriginal)}
              </div>
              <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap"
          }}>
                <NatureBadge nature={detail.fundNature} />
                <FundStatusBadge status={detail.status} />
              </div>
            </div>

            <div>
              <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>{t('prc2.fund_info', "资金信息")}</div>
              <Row label={t('prc2.fund_no', "资金编号")} value={detail.fundNo} mono />
              <Row label={t('prc2.shareholder_name', "股东姓名")} value={detail.shareholderName} />
              <Row label={t('prc2.shareholder_id', "股东ID")} value={detail.shareholderId || "—"} />
              <Row label={t('prc2.fund_nature', "资金性质")} value={FUND_NATURE_LABELS[detail.fundNature] ?? detail.fundNature} />
              <Row label={t('prc2.source_type', "来源类型")} value={detail.sourceType || "—"} />
              <Row label={t('prc2.occurred_date', "发生日期")} value={detail.occurredDate || "—"} />
              <Row label={t('prc2.status', "状态")} value={STATUS_LABELS[detail.status] ?? detail.status} />
            </div>

            <div style={{
          marginTop: 16
        }}>
              <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>{t('prc2.amount_info', "金额信息")}</div>
              <Row label={t('prc2.original_currency', "原币")} value={detail.currencyCode} />
              <Row label={t('prc2.amount_original', "金额（原币）")} value={`${detail.currencyCode} ${fmtNum(detail.amountOriginal)}`} />
              <Row label={t('prc2.exchange_rate', "汇率")} value={Number(detail.exchangeRate).toFixed(6)} />
              <Row label={t('prc2.base_currency', "基准货币")} value={detail.baseCurrency} />
              <Row label={t('prc2.amount_base', "金额（基准）")} value={`${detail.baseCurrency} ${fmtNum(detail.amountBase)}`} />
            </div>

            <div style={{
          marginTop: 16
        }}>
              <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>{t('prc2.related_info', "关联信息")}</div>
              <Row label={t('prc2.po_no_related', "关联PO")} value={detail.relatedPoNo || "—"} mono />
              <Row label={t('prc2.related_payment_id', "关联付款ID")} value={detail.relatedPaymentId || "—"} />
              <Row label={t('prc2.company', "公司")} value={detail.companyName || detail.companyCode || "—"} />
              <Row label={t('prc2.project', "项目")} value={detail.projectName || detail.projectCode || "—"} />
              <Row label={t('prc2.remark', "备注")} value={detail.remark || "—"} />
            </div>

            <div style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginTop: 16
        }}>
              {t('prc2.created_at', "创建于")} {new Date(detail.createdAt).toLocaleString("zh-CN")}
            </div>
            {detail.status === "DRAFT" && <div style={{
          padding: "16px 24px 0"
        }}>
                <button className={s.btnPrimary} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }} onClick={() => handleSubmit(detail.id)} disabled={submitting}>
                  <Send size={14} /> {submitting ? t('prc2.submitting', "提交中…") : t('prc2.submit_approval', "提交审批")}
                </button>
              </div>}
          </div>}
      </RightDrawer>

      {/* 新建股东资金 */}
      <RightDrawer open={createOpen} onClose={() => setCreateOpen(false)} title={t('prc2.new_fund_manual', "新建股东资金（手工登记）")} width={480}>
        {/* G158：表单仅 open 时挂载 */}
        {createOpen && <div style={{
        padding: "0 24px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}>
          {/* G39：公司前置 → 切公司清空股东/项目，股东与项目随公司收窄 */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.company', "公司")}</span>
            <CompanySelector value={createForm.companyCode} onChange={v => setCreateForm(prev => ({
              ...prev, companyCode: v, shareholderId: "", shareholderName: "", projectCode: "", projectName: ""
            }))} onPick={o => setCreateForm(prev => ({ ...prev, companyName: o?.label ?? "" }))} />
          </label>
          {/* G39：股东按公司过滤（先选公司） */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.shareholder_required', "股东 *")}</span>
            <ShareholderSelector companyCode={createForm.companyCode} disabled={!createForm.companyCode}
              value={createForm.shareholderId ?? ""} onChange={v => setCreateForm(prev => ({ ...prev, shareholderId: v }))}
              onPick={o => setCreateForm(prev => ({ ...prev, shareholderName: o?.raw?.name ?? o?.raw?.shareholderName ?? o?.raw?.shareholder_name ?? o?.label ?? "" }))} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.amount_required', "金额 *")}</span>
            <input type="number" placeholder={t('prc2.amount_original_ph', "输入原币金额")} value={createForm.amountOriginal} onChange={e => setCreateForm(prev => ({
              ...prev, amountOriginal: e.target.value
            }))} className={inputFieldClass} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.exchange_rate', "汇率")}</span>
            <input type="number" placeholder={t('prc2.exchange_rate_ph', "对基准货币汇率，默认1")} value={createForm.exchangeRate} onChange={e => setCreateForm(prev => ({
              ...prev, exchangeRate: e.target.value
            }))} className={inputFieldClass} />
          </label>
          {/* G4-A：项目主数据(shr_projects)，自动带出名称 */}
          <label style={{
          display: "flex",
          flexDirection: "column",
          gap: 4
        }}>
            <span className={u.muted12}>{t('prc2.project', "项目")}</span>
            {/* G39：项目也按公司过滤 */}
            <ProjectSelector companyCode={createForm.companyCode} value={createForm.projectCode} onChange={v => setCreateForm(prev => ({
            ...prev,
            projectCode: v
          }))} onPick={o => setCreateForm(prev => ({
            ...prev,
            projectName: o?.raw?.project_name ?? o?.raw?.projectName ?? o?.label ?? ""
          }))} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.occurred_date', "发生日期")}</span>
            <input type="date" value={createForm.occurredDate} onChange={e => setCreateForm(prev => ({
              ...prev, occurredDate: e.target.value
            }))} className={inputFieldClass} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className={u.muted12}>{t('prc2.remark', "备注")}</span>
            <input type="text" placeholder={t('prc2.optional', "可选")} value={createForm.remark} onChange={e => setCreateForm(prev => ({
              ...prev, remark: e.target.value
            }))} className={inputFieldClass} />
          </label>
          {/* G4-A：资金性质来自 sys_dict(FIN_FUND_NATURE) */}
          <label style={{
          display: "flex",
          flexDirection: "column",
          gap: 4
        }}>
            <span className={u.muted12}>{t('prc2.fund_nature', "资金性质")}</span>
            <DictSelect dictType="FIN_FUND_NATURE" value={createForm.fundNature} onChange={v => setCreateForm(p => ({
            ...p,
            fundNature: v
          }))} allowEmpty={false} />
          </label>
          {/* G4-A：货币来自 sys_dict(SYS_CURRENCY) */}
          <label style={{
          display: "flex",
          flexDirection: "column",
          gap: 4
        }}>
            <span className={u.muted12}>{t('prc2.currency_short', "币种")}</span>
            <DictSelect dictType="SYS_CURRENCY" value={createForm.currencyCode} onChange={v => setCreateForm(p => ({
            ...p,
            currencyCode: v
          }))} allowEmpty={false} />
          </label>
          {/* G164：CTA 加宽更舒展（原按钮太小） */}
          <button className={s.btnPrimary} onClick={handleCreate} disabled={submitting} style={{
          marginTop: 12,
          width: "100%",
          padding: "11px 18px",
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6
        }}>
            <Plus size={15} /> {submitting ? t('prc2.saving_dots1', "保存中…") : t('prc2.save_as_draft', "保存为草稿")}
          </button>
        </div>}
      </RightDrawer>
    </div>;
}
function Row({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return <div style={{
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8
  }}>
      <div style={{
      width: 100,
      flexShrink: 0,
      fontSize: 12,
      color: "var(--text-secondary)",
      paddingTop: 1
    }}>{label}</div>
      <div style={{
      fontSize: 13,
      wordBreak: "break-all",
      fontFamily: mono ? "monospace" : undefined
    }}>{value}</div>
    </div>;
}