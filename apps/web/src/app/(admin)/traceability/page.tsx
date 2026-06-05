"use client";
import { useState } from "react";
import { Search, Egg, Package, Tag, ShoppingCart, Users, Warehouse, Banknote, RotateCcw, Factory } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import request from "@/lib/api-client";

/**
 * 全链追溯（R5 统一追溯 Runtime）
 * 入口：库存批次 / 包装批次 / 标签码 / 销售单 / 客户。
 * 展示：生产 → 包装 → 标签 → 库存 → 销售/POS → 财务 → 退货 全链树。
 */

const ENTRIES = [
  { key: "batch",        label: "库存批次", placeholder: "EGG-YYYYMMDD-NNNNN", path: "batch" },
  { key: "packaging",    label: "包装批次", placeholder: "PKG-YYYYMMDD-XXXX",  path: "packaging" },
  { key: "label",        label: "标签码",   placeholder: "标签号 label_no",    path: "label" },
  { key: "sales-order",  label: "销售单",   placeholder: "SO / 订单号",        path: "sales-order" },
  { key: "customer",     label: "客户",     placeholder: "客户编码",           path: "customer" },
];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--bg-muted)", fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
        {icon}{title}
      </div>
      <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-secondary)", overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
      <span style={{ color: "var(--text-disabled)", minWidth: 96 }}>{k}</span>
      <span style={{ color: "var(--text-primary)", fontFamily: typeof v === "string" && /^[A-Z]/.test(v) ? "monospace" : undefined }}>{v ?? "-"}</span>
    </div>
  );
}

