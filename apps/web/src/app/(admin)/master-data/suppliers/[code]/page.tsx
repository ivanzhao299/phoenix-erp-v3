"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EntityWorkspace, Panel, DataTableV3 } from "@/components/design-system";
import { inlineBadge } from "@/components/design-system/cockpit-styles";
import { usePermission } from "@/hooks/usePermission";
import { PermissionDeniedState } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { Building2, ShoppingCart, Receipt, Link2, FileText } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── 工具：从各种响应 shape 里取数组 ───────────────────────────────────
const formatMoney = (amount: unknown, currency: string) =>
  amount == null || amount === "" ? "—" : `${currency} ${Number(amount).toLocaleString()}`;
const pageSize = 20;
interface PageResult<T> { items: T[]; total: number }
interface OrderRow {
  id: string; poNo: string; createdAt: string; totalAmount: number; currencyCode: string; status: string;
}
interface ApRow {
  id: string; ap_no: string; invoice_date: string; due_date: string;
  amount_original: number; balance_amount_original: number; currency_code: string; status: string;
}
function useSupplierDocuments<T>(route: string, code: string, visible: boolean) {
  const [pagination, setPagination] = useState({ code, page: 1 });
  const page = pagination.code === code ? pagination.page : 1;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: PageResult<T>; error?: boolean }>();
  const key = `${code}/${page}/${retry}`;
  useEffect(() => {
    if (!visible || !code) return;
    let current = true;
    const query = new URLSearchParams({ supplierCode: code, page: String(page), pageSize: String(pageSize) });
    request<PageResult<T>>(`${route}?${query}`, { silent: true })
      .then(data => { if (current) setResult({ key, data }); })
      .catch(() => { if (current) setResult({ key, error: true }); });
    return () => { current = false; };
  }, [route, code, page, key, visible]);
  const ready = visible && result?.key === key ? result : undefined;
  return {
    rows: ready?.data?.items ?? [], total: ready?.data?.total ?? 0, error: ready?.error,
    loading: visible && !ready, page, setPage: (next: number) => setPagination({ code, page: next }),
    retry: () => setRetry(value => value + 1),
  };
}

const dateStr = (v: any) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");

// 状态徽章
const STATUS_META: Record<string, { labelKey: string; label: string; tone: "default" | "success" | "warning" | "danger" }> = {
  ACTIVE: { labelKey: "md.status_active", label: "在用", tone: "success" },
  PENDING_APPROVAL: { labelKey: "md.status_pending_approval", label: "待审批", tone: "warning" },
  DRAFT: { labelKey: "md.status_draft", label: "草稿", tone: "default" },
  FROZEN: { labelKey: "md.status_frozen", label: "冻结", tone: "danger" },
  ARCHIVED: { labelKey: "md.status_archived", label: "归档", tone: "default" },
  REJECTED: { labelKey: "md.status_rejected", label: "已驳回", tone: "danger" },
};

interface RefItem { refTable: string; refDocType: string; refCount: number; }

