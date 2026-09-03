"use client";

import { useState, useCallback, useMemo } from "react";
import request from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { Plus, ScanLine, Send, PackageCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDictOptions } from "@/hooks/useDictOptions";
import { formatMasterData } from "@/lib/business-display";
import { masterNameWithCode } from "@/lib/localized-master-data";
// g200e 模板 token(2026-06-20)
import { StatusBadge } from "@/components/design-system/status/StatusBadge";
import {
  primaryActionButton, moneyCell, inputField,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
  actionGroupBox,
} from "@/components/design-system/cockpit-styles";
import {
  TRANSFER_DISPLAY_STATUSES,
  transferActionForStatus,
  transferStatusLabel,
} from "./transfer-status";

// ✅ V3 表: wms_transfer
// 字段: transfer_no, from_warehouse, to_warehouse, batch_no, qty, operator, reason, status, date
// V2 对应: StockTransfer.jsx (wms_stock_transfers) - 字段已对齐至 V3 schema
import u from "@/styles/uix-utils.module.css";
const TABLE = "wms_transfer";
type Row = Record<string, unknown>;
export default function TransferPage() {
  const { t, lang } = useLanguage();
  const { user, canEdit } = useAuth();
  const currentOperator = masterNameWithCode(String(user?.name || ""), String(user?.username || ""));
  const { codeMap: reasonLabels } = useDictOptions("INV_TRANSFER_REASON");
  // Dedicated transfer endpoints are guarded by MENU_INV_BATCH:E.
  const canOperateTransfer = canEdit("MENU_INV_BATCH");

  // G4-D：调拨单 — 调出/调入仓库、经办人 主数据化；调拨原因 → sys_dict(INV_TRANSFER_REASON)；交接附件统一上传
  const FIELDS: FormField[] = [{
    key: "transfer_no",
    label: t("ui.调拨单号", "调拨单号"),
    type: "text",
    placeholder: t("ui.留空自动生成WT", "留空自动生成 WT-XXXXXX")
  }, {
    key: "from_warehouse",
    label: t("ui.调出仓库", "调出仓库"),
    type: "warehouse",
    required: true
  }, {
    key: "from_zone",
    label: t("ui.调出库区", "调出库区"),
    type: "zone",
    filterBy: {
      warehouseField: "from_warehouse"
    }
  }, {
    key: "from_location",
    label: t("ui.调出货位", "调出货位"),
    type: "location",
    filterBy: {
      warehouseField: "from_warehouse",
      zoneField: "from_zone"
    }
  }, {
    key: "to_warehouse",
    label: t("ui.调入仓库", "调入仓库"),
    type: "warehouse",
    required: true
  }, {
    key: "to_zone",
    label: t("ui.调入库区", "调入库区"),
    type: "zone",
    filterBy: {
      warehouseField: "to_warehouse"
    }
  }, {
    key: "to_location",
    label: t("ui.调入货位", "调入货位"),
    type: "location",
    filterBy: {
      warehouseField: "to_warehouse",
      zoneField: "to_zone"
    }
  }, {
    key: "batch_no",
    label: t("ui.批次号", "批次号"),
    type: "text"
  }, {
    key: "qty",
    label: t("ui.调拨数量", "调拨数量"),
    type: "number",
    required: true
  }, {
    key: "reason",
    label: t("ui.调拨原因", "调拨原因"),
    type: "dict",
    dictType: "INV_TRANSFER_REASON"
  }, {
    key: "operator",
    label: t("ui.经办人", "经办人"),
    type: "readonly",
    defaultValue: currentOperator
  }, {
    key: "attachment_url",
    label: t("ui.调拨交接附件", "调拨交接附件"),
    type: "attachment"
  }];
  const COLUMNS: Column<Row>[] = [{
    key: "transfer_no",
    title: t("ui.调拨单号", "调拨单号"),
    width: 160
  }, {
    key: "from_warehouse",
    title: t("ui.调出仓库", "调出仓库"),
    width: 170,
    render: (v, row) => formatMasterData(row, "from_warehouse_name", v, lang)
  }, {
    key: "to_warehouse",
    title: t("ui.调入仓库", "调入仓库"),
    width: 170,
    render: (v, row) => formatMasterData(row, "to_warehouse_name", v, lang)
  }, {
    key: "batch_no",
    title: t("ui.批次号", "批次号"),
    width: 150
  }, {
    key: "qty",
    title: t("ui.数量", "数量"),
    width: 80,
    align: "right",
    render: v => <span style={moneyCell("default", "md")}>{String(v ?? 0)}</span>
  }, {
    key: "reason",
    title: t("ui.调拨原因", "调拨原因"),
    width: 130,
    render: v => reasonLabels[String(v)] ?? String(v ?? "—")
  }, {
    key: "operator",
    title: t("ui.经办人", "经办人"),
    width: 140,
    render: (v, row) => masterNameWithCode(String(row.operator_name || ""), String(v || "")) || "—"
  }, {
    key: "status",
    title: t("common.status", "状态"),
    width: 120,
    align: "center",
    render: v => <StatusBadge status={String(v ?? "")} label={transferStatusLabel(v, t)} />
  }, {
    key: "__lifecycle_action",
    title: t("common.operation", "操作"),
    width: 110,
    align: "center",
    render: (_v, row) => {
      const action = transferActionForStatus(row.status);
      if (!action || !canOperateTransfer) return <span>—</span>;
      return <button
        type="button"
        style={{ ...primaryActionButton, padding: "5px 9px", fontSize: 12 }}
        onClick={() => void handleLifecycleAction(row, action)}
      >
        {action === "dispatch" ? <Send size={13} /> : <PackageCheck size={13} />}
        {action === "dispatch"
          ? t("warehouse.transfer.action.dispatch", "发运")
          : t("warehouse.transfer.action.receive", "签收")}
      </button>;
    }
  }];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanCode, setScanCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const tableParams = useMemo(() => statusFilter ? { status: statusFilter } : {}, [statusFilter]);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew = useCallback(() => {
    if (!canOperateTransfer) return;
    setDrawerOpen(true);
  }, [canOperateTransfer]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
        await request("/inventory/transfer", {
          method: "POST",
          body: JSON.stringify({
            ...values,
            from_warehouse: values.from_warehouse,
            to_warehouse: values.to_warehouse,
            transfer_no: values.transfer_no || `WT-${Date.now().toString().slice(-6)}`,
            items: [{
              batch_no: values.batch_no,
              qty: Number(values.qty || values.total_qty || 0)
            }],
            operator: values.operator
          })
        });
      setDrawerOpen(false);
      refresh();
    } catch (e) {
      console.error("[transfer] confirm failed:", e);
      // 简单 alert，避免 dialog 引入；详细错误已 console.error
      if (typeof window !== "undefined") window.alert(`${t("ui.调拨失败", "调拨失败")}：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [refresh, t]);

  async function handleLifecycleAction(row: Row, action: "dispatch" | "receive") {
    if (!canOperateTransfer || transferActionForStatus(row.status) !== action) return;
    const transferNo = String(row.transfer_no || "");
    if (!transferNo) return;
    await request(`/inventory/transfer/${encodeURIComponent(transferNo)}/${action}`, {
      method: "POST",
      body: JSON.stringify(action === "receive" ? { receive_all: true } : {}),
    });
    refresh();
  }

  // 扫码确认调入（快速更新单号对应记录状态）
  const handleScan = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !scanCode.trim()) return;
    if (!canOperateTransfer) return;
    await request(`/inventory/transfer/${encodeURIComponent(scanCode.trim())}/receive`, {
      method: "POST",
      body: JSON.stringify({ receive_all: true })
    });
    refresh();
    setScanCode("");
  }, [scanCode, refresh, canOperateTransfer]);
  return <div>
      <PageHeader
        title={t("ui.库存调拨", "库存调拨")}
        subtitle={t("ui.库区间及仓店间库存调拨管理", "库区间及仓店间库存调拨管理")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.库存调拨", "库存调拨")]}
        actions={canOperateTransfer ? (
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新建调拨单", "新建调拨单")}
          </button>
        ) : undefined}
      />

      {/* g200e:KPI 2 卡 + 扫码区 — 老 statCard → kpiCardCompact / 扫码用 actionGroupBox + inputField */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 2fr",
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={kpiCardCompact("warning")}>
          <div style={kpiCardCompactLabel}>{t("ui.等待调入确认", "等待调入确认")}</div>
          <div style={kpiCardCompactValue("warning")}>—</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("status.pending", "待确认单")}</div>
        </div>
        <div style={kpiCardCompact("success")}>
          <div style={kpiCardCompactLabel}>{t("ui.本月已完成", "本月已完成")}</div>
          <div style={kpiCardCompactValue("success")}>—</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{t("ui.已完成单", "已完成单")}</div>
        </div>
        {canOperateTransfer && <div style={{ ...actionGroupBox, background: "var(--bg-card)", padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ScanLine size={14} /> {t("ui.扫码快速确认调入", "扫码快速确认调入")}
          </div>
          <input
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            onKeyDown={handleScan}
            placeholder={t("ui.扫描调拨单号按回车确认", "扫描调拨单号 → 按回车确认")}
            style={{ ...inputField, flex: 1 }}
          />
        </div>}
      </div>

      <div style={{ marginBottom: 12, maxWidth: 240 }}>
        <select aria-label={t("warehouse.transfer.filter.status", "按状态筛选")} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputField, width: "100%" }}>
          <option value="">{t("warehouse.transfer.filter.all", "全部状态")}</option>
          {TRANSFER_DISPLAY_STATUSES.map(status => <option key={status} value={status}>{transferStatusLabel(status, t)}</option>)}
        </select>
      </div>

      <DataTable table={TABLE} columns={COLUMNS} params={tableParams} refreshKey={refreshKey} emptyText={t("ui.暂无调拨记录", "暂无调拨记录")} pageSize={30} />

      <RightDrawer open={drawerOpen} title={t("ui.新建调拨单", "新建调拨单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={{ operator: currentOperator }} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
    </div>;
}
