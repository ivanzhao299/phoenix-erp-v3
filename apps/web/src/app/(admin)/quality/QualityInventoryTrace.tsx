"use client";

import { useState, type FormEvent } from "react";
import PageHeader from "@/components/PageHeader";
import { EmptyState, fieldInputStyle } from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import request from "@/lib/api-client";
import { formatMasterData } from "@/lib/business-display";
import { useMasterNames } from "@/hooks/useMasterNames";
import { masterDisplayLabel } from "@/lib/master-display";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";

type Batch = { batch_no: string; sku_code?: string; warehouse_code: string; location_code?: string; qty: string; unit: string; status: string };
type Allocation = { id: string; sale_no: string; batch_no: string; warehouse_code: string; qty: string; unit: string; returned_qty: string; outstanding_qty: string };
type Shipment = { event_id: string; order_no: string; customer_code?: string; batch_no: string; warehouse_code: string; allocated_qty: string; unit: string; delivery_no?: string };
type Edge = { parent_batch_no: string; child_batch_no: string; kind: string; document_no: string; mixed: boolean };
type AllocationPage = { total: number; nextCursor: string | null };
type TraceResult = {
  batch?: Batch;
  traces?: Array<{ batch_detail: Batch }>;
  sales?: Allocation[];
  allocations?: Allocation[];
  salesPage?: AllocationPage;
  allocationPage?: AllocationPage;
  shipments: Shipment[];
  lineage: Edge[];
};
type Search = { field: "batch_no" | "sale_no"; value: string };
type TableRow = { id: string; cells: React.ReactNode[] };

function TraceTable({ heading, headers, rows, empty }: {
  heading: string; headers: string[]; rows: TableRow[]; empty: string;
}) {
  return <section className={u.mb20}>
    <h2>{heading}</h2>
    {rows.length ? <div style={{ overflowX: "auto" }}><table className={s.table}>
      <thead><tr>{headers.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        {row.cells.map((cell, index) => <td key={headers[index]}>{cell ?? "—"}</td>)}
      </tr>)}</tbody>
    </table></div> : <EmptyState title={empty} />}
  </section>;
}

export default function QualityInventoryTrace({ direction }: { direction: "forward" | "backward" }) {
  const { t, lang } = useLanguage();
  const customers = useMasterNames("customer");
  const forward = direction === "forward";
  const [value, setValue] = useState("");
  const [field, setField] = useState<Search["field"]>("batch_no");
  const [search, setSearch] = useState<Search | null>(null);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const page = result?.salesPage ?? result?.allocationPage;
  const batch = t("ui.批次号", "批次号");
  const warehouse = t("ui.仓库", "仓库");
  const quantity = t("ui.数量", "数量");
  const sale = t("ui.销售单号", "销售单号");
  const empty = t("ui.无已核实记录", "没有已核实记录");
  const allocations = result?.sales ?? result?.allocations ?? [];
  const batches = result?.batch ? [result.batch] : result?.traces?.map(row => row.batch_detail) ?? [];
  const formatQuantity = (qty: string, unit: string) => [qty, unit].filter(Boolean).join(" ");

  async function load(query: Search, cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    if (!cursor) {
      setResult(null);
      setSearch(query);
    }
    const params = new URLSearchParams({ [query.field]: query.value });
    if (cursor) params.set("after", cursor);
    try {
      const data = await request<TraceResult>(`/quality/trace/${direction}?${params}`);
      setResult(data);
    } catch (failure) {
      setError((failure as Error).message || t("ui.查询失败", "查询失败"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) void load({ field, value: value.trim() });
  }

  return <div>
    <PageHeader title={forward ? t("ui.正向追溯", "正向追溯") : t("ui.反向追溯", "反向追溯")}
      subtitle={forward ? t("ui.正向追溯流向", "按批次查看调拨、转换、配送和门店销售")
        : t("ui.反向追溯来源", "按批次号或销售单号回查库存来源")} />
    <form className={u.mb20} onSubmit={submit} style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
      {!forward && <label>{t("ui.查询类型", "查询类型")} <select aria-label={t("ui.查询类型", "查询类型")} value={field}
        onChange={event => setField(event.target.value === "sale_no" ? "sale_no" : "batch_no")}>
        <option value="batch_no">{batch}</option><option value="sale_no">{sale}</option>
      </select></label>}
      <label>{field === "batch_no" ? batch : sale} <input style={fieldInputStyle} maxLength={128}
        value={value} onChange={event => setValue(event.target.value)} /></label>
      <button className={s.btnPrimary} type="submit" disabled={busy || !value.trim()}>{busy ? t("ui.查询中", "查询中…") : t("ui.追溯", "追溯")}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p>{t("ui.追溯结果范围", "下方显示已核实且在授权范围内的记录。历史记录缺失或来源待核时，结果可能不完整。")}</p>
      <TraceTable heading={t("ui.库存批次", "库存批次")} empty={empty}
        headers={[batch, warehouse, t("ui.库位", "库位"), "SKU", quantity, t("common.status", "状态")]}
        rows={batches.map(row => ({ id: row.batch_no, cells: [row.batch_no,
          formatMasterData(row, "warehouse_name", row.warehouse_code, lang, { canonicalFallback: true }),
          formatMasterData(row, "location_name", row.location_code, lang), row.sku_code, formatQuantity(row.qty, row.unit), row.status] }))} />
      {!!result.lineage.length && <TraceTable heading={t("ui.关联批次", "关联批次")} empty={empty}
        headers={[t("ui.源批次", "源批次"), t("ui.产出批次", "产出批次"), t("ui.单据号", "单据号"), t("ui.来源关系", "来源关系")]}
        rows={result.lineage.map(row => ({ id: [row.parent_batch_no,row.child_batch_no,row.kind,row.document_no].join("/"),
          cells: [row.parent_batch_no, row.child_batch_no, row.document_no,
            row.mixed ? t("ui.混合来源", "混合来源") : row.kind === "TRANSFER" ? t("ui.调拨", "调拨") : row.kind === "RAW_RECEIPT" ? t("ui.原料收货", "原料收货") : t("ui.转换", "转换")] }))} />}
      <TraceTable heading={t("ui.配送实发", "配送实发")} empty={empty}
        headers={[sale, t("ui.配送单号", "配送单号"), t("ui.客户", "客户"), batch, warehouse, quantity]}
        rows={result.shipments.map(row => ({ id: row.event_id, cells: [row.order_no, row.delivery_no,
          masterDisplayLabel(customers, "customer", row.customer_code, lang, row),
          row.batch_no, row.warehouse_code, formatQuantity(row.allocated_qty,row.unit)] }))} />
      <TraceTable heading={t("ui.门店逐批销售", "门店逐批销售")} empty={empty}
        headers={[sale, batch, warehouse, quantity, t("ui.已退", "已退"), t("ui.尚未退回", "尚未退回")]}
        rows={allocations.map(row => ({ id: row.id, cells: [row.sale_no,row.batch_no,row.warehouse_code,
          formatQuantity(row.qty,row.unit),formatQuantity(row.returned_qty,row.unit),formatQuantity(row.outstanding_qty,row.unit)] }))} />
      {page && <p>{t("ui.可查分配记录", "可查分配记录")} {page.total}</p>}
      {page?.nextCursor && search && <button className={s.btnPrimary} type="button" disabled={busy}
        onClick={() => void load(search, page.nextCursor!)}>{t("ui.下一页", "下一页")}</button>}
    </>}
  </div>;
}
