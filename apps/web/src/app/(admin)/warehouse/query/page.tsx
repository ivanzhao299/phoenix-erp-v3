"use client";
import PageHeader from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import s from "@/components/ui/admin-ui.module.css";

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

const COLS: Column<InvBatch>[] = [
  { key: "batch_no",       title: "批次号",   width: 200 },
  { key: "product_code",   title: "产品编码", width: 140 },
  { key: "warehouse_code", title: "仓库",     width: 110 },
  { key: "location_code",  title: "库位",     width: 110 },
  { key: "expire_date",    title: "保质期至", width: 110,
    render: v => v ? String(v).slice(0, 10) : "—" },
  { key: "qty",            title: "库存数量", width: 100, align: "right",
    render: v => <b className={Number(v) > 0 ? s.textSuccess : s.textWarning}>{Number(v) || 0}</b> },
  { key: "store_code",     title: "归属门店", width: 100, align: "center" },
];

export default function StockQueryPage() {
  return (
    <div>
      <PageHeader
        title="库存查询"
        subtitle="实时查询库存批次余量和状态（表：inv_batches）"
      />
      <DataTable<InvBatch>
        table="inv_batches"
        columns={COLS}
        emptyText="暂无库存数据"
        pageSize={30}
      />
    </div>
  );
}
