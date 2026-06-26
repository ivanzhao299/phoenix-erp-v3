"use client";

/**
 * 供应商全景详情页 — 路由式全宽多页签（照抄客户全景详情页）
 * 范本：master-data/customers/[code]/page.tsx
 *
 * 4 个页签（各接口独立 try/catch，失败/空均给友好空态，绝不白屏）：
 *   1. 基本信息  GET /master-data/runtime/supplier（按 supplier_code 匹配）
 *   2. 采购单    GET /v2/procurement/orders?supplierCode=...
 *   3. 应付      GET /v2/finance/ap?supplierCode=...（不支持则空态）
 *   4. 引用      GET /master-data/references/SUPPLIER/{code}
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { EntityWorkspace, Panel, DataTableV3 } from "@/components/design-system";
import { inlineBadge } from "@/components/design-system/cockpit-styles";
import { usePermission } from "@/hooks/usePermission";
import { PermissionDeniedState } from "@/components/design-system";
import request from "@/lib/api-client";
import { Building2, ShoppingCart, Receipt, Link2, FileText } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ── 工具：从各种响应 shape 里取数组 ───────────────────────────────────
const toArr = (v: any): any[] =>
  Array.isArray(v) ? v : (v?.data ?? v?.items ?? v?.list ?? v?.rows ?? []);
const yuan = (v: any) => (v == null || v === "" ? "—" : `¥${Number(v).toLocaleString("zh-CN")}`);
const dateStr = (v: any) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");

// 状态徽章
const STATUS_META: Record<string, { label: string; tone: "default" | "success" | "warning" | "danger" }> = {
  ACTIVE: { label: "在用", tone: "success" },
  PENDING_APPROVAL: { label: "待审批", tone: "warning" },
  DRAFT: { label: "草稿", tone: "default" },
  FROZEN: { label: "冻结", tone: "danger" },
  ARCHIVED: { label: "归档", tone: "default" },
  REJECTED: { label: "已驳回", tone: "danger" },
};

interface RefItem { refTable: string; refDocType: string; refCount: number; }

export default function SupplierDetailPage() {
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
  const [orders, setOrders] = useState<any[]>([]);
  const [apRows, setApRows] = useState<any[]>([]);
  const [refs, setRefs] = useState<{ total: number; items: RefItem[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);

    // 1) 基本信息：runtime/supplier 全量（26 条全字段）
    //    code 字段为 supplier_code（兜底 supplier_no/code）
    const matchCode = (x: any) => String(x.supplier_code ?? x.supplier_no ?? x.code) === code;
    (async () => {
      try {
        const r = await request<any>(`/master-data/runtime/supplier`);
        const list = toArr(r);
        let found = list.find(matchCode) || null;
        if (!found) {
          // 兜底：仅 ACTIVE 简化版
          const r2 = await request<any>(`/master-data/runtime/supplier/active`).catch(() => null);
          found = toArr(r2).find(matchCode) || null;
        }
        setInfo(found);
      } catch {
        setInfo(null);
      }
    })();

    // 2) 采购单：跨采购域页签仅在持 MENU_PRC2_ORDER 时展示/请求。
    if (canViewPurchaseOrders) {
      (async () => {
        try {
          const r = await request<any>(`/v2/procurement/orders?supplierCode=${encodeURIComponent(code)}&limit=100`);
          setOrders(toArr(r));
        } catch {
          setOrders([]);
        }
      })();
    } else {
      setOrders([]);
    }

    // 3) 应付：跨财务域页签仅在持 MENU_FIN2_AP 时展示/请求。
    if (canViewAp) {
      (async () => {
        try {
          const r = await request<any>(`/v2/finance/ap?supplierCode=${encodeURIComponent(code)}&pageSize=100`);
          setApRows(toArr(r));
        } catch {
          setApRows([]);
        }
      })();
    } else {
      setApRows([]);
    }

    // 4) 引用
    (async () => {
      try {
        const r = await request<{ totalReferences: number; references: RefItem[] }>(
          `/master-data/references/SUPPLIER/${encodeURIComponent(code)}`,
        );
        setRefs({ total: r?.totalReferences ?? 0, items: Array.isArray(r?.references) ? r.references : [] });
      } catch {
        setRefs({ total: 0, items: [] });
      }
    })();

    setLoading(false);
  }, [code, canViewAp, canViewPurchaseOrders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── 汇总 ───────────────────────────────────────────────────────────
  const orderTotal = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total_amount ?? o.totalAmount ?? 0), 0),
    [orders],
  );
  const apBalance = useMemo(
    () => apRows.reduce((sum, a) => sum + Number(a.balance_amount_original ?? a.balance_amount ?? 0), 0),
    [apRows],
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
  const statusMeta = statusKey ? (STATUS_META[statusKey] ?? { label: statusKey, tone: "default" as const }) : null;
  const supplierName = info?.supplier_name || code;

  // ── Tab 1：基本信息 ───────────────────────────────────────────────
  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "供应商编码", value: <code style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{code}</code> },
    { label: "供应商名称", value: info?.supplier_name || "—" },
    { label: "供应商类型", value: info?.supplier_type || "—" },
    { label: "国家", value: info?.country_code || "—" },
    { label: "默认币种", value: info?.default_currency || "—" },
    { label: "联系人", value: info?.contact_name || "—" },
    { label: "联系电话", value: info?.contact_phone || "—" },
    { label: "邮箱", value: info?.contact_email || "—" },
    { label: "开户行", value: info?.bank_name || "—" },
    { label: "银行账号", value: info?.bank_account_no || "—" },
    { label: "税号", value: info?.tax_no || "—" },
    { label: "地址", value: info?.address || "—" },
    { label: "账期天数", value: info?.credit_days != null ? `${info.credit_days} 天` : "—" },
    { label: "付款条件", value: info?.payment_terms || "—" },
  ];

  const infoTab = (
    <Panel title="供应商基本信息" icon={<Building2 size={14} />}>
      {!info && (
        <div style={{ fontSize: 12, color: "var(--status-warning)", marginBottom: 12 }}>
          ⚠️ 未取到供应商主数据记录（可能已归档或无权限），以下仅展示编码。
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
      title="采购订单"
      icon={<ShoppingCart size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          共 <b style={{ color: "var(--color-primary)" }}>{orders.length}</b> 单 · 合计{" "}
          <b style={{ color: "var(--text-primary)" }}>{yuan(orderTotal)}</b>
        </span>
      }
    >
      <DataTableV3
        rows={orders}
        rowKey={(r, i) => r.id ?? r.order_no ?? i}
        emptyText="暂无采购单"
        columns={[
          { key: "order_no", title: "单号", render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.order_no ?? "—"}</code> },
          { key: "created_at", title: "日期", type: "date" },
          { key: "total_amount", title: "金额", type: "money", align: "right" },
          { key: "status", title: "状态", type: "status", align: "center" },
        ]}
      />
    </Panel>
  );

  // ── Tab 3：应付 ───────────────────────────────────────────────────
  const apTab = (
    <Panel
      title="应付账款"
      icon={<Receipt size={14} />}
      extra={
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          共 <b style={{ color: "var(--color-primary)" }}>{apRows.length}</b> 笔 · 未付余额{" "}
          <b style={{ color: apBalance > 0 ? "var(--status-warning)" : "var(--text-primary)" }}>{yuan(apBalance)}</b>
        </span>
      }
    >
      <DataTableV3
        rows={apRows}
        rowKey={(r, i) => r.id ?? r.ap_no ?? i}
        emptyText="暂无应付"
        columns={[
          { key: "ap_no", title: "应付单号", render: (r) => <code style={{ color: "var(--color-primary)" }}>{r.ap_no ?? "—"}</code> },
          { key: "invoice_date", title: "开票日期", type: "date" },
          { key: "due_date", title: "到期日", type: "date" },
          { key: "amount_original", title: "应付金额", type: "money", align: "right" },
          { key: "balance_amount_original", title: "未付余额", type: "money", align: "right" },
          { key: "status", title: "状态", type: "status", align: "center" },
        ]}
      />
    </Panel>
  );

  // ── Tab 4：引用 ───────────────────────────────────────────────────
  const refsTab = (
    <Panel
      title="被引用情况"
      icon={<Link2 size={14} />}
      extra={
        <span style={inlineBadge(refs.total > 0 ? "warning" : "success")}>
          {refs.total > 0 ? `被 ${refs.total} 处引用` : "无引用"}
        </span>
      }
    >
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
        被引用表示该供应商已被下游单据使用，存在引用时不可归档/删除。
      </div>
      {refs.items.length === 0 ? (
        <div style={{ padding: "20px 12px", textAlign: "center", background: "var(--bg-muted)", borderRadius: "var(--radius-card)", fontSize: 13, color: "var(--text-secondary)" }}>
          该供应商暂无任何单据引用
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
            {info?.supplier_type ? ` · ${info.supplier_type}` : ""}
          </span>
        }
        status={statusBadge}
        onBack={() => router.push("/master-data/suppliers")}
        actions={
          <a
            href="/master-data/suppliers"
            style={{ fontSize: 12, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", textDecoration: "none" }}
            title="编辑请回到供应商列表的新增/编辑流程"
          >
            <FileText size={13} /> 查看全景（只读）· 编辑回列表
          </a>
        }
        tabs={[
          { key: "info", label: "基本信息", content: infoTab },
          ...(canViewPurchaseOrders ? [{
            key: "orders",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                采购单 {orders.length > 0 && <Count n={orders.length} />}
              </span>
            ),
            content: ordersTab,
          }] : []),
          ...(canViewAp ? [{
            key: "ap",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                应付 {apRows.length > 0 && <Count n={apRows.length} />}
              </span>
            ),
            content: apTab,
          }] : []),
          {
            key: "refs",
            label: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                引用 {refs.total > 0 && <Count n={refs.total} />}
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