export default function SupplierDetailPage() {
  const { t, lang } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const supplierPerm = usePermission("MENU_MD_SUPPLIER");
  const purchaseOrderPerm = usePermission("MENU_PRC2_ORDER");
  const apPerm = usePermission("MENU_FIN2_AP");
  const canView = supplierPerm.canView || supplierPerm.isSuper;
  const isSuper = supplierPerm.isSuper;
  const canViewPurchaseOrders = purchaseOrderPerm.canView || purchaseOrderPerm.isSuper;
  const canViewAp = apPerm.canView || apPerm.isSuper;

  const code = decodeURIComponent(String(params?.code || ""));

  const [info, setInfo] = useState<any>(null);
  const ordersPage = useSupplierDocuments<OrderRow>('/v2/procurement/orders', code, canView && canViewPurchaseOrders);
  const apPage = useSupplierDocuments<ApRow>('/v2/finance/ap/invoices', code, canView && canViewAp);
  const orders = ordersPage.rows;
  const apRows = apPage.rows;
  const [refs, setRefs] = useState<{ total: number; items: RefItem[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !code) return;
    let current = true;
    const supplierCode = encodeURIComponent(code);
    request<Record<string, unknown>>(`/master-data/runtime/supplier/${supplierCode}`)
      .then(row => { if (current) setInfo(row); })
      .catch(() => { if (current) setInfo(null); })
      .finally(() => { if (current) setLoading(false); });
    request<{ totalReferences: number; references: RefItem[] }>(
      `/master-data/references/SUPPLIER/${supplierCode}`, { silent: true },
    ).then(report => { if (current) setRefs({ total: report.totalReferences, items: report.references }); })
      .catch(() => { if (current) setRefs({ total: 0, items: [] }); });
    return () => { current = false; };
  }, [code, canView]);

  const documentFooter = (result: ReturnType<typeof useSupplierDocuments>) => (
    result.error ? <div role="alert">{t('md.document_load_failed', '单据加载失败')} <button onClick={result.retry}>{t('md.retry', '重试')}</button></div>
      : result.total > pageSize && <div className={s.pagination}>
        <button disabled={result.page <= 1 || result.loading} onClick={() => result.setPage(result.page - 1)}>{t('prc2.prev_page', '上一页')}</button>
        <span>{result.page} / {Math.ceil(result.total / pageSize)}</span>
        <button disabled={result.page * pageSize >= result.total || result.loading} onClick={() => result.setPage(result.page + 1)}>{t('prc2.next_page', '下一页')}</button>
      </div>
  );

  // ── 权限门控 ───────────────────────────────────────────────────────
  if (!isSuper && !canView) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <PermissionDeniedState />
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <div className={s.card}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 14 }}>
              <div className={s.shimmer} style={{ width: 140, height: 14, borderRadius: 4 }} />
              <div className={s.shimmer} style={{ width: 200, height: 14, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statusKey = info?.status as string | undefined;
  const statusMetaRaw = statusKey ? STATUS_META[statusKey] : null;
  const statusMeta = statusKey
    ? { label: statusMetaRaw ? t(statusMetaRaw.labelKey, statusMetaRaw.label) : statusKey, tone: statusMetaRaw?.tone ?? ("default" as const) }
    : null;
  const supplierName = info?.supplier_name || code;

  // ── Tab 1：基本信息 ───────────────────────────────────────────────
  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: t('md.supplier_code','供应商编码'), value: <code style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{code}</code> },
    { label: t('md.supplier_name','供应商名称'), value: info?.supplier_name || "—" },
    { label: t('md.supply_category','供应品类'), value: info?.supply_category || "—" },
    { label: t('md.sourcing_type','采购地域'), value: info?.sourcing_type === 'UNSPECIFIED' ? t('md.pending_completion','待补录') : (info?.sourcing_type || "—") },
    { label: t('md.country','国家'), value: info?.country_code || "—" },
    { label: t('md.default_currency','默认币种'), value: info?.default_currency || "—" },
    { label: t('md.contact_name','联系人'), value: info?.contact_name || "—" },
    { label: t('md.contact_phone','联系电话'), value: info?.contact_phone || "—" },
    { label: t('md.email','邮箱'), value: info?.contact_email || "—" },
    { label: t('md.bank_name','开户行'), value: info?.bank_name || "—" },
    { label: t('md.bank_account_no','银行账号'), value: info?.bank_account_no || "—" },
    { label: t('md.tax_no','税号'), value: info?.tax_no || "—" },
    { label: t('md.address','地址'), value: info?.address || "—" },
    { label: t('md.payment_days','账期天数'), value: info?.credit_days != null ? `${info.credit_days} ${t('md.unit_days','天')}` : "—" },
    { label: t('md.payment_terms','付款条件'), value: info?.payment_terms || "—" },
  ];

  const infoTab = (
    <Panel title={t('md.supplier_basic_info','供应商基本信息')} icon={<Building2 size={14} />}>
      {!info && (
        <div style={{ fontSize: 12, color: "var(--status-warning)", marginBottom: 12 }}>
          ⚠️ {t('md.supplier_no_record','未取到供应商主数据记录（可能已归档或无权限），以下仅展示编码。')}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 32px", padding: 16, background: "var(--bg-muted)", borderRadius: "var(--radius-card)" }}>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 72 }}>{f.label}</span>
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{f.value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );

  // ── Tab 2：采购单 ─────────────────────────────────────────────────
  const ordersTab = (
    <Panel
      title={t('md.purchase_order','采购订单')}
      icon={<ShoppingCart size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t('md.total_count_prefix','共')} <b style={{ color: "var(--color-primary)" }}>{ordersPage.total}</b> {t('md.unit_order','单')}
        </span>
      }
    >
      <DataTableV3
        rows={orders}
        loading={ordersPage.loading}
        rowKey={(r, i) => r.id ?? r.poNo ?? i}
        emptyText={t('md.empty_purchase_orders','暂无采购单')}
        columns={[
          { key: "poNo", title: t('md.doc_no','单号'), render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.poNo ?? "—"}</code> },
          { key: "createdAt", title: t('md.date','日期'), type: "date" },
          { key: "totalAmount", title: t('md.amount','金额'), render: row => formatMoney(row.totalAmount, row.currencyCode), align: "right" },
          { key: "status", title: t('md.status','状态'), type: "status", align: "center" },
        ]}
      />
      {documentFooter(ordersPage)}
    </Panel>
  );

  // ── Tab 3：应付 ───────────────────────────────────────────────────
  const apTab = (
    <Panel
      title={t('md.ap','应付账款')}
      icon={<Receipt size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t('md.total_count_prefix','共')} <b style={{ color: "var(--color-primary)" }}>{apPage.total}</b> {t('md.unit_pen','笔')}
        </span>
      }
    >
      <DataTableV3
        rows={apRows}
        loading={apPage.loading}
        rowKey={(r, i) => r.id ?? r.ap_no ?? i}
        emptyText={t('md.empty_ap','暂无应付')}
        columns={[
          { key: "ap_no", title: t('md.ap_no','应付单号'), render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.ap_no ?? "—"}</code> },
          { key: "invoice_date", title: t('md.invoice_date','开票日期'), type: "date" },
          { key: "due_date", title: t('md.due_date','到期日'), type: "date" },
          { key: "amount_original", title: t('md.ap_amount','应付金额'), render: row => formatMoney(row.amount_original, row.currency_code), align: "right" },
          { key: "balance_amount_original", title: t('md.unpaid_balance','未付余额'), render: row => formatMoney(row.balance_amount_original, row.currency_code), align: "right" },
          { key: "status", title: t('md.status','状态'), type: "status", align: "center" },
        ]}
      />
      {documentFooter(apPage)}
    </Panel>
  );

  // ── Tab 4：引用 ───────────────────────────────────────────────────
  const refsTab = (
    <Panel
      title={t('md.references','被引用情况')}
      icon={<Link2 size={14} />}
      extra={
        <span style={inlineBadge(refs.total > 0 ? "warning" : "success")}>
          {refs.total > 0 ? `${t('md.referenced_by','被')} ${refs.total} ${t('md.referenced_places','处引用')}` : t('md.no_reference','无引用')}
        </span>
      }
    >
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
        {t('md.supplier_reference_hint','被引用表示该供应商已被下游单据使用，存在引用时不可归档/删除。')}
      </div>
      {refs.items.length === 0 ? (
        <div style={{ padding: "20px 12px", textAlign: "center", background: "var(--bg-muted)", borderRadius: "var(--radius-card)", fontSize: 13, color: "var(--text-secondary)" }}>
          {t('md.supplier_no_reference','该供应商暂无任何单据引用')}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {refs.items.map((r) => (
            <div key={r.refTable} style={{ padding: 12, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", display: "flex", alignItems: "center", gap: 10 }}>
              <Link2 size={16} color="var(--color-primary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.refDocType}</div>
                <code style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.refTable}</code>
              </div>
              <span style={inlineBadge("warning")}>{r.refCount}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );

  // ── 头部 ───────────────────────────────────────────────────────────
  const statusBadge = statusMeta ? <span style={inlineBadge(statusMeta.tone)}>{statusMeta.label}</span> : null;

  return (
    <div className="animate-fade-in">
      <EntityWorkspace
        title={supplierName}
        subtitle={
          <span>
            <code style={{ fontFamily: "monospace" }}>{code}</code>
            {info?.supply_category ? ` · ${info.supply_category}` : ""}
          </span>
        }
        status={statusBadge}
        onBack={() => router.push("/master-data/suppliers")}
        actions={
          <Link
            href="/master-data/suppliers"
            style={{ fontSize: 12, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", textDecoration: "none" }}
            title={t('md.supplier_edit_back_hint','编辑请回到供应商列表的新增/编辑流程')}
          >
            <FileText size={13} /> {t('md.view_overview_readonly','查看全景（只读）· 编辑回列表')}
          </Link>
        }
        tabs={[
          { key: "info", label: t('md.tab_basic_info','基本信息'), content: infoTab },
          ...(canViewPurchaseOrders ? [{
            key: "orders",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t('md.tab_purchase_orders','采购单')} {orders.length > 0 && <Count n={ordersPage.total} />}
              </span>
            ),
            content: ordersTab,
          }] : []),
          ...(canViewAp ? [{
            key: "ap",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t('md.tab_ap','应付')} {apRows.length > 0 && <Count n={apPage.total} />}
              </span>
            ),
            content: apTab,
          }] : []),
          {
            key: "refs",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t('md.tab_references','引用')} {refs.total > 0 && <Count n={refs.total} />}
              </span>
            ),
            content: refsTab,
          },
        ]}
      />
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 5px", borderRadius: 8, fontSize: 10, fontWeight: 700, background: "var(--color-primary)", color: "white" }}>
      {n}
    </span>
  );
}
