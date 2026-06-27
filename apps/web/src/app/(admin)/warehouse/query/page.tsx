"use client";
import PageHeader from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { useLanguage } from "@/contexts/LanguageContext";
// g200e 模板 token(2026-06-20)
import { moneyCell } from "@/components/design-system/cockpit-styles";

// B6: inv_batches 真实列 — batch_no / product_code / qty / warehouse_code / location_code / expire_date / store_code
//     旧版引用的 sku_code / house_code / grading_date / pack_type / status 全部不存在 → 整页空白
interface InvBatch {
  id: number;
  batch_no:       string;
  product_code:   string;
  qty:            number;
  warehouse_code: string;
  location_code:  string;
  expire_date:    string;
  store_code:     string;
}

export default function StockQueryPage() {
  const { t } = useLanguage();

  const COLS: Column<InvBatch>[] = [
    { key: "batch_no",       title: t("ui.批次号", "批次号"),   width: 200 },
    { key: "product_code",   title: t("ui.产品编码", "产品编码"), width: 140 },
    { key: "warehouse_code", title: t("ui.仓库", "仓库"),     width: 110 },
    { key: "location_code",  title: t("ui.库位", "库位"),     width: 110 },
    { key: "expire_date",    title: t("ui.保质期至", "保质期至"), width: 110,
      render: v => v ? String(v).slice(0, 10) : "—" },
    { key: "qty",            title: t("ui.库存数量", "库存数量"), width: 100, align: "right",
      render: v => <span style={moneyCell(Number(v) > 0 ? "success" : "warning", "md")}>{Number(v) || 0}</span> },
    { key: "store_code",     title: t("ui.归属门店", "归属门店"), width: 100, align: "center" },
  ];

  return (
    <div>
      <PageHeader
        title={t("ui.库存查询", "库存查询")}
        subtitle={t("ui.实时查询库存批次余量和状态", "实时查询库存批次余量和状态")}
      />
      <DataTable<InvBatch>
        table="inv_batches"
        columns={COLS}
        emptyText={t("ui.暂无库存数据", "暂无库存数据")}
        pageSize={30}
      />
    </div>
  );
}
