"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import u from "@/styles/uix-utils.module.css";
import { BookOpen, List, Zap, AlertTriangle, Plus, RefreshCw, Search, X, Info, Layers } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import s from "@/components/ui/admin-ui.module.css";
import { inputField } from "@/components/design-system/cockpit-styles"; // G94 全局输入框唯一真相源
import { useLanguage } from "@/contexts/LanguageContext";
const API = "/api/v2/sales/pricing";
const MASTER_API = "/api/product-master";

// ── 枚举常量 ──────────────────────────────────────────────────────────────────
const BOOK_STATUSES: Record<string, {
  label: string;
  cls: string;
}> = {
  DRAFT: {
    label: "草稿",
    cls: s.badgeNeutral
  },
  PENDING_APPROVAL: {
    label: "审批中",
    cls: s.badgeWarning
  },
  APPROVED: {
    label: "已批准",
    cls: s.badgeInfo
  },
  ACTIVE: {
    label: "生效中",
    cls: s.badgeSuccess
  },
  EXPIRED: {
    label: "已失效",
    cls: s.badgeNeutral
  },
  CANCELLED: {
    label: "已取消",
    cls: s.badgeNeutral
  }
};

/** Phase H3 前：旧 grade_code 数字值集兼容显示（旧数据保留，新数据用 product_grades 主数据） */
const LEGACY_GRADE_NAMES: Record<string, string> = {
  "0": "0号蛋",
  "1": "1号蛋",
  "2": "2号蛋",
  "3": "3号蛋",
  "4": "4号蛋",
  "5": "5号蛋",
  "DIRTY": "脏蛋",
  "BROKEN": "破损蛋"
};
type Tab = "books" | "items" | "current" | "anomaly";

// ── 主数据接口类型 ─────────────────────────────────────────────────────────────
interface GradeItem {
  grade_code: string;
  grade_name: string;
  status: string;
}
interface SpecItem {
  spec_code: string;
  spec_name: string;
  status: string;
  qty_per_unit: number;
  display_unit: string;
}
interface SkuItem {
  sku_code: string;
  product_code: string;
  grade_code: string;
  spec_code: string;
  sku_name?: string;
  status: string;
}
interface MasterData {
  grades: GradeItem[];
  specs: SpecItem[];
  skus: SkuItem[];
  loading: boolean;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
async function apiFetch(path: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("phoenix_token") || sessionStorage.getItem("phoenix_token") || "" : "";
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? {
        Authorization: `Bearer ${token}`
      } : {})
    },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** 将 grade_code 转成可读名称（先查主数据，再 fallback 旧值集） */
function gradeLabel(code: string | null | undefined, grades: GradeItem[]): string {
  if (!code) return "—";
  const g = grades.find(x => x.grade_code === code);
  if (g) return `${g.grade_name} (${code})`;
  return LEGACY_GRADE_NAMES[code] ?? code;
}

