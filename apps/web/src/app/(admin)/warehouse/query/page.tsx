"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Warehouse } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import request, { crudApi, type ApiError } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { moneyCell } from "@/components/design-system/cockpit-styles";
import {
  filterWarehouseBatchRows,
  formatWarehouseBatchDate,
  formatWarehouseDisplay,
  getWarehouseBatchQuantity,
  normalizeWarehouseBatchRows,
  type WarehouseQueryBatch,
} from "@/lib/warehouse-query";

export default function StockQueryPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<WarehouseQueryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState(() => {
    if (typeof window === "undefined") return "";
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    return q.trim() ? q : "";
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let data: WarehouseQueryBatch[] = [];
      try {
        data = normalizeWarehouseBatchRows(await request("/inventory/batches", { silent: true }));
      } catch (e) {
        const err = e as ApiError;
        if (err.status !== 404) throw e;
        const fallback = await crudApi.list<WarehouseQueryBatch>("inv_batches", { limit: 1000, offset: 0 });
        data = normalizeWarehouseBatchRows(fallback);
      }
      setRows(data);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) {
        setError(t("ui.当前账号没有库存查询权限或仓库数据范围，请联系管理员检查 MENU_WMS_VIEW 与仓库授权。", "当前账号没有库存查询权限或仓库数据范围，请联系管理员检查 MENU_WMS_VIEW 与仓库授权。"));
      } else {
        setError(err.message || t("ui.库存查询加载失败", "库存查询加载失败"));
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredRows = useMemo(() => {
    return filterWarehouseBatchRows(rows, keyword);
  }, [rows, keyword]);

  const totalQty = useMemo(() => filteredRows.reduce((sum, row) => sum + getWarehouseBatchQuantity(row), 0), [filteredRows]);

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
          <strong style={summaryValueStyle}>{filteredRows.length}</strong>
          <span style={summaryHintStyle}>{t("ui.按当前账号仓库范围", "按当前账号仓库范围")}</span>
        </div>
        <div style={summaryCardStyle}>
          <span style={summaryLabelStyle}>{t("ui.可见库存量", "可见库存量")}</span>
          <strong style={{ ...summaryValueStyle, color: "var(--status-success)" }}>{totalQty.toLocaleString()}</strong>
          <span style={summaryHintStyle}>{t("ui.来自专用库存接口", "来自专用库存接口")}</span>
        </div>
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
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t("ui.搜索批次产品仓库库位门店", "搜索批次号、产品编码、仓库、库位或门店")}
          style={{
            flex: 1,
            minWidth: 180,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 14,
          }}
        />
        <button type="button" onClick={load} disabled={loading} style={buttonStyle}>
          <RefreshCw size={15} />
          {loading ? t("ui.刷新中", "刷新中") : t("ui.刷新", "刷新")}
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-muted)", color: "var(--text-secondary)" }}>
                <th style={thStyle}>{t("ui.批次号", "批次号")}</th>
                <th style={thStyle}>{t("ui.产品编码", "产品编码")}</th>
                <th style={thStyle}>{t("ui.仓库", "仓库")}</th>
                <th style={thStyle}>{t("ui.库位", "库位")}</th>
                <th style={thRightStyle}>{t("ui.库存数量", "库存数量")}</th>
                <th style={thStyle}>{t("ui.状态", "状态")}</th>
                <th style={thStyle}>{t("ui.保质期至", "保质期至")}</th>
                <th style={thStyle}>{t("ui.归属门店", "归属门店")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={emptyStyle}>{t("ui.库存数据加载中", "库存数据加载中")}...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={8} style={emptyStyle}>
                  <Warehouse size={24} />
                  {error ? t("ui.请先处理上方提示", "请先处理上方提示") : t("ui.当前权限范围内暂无库存批次", "当前权限范围内暂无库存批次")}
                </td></tr>
              ) : filteredRows.map((row, index) => {
                const qty = getWarehouseBatchQuantity(row);
                return (
                  <tr key={`${row.id ?? row.batch_no ?? index}`} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={tdStrongStyle}>{row.batch_no || "—"}</td>
                    <td style={tdStyle}>{row.product_code || "—"}</td>
                    <td style={tdStyle}>{formatWarehouseDisplay(row)}</td>
                    <td style={tdStyle}>{row.location_code || "—"}</td>
                    <td style={{ ...tdRightStyle, ...moneyCell(qty > 0 ? "success" : "warning", "md") }}>{qty.toLocaleString()}</td>
                    <td style={tdStyle}><span style={statusPillStyle}>{row.status || "AVAILABLE"}</span></td>
                    <td style={tdStyle}>{formatWarehouseBatchDate(row.expire_date || row.expiry_date)}</td>
                    <td style={tdStyle}>{row.store_code || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
