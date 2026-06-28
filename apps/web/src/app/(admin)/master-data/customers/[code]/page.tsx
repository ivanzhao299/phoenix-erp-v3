"use client";

/**
 * 客户全景详情页 — 路由式全宽多页签（升级自只读侧抽屉）
 * 范本：settings/roles/[code]/page.tsx & settings/users/[id]/page.tsx
 *
 * 4 个页签（各接口独立 try/catch，失败/空均给友好空态，绝不白屏）：
 *   1. 基本信息  GET /master-data/runtime/customer/active（按 customer_code 匹配，兜底 /crud/sal_customers）
 *   2. 订单      GET /v2/sales/orders?customerCode=...           → { data, total }
 *   3. 应收      GET /v2/finance/ar/invoices?customerCode=...     → { items, total }
 *   4. 引用      GET /master-data/references/CUSTOMER/{code}      → { totalReferences, references[] }
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { EntityWorkspace, Panel, DataTableV3 } from "@/components/design-system";
import { inlineBadge } from "@/components/design-system/cockpit-styles";
import { usePermission } from "@/hooks/usePermission";
import { PermissionDeniedState } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { User, ShoppingCart, Receipt, Link2, FileText } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── 工具：从各种响应 shape 里取数组 ───────────────────────────────────
const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);
const yuan = (v: any) => (v == null || v === "" ? "—" : `¥${Number(v).toLocaleString("zh-CN")}`);
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

export default function CustomerDetailPage() {
  const { t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const customerPerm = usePermission("MENU_MD_CUSTOMER");
  const salesOrderPerm = usePermission("MENU_SALES2_ORDER");
  const arPerm = usePermission("MENU_FIN2_AR");
  const canView = customerPerm.canView || customerPerm.isSuper;
  const isSuper = customerPerm.isSuper;
  const canViewOrders = salesOrderPerm.canView || salesOrderPerm.isSuper;
  const canViewAr = arPerm.canView || arPerm.isSuper;

  const code = decodeURIComponent(String(params?.code || ""));

  const [info, setInfo] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [arRows, setArRows] = useState<any[]>([]);
  const [refs, setRefs] = useState<{ total: number; items: RefItem[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // 1) 基本信息：runtime/customer 全量（含全字段 customer_no/name/type/contact/credit…）
    //    code 字段为 customer_no（兜底 customer_code/code）
    const matchCode = (x: any) => String(x.customer_no ?? x.customer_code ?? x.code) === code;
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/customer`);
        const list = toArr(r);
        let found = list.find(matchCode) || null;
        if (!found) {
          // 兜底：仅 ACTIVE 简化版
          const r2 = await request<any>(`/master-data/runtime/customer/active`).catch(() => null);
          found = toArr(r2).find(matchCode) || null;
        }
        setInfo(found);
      } catch {
        setInfo(null);
      }
    })();

    // 2) 订单：跨销售域页签仅在持 MENU_SALES2_ORDER 时展示/请求。
    if (canViewOrders) {
      (async () => {
        try {
          const r = await request<any>(`/v2/sales/orders?customerCode=${encodeURIComponent(code)}&limit=100`);
          setOrders(toArr(r));
        } catch {
          setOrders([]);
        }
      })();
    } else {
      setOrders([]);
    }

    // 3) 应收：跨财务域页签仅在持 MENU_FIN2_AR 时展示/请求。
    if (canViewAr) {
      (async () => {
        try {
          const r = await request<any>(`/v2/finance/ar/invoices?customerCode=${encodeURIComponent(code)}&pageSize=100`);
          setArRows(toArr(r));
        } catch {
          setArRows([]);
        }
      })();
    } else {
      setArRows([]);
    }

    // 4) 引用
    (async () => {
      try {
        const r = await request<{ totalReferences: number; references: RefItem[] }>(
          `/master-data/references/CUSTOMER/${encodeURIComponent(code)}`,
        );
        setRefs({ total: r?.totalReferences ?? 0, items: Array.isArray(r?.references) ? r.references : [] });
      } catch {
        setRefs({ total: 0, items: [] });
      }
    })();

    setLoading(false);
  }, [code, canViewAr, canViewOrders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 汇总 ───────────────────────────────────────────────────────────
  const orderTotal = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total_amount ?? o.totalAmount ?? 0), 0),
    [orders],
  );
  const arBalance = useMemo(
    () => arRows.reduce((sum, a) => sum + Number(a.balance_amount_original ?? 0), 0),
    [arRows],
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
  const customerName = info?.customer_name || code;

  // ── Tab 1：基本信息 ───────────────────────────────────────────────
  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: t('md.customer_code','客户编码'), value: <code style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{code}</code> },
    { label: t('md.customer_name','客户名称'), value: info?.customer_name || "—" },
    { label: t('md.customer_type','客户类型'), value: info?.customer_type || "—" },
    { label: t('md.company','所属公司'), value: info?.company_code || "—" },
    { label: t('md.contact_name','联系人'), value: info?.contact_name || "—" },
    { label: t('md.contact_phone','联系电话'), value: info?.contact_phone || "—" },
    { label: t('md.region_code','区域编码'), value: info?.region_code || "—" },
    { label: t('md.credit_limit','信用额度'), value: info?.credit_limit != null ? yuan(info.credit_limit) : "—" },
    { label: t('md.payment_days','账期天数'), value: info?.payment_terms != null ? `${info.payment_terms} ${t('md.unit_days','天')}` : "—" },
    { label: t('md.delivery_address','配送地址'), value: info?.delivery_address || "—" },
    { label: t('md.effective_date','生效日期'), value: dateStr(info?.effective_date) },
    { label: t('md.expire_date','失效日期'), value: info?.expire_date ? dateStr(info.expire_date) : t('md.permanent','永久') },
    { label: t('md.remark','备注'), value: info?.remark || "—" },
  ];

  const infoTab = (
    <Panel title={t('md.customer_basic_info','客户基本信息')} icon={<User size={14} />}>
      {!info && (
        <div style={{ fontSize: 12, color: "var(--status-warning)", marginBottom: 12 }}>
          ⚠️ {t('md.customer_no_record','未取到客户主数据记录（可能已归档或无权限），以下仅展示编码。')}
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

  // ── Tab 2：订单 ───────────────────────────────────────────────────
  const ordersTab = (
    <Panel
      title={t('md.sales_order','销售订单')}
      icon={<ShoppingCart size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t('md.total_count_prefix','共')} <b style={{ color: "var(--color-primary)" }}>{orders.length}</b> {t('md.unit_order','单')} · {t('md.subtotal','合计')}{" "}
          <b style={{ color: "var(--text-primary)" }}>{yuan(orderTotal)}</b>
        </span>
      }
    >
      <DataTableV3
        rows={orders}
        rowKey={(r, i) => r.id ?? r.order_no ?? i}
        emptyText={t('md.empty_orders','暂无订单')}
        columns={[
          { key: "order_no", title: t('md.order_no','订单号'), render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.order_no ?? "—"}</code> },
          { key: "created_at", title: t('md.order_date','下单日期'), type: "date" },
          { key: "total_amount", title: t('md.amount','金额'), type: "money", align: "right" },
          { key: "status", title: t('md.status','状态'), type: "status", align: "center" },
        ]}
      />
    </Panel>
  );

  // ── Tab 3：应收 ───────────────────────────────────────────────────
  const arTab = (
    <Panel
      title={t('md.ar','应收账款')}
      icon={<Receipt size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t('md.total_count_prefix','共')} <b style={{ color: "var(--color-primary)" }}>{arRows.length}</b> {t('md.unit_pen','笔')} · {t('md.unreceived_balance','未收余额')}{" "}
          <b style={{ color: arBalance > 0 ? "var(--status-warning)" : "var(--text-primary)" }}>{yuan(arBalance)}</b>
        </span>
      }
    >
      <DataTableV3
        rows={arRows}
        rowKey={(r, i) => r.id ?? r.ar_no ?? i}
        emptyText={t('md.empty_ar','暂无应收')}
        columns={[
          { key: "ar_no", title: t('md.ar_no','应收单号'), render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.ar_no ?? "—"}</code> },
          { key: "invoice_date", title: t('md.invoice_date','开票日期'), type: "date" },
          { key: "due_date", title: t('md.due_date','到期日'), type: "date" },
          { key: "amount_original", title: t('md.ar_amount','应收金额'), type: "money", align: "right" },
          { key: "balance_amount_original", title: t('md.unreceived_balance','未收余额'), type: "money", align: "right" },
          { key: "status", title: t('md.status','状态'), type: "status", align: "center" },
        ]}
      />
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
        {t('md.customer_reference_hint','被引用表示该客户已被下游单据使用，存在引用时不可归档/删除。')}
      </div>
      {refs.items.length === 0 ? (
        <div style={{ padding: "20px 12px", textAlign: "center", background: "var(--bg-muted)", borderRadius: "var(--radius-card)", fontSize: 13, color: "var(--text-secondary)" }}>
          {t('md.customer_no_reference','该客户暂无任何单据引用')}
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
        title={customerName}
        subtitle={
          <span>
            <code style={{ fontFamily: "monospace" }}>{code}</code>
            {info?.customer_type ? ` · ${info.customer_type}` : ""}
          </span>
        }
        status={statusBadge}
        onBack={() => router.push("/master-data/customers")}
        actions={
          <a
            href="/master-data/customers"
            style={{ fontSize: 12, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", textDecoration: "none" }}
            title={t('md.customer_edit_back_hint','编辑请回到客户列表的新增/编辑流程')}
          >
            <FileText size={13} /> {t('md.view_overview_readonly','查看全景（只读）· 编辑回列表')}
          </a>
        }
        tabs={[
          { key: "info", label: t('md.tab_basic_info','基本信息'), content: infoTab },
          ...(canViewOrders ? [{
            key: "orders",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t('md.tab_orders','订单')} {orders.length > 0 && <Count n={orders.length} />}
              </span>
            ),
            content: ordersTab,
          }] : []),
          ...(canViewAr ? [{
            key: "ar",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {t('md.tab_ar','应收')} {arRows.length > 0 && <Count n={arRows.length} />}
              </span>
            ),
            content: arTab,
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
