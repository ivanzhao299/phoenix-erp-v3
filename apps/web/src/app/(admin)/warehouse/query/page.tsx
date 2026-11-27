"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search, Warehouse } from "lucide-react";
import { StatusBadge } from "@/components/design-system/status/StatusBadge";
import PageHeader from "@/components/PageHeader";
import request, { type ApiError } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { moneyCell } from "@/components/design-system/cockpit-styles";
import {
  formatWarehouseBatchDate,
  getWarehouseBatchQuantity,
  type WarehouseQueryBatch,
} from "@/lib/warehouse-query";
import { formatBusinessEnum, formatMasterData } from "@/lib/business-display";

export default function StockQueryPage() {
  const { t, lang } = useLanguage();
  type Batch = WarehouseQueryBatch & Record<string, unknown> & { reserved: number; held: number };
  type Unit = { unit: string | null; count: number; physical: string; available: string; reserved: string; held: string };
  type BatchPage = { total: number; rows: Batch[]; units: Unit[] };
  const [data, setData] = useState<BatchPage | null>(null);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState(() => {
    if (typeof window === "undefined") return "";
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    return q.trim() ? q : "";
  });
  const [inventoryClass, setInventoryClass] = useState<"ALL" | "STANDARD" | "DEFECT_SALE">("ALL");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      setData(null);
      try {
        const params = new URLSearchParams({ q: keyword.trim(), page: String(page) });
        if (inventoryClass !== 'ALL') params.set('inventory_class', inventoryClass);
        const result = await request<{ data: BatchPage }>('/inventory/batches/query?' + params, { signal: controller.signal });
        if (!controller.signal.aborted) setData(result.data);
      } catch (e) {
        if (controller.signal.aborted) return;
        const err = e as ApiError;
        setError(err.message || t('ui.库存查询加载失败', '库存查询加载失败'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [keyword, inventoryClass, page, refresh, t]);

  const filteredRows = data?.rows ?? [];
  const quantityGroups = data?.units ?? [];

  return (
    <div>
      <PageHeader
        title={t("ui.库存查询", "库存查询")}
        subtitle={t("ui.按权限范围查询库存批次余量和状态", "按权限范围查询库存批次余量和状态")}
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={summaryCardStyle}>
          <span style={summaryLabelStyle}>{t("ui.可见批次", "可见批次")}</span>
          <strong style={summaryValueStyle}>{data?.total ?? "—"}</strong>
          <span style={summaryHintStyle}>{t("ui.按当前账号仓库范围", "按当前账号仓库范围")}</span>
        </div>
        {quantityGroups.map((group) => (
          <div key={group.unit ?? "UNKNOWN"} style={summaryCardStyle}>
            <span style={summaryLabelStyle}>{t("ui.实存", "实存")} · {group.unit ?? t("ui.单位待核", "单位待核")}</span>
            <strong style={{ ...summaryValueStyle, color: "var(--status-success)" }}>{Number(group.physical).toLocaleString()}</strong>
            <span style={summaryHintStyle}>{group.count} {t("ui.批", "批")} · {t("ui.不同单位不合并", "不同单位不合并")}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
      }}>
        <Search size={18} color="var(--text-secondary)" />
        <input
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          aria-label={t("ui.搜索批次产品仓库库位门店", "搜索批次号、产品编码、仓库、库位或门店")}
          placeholder={t("ui.搜索批次产品仓库库位门店", "搜索批次号、产品编码、仓库、库位或门店")}
          style={{
            flex: 1,
            minWidth: 180,
            border: "none",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 14,
          }}
        />
        <select
          value={inventoryClass}
          onChange={(e) => { setInventoryClass(e.target.value as typeof inventoryClass); setPage(1); }}
          aria-label={t("ui.库存分类", "库存分类")}
          style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-primary)", padding: "8px 10px", minWidth: 150 }}
        >
          <option value="ALL">{t("ui.全部库存", "全部库存")}</option>
          <option value="STANDARD">{t("ui.普通销售库存", "普通销售库存")}</option>
          <option value="DEFECT_SALE">{t("ui.缺陷销售库存", "缺陷销售库存")}</option>
        </select>
        <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading} style={buttonStyle}>
          <RefreshCw size={15} />
          {loading ? t("ui.刷新中", "刷新中") : t("ui.刷新", "刷新")}
        </button>
      </div>

      {error && <div role="alert" style={errorStyle}>{error}</div>}

      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <div role="region" aria-label={t("ui.库存查询", "库存查询")} tabIndex={0} style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1040, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                <th style={thStyle}>{t("ui.批次号", "批次号")}</th>
                <th style={thStyle}>{t("ui.库存品目", "库存品目")}</th>
                <th style={thStyle}>{t("ui.质量等级", "质量等级")}</th>
                <th style={thStyle}>{t("ui.库存分类", "库存分类")}</th>
                <th style={thStyle}>{t("ui.仓库", "仓库")}</th>
                <th style={thStyle}>{t("ui.库位", "库位")}</th>
                <th style={thRightStyle}>{t("ui.库存数量", "库存数量")}</th>
                <th style={thStyle}>{t("ui.状态", "状态")}</th>
                <th style={thStyle}>{t("ui.入库日期", "入库日期")}</th>
                <th style={thStyle}>{t("ui.保质期至", "保质期至")}</th>
                <th style={thStyle}>{t("ui.归属门店", "归属门店")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={emptyStyle}>{t("ui.库存数据加载中", "库存数据加载中")}...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={11} style={emptyStyle}>
                  <Warehouse size={24} />
                  {error ? t("ui.请先处理上方提示", "请先处理上方提示") : t("ui.当前权限范围内暂无库存批次", "当前权限范围内暂无库存批次")}
                </td></tr>
              ) : filteredRows.map((row, index) => {
                const qty = getWarehouseBatchQuantity(row);
                return (
                  <tr key={`${row.id ?? row.batch_no ?? index}`} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStrongStyle}>{row.batch_no || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>
                        {formatMasterData(
                          row as Record<string, unknown>,
                          row.material_code ? "material_name" : row.sku_code ? "sku_name" : "product_name",
                          row.material_code || row.sku_code || row.product_code,
                          lang,
                        )}
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 2 }}>
                        {[row.item_type, row.material_type, row.unit].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td style={tdStyle}>{row.quality_grade || row.grade_code_std || "—"}</td>
                    <td style={tdStyle}>
                      <span style={statusPillStyle}>
                        {String(row.inventory_class || "STANDARD").toUpperCase() === "DEFECT_SALE" ? t("ui.缺陷销售库存", "缺陷销售库存") : t("ui.普通销售库存", "普通销售库存")}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatMasterData(row as Record<string, unknown>, "warehouse_name", row.warehouse_code, lang)}</td>
                    <td style={tdStyle}>{formatMasterData(row as Record<string, unknown>, "location_name", row.location_code, lang)}</td>
                    <td style={{ ...tdRightStyle, ...moneyCell(qty > 0 ? "success" : "warning", "md") }}>
                      <div>{t('ui.实存', '实存')} {Number(row.qty).toLocaleString()} {row.unit}</div>
                      <small>{t('ui.可用', '可用')} {qty.toLocaleString()} · {t('ui.预留', '预留')} {row.reserved} · {t('ui.隔离冻结', '隔离冻结')} {row.held}</small>
                    </td>
                    <td style={tdStyle}><StatusBadge status={row.status || ""} label={formatBusinessEnum("inventory", row.status, lang)} /></td>
                    <td style={tdStyle}>{formatWarehouseBatchDate(row.inbound_date)}</td>
                    <td style={tdStyle}>{formatWarehouseBatchDate(row.expire_date || row.expiry_date)}</td>
                    <td style={tdStyle}>{formatMasterData(row as Record<string, unknown>, "store_name", row.store_code, lang)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center', padding: 12 }}>
          <button type="button" style={buttonStyle} disabled={loading || page === 1} onClick={() => setPage(n => n - 1)}>{t('ui.上一页', '上一页')}</button>
          <span>{page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 30))}</span>
          <button type="button" style={buttonStyle} disabled={loading || page * 30 >= (data?.total ?? 0)} onClick={() => setPage(n => n + 1)}>{t('ui.下一页', '下一页')}</button>
        </div>
      </div>
    </div>
  );
}

const summaryCardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "16px 18px",
  display: "grid",
  gap: 6,
};
const summaryLabelStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 13, fontWeight: 700 };
const summaryValueStyle: React.CSSProperties = { color: "var(--text-primary)", fontSize: 30, lineHeight: 1, fontWeight: 800 };
const summaryHintStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 12 };
const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  whiteSpace: "nowrap",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
};
const errorStyle: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--status-danger) 30%, var(--border))",
  background: "color-mix(in srgb, var(--status-danger) 8%, var(--bg-card))",
  color: "var(--status-danger)",
  borderRadius: 10,
  padding: "12px 14px",
  marginBottom: 12,
  fontWeight: 700,
};
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 14px", fontWeight: 700, whiteSpace: "nowrap" };
const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: React.CSSProperties = { padding: "12px 14px", color: "var(--text-primary)", verticalAlign: "top" };
const tdStrongStyle: React.CSSProperties = { ...tdStyle, fontWeight: 800, color: "var(--color-accent)" };
const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontWeight: 800 };
const emptyStyle: React.CSSProperties = {
  height: 180,
  color: "var(--text-secondary)",
  textAlign: "center",
  verticalAlign: "middle",
};
const statusPillStyle: React.CSSProperties = {
  display: "inline-flex",
  borderRadius: 999,
  padding: "2px 8px",
  background: "color-mix(in srgb, var(--status-success) 12%, var(--bg-muted))",
  color: "var(--status-success)",
  fontWeight: 700,
  fontSize: 12,
};