// ── 主数据加载 Hook ────────────────────────────────────────────────────────────
function useMasterData(): MasterData {
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [specs, setSpecs] = useState<SpecItem[]>([]);
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    Promise.allSettled([apiFetch(`${MASTER_API}/grades`).then(r => setGrades(r.data ?? [])), apiFetch(`${MASTER_API}/specs`).then(r => setSpecs(r.data ?? [])), apiFetch(`${MASTER_API}/skus`).then(r => setSkus(r.data ?? []))]).finally(() => setLoading(false));
  }, []);
  return {
    grades,
    specs,
    skus,
    loading
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 页面主体
// ══════════════════════════════════════════════════════════════════════════════
export default function SalesV2PricingPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("books");
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.价格管理','价格管理')} subtitle={t('ui.价格册 · 价格明细 · 统一定价引擎 · 按公司隔离数据','价格册 · 价格明细 · 统一定价引擎 · 按公司隔离数据')} breadcrumb={[t('ui.销售系统','销售系统'), t('ui.价格管理','价格管理')]} />

      {/* Tab Bar */}
      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "1px solid var(--border)",
      paddingBottom: 0
    }}>
        {([{
        id: "books",
        label: t('ui.价格册','价格册'),
        icon: <BookOpen size={14} />
      }, {
        id: "items",
        label: t('ui.价格明细','价格明细'),
        icon: <List size={14} />
      }, {
        id: "current",
        label: t('ui.当前生效价格','当前生效价格'),
        icon: <Zap size={14} />
      }, {
        id: "anomaly",
        label: t('ui.价格异常','价格异常'),
        icon: <AlertTriangle size={14} />
      }] as {
        id: Tab;
        label: string;
        icon: React.ReactNode;
      }[]).map(({
        id,
        label,
        icon
      }) => <button key={id} type="button" onClick={() => setTab(id)} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        color: tab === id ? "var(--color-primary)" : "var(--text-secondary)",
        borderBottom: tab === id ? "2px solid var(--color-primary)" : "2px solid transparent",
        marginBottom: -1
      }}>
            {icon}{label}
          </button>)}
      </div>

      {tab === "books" && <PriceBooksTab />}
      {tab === "items" && <PriceItemsTab />}
      {tab === "current" && <CurrentPricesTab />}
      {tab === "anomaly" && <AnomalyTab />}
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格册 Tab（无变化）
// ══════════════════════════════════════════════════════════════════════════════
function PriceBooksTab() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmFn, setConfirmFn] = useState<() => Promise<void>>(() => async () => {});
  const [errorMsg, setErrorMsg] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const p = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (keyword) p.set("keyword", keyword);
      if (statusFilter) p.set("status", statusFilter);
      const res = await apiFetch(`${API}/books?${p}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setErrorMsg(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, statusFilter]);
  useEffect(() => {
    load();
  }, [load]);
  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`${API}/books/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values)
        });
      } else {
        await apiFetch(`${API}/books`, {
          method: "POST",
          body: JSON.stringify(values)
        });
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };
  const ask = (msg: string, fn: () => Promise<void>) => {
    setConfirmMsg(msg);
    setConfirmFn(() => fn);
    setConfirmOpen(true);
  };
  const doAction = async (id: string, action: string, label: string) => {
    ask(`${t('ui.确认','确认')}${label}${t('ui.此价格册？','此价格册？')}`, async () => {
      try {
        await apiFetch(`${API}/books/${id}/${action}`, {
          method: "POST",
          body: "{}"
        });
        load();
      } catch (e: any) {
        setErrorMsg(e.message);
      }
    });
  };
  const FIELDS: FormField[] = [{
    key: "priceBookName",
    label: t('ui.价格册名称','价格册名称'),
    type: "text",
    required: true
  }, {
    key: "companyCode",
    label: t('ui.公司','公司'),
    type: "company",
    required: true,
    onPickKeys: { companyName: "org_name" }
  }, {
    key: "companyName",
    label: t('ui.公司名称（自动带出）','公司名称（自动带出）'),
    type: "readonly"
  }, {
    key: "channelCode",
    label: t('ui.渠道（渠道价）','渠道（渠道价）'),
    type: "channel",
    placeholder: t('ui.留空=不限渠道','留空=不限渠道')
  }, {
    key: "customerCode",
    label: t('ui.客户（专属价）','客户（专属价）'),
    type: "customer",
    placeholder: t('ui.留空=非专属','留空=非专属')
  }, {
    key: "priority",
    label: t('ui.优先级（数字越小越优先）','优先级（数字越小越优先）'),
    type: "number"
  }, {
    key: "effectiveFrom",
    label: t('ui.生效日期','生效日期'),
    type: "date"
  }, {
    key: "effectiveTo",
    label: t('ui.失效日期','失效日期'),
    type: "date"
  }, {
    key: "remark",
    label: t('ui.备注','备注'),
    type: "text"
  }];
  const totalPages = Math.ceil(total / limit);
  return <div>
      {errorMsg && <div style={{
      marginBottom: 12,
      padding: "10px 14px",
      borderRadius: "var(--radius)",
      background: "var(--status-danger-bg-faint)",
      border: "1px solid var(--status-danger-bg-medium)",
      color: "var(--status-danger)",
      fontSize: 13
    }}>
          {errorMsg} <button type="button" onClick={() => setErrorMsg("")} style={{
        marginLeft: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--status-danger)"
      }}><X size={12} /></button>
        </div>}

      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 14,
      flexWrap: "wrap"
    }}>
        <div style={{
        position: "relative",
        flex: 1,
        minWidth: 200
      }}>
          <Search size={14} style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-secondary)"
        }} />
          <input style={{
          paddingLeft: 32,
          height: 34,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          fontSize: 13,
          width: "100%",
          background: "var(--bg-card)"
        }} placeholder={t('ui.搜索价格册名称 / 编号…','搜索价格册名称 / 编号…')} value={keyword} onChange={e => {
          setKeyword(e.target.value);
          setPage(1);
        }} />
        </div>
        <select value={statusFilter} onChange={e => {
        setStatusFilter(e.target.value);
        setPage(1);
      }} style={{
        height: 34,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        padding: "0 10px",
        background: "var(--bg-card)"
      }}>
          <option value="">{t('ui.全部状态','全部状态')}</option>
          {Object.entries(BOOK_STATUSES).map(([v, {
          label
        }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}>
          <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> {t('ui.刷新','刷新')}
        </button>
        <button type="button" className={s.btnPrimary} onClick={() => {
        setEditing(null);
        setDrawerOpen(true);
      }} style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}>
          <Plus size={13} /> {t('ui.新建价格册','新建价格册')}
        </button>
      </div>

      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('ui.编号','编号'), t('ui.名称','名称'), t('ui.渠道','渠道'), t('ui.客户','客户'), t('ui.优先级','优先级'), t('ui.生效日','生效日'), t('ui.失效日','失效日'), t('ui.状态','状态'), t('ui.操作','操作')].map(h => <th key={h} className={u.nowrap}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className={u.emptyCenter}>{t('ui.加载中…','加载中…')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className={s.emptyState}>{t('ui.暂无价格册','暂无价格册')}</td></tr>}
            {rows.map((row, i) => {
            const st = BOOK_STATUSES[row.status] ?? {
              label: row.status,
              cls: s.badgeNeutral
            };
            return <tr key={row.id} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                  <td style={{
                fontFamily: "monospace",
                fontSize: 11
              }}>{row.price_book_no}</td>
                  <td>{row.price_book_name}</td>
                  <td className={u.muted}>{row.channel_code ?? "—"}</td>
                  <td className={u.muted}>{row.customer_code ?? "—"}</td>
                  <td className={u.tac}>{row.priority}</td>
                  {/* g200c(2026-06-19):ISO 字符串 → 本地日期(yyyy-MM-dd) */}
                  <td className={u.fs11}>{row.effective_from ? new Date(row.effective_from).toLocaleDateString("zh-CN") : "—"}</td>
                  <td className={u.fs11}>{row.effective_to   ? new Date(row.effective_to).toLocaleDateString("zh-CN")   : "—"}</td>
                  <td><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                  <td>
                    <div style={{
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap"
                }}>
                      {row.status === "DRAFT" && <>
                          <button type="button" className={s.btnSecondary} onClick={() => {
                      setEditing(row);
                      setDrawerOpen(true);
                    }} style={{
                      padding: "2px 8px",
                      fontSize: 11
                    }}>{t('ui.编辑','编辑')}</button>
                          <button type="button" className={s.btnSecondary} onClick={() => doAction(row.id, "submit", t('ui.提交审批','提交审批'))} style={{
                      padding: "2px 8px",
                      fontSize: 11
                    }}>{t('ui.提交审批','提交审批')}</button>
                        </>}
                      {row.status === "APPROVED" && <button type="button" className={s.btnPrimary} onClick={() => doAction(row.id, "activate", t('ui.激活','激活'))} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>{t('ui.激活','激活')}</button>}
                      {(row.status === "ACTIVE" || row.status === "APPROVED") && <button type="button" className={s.btnSecondary} onClick={() => doAction(row.id, "expire", t('ui.失效','失效'))} style={{
                    padding: "2px 8px",
                    fontSize: 11
                  }}>{t('ui.失效','失效')}</button>}
                      {!["CANCELLED", "ACTIVE"].includes(row.status) && <button type="button" onClick={() => doAction(row.id, "cancel", t('ui.取消','取消'))} style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    background: "none",
                    border: "1px solid var(--status-danger)",
                    color: "var(--status-danger)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer"
                  }}>{t('ui.取消','取消')}</button>}
                    </div>
                  </td>
                </tr>;
          })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
      alignItems: "center",
      fontSize: 13
    }}>
          <span className={u.muted}>{t('ui.共','共')} {total} {t('ui.条','条')}</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('ui.上一页','上一页')}</button>
          <span>{t('ui.第','第')} {page} / {totalPages} {t('ui.页','页')}</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('ui.下一页','下一页')}</button>
        </div>}

      <RightDrawer open={drawerOpen} title={editing ? t('ui.编辑价格册','编辑价格册') : t('ui.新建价格册','新建价格册')} onClose={() => setDrawerOpen(false)}>
        <CrudForm fields={FIELDS} initialValues={editing ? {
        priceBookName: editing.price_book_name,
        companyCode: editing.company_code,
        companyName: editing.company_name,
        channelCode: editing.channel_code,
        customerCode: editing.customer_code,
        priority: editing.priority,
        effectiveFrom: editing.effective_from,
        effectiveTo: editing.effective_to,
        remark: editing.remark
      } : {}} onSubmit={handleSave} onCancel={() => setDrawerOpen(false)} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t('ui.确认操作','确认操作')} message={confirmMsg} onConfirm={async () => {
      await confirmFn();
      setConfirmOpen(false);
    }} onCancel={() => setConfirmOpen(false)} />
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格明细 Tab — Phase H3 升级：接入主数据 + SKU 选择器
// ══════════════════════════════════════════════════════════════════════════════