function Table({ rows, cols }: { rows: any[]; cols: { k: string; label: string }[] }) {
  if (!rows || rows.length === 0) return <span style={{ color: "var(--text-disabled)" }}>无</span>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr style={{ color: "var(--text-disabled)" }}>{cols.map(c => <th key={c.k} style={{ textAlign: "left", padding: "3px 8px", whiteSpace: "nowrap" }}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            {cols.map(c => <td key={c.k} style={{ padding: "3px 8px", whiteSpace: "nowrap", fontFamily: "monospace" }}>{r[c.k] ?? "-"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TraceabilityPage() {
  const { canView } = usePermission("MENU_TRACEABILITY_VIEW");
  const [entry, setEntry] = useState(ENTRIES[0]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  const search = async () => {
    if (!value.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const r = await request<any>(`/traceability/${entry.path}/${encodeURIComponent(value.trim())}`);
      setData(r);
      if (r && r.found === false) setError(r.denied ? (r.reason || "无权查看") : "未找到追溯记录");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally { setLoading(false); }
  };

  if (!canView) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>无权限访问全链追溯</div>;

  // 渲染一棵 batch 追溯树
  const renderTree = (t: any) => {
    if (!t || t.found === false) return null;
    const p = t.production || {}, pk = t.packaging, inv = t.inventory || {}, sa = t.sales || {}, fi = t.finance || {};
    return (
      <div>
        <Section icon={<Factory size={14} />} title="生产域（场站 / 鸡舍 / 鸡群 / 日产蛋）">
          <KV k="场站" v={p.site} /><KV k="产线" v={p.line} /><KV k="生产日期" v={p.productionDate} />
          <div style={{ marginTop: 6 }}><Table rows={p.houses} cols={[{ k: "house_code", label: "鸡舍" }, { k: "farm_code", label: "场站码" }, { k: "farm_name", label: "场站名" }]} /></div>
          <div style={{ marginTop: 6 }}><Table rows={p.flocks} cols={[{ k: "flock_no", label: "鸡群" }, { k: "house_code", label: "鸡舍" }, { k: "current_qty", label: "存栏" }, { k: "breed_type", label: "品种" }]} /></div>
          <div style={{ marginTop: 6 }}><Table rows={p.dailyLogs} cols={[{ k: "log_date", label: "日期" }, { k: "house_code", label: "鸡舍" }, { k: "eggs_produced", label: "日产蛋" }]} /></div>
          <div style={{ marginTop: 6 }}><Table rows={p.source} cols={[{ k: "batch_code", label: "集蛋批次" }, { k: "house_code", label: "鸡舍" }, { k: "lay_date", label: "产蛋日" }, { k: "received_qty", label: "收蛋" }]} /></div>
        </Section>
        {pk && (
          <Section icon={<Package size={14} />} title="包装域（包装批次 / 分级 / 班次 / 人员）">
            <KV k="包装批次" v={pk.packingCode} /><KV k="分级码" v={pk.gradingCode} /><KV k="总箱数" v={pk.totalBoxes} /><KV k="总枚数" v={pk.totalEggs} />
            <KV k="班次" v={pk.shiftCode} /><KV k="包装人员" v={pk.operator} /><KV k="班组长" v={pk.supervisor} />
            <div style={{ marginTop: 6 }}><Table rows={pk.grading} cols={[{ k: "code", label: "分级记录" }, { k: "total_output", label: "产出" }]} /></div>
          </Section>
        )}
        <Section icon={<Tag size={14} />} title={`标签（${t.label?.count ?? 0} 条打印记录）`}>
          <Table rows={t.label?.records} cols={[{ k: "label_no", label: "标签号" }, { k: "qty", label: "数量" }, { k: "status", label: "状态" }, { k: "printed_at", label: "打印时间" }]} />
        </Section>
        <Section icon={<Warehouse size={14} />} title="库存域（批次 / SKU / 规格 / 流水）">
          <KV k="库存批次" v={inv.batchNo} /><KV k="SKU" v={inv.skuCode} /><KV k="产品" v={inv.productCode} />
          <KV k="等级" v={inv.grade} /><KV k="规格" v={inv.specCode} /><KV k="数量/可用" v={`${inv.qty ?? "-"} / ${inv.qtyAvailable ?? "-"}`} />
          <KV k="生产日期" v={inv.eggDate} /><KV k="到期日" v={inv.expireDate} /><KV k="来源" v={inv.sourceType} /><KV k="公司" v={inv.companyCode} />
          <div style={{ marginTop: 6 }}><Table rows={inv.ledger} cols={[{ k: "change_type", label: "类型" }, { k: "qty_change", label: "数量" }, { k: "ref_no", label: "单据" }, { k: "created_at", label: "时间" }]} /></div>
        </Section>
        <Section icon={<ShoppingCart size={14} />} title="销售域（销售订单 / 门店 POS）">
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: "var(--text-disabled)", marginBottom: 3 }}>销售订单</div>
            <Table rows={sa.salesOrders} cols={[{ k: "order_no", label: "订单" }, { k: "customer_name", label: "客户" }, { k: "status", label: "状态" }, { k: "allocated_qty", label: "数量" }, { k: "received_at", label: "签收" }]} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-disabled)", marginBottom: 3 }}>门店 POS</div>
            <Table rows={sa.storeSales} cols={[{ k: "sale_no", label: "POS单" }, { k: "store_code", label: "门店" }, { k: "total_amount", label: "金额" }, { k: "payment_method", label: "支付" }, { k: "completed_at", label: "时间" }]} /></div>
        </Section>
        <Section icon={<Banknote size={14} />} title="财务域（AR / 现金）">
          <div style={{ marginBottom: 8 }}><Table rows={fi.ar} cols={[{ k: "source_no", label: "来源单" }, { k: "amount_original", label: "金额" }, { k: "status", label: "状态" }, { k: "collection_status", label: "收款" }]} /></div>
          <Table rows={fi.cash} cols={[{ k: "txn_no", label: "现金流水" }, { k: "direction", label: "方向" }, { k: "amount", label: "金额" }, { k: "created_at", label: "时间" }]} />
        </Section>
        {t.returns && t.returns.length > 0 && (
          <Section icon={<RotateCcw size={14} />} title="退货 / 报损">
            <Table rows={t.returns} cols={[{ k: "change_type", label: "类型" }, { k: "qty_change", label: "数量" }, { k: "ref_no", label: "单据" }, { k: "created_at", label: "时间" }]} />
          </Section>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1100 }}>
      <PageHeader title="全链追溯" subtitle="鸡舍 → 集蛋 → 包装 → 库存 → 销售/POS → 客户 → 财务 正反向追溯" breadcrumb={["全链追溯"]} />

      {/* 查询条 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <select value={entry.key} onChange={e => setEntry(ENTRIES.find(x => x.key === e.target.value)!)}
          className="bg-bg-muted border border-border text-text" style={{ padding: "8px 12px", borderRadius: 7, fontSize: 13 }}>
          {ENTRIES.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <div style={{ position: "relative", flex: "1 1 320px", minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
            placeholder={entry.placeholder} className="bg-bg-muted border border-border text-text"
            style={{ width: "100%", padding: "8px 10px 8px 32px", borderRadius: 7, fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={search} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 7, background: "var(--color-primary)", color: "var(--text-on-dark)", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Search size={14} /> {loading ? "追溯中..." : "追溯"}
        </button>
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--status-danger-bg-faint)", color: "var(--status-danger)", fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* 结果 */}
      {data && data.found !== false && (
        <div>
          {data.entry === "batch" && renderTree(data)}
          {(data.entry === "packaging" || data.entry === "sales-order") && (
            <>
              {data.entry === "packaging" && <Section icon={<Package size={14} />} title="包装批次"><KV k="包装码" v={data.key} /><KV k="生产日期" v={data.packaging?.production_date} /><KV k="总枚数" v={data.packaging?.total_eggs} /></Section>}
              {data.entry === "sales-order" && <Section icon={<ShoppingCart size={14} />} title="销售订单"><KV k="订单" v={data.order?.order_no} /><KV k="客户" v={data.order?.customer_name} /><KV k="状态" v={data.order?.status} /><KV k="金额" v={data.order?.total_amount} /></Section>}
              {(data.traces || []).map((t: any, i: number) => <div key={i} style={{ marginTop: 8 }}>{renderTree(t)}</div>)}
              {(!data.traces || data.traces.length === 0) && <div style={{ color: "var(--text-disabled)", fontSize: 13 }}>暂无关联库存批次（可能尚未分配/出库）</div>}
            </>
          )}
          {data.entry === "label" && <>{<Section icon={<Tag size={14} />} title="标签"><KV k="标签号" v={data.label?.label_no} /><KV k="库存批次" v={data.label?.batch_no} /><KV k="打印时间" v={data.label?.printed_at} /></Section>}{renderTree(data.trace)}</>}
          {data.entry === "customer" && (
            <>
              <Section icon={<Users size={14} />} title={`客户 ${data.key} · 历史订单`}>
                <Table rows={data.orders} cols={[{ k: "order_no", label: "订单" }, { k: "company_code", label: "公司" }, { k: "status", label: "状态" }, { k: "total_amount", label: "金额" }, { k: "created_at", label: "时间" }]} />
              </Section>
              <Section icon={<Egg size={14} />} title="历史购买批次（门店 POS）">
                <Table rows={data.storeBatches} cols={[{ k: "batch_no", label: "库存批次" }, { k: "sku_code", label: "SKU" }, { k: "sale_no", label: "POS单" }, { k: "completed_at", label: "时间" }]} />
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
