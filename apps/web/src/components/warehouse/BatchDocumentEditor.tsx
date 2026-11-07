"use client";

import { useMemo, type CSSProperties } from "react";
import { Plus, Trash2 } from "lucide-react";
import { InventoryItemSelector, WarehouseSelector, CustomerSelector, StoreSelector, DepartmentSelector, ProjectSelector, UserSelector, SupplierSelector, HouseSelector } from "@/components/shared-selectors/MasterDataSelectors";
import { DictSelect } from "@/components/shared-selectors/DictSelect";
import { useLanguage } from "@/contexts/LanguageContext";

export type BatchLine = Record<string, unknown> & { _key: string };
export type BatchHeader = Record<string, unknown>;

type Props = {
  kind: "inbound" | "outbound";
  header: BatchHeader;
  setHeader: (next: BatchHeader) => void;
  items: BatchLine[];
  setItems: (next: BatchLine[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading?: boolean;
};

const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 8px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-surface)" };

export function newBatchLine(): BatchLine {
  return { _key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, item: "", item_name: "", item_type: "", material_code: "", sku_code: "", unit: "", qty: "" };
}

export default function BatchDocumentEditor({ kind, header, setHeader, items, setItems, onSubmit, onCancel, loading }: Props) {
  const { t } = useLanguage();
  const setH = (key: string, value: unknown) => setHeader({ ...header, [key]: value });
  const updateLine = (key: string, patch: Partial<BatchLine>) => setItems(items.map(line => line._key === key ? { ...line, ...patch } : line));
  const removeLine = (key: string) => { if (items.length > 1) setItems(items.filter(line => line._key !== key)); };
  const total = useMemo(() => items.reduce((sum, line) => sum + (Number(line.qty) || 0), 0), [items]);
  const isInbound = kind === "inbound";

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
      <label>{isInbound ? t("ui.入库日期", "入库日期") : t("ui.出库日期", "出库日期")}
        <input type="date" value={String(header.date ?? "")} onChange={e => setH("date", e.target.value)} style={inputStyle} required /></label>
      <label>{isInbound ? t("ui.入库类型", "入库类型") : t("ui.出库类型", "出库类型")}
        <DictSelect dictType={isInbound ? "INV_INBOUND_TYPE" : "INV_OUTBOUND_TYPE"} value={String(header.type ?? "")} onChange={value => setH("type", value)} allowEmpty={false} /></label>
      <label>{isInbound ? t("ui.仓库", "仓库") : t("ui.出库仓库", "出库仓库")}
        <WarehouseSelector value={String(header.warehouse_code ?? "")} onChange={v => setH("warehouse_code", v)} onPick={o => setHeader({ ...header, warehouse_code: o?.value ?? "", warehouse_name: o?.raw?.name ?? o?.raw?.warehouse_name ?? "" })} />
      </label>
    </div>
    {!isInbound && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
      <label>{t("ui.去向类型", "去向类型")}
        <DictSelect dictType="INV_OUTBOUND_DEST_TYPE" value={String(header.destination_type ?? "")} onChange={value => setHeader({ ...header, destination_type: value, destination_code: "", destination_house_code: "", destination_customer_code: "", destination_warehouse_code: "", destination_store_code: "", department_code: "", project_code: "", receiver_username: "" })} allowEmpty={false} />
      </label>
      <label>{t("ui.去向", "去向")}{(() => { const destination = String(header.destination_type ?? ""); const props = { value: String(header.destination_code ?? ""), onChange: (value: string) => setH("destination_code", value) }; if (destination === "CUSTOMER") return <CustomerSelector {...props} />; if (destination === "STORE") return <StoreSelector {...props} />; if (destination === "WAREHOUSE") return <WarehouseSelector {...props} />; if (destination === "HOUSE") return <HouseSelector {...props} />; if (destination === "DEPARTMENT") return <DepartmentSelector {...props} />; if (destination === "PROJECT") return <ProjectSelector {...props} />; if (destination === "EMPLOYEE") return <UserSelector {...props} />; if (destination === "SUPPLIER") return <SupplierSelector {...props} />; return <input value={props.value} onChange={e => props.onChange(e.target.value)} style={inputStyle} required />; })()}</label>
    </div>}
    <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead><tr>{[t("ui.库存品目", "库存品目"), t("ui.品目名称", "品目名称"), t("ui.计量单位", "计量单位"), isInbound ? t("ui.入库数量", "入库数量") : t("ui.出库数量", "出库数量"), t("common.operation", "操作")].map(label => <th key={label} style={{ textAlign: "left", padding: 8, fontSize: 12, background: "var(--bg-muted)" }}>{label}</th>)}</tr></thead>
        <tbody>{items.map(line => <tr key={line._key}>
          <td style={{ padding: 7 }}><InventoryItemSelector value={String(line.item ?? "")} onChange={value => updateLine(line._key, { item: value })} onPick={option => updateLine(line._key, { item: option?.value ?? "", item_name: option?.raw?.itemName ?? option?.raw?.item_name ?? "", item_type: option?.raw?.itemType ?? option?.raw?.item_type ?? "", material_code: option?.raw?.materialCode ?? option?.raw?.material_code ?? "", sku_code: option?.raw?.skuCode ?? option?.raw?.sku_code ?? "", unit: option?.raw?.unit ?? "" })} /></td>
          <td style={{ padding: 7 }}><input value={String(line.item_name ?? "")} readOnly style={{ ...inputStyle, background: "var(--bg-muted)" }} /></td>
          <td style={{ padding: 7, width: 100 }}><input value={String(line.unit ?? "")} readOnly style={{ ...inputStyle, background: "var(--bg-muted)" }} /></td>
          <td style={{ padding: 7, width: 130 }}><input type="number" min="0" step="0.001" value={String(line.qty ?? "")} onChange={e => updateLine(line._key, { qty: e.target.value })} style={inputStyle} required /></td>
          <td style={{ padding: 7, width: 60 }}><button type="button" aria-label={t("common.delete", "删除")} onClick={() => removeLine(line._key)} disabled={items.length === 1} style={{ border: 0, background: "transparent", cursor: items.length === 1 ? "not-allowed" : "pointer" }}><Trash2 size={15} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <button type="button" onClick={() => setItems([...items, newBatchLine()])} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-surface)", cursor: "pointer" }}><Plus size={14} />{t("ui.新增明细", "新增明细")}</button>
      <strong>{t("ui.合计数量", "合计数量")}：{total}</strong>
      <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={onCancel} style={{ padding: "7px 12px" }}>{t("common.cancel", "取消")}</button><button type="button" onClick={onSubmit} disabled={loading || items.some(line => !line.item || Number(line.qty) <= 0)} style={{ padding: "7px 12px", fontWeight: 700 }}>{loading ? t("common.processing", "处理中") : t("common.save", "保存")}</button></div>
    </div>
  </div>;
}
