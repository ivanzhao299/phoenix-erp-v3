"use client";
import PageHeader from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { useLanguage } from "@/contexts/LanguageContext";
// g200e 模板 token(2026-06-20)
import { moneyCell, actionPill } from "@/components/design-system/cockpit-styles";
import {
  formatWarehouseLedgerChangeType,
  getWarehouseLedgerChangeTone,
} from "@/lib/warehouse-ledger-change-type";
import { formatMasterData } from "@/lib/business-display";
import { masterNameWithCode } from "@/lib/localized-master-data";

// B6: inv_ledger 真实列 — batch_no / change_type / qty_change / operator / store_code / ref_no / note / created_at
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
  operator_name?: string;
  store_name?: string;
  store_name_en?: string;
  store_name_lo?: string;
}

export default function LedgerPage() {
  const { t, lang } = useLanguage();

  const COLS: Column<InvLedger>[] = [
    { key: "created_at",  title: t("ui.事务时间", "事务时间"), width: 160,
      render: v => v ? String(v).slice(0,16).replace("T"," ") : "—" },
    { key: "batch_no",    title: t("ui.批次号", "批次号"),   width: 200 },
    { key: "change_type", title: t("ui.事务类型", "事务类型"), width: 130,
      render: v => <span title={String(v ?? "")} style={actionPill(getWarehouseLedgerChangeTone(v))}>{formatWarehouseLedgerChangeType(v)}</span> },
    { key: "qty_change",  title: t("ui.数量变动", "数量变动"), width: 100, align: "right",
      render: v => <span style={moneyCell(Number(v) >= 0 ? "success" : "danger", "md")}>{Number(v) >= 0 ? `+${v}` : String(v)}</span> },
    { key: "ref_no",      title: t("ui.关联单据", "关联单据"), width: 160 },
    { key: "operator", title: t("ui.操作员", "操作员"), width: 140,
      render: (v, row) => masterNameWithCode(row.operator_name, String(v || "")) || "—" },
    { key: "store_code", title: t("ui.门店", "门店"), width: 170,
      render: (v, row) => formatMasterData(row, "store_name", v, lang) },
    { key: "note",        title: t("common.remark", "备注"),     width: 220 },
  ];

  return (
    <div>
      <PageHeader title={t("ui.库存台账", "库存台账")} subtitle={t("ui.实时库存进出流水台账", "实时库存进出流水台账（只读）")} />
      <DataTable<InvLedger> table="inv_ledger" columns={COLS} pageSize={50} emptyText={t("ui.暂无台账记录", "暂无台账记录")} />
    </div>
  );
}
