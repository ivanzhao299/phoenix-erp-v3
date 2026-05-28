"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { Search, RefreshCw, Eye, Plus, Send } from "lucide-react";

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

const FUND_NATURE_LABELS: Record<string, string> = {
  INVESTMENT: "投资款",
  LOAN:       "借款",
  ADVANCE:    "垫付",
  NORMAL:     "普通",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT:            "草稿",
  PENDING_APPROVAL: "审批中",
  APPROVED:         "已批准",
  CONFIRMED:        "已确认",
  REJECTED:         "已拒绝",
  CANCELLED:        "已取消",
  SETTLED:          "已结算",
  VOID:             "已作废",
};

function getToken() {
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}

function hdr() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

function fmtNum(v: number | string | undefined, decimals = 2) {
  const n = Number(v ?? 0);
  return isNaN(n) ? "0.00" : n.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function NatureBadge({ nature }: { nature: string }) {
  const colorMap: Record<string, string> = {
    INVESTMENT: s.badgeInfo,
    LOAN:       s.badgeWarning,
    ADVANCE:    s.badgeNeutral,
    NORMAL:     s.badgeSuccess,
  };
  return <span className={`${s.badge} ${colorMap[nature] ?? s.badgeNeutral}`}>{FUND_NATURE_LABELS[nature] ?? nature}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    DRAFT:            s.badgeNeutral,
    PENDING_APPROVAL: s.badgeWarning,
    APPROVED:         s.badgeInfo,
    CONFIRMED:        s.badgeSuccess,
    REJECTED:         s.badgeDanger,
    CANCELLED:        s.badgeNeutral,
    SETTLED:          s.badgeInfo,
    VOID:             s.badgeDanger,
  };
  return <span className={`${s.badge} ${colorMap[status] ?? s.badgeNeutral}`}>{STATUS_LABELS[status] ?? status}</span>;
}