/** 价格明细表单（自定义，支持 SKU 选择自动填充） */
interface ItemFormState {
  priceBookId: string;
  skuCode: string; // Phase H3: SKU 选择器
  productCode: string;
  gradeCode: string;
  packagingSpec: string;
  unitPrice: string;
  floorPrice: string;
  ceilingPrice: string;
  minQty: string;
  maxQty: string;
  currencyCode: string;
}
const EMPTY_FORM: ItemFormState = {
  priceBookId: "",
  skuCode: "",
  productCode: "",
  gradeCode: "",
  packagingSpec: "",
  unitPrice: "",
  floorPrice: "",
  ceilingPrice: "",
  minQty: "",
  maxQty: "",
  currencyCode: "LAK"
};
function PriceItemsTab() {
  const { t } = useLanguage();
  const master = useMasterData();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bookId, setBookId] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 动态 grade 和 spec 选项（从主数据 API 加载，fallback 旧值集）
  const gradeOptions = useMemo(() => master.grades.length > 0 ? master.grades.filter(g => g.status === "ACTIVE").map(g => ({
    value: g.grade_code,
    label: `${g.grade_name} (${g.grade_code})`
  })) : Object.entries(LEGACY_GRADE_NAMES).map(([v, l]) => ({
    value: v,
    label: l
  })), [master.grades]);
  const specOptions = useMemo(() => master.specs.length > 0 ? master.specs.filter(sp => sp.status === "ACTIVE").map(sp => ({
    value: sp.spec_code,
    label: `${sp.spec_name} (${sp.spec_code})`
  })) : [{
    value: "LOOSE",
    label: t('ui.散装 (LOOSE)','散装 (LOOSE)')
  }, {
    value: "TRAY30",
    label: t('ui.30枚/托 (TRAY30)','30枚/托 (TRAY30)')
  }, {
    value: "BOX360",
    label: t('ui.360枚/箱 (BOX360)','360枚/箱 (BOX360)')
  }], [master.specs]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: "ACTIVE"
      });
      if (bookId) p.set("priceBookId", bookId);
      if (gradeFilter) p.set("gradeCode", gradeFilter);
      const res = await apiFetch(`${API}/items?${p}`);
      setRows(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, bookId, gradeFilter]);
  useEffect(() => {
    load();
  }, [load]);

  /** Phase H3: 选择 SKU → 自动填充 productCode（readonly），grade/spec 保持可选 */
  const handleSkuChange = (skuCode: string) => {
    const sku = master.skus.find(x => x.sku_code === skuCode);
    if (sku) {
      setForm(f => ({
        ...f,
        skuCode,
        productCode: sku.product_code,
        gradeCode: sku.grade_code,
        packagingSpec: sku.spec_code
      }));
    } else {
      setForm(f => ({
        ...f,
        skuCode
      }));
    }
  };
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      priceBookId: String(row.price_book_id ?? ""),
      skuCode: row.sku_code ?? "",
      productCode: row.product_code ?? "",
      gradeCode: row.grade_code ?? "",
      packagingSpec: row.packaging_spec ?? "",
      unitPrice: String(row.unit_price ?? ""),
      floorPrice: String(row.floor_price ?? ""),
      ceilingPrice: String(row.ceiling_price ?? ""),
      minQty: String(row.min_qty ?? ""),
      maxQty: String(row.max_qty ?? ""),
      currencyCode: row.currency_code ?? "LAK"
    });
    setDrawerOpen(true);
  };
  const handleSave = async () => {
    if (!form.productCode && !form.skuCode) {
      setErrorMsg(t('ui.请填写产品编码，或通过 SKU 选择器自动填充','请填写产品编码，或通过 SKU 选择器自动填充'));
      return;
    }
    if (!form.unitPrice) {
      setErrorMsg(t('ui.单价不能为空','单价不能为空'));
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        priceBookId: Number(form.priceBookId),
        productCode: form.productCode || undefined,
        gradeCode: form.gradeCode || undefined,
        packagingSpec: form.packagingSpec || undefined,
        unitPrice: Number(form.unitPrice),
        floorPrice: form.floorPrice ? Number(form.floorPrice) : undefined,
        ceilingPrice: form.ceilingPrice ? Number(form.ceilingPrice) : undefined,
        minQty: form.minQty ? Number(form.minQty) : undefined,
        maxQty: form.maxQty ? Number(form.maxQty) : undefined,
        currencyCode: form.currencyCode || "LAK",
        // Phase H3
        skuCode: form.skuCode || undefined
      };
      if (editing?.id) {
        await apiFetch(`${API}/items/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            unitPrice: payload.unitPrice,
            floorPrice: payload.floorPrice,
            ceilingPrice: payload.ceilingPrice,
            minQty: payload.minQty,
            maxQty: payload.maxQty,
            currencyCode: payload.currencyCode
          })
        });
      } else {
        await apiFetch(`${API}/items`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      setDrawerOpen(false);
      load();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSaving(false);
    }
  };
  const doDisable = async (id: string) => {
    try {
      await apiFetch(`${API}/items/${id}/disable`, {
        method: "POST"
      });
      load();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };
  const totalPages = Math.ceil(total / limit);

  // 用于筛选器 Grade 下拉
  const allGradeOptions = useMemo(() => [...Object.entries(LEGACY_GRADE_NAMES).map(([v, l]) => ({
    value: v,
    label: l
  })), ...master.grades.filter(g => !LEGACY_GRADE_NAMES[g.grade_code]).map(g => ({
    value: g.grade_code,
    label: `${g.grade_name} (${g.grade_code})`
  }))], [master.grades]);
  // G94：并入全局输入框唯一真相源（取代本页自定义 高34·0/10·13）
  const inp: React.CSSProperties = inputField;
  const lbl: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: 4,
    marginTop: 14
  };
  return <div>
      {errorMsg && <div style={{
      marginBottom: 10,
      padding: "8px 12px",
      borderRadius: "var(--radius)",
      background: "var(--status-danger-bg-faint)",
      color: "var(--status-danger)",
      fontSize: 12
    }}>
          {errorMsg} <button type="button" onClick={() => setErrorMsg("")} style={{
        marginLeft: 6,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--status-danger)"
      }}><X size={11} /></button>
        </div>}

      {/* 工具栏 */}
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 14
    }}>
        <input style={{
        ...inp,
        width: 140
      }} placeholder={t('ui.价格册 ID','价格册 ID')} value={bookId} onChange={e => {
        setBookId(e.target.value);
        setPage(1);
      }} />
        <select value={gradeFilter} onChange={e => {
        setGradeFilter(e.target.value);
        setPage(1);
      }} style={{
        ...inp,
        width: 160
      }}>
          <option value="">{t('ui.全部品级','全部品级')}</option>
          {allGradeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}>
          <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> {t('ui.刷新','刷新')}
        </button>
        <button type="button" className={s.btnPrimary} onClick={openCreate} style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginLeft: "auto"
      }}>
          <Plus size={13} /> {t('ui.新建明细','新建明细')}
        </button>
      </div>

      {/* 表格 */}
      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('ui.价格册','价格册'), t('ui.SKU / 产品','SKU / 产品'), t('ui.品级','品级'), t('ui.规格','规格'), t('ui.单价','单价'), t('ui.底价','底价'), t('ui.最高价','最高价'), t('ui.数量范围','数量范围'), t('ui.货币','货币'), t('ui.操作','操作')].map(h => <th key={h} style={{
              textAlign: [t('ui.单价','单价'), t('ui.底价','底价'), t('ui.最高价','最高价')].includes(h) ? "right" : "left",
              whiteSpace: "nowrap"
            }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className={u.emptyCenter}>{t('ui.加载中…','加载中…')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={10} className={s.emptyState}>{t('ui.暂无价格明细（请输入价格册 ID 筛选）','暂无价格明细（请输入价格册 ID 筛选）')}</td></tr>}
            {rows.map((row, i) => <tr key={row.id} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}>
                <td style={{
              fontFamily: "monospace",
              fontSize: 11
            }}>{row.price_book_no}</td>
                <td>
                  {row.sku_code ? <span style={{
                fontFamily: "monospace",
                fontSize: 11,
                background: "var(--status-special-bg-medium)",
                color: "var(--color-purple-400)",
                borderRadius: 4,
                padding: "2px 6px"
              }}>{row.sku_code}</span> : row.product_code}
                </td>
                <td className={u.fs12}>{gradeLabel(row.grade_code_std ?? row.grade_code, master.grades)}</td>
                <td className={u.fs11}>{row.spec_code ?? row.packaging_spec ?? "—"}</td>
                <td style={{
              textAlign: "right",
              fontWeight: 700
            }}>{Number(row.unit_price).toLocaleString()}</td>
                <td style={{
              textAlign: "right",
              color: "var(--status-warning)"
            }}>
                  {row.floor_price != null ? Number(row.floor_price).toLocaleString() : "—"}
                </td>
                <td className={u.tar}>
                  {row.ceiling_price != null ? Number(row.ceiling_price).toLocaleString() : "—"}
                </td>
                <td className={u.fs11}>
                  {row.min_qty || row.max_qty ? `${row.min_qty ?? 0} ~ ${row.max_qty ?? "∞"}` : t('ui.不限','不限')}
                </td>
                <td>{row.currency_code}</td>
                <td>
                  <div style={{
                display: "flex",
                gap: 4
              }}>
                    <button type="button" className={s.btnSecondary} onClick={() => openEdit(row)} style={{
                  padding: "2px 8px",
                  fontSize: 11
                }}>{t('ui.编辑','编辑')}</button>
                    <button type="button" onClick={() => doDisable(row.id)} style={{
                  padding: "2px 8px",
                  fontSize: 11,
                  background: "none",
                  border: "1px solid var(--status-danger)",
                  color: "var(--status-danger)",
                  borderRadius: "var(--radius)",
                  cursor: "pointer"
                }}>{t('ui.停用','停用')}</button>
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
      alignItems: "center",
      fontSize: 13
    }}>
          <span className={u.muted}>{t('ui.共','共')} {total} {t('ui.条','条')}</span>
          <button type="button" className={s.btnSecondary} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('ui.上一页','上一页')}</button>
          <span>{t('ui.第','第')} {page} / {totalPages} {t('ui.页','页')}</span>
          <button type="button" className={s.btnSecondary} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t('ui.下一页','下一页')}</button>
        </div>}

      {/* 新建 / 编辑 Drawer — 自定义表单支持 SKU 选择器 */}
      <RightDrawer open={drawerOpen} title={editing ? t('ui.编辑价格明细','编辑价格明细') : t('ui.新建价格明细','新建价格明细')} onClose={() => setDrawerOpen(false)}>
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "4px 0"
      }}>

          {/* Phase H3: SKU 快捷选择（仅新建时显示） */}
          {!editing && <div className={u.mb8}>
              <label style={lbl}>
                <span className={u.flexRow}>
                  <Layers size={12} color="var(--color-purple-400)" /> {t('ui.SKU 快捷选择','SKU 快捷选择')}
                  <span style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontWeight: 400
              }}>{t('ui.（可选·选择后自动填充产品/品级/规格）','（可选·选择后自动填充产品/品级/规格）')}</span>
                </span>
              </label>
              {master.skus.length === 0 && !master.loading ? <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--status-warning)",
            background: "var(--status-warning-bg-faint)",
            border: "1px solid var(--status-warning-border)",
            borderRadius: "var(--radius)",
            padding: "8px 10px"
          }}>
                  <Info size={13} /> {t('ui.请先在','请先在')}<a href="/master-data/product-skus" target="_blank" style={{
              color: "var(--status-warning)",
              textDecoration: "underline"
            }}>{t('ui.主数据中心 → SKU 档案','主数据中心 → SKU 档案')}</a>{t('ui.维护商品组合','维护商品组合')}
                </div> : <select style={inp} value={form.skuCode} onChange={e => handleSkuChange(e.target.value)}>
                  <option value="">{t('ui.— 不使用 SKU 选择器，手动填写 —','— 不使用 SKU 选择器，手动填写 —')}</option>
                  {master.skus.filter(x => x.status === "ACTIVE").map(x => <option key={x.sku_code} value={x.sku_code}>
                      {x.sku_code}{x.sku_name ? ` · ${x.sku_name}` : ""}
                    </option>)}
                </select>}
            </div>}

          <label style={lbl}>{t('ui.价格册 ID','价格册 ID')} <span style={{
            color: "var(--status-danger)"
          }}>*</span></label>
          <input type="number" style={{
          ...inp,
          ...(editing ? {
            background: "var(--bg-muted)",
            color: "var(--text-secondary)"
          } : {})
        }} value={form.priceBookId} disabled={!!editing} onChange={e => setForm(f => ({
          ...f,
          priceBookId: e.target.value
        }))} placeholder={t('ui.输入价格册 ID','输入价格册 ID')} />

          <label style={lbl}>
            {t('ui.产品编码','产品编码')} {!form.skuCode && <span style={{
            color: "var(--status-danger)"
          }}>*</span>}
            {form.skuCode && <span style={{
            fontSize: 11,
            color: "var(--color-purple-400)",
            marginLeft: 6
          }}>{t('ui.（由 SKU 自动填充）','（由 SKU 自动填充）')}</span>}
          </label>
          <input style={{
          ...inp,
          ...(form.skuCode ? {
            background: "var(--bg-muted)",
            color: "var(--text-secondary)"
          } : {})
        }} value={form.productCode} disabled={!!form.skuCode} onChange={e => setForm(f => ({
          ...f,
          productCode: e.target.value
        }))} placeholder={t('ui.如 EGG / PRD-EGG-RAW','如 EGG / PRD-EGG-RAW')} />

          <label style={lbl}>{t('ui.品级（grade_code）','品级（grade_code）')}</label>
          <select style={{
          ...inp,
          ...(form.skuCode ? {
            background: "var(--bg-muted)",
            color: "var(--text-secondary)"
          } : {})
        }} value={form.gradeCode} disabled={!!form.skuCode} onChange={e => setForm(f => ({
          ...f,
          gradeCode: e.target.value
        }))}>
            <option value="">{t('ui.— 不限品级 —','— 不限品级 —')}</option>
            {gradeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label style={lbl}>{t('ui.包装规格（spec_code）','包装规格（spec_code）')}</label>
          <select style={{
          ...inp,
          ...(form.skuCode ? {
            background: "var(--bg-muted)",
            color: "var(--text-secondary)"
          } : {})
        }} value={form.packagingSpec} disabled={!!form.skuCode} onChange={e => setForm(f => ({
          ...f,
          packagingSpec: e.target.value
        }))}>
            <option value="">{t('ui.— 不限规格 —','— 不限规格 —')}</option>
            {specOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label style={lbl}>{t('ui.单价','单价')} <span style={{
            color: "var(--status-danger)"
          }}>*</span></label>
          <input type="number" style={inp} min={0} value={form.unitPrice} onChange={e => setForm(f => ({
          ...f,
          unitPrice: e.target.value
        }))} placeholder="0" />

          <label style={lbl}>{t('ui.底价（低于此须审批）','底价（低于此须审批）')}</label>
          <input type="number" style={inp} min={0} value={form.floorPrice} onChange={e => setForm(f => ({
          ...f,
          floorPrice: e.target.value
        }))} placeholder={t('ui.选填','选填')} />

          <label style={lbl}>{t('ui.最高价','最高价')}</label>
          <input type="number" style={inp} min={0} value={form.ceilingPrice} onChange={e => setForm(f => ({
          ...f,
          ceilingPrice: e.target.value
        }))} placeholder={t('ui.选填','选填')} />

          <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8
        }}>
            <div>
              <label style={lbl}>{t('ui.最小数量（阶梯）','最小数量（阶梯）')}</label>
              <input type="number" style={inp} min={0} value={form.minQty} onChange={e => setForm(f => ({
              ...f,
              minQty: e.target.value
            }))} placeholder={t('ui.不限','不限')} />
            </div>
            <div>
              <label style={lbl}>{t('ui.最大数量（阶梯）','最大数量（阶梯）')}</label>
              <input type="number" style={inp} min={0} value={form.maxQty} onChange={e => setForm(f => ({
              ...f,
              maxQty: e.target.value
            }))} placeholder={t('ui.不限','不限')} />
            </div>
          </div>

          <label style={lbl}>{t('ui.货币','货币')}</label>
          <input style={inp} value={form.currencyCode} onChange={e => setForm(f => ({
          ...f,
          currencyCode: e.target.value
        }))} placeholder="LAK" />

          {errorMsg && <div style={{
          marginTop: 8,
          fontSize: 12,
          color: "var(--status-danger)",
          background: "var(--status-danger-bg-faint)",
          borderRadius: "var(--radius)",
          padding: "8px 10px"
        }}>{errorMsg}</div>}

          <div style={{
          display: "flex",
          gap: 8,
          marginTop: 20
        }}>
            <button type="button" className={s.btnPrimary} onClick={handleSave} disabled={saving} style={{
            flex: 1,
            height: 38,
            fontSize: 14,
            fontWeight: 600
          }}>
              {saving ? t('ui.保存中…','保存中…') : t('ui.保存','保存')}
            </button>
            <button type="button" className={s.btnSecondary} onClick={() => setDrawerOpen(false)} style={{
            height: 38,
            padding: "0 16px"
          }}>{t('ui.取消','取消')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 当前生效价格 Tab — Phase H3 升级：使用主数据显示品级名称，展示 SKU
// ══════════════════════════════════════════════════════════════════════════════
function CurrentPricesTab() {
  const { t } = useLanguage();
  const master = useMasterData();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyCode, setCompanyCode] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (companyCode) p.set("companyCode", companyCode);
      const res = await apiFetch(`${API}/current?${p}`);
      setRows(Array.isArray(res) ? res : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyCode]);
  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(() => gradeFilter ? rows.filter(r => (r.gradeCodeStd ?? r.gradeCode) === gradeFilter) : rows, [rows, gradeFilter]);

  // 合并新旧 grade code 作为筛选器选项
  const filterGradeOptions = useMemo(() => [...master.grades.filter(g => g.status === "ACTIVE").map(g => ({
    value: g.grade_code,
    label: `${g.grade_name} (${g.grade_code})`
  })), ...Object.entries(LEGACY_GRADE_NAMES).filter(([v]) => !master.grades.find(g => g.grade_code === v)).map(([v, l]) => ({
    value: v,
    label: l
  }))], [master.grades]);
  return <div>
      <div style={{
      display: "flex",
      gap: 10,
      marginBottom: 14
    }}>
        <input style={{
        height: 34,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        padding: "0 10px",
        background: "var(--bg-card)",
        width: 200
      }} placeholder={t('ui.公司编码（可选）','公司编码（可选）')} value={companyCode} onChange={e => setCompanyCode(e.target.value)} />
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} style={{
        height: 34,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        padding: "0 10px",
        background: "var(--bg-card)"
      }}>
          <option value="">{t('ui.全部品级','全部品级')}</option>
          {filterGradeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className={s.btnSecondary} onClick={load} disabled={loading} style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 6
      }}>
          <RefreshCw size={13} style={{
          animation: loading ? "spin 1s linear infinite" : "none"
        }} /> {t('ui.刷新','刷新')}
        </button>
      </div>

      {loading ? <div className={u.emptyPad40}>{t('ui.加载中…','加载中…')}</div> : filtered.length === 0 ? <div className={s.emptyState}>{t('ui.暂无生效价格（请先创建并激活价格册）','暂无生效价格（请先创建并激活价格册）')}</div> : <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 12
    }}>
          {filtered.map((r, i) => {
        const displayGrade = gradeLabel(r.gradeCodeStd ?? r.gradeCode, master.grades);
        return <div key={i} style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "var(--card-accent-width) solid var(--color-primary)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 16px"
        }}>
                {r.skuCode && <div style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: "var(--color-purple-400)",
            background: "var(--status-special-bg-medium)",
            borderRadius: 3,
            padding: "1px 6px",
            marginBottom: 4,
            display: "inline-block"
          }}>
                    {r.skuCode}
                  </div>}
                <div style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 4
          }}>
                  {displayGrade !== "—" ? displayGrade : t('ui.所有品级','所有品级')}
                  {r.specCode ?? r.packagingSpec ? ` · ${r.specCode ?? r.packagingSpec}` : ""}
                </div>
                <div style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--color-primary)"
          }}>
                  {Number(r.unitPrice).toLocaleString()}
                  <span style={{
              fontSize: 11,
              marginLeft: 4,
              color: "var(--text-secondary)",
              fontWeight: 400
            }}>{r.currencyCode}</span>
                </div>
                {r.floorPrice != null && <div style={{
            fontSize: 11,
            color: "var(--status-warning)",
            marginTop: 4
          }}>
                    {t('ui.底价','底价')} {Number(r.floorPrice).toLocaleString()}
                  </div>}
                <div style={{
            fontSize: 10,
            color: "var(--text-secondary)",
            marginTop: 6
          }}>{r.priceBookNo}</div>
              </div>;
      })}
        </div>}
    </div>;
}

// ══════════════════════════════════════════════════════════════════════════════
// 价格异常 Tab（预留）
// ══════════════════════════════════════════════════════════════════════════════
function AnomalyTab() {
  const { t } = useLanguage();
  return <div style={{
    padding: "40px 0",
    textAlign: "center",
    opacity: 0.5
  }}>
      <AlertTriangle size={36} style={{
      margin: "0 auto 14px",
      color: "var(--status-warning)"
    }} />
      <div style={{
      fontWeight: 600,
      marginBottom: 8
    }}>{t('ui.价格异常监控','价格异常监控')}</div>
      <div style={{
      fontSize: 13,
      color: "var(--text-secondary)",
      lineHeight: 1.8
    }}>
        {t('ui.Phase 3（销售订单）完成后启用','Phase 3（销售订单）完成后启用')}<br />
        {t('ui.将展示：低于底价的历史成交记录、未走审批的价格异常、频繁报价异常客户','将展示：低于底价的历史成交记录、未走审批的价格异常、频繁报价异常客户')}
      </div>
    </div>;
}