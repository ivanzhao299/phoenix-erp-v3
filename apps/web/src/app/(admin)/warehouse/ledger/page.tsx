"use client";
import PageHeader from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import s from "@/components/ui/admin-ui.module.css";

// B6: inv_ledger 真实列 — batch_no / change_type / qty_change / operator / store_code / ref_no / note / created_at
//     旧版 txn_type / qty / txn_time / ref_doc_id / location_code / warehouse_code 全部不存在
interface InvLedger {
  id: number;
  batch_no:    string;
  change_type: string;
  qty_change:  number;
  operator:    string;
  store_code:  string;
  ref_no:      string;
  note:        string;
  created_at:  string;
}
const TXN_CLS: Record<string, string> = {
  FARM_IN:      s.textSuccess,
  EGG_IN:       s.textSuccess,
  PACK_DONE:    s.textSuccess,
  TRANSFER_IN:  s.textInfo,
  SALE_OUT:     s.textDanger,
  TRANSFER_OUT: s.textWarning,
  EGG_REVERSED: s.textDanger,
  FARM_REVERSED: s.textDanger,
  ADJUST:       s.textWarning,
  SCRAP:        "",
};
const COLS: Column<InvLedger>[] = [
  { key: "created_at",  title: "事务时间", width: 160,
    render: v => v ? String(v).slice(0,16).replace("T"," ") : "—" },
  { key: "batch_no",    title: "批次号",   width: 200 },
  { key: "change_type", title: "事务类型", width: 130,
    render: v => <span className={TXN_CLS[String(v)] ?? ""} style={{ fontWeight: 700, fontSize: 12 }}>{String(v)}</span> },
  { key: "qty_change",  title: "数量变动", width: 100, align: "right",
    render: v => <b className={Number(v) >= 0 ? s.textSuccess : s.textDanger}>{Number(v) >= 0 ? `+${v}` : String(v)}</b> },
  { key: "ref_no",      title: "关联单据", width: 160 },
  { key: "operator",    title: "操作员",   width: 90  },
  { key: "store_code",  title: "门店",     width: 90  },
  { key: "note",        title: "备注",     width: 220 },
];
export default function LedgerPage() {
  return (
    <div>
      <PageHeader title="库存台账" subtitle="实时库存进出流水台账（表：inv_ledger，只读）" />
      <DataTable<InvLedger> table="inv_ledger" columns={COLS} pageSize={50} emptyText="暂无台账记录" />
    </div>
  );
}
