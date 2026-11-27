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
import { invalidateBatchLookups } from "@/lib/request-cache";
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
type TransferReceipt = {
  transfer_no: string; status: string; can_dispatch: boolean; can_receive: boolean; store_replenishment: boolean;
  can_resolve: boolean;
  discrepancies: Array<{ id: string; discrepancy_type: string; qty: string; source_batch_no: string; damaged_batch_no: string | null; resolution_type?: string; resolution_ref?: string }>;
  items: Array<{ batch_no: string; expected_qty: string; received_qty: string | null; damaged_qty: string | null; unit: string | null }>;
};
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
    type: "batch",
    onPickKeys: { unit: "unit" }
  }, {
    key: "unit", label: t("ui.基本单位", "来源批次基本单位"), type: "readonly"
  }, {
    key: "qty",
    label: t("ui.调拨基础数量", "调拨基础数量（按来源批次单位）"),
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
      const action = row.status === "RECEIVED" ? "complete" : transferActionForStatus(row.status);
      if (!action || !canOperateTransfer) return <span>—</span>;
      return <button
        type="button"
        style={{ ...primaryActionButton, padding: "5px 9px", fontSize: 12 }}
        onClick={() => void handleLifecycleAction(row, action)}
      >
        {action === "dispatch" ? <Send size={13} /> : <PackageCheck size={13} />}
        {action === "dispatch"
          ? t("warehouse.transfer.action.dispatch", "发运")
          : action === "receive" ? t("warehouse.transfer.action.receive", "签收") : t("ui.核对差异", "核对差异")}
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

  const [receiptDraft, setReceiptDraft] = useState<TransferReceipt | null>(null);
  const [differenceDraft, setDifferenceDraft] = useState<TransferReceipt | null>(null);
  const [dispositionRefs, setDispositionRefs] = useState<Record<string, string>>({});
  const [receivedByBatch, setReceivedByBatch] = useState<Record<string, { received_qty: string; damaged_qty: string }>>({});
  const [transferError, setTransferError] = useState('');
  const [posting, setPosting] = useState(false);

  async function postTransferAction(path: string, action: string, body: unknown, committed: (row: TransferReceipt) => boolean) {
    try {
      await request(path + '/' + action, { method: 'POST', body: JSON.stringify(body), retry: false });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== undefined && status !== 400 && status !== 409 && status < 500) throw err;
      const current = await request<{ data: TransferReceipt }>(path, { retry: false, silent: true }).catch(() => null);
      if (!current || !committed(current.data)) throw err;
    }
  }

  async function handleLifecycleAction(row: Row, action: "dispatch" | "receive" | "complete") {
    if (!canOperateTransfer || posting) return;
    const transferNo = String(row.transfer_no || "");
    if (!transferNo) return;
    const path = `/inventory/transfer/${encodeURIComponent(transferNo)}`;
    setTransferError('');
    setPosting(true);
    try {
      const { data } = await request<{ data: TransferReceipt }>(path);
      if (data.store_replenishment) throw new Error(t('ui.请从门店补货流程处理此调拨', '请从门店补货流程处理此调拨'));
      if (action === 'receive' && data.can_receive) {
        setReceivedByBatch(Object.fromEntries(data.items.map(item => [item.batch_no,
          { received_qty: item.expected_qty, damaged_qty: '0' }])));
        setReceiptDraft(data);
      } else if (action === 'complete' && data.can_resolve) {
        setDispositionRefs({});
        setDifferenceDraft(data);
      } else if (action === 'dispatch' && data.can_dispatch) {
        await postTransferAction(path, 'dispatch', {}, row => ['IN_TRANSIT','RECEIVED','COMPLETED'].includes(row.status));
        invalidateBatchLookups();
        refresh();
      } else {
        throw new Error(t('ui.当前状态或仓库权限不允许此操作', '当前状态或仓库权限不允许此操作'));
      }
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : t('ui.调拨失败', '调拨失败'));
    } finally {
      setPosting(false);
    }
  }

  const receive = async () => {
    if (!receiptDraft || posting) return;
    const items = receiptDraft.items.map(item => ({ batch_no: item.batch_no, ...receivedByBatch[item.batch_no] }));
    setTransferError('');
    setPosting(true);
    try {
      await postTransferAction(`/inventory/transfer/${encodeURIComponent(receiptDraft.transfer_no)}`, 'receive', { items },
        row => ['RECEIVED','COMPLETED'].includes(row.status) && row.items.length === items.length && items.every(input => {
          const item = row.items.find(candidate => candidate.batch_no === input.batch_no);
          return item?.received_qty != null && item.damaged_qty != null
            && Number(item.received_qty) === Number(input.received_qty) && Number(item.damaged_qty) === Number(input.damaged_qty);
        }));
      setReceiptDraft(null);
      setScanCode('');
      invalidateBatchLookups();
      refresh();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : t('ui.签收失败', '签收失败'));
    } finally {
      setPosting(false);
    }
  };

  const complete = async () => {
    if (!differenceDraft || posting || !differenceDraft.discrepancies.length ||
        differenceDraft.discrepancies.some(row => row.discrepancy_type !== 'DAMAGE' || !row.damaged_batch_no)) return;
    const resolutions = differenceDraft.discrepancies.map(row => {
      const ref = dispositionRefs[row.id]?.trim() ?? '';
      return { id: row.id, resolution_type: !ref ? 'CUSTODY' : /^LR-/i.test(ref) ? 'LOSS' : 'ADJUSTMENT',
        resolution_ref: ref || row.damaged_batch_no };
    });
    setTransferError('');
    setPosting(true);
    try {
      await postTransferAction(`/inventory/transfer/${encodeURIComponent(differenceDraft.transfer_no)}`,
        'complete', { resolutions }, row => row.status === 'COMPLETED' && resolutions.every(input =>
          row.discrepancies.some(discrepancy => discrepancy.id === input.id &&
            discrepancy.resolution_type === input.resolution_type && discrepancy.resolution_ref === input.resolution_ref)));
      setDifferenceDraft(null);
      refresh();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : t('ui.调拨失败', '调拨失败'));
    } finally {
      setPosting(false);
    }
  };

  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanCode.trim()) void handleLifecycleAction({ transfer_no: scanCode.trim() }, 'receive');
  };
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

      {transferError && !receiptDraft && !differenceDraft && <p role="alert">{transferError}</p>}
      <RightDrawer open={Boolean(receiptDraft)} title={t('ui.调拨签收', '调拨签收')}
        onClose={() => { if (!posting) setReceiptDraft(null); }}>
        {receiptDraft && <div style={{ display: 'grid', gap: 12 }}>
          <p>{receiptDraft.transfer_no}</p>
          {receiptDraft.items.map(item => <fieldset key={item.batch_no}>
            <legend>{item.batch_no} · {t('ui.应收', '应收')} {item.expected_qty} {item.unit}</legend>
            {(['received_qty','damaged_qty'] as const).map(field => <label key={field}>
              {field === 'received_qty' ? t('ui.实收', '实收') : t('ui.破损', '破损')}
              <input inputMode="decimal" disabled={posting} style={inputField}
                value={receivedByBatch[item.batch_no][field]}
                onChange={event => { const value = event.target.value; setReceivedByBatch(prev => ({
                  ...prev, [item.batch_no]: { ...prev[item.batch_no], [field]: value },
                })); }} />
            </label>)}
          </fieldset>)}
          {transferError && <p role="alert">{transferError}</p>}
          <button type="button" style={primaryActionButton} disabled={posting || !receiptDraft.items.length}
            onClick={receive}>{t('ui.确认签收', '确认签收')}</button>
        </div>}
      </RightDrawer>

      <RightDrawer open={Boolean(differenceDraft)} title={t('ui.核对调拨差异', '核对调拨差异')}
        onClose={() => { if (!posting) setDifferenceDraft(null); }}>
        {differenceDraft && <div style={{ display: 'grid', gap: 12 }}>
          <p>{differenceDraft.transfer_no}</p>
          {differenceDraft.discrepancies.map(row => <fieldset key={row.id}>
            <legend>{row.source_batch_no} · {row.discrepancy_type === 'DAMAGE' ? t('ui.破损', '破损') :
              t('ui.在途短少', '在途短少')} {row.qty}</legend>
            {row.damaged_batch_no ? <>
              <p>{t('ui.对应破损批次', '对应破损批次')} {row.damaged_batch_no}</p>
              <label>{t('ui.过账报损或调整单号', '已过账报损或调整单号')}
                <input style={inputField} maxLength={128} disabled={posting} value={dispositionRefs[row.id] ?? ''}
                  onChange={event => { const value = event.target.value; setDispositionRefs(prev => ({ ...prev, [row.id]: value })); }} />
              </label>
              <p>{t('ui.留空表示核对留存', '留空时按仍在仓的原破损数量核对并结案。')}</p>
            </> : <p>{t('ui.短少等待财务', '在途短少等待财务核定。')}</p>}
          </fieldset>)}
          {transferError && <p role="alert">{transferError}</p>}
          <button type="button" style={primaryActionButton} disabled={posting || !differenceDraft.discrepancies.length ||
            differenceDraft.discrepancies.some(row => row.discrepancy_type !== 'DAMAGE' || !row.damaged_batch_no)}
            onClick={complete}>{t('ui.确认差异结案', '确认差异结案')}</button>
        </div>}
      </RightDrawer>

      <DataTable table={TABLE} columns={COLUMNS} params={tableParams} refreshKey={refreshKey} emptyText={t("ui.暂无调拨记录", "暂无调拨记录")} pageSize={30} />

      <RightDrawer open={drawerOpen} title={t("ui.新建调拨单", "新建调拨单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} batchRefreshKey={refreshKey} initialValues={{ operator: currentOperator }} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>
    </div>;
}