// ── Summary Cards ──────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: SummaryRow[] }) {
  // Group by fundNature
  const byNature: Record<string, { totalOriginal: number; breakdown: { currency: string; amount: number }[] }> = {};
  for (const row of summary) {
    if (!byNature[row.fundNature]) byNature[row.fundNature] = { totalOriginal: 0, breakdown: [] };
    byNature[row.fundNature].totalOriginal += Number(row.totalOriginal);
    byNature[row.fundNature].breakdown.push({ currency: row.currencyCode, amount: Number(row.totalOriginal) });
  }

  if (Object.keys(byNature).length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      {Object.entries(byNature).map(([nature, data]) => (
        <div key={nature} style={{
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "12px 20px", minWidth: 180,
        }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
            {FUND_NATURE_LABELS[nature] ?? nature}
          </div>
          {data.breakdown.map(b => (
            <div key={b.currency} style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              {b.currency} {fmtNum(b.amount)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ShareholderFundsPage() {
  const toast = useToast();

  // ── List state ────────────────────────────────────────────────────────────
  const [items,    setItems]    = useState<FundRecord[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize] = useState(20);
  const [summary,  setSummary]  = useState<SummaryRow[]>([]);
  const [loading,  setLoading]  = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [keyword,       setKeyword]       = useState("");
  const [fundNature,    setFundNature]    = useState("");
  const [currencyCode,  setCurrencyCode]  = useState("");
  const [shareholderId, setShareholderId] = useState("");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [detail,       setDetail]       = useState<FundRecord | null>(null);
  const [detailOpen,   setDetailOpen]   = useState(false);

  // ── Create drawer ─────────────────────────────────────────────────────────
  const [createOpen,   setCreateOpen]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [createForm,   setCreateForm]   = useState({
    shareholderName: "", fundNature: "ADVANCE", currencyCode: "CNY",
    amountOriginal: "", exchangeRate: "1", companyCode: "", companyName: "",
    projectCode: "", projectName: "", occurredDate: "", remark: "",
  });

  // ── Load list ─────────────────────────────────────────────────────────────
  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (keyword)       params.set("keyword",       keyword);
      if (fundNature)    params.set("fundNature",    fundNature);
      if (currencyCode)  params.set("currencyCode",  currencyCode);
      if (shareholderId) params.set("shareholderId", shareholderId);
      if (dateFrom)      params.set("dateFrom",      dateFrom);
      if (dateTo)        params.set("dateTo",        dateTo);

      const res = await fetch(`/api/v2/procurement/shareholder-funds?${params}`, { headers: hdr() });
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

  useEffect(() => { loadList(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { setPage(1); loadList(1); };
  const handleReset  = () => {
    setKeyword(""); setFundNature(""); setCurrencyCode("");
    setShareholderId(""); setDateFrom(""); setDateTo("");
    setTimeout(() => loadList(1), 0);
  };

  const openDetail = (row: FundRecord) => { setDetail(row); setDetailOpen(true); };

  const handleCreate = async () => {
    if (!createForm.shareholderName.trim()) { toast.error("股东名称不能为空"); return; }
    if (!createForm.amountOriginal || Number(createForm.amountOriginal) <= 0) { toast.error("金额必须大于0"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v2/procurement/shareholder-funds", {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ ...createForm, amountOriginal: Number(createForm.amountOriginal), exchangeRate: Number(createForm.exchangeRate) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "创建失败"); return; }
      toast.success("已创建股东资金（草稿）");
      setCreateOpen(false);
      setCreateForm({ shareholderName: "", fundNature: "ADVANCE", currencyCode: "CNY", amountOriginal: "", exchangeRate: "1", companyCode: "", companyName: "", projectCode: "", projectName: "", occurredDate: "", remark: "" });
      loadList(1);
    } catch { toast.error("网络错误"); }
    finally { setSubmitting(false); }
  };

  const handleSubmit = async (id: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/procurement/shareholder-funds/${id}/submit`, { method: "POST", headers: hdr() });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "提交失败"); return; }
      toast.success("已提交审批");
      setDetailOpen(false);
      loadList(1);
    } catch { toast.error("网络错误"); }
    finally { setSubmitting(false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ padding: 16 }}>
      {/* Summary cards */}
      <SummaryCards summary={summary} />

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <input
          placeholder="搜索编号 / 股东姓名 / PO编号"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, width: 220, background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
        <select
          value={fundNature}
          onChange={e => setFundNature(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}
        >
          <option value="">全部性质</option>
          <option value="INVESTMENT">投资款</option>
          <option value="LOAN">借款</option>
          <option value="ADVANCE">垫付</option>
          <option value="NORMAL">普通</option>
        </select>
        <select
          value={currencyCode}
          onChange={e => setCurrencyCode(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}
        >
          <option value="">全部币种</option>
          <option value="CNY">CNY 人民币</option>
          <option value="LAK">LAK 老挝基普</option>
          <option value="THB">THB 泰铢</option>
          <option value="USD">USD 美元</option>
        </select>
        <input
          placeholder="股东ID"
          value={shareholderId}
          onChange={e => setShareholderId(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, width: 100, background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>至</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
        <button className={s.btnPrimary} onClick={handleSearch} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Search size={13} /> 查询
        </button>
        <button className={s.btnSecondary} onClick={handleReset} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={13} /> 重置
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)" }}>共 {total} 条</span>
        <button className={s.btnPrimary} onClick={() => setCreateOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={13} /> 新建资金
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>资金编号</th>
              <th>股东姓名</th>
              <th>资金性质</th>
              <th>币种</th>
              <th>金额</th>
              <th>汇率</th>
              <th>CNY换算</th>
              <th>关联PO</th>
              <th>项目</th>
              <th>发生日期</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>加载中...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>暂无数据</td></tr>
            )}
            {!loading && items.map(row => (
              <tr key={row.id}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.fundNo}</td>
                <td>{row.shareholderName}</td>
                <td><NatureBadge nature={row.fundNature} /></td>
                <td>{row.currencyCode}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtNum(row.amountOriginal)}</td>
                <td style={{ textAlign: "right", fontSize: 12 }}>{Number(row.exchangeRate).toFixed(4)}</td>
                <td style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: 12 }}>
                  {row.baseCurrency} {fmtNum(row.amountBase)}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.relatedPoNo || "—"}</td>
                <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.projectName || row.projectCode || "—"}</td>
                <td style={{ fontSize: 12 }}>{row.occurredDate || "—"}</td>
                <td><StatusBadge status={row.status} /></td>
                <td style={{ display: "flex", gap: 4 }}>
                  <button className={s.btnIcon} title="查看详情" onClick={() => openDetail(row)}>
                    <Eye size={13} />
                  </button>
                  {row.status === "DRAFT" && (
                    <button className={s.btnIcon} title="提交审批" onClick={() => handleSubmit(row.id)} disabled={submitting}>
                      <Send size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button className={s.btnSecondary} disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadList(p); }}>上一页</button>
          <span style={{ lineHeight: "30px", fontSize: 13 }}>第 {page} / {totalPages} 页</span>
          <button className={s.btnSecondary} disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); loadList(p); }}>下一页</button>
        </div>
      )}

      {/* Detail Drawer */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={`股东资金详情 - ${detail?.fundNo ?? ""}`} width={560}>
        {detail && (
          <div style={{ padding: "0 24px 24px" }}>
            {/* Header summary */}
            <div style={{
              background: "var(--bg-highlight, var(--bg-card))", borderRadius: 8,
              padding: 16, marginBottom: 20, border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                {detail.currencyCode} {fmtNum(detail.amountOriginal)}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <NatureBadge nature={detail.fundNature} />
                <StatusBadge status={detail.status} />
              </div>
            </div>

            <div className={s.formSection}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>资金信息</div>
              <Row label="资金编号"   value={detail.fundNo} mono />
              <Row label="股东姓名"   value={detail.shareholderName} />
              <Row label="股东ID"     value={detail.shareholderId || "—"} />
              <Row label="资金性质"   value={FUND_NATURE_LABELS[detail.fundNature] ?? detail.fundNature} />
              <Row label="来源类型"   value={detail.sourceType || "—"} />
              <Row label="发生日期"   value={detail.occurredDate || "—"} />
              <Row label="状态"       value={STATUS_LABELS[detail.status] ?? detail.status} />
            </div>

            <div className={s.formSection} style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>金额信息</div>
              <Row label="原币"        value={detail.currencyCode} />
              <Row label="金额（原币）" value={`${detail.currencyCode} ${fmtNum(detail.amountOriginal)}`} />
              <Row label="汇率"         value={Number(detail.exchangeRate).toFixed(6)} />
              <Row label="基准货币"     value={detail.baseCurrency} />
              <Row label="金额（基准）" value={`${detail.baseCurrency} ${fmtNum(detail.amountBase)}`} />
            </div>

            <div className={s.formSection} style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>关联信息</div>
              <Row label="关联PO"      value={detail.relatedPoNo || "—"} mono />
              <Row label="关联付款ID" value={detail.relatedPaymentId || "—"} />
              <Row label="公司"        value={detail.companyName || detail.companyCode || "—"} />
              <Row label="项目"        value={detail.projectName || detail.projectCode || "—"} />
              <Row label="备注"        value={detail.remark || "—"} />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 16 }}>
              创建于 {new Date(detail.createdAt).toLocaleString("zh-CN")}
            </div>
            {detail.status === "DRAFT" && (
              <div style={{ padding: "16px 24px 0" }}>
                <button className={s.btnPrimary} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => handleSubmit(detail.id)} disabled={submitting}>
                  <Send size={14} /> {submitting ? "提交中…" : "提交审批"}
                </button>
              </div>
            )}
          </div>
        )}
      </RightDrawer>

      {/* 新建股东资金 */}
      <RightDrawer open={createOpen} onClose={() => setCreateOpen(false)} title="新建股东资金（手工登记）" width={480}>
        <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {([
            { label: "股东姓名 *", key: "shareholderName", type: "text", placeholder: "输入股东全名" },
            { label: "金额 *",     key: "amountOriginal",  type: "number", placeholder: "输入原币金额" },
            { label: "汇率",       key: "exchangeRate",    type: "number", placeholder: "对基准货币汇率，默认1" },
            { label: "公司代码",   key: "companyCode",     type: "text",   placeholder: "如 PHX_AGRI_LA" },
            { label: "公司名称",   key: "companyName",     type: "text",   placeholder: "公司全名" },
            { label: "项目代码",   key: "projectCode",     type: "text",   placeholder: "可选" },
            { label: "项目名称",   key: "projectName",     type: "text",   placeholder: "可选" },
            { label: "发生日期",   key: "occurredDate",    type: "date",   placeholder: "" },
            { label: "备注",       key: "remark",          type: "text",   placeholder: "可选" },
          ] as { label: string; key: keyof typeof createForm; type: string; placeholder: string }[]).map(f => (
            <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{f.label}</span>
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={createForm[f.key]}
                onChange={e => setCreateForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}
              />
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>资金性质</span>
            <select value={createForm.fundNature} onChange={e => setCreateForm(p => ({ ...p, fundNature: e.target.value }))}
              style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}>
              <option value="ADVANCE">垫付</option>
              <option value="LOAN">借款</option>
              <option value="INVESTMENT">投资款</option>
              <option value="EQUITY">股权出资</option>
              <option value="DIVIDEND_OFFSET">分红转投资</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>币种</span>
            <select value={createForm.currencyCode} onChange={e => setCreateForm(p => ({ ...p, currencyCode: e.target.value }))}
              style={{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg-input)", color: "var(--text-primary)" }}>
              <option value="CNY">CNY 人民币</option>
              <option value="LAK">LAK 老挝基普</option>
              <option value="THB">THB 泰铢</option>
              <option value="USD">USD 美元</option>
            </select>
          </label>
          <button className={s.btnPrimary} onClick={handleCreate} disabled={submitting}
            style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={14} /> {submitting ? "保存中…" : "保存为草稿"}
          </button>
        </div>
      </RightDrawer>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
      <div style={{ width: 100, flexShrink: 0, fontSize: 12, color: "var(--text-secondary)", paddingTop: 1 }}>{label}</div>
      <div style={{ fontSize: 13, wordBreak: "break-all", fontFamily: mono ? "monospace" : undefined }}>{value}</div>
    </div>
  );
}
