"use client";

import { useState, useCallback, useEffect } from "react";
import request, { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import { formatMasterData } from '@/lib/business-display';
import { useMasterNames } from '@/hooks/useMasterNames';
import { masterDisplayLabel } from '@/lib/master-display';
import { MasterLabel } from '@/components/MasterNameCode';
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, CheckCircle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateBatchLookups } from "@/lib/request-cache";
// g200e 模板 token(2026-06-20)
import {
  primaryActionButton, actionPill, moneyCell,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// ✅ V3 报损管理页面 (对应 V2: LossReport.jsx)
// 数据来源: wms_stocktake 表 (复用，loss_no 前缀区分)
// 权限由 MENU_WMS_INOUT 原子权限控制，不再前端硬编码角色。
import u from "@/styles/uix-utils.module.css";
const TABLE = "wms_stocktake";
type Row = Record<string, unknown>;
export default function LossReportPage() {
  const { canCreate, canEdit, canDelete, canApprove } = useAuth();
  const canCreateInout = canCreate("MENU_WMS_INOUT");
  const canEditInout = canEdit("MENU_WMS_INOUT");
  const canDeleteInout = canDelete("MENU_WMS_INOUT");
  const canApproveInout = canApprove("MENU_WMS_INOUT");
  const {
    t, lang
  } = useLanguage();
  const zoneNames = useMasterNames('zone');

  // g200e:状态 tone → actionPill(tone)
  const STATUS_BADGE: Record<string, { tone: Tone; label: string }> = {
    DRAFT:    { tone: "default", label: t("ui.草稿",         "草稿") },
    DONE:     { tone: "warning", label: t("ui.待审批",       "待审批") },
    APPROVED: { tone: "success", label: t("status.approved", "已审批") },
  };

  // G4-D：报损单 — 仓库/库区/货位/SKU/报损人 主数据化；报损原因 → sys_dict(INV_LOSS_REASON)；报损证明附件统一上传
  const FIELDS: FormField[] = [{
    key: "stocktake_no",
    label: t("ui.报损单号", "报损单号"),
    type: "text",
    placeholder: t("ui.留空自动生成LR", "留空自动生成 LR-XXXXXX")
  }, {
    key: "batch_no",
    label: t("ui.报损批次", "报损批次"),
    type: "batch",
    required: true,
    onPickKeys: { item: "inventory_item_code", warehouse_code: "warehouse_code" }
  }, {
    key: "warehouse_code",
    label: t("ui.报损仓库", "报损仓库"),
    type: "warehouse",
    required: true
  }, {
    key: "zone_code",
    label: t("ui.报损库区", "报损库区"),
    type: "zone",
    filterBy: {
      warehouseField: "warehouse_code"
    }
  }, {
    key: "location_code",
    label: t("ui.报损货位", "报损货位"),
    type: "location",
    filterBy: {
      warehouseField: "warehouse_code",
      zoneField: "zone_code"
    }
  }, {
    key: "item",
    label: t("ui.报损品目", "报损品目"),
    type: "sku",
    onPickKeys: {
      item_name: "sku_name",
      spec_code: "spec_code",
      grade_code: "grade_code"
    }
  }, {
    key: "diff_qty",
    label: t("ui.报损数量", "报损数量"),
    type: "number",
    required: true
  }, {
    key: "book_qty",
    label: t("ui.损失估值LAK", "损失估值(LAK)"),
    type: "number"
  }, {
    key: "actual_qty",
    label: t("ui.实盘账面量", "实盘账面量"),
    type: "number"
  }, {
    key: "reason",
    label: t("ui.报损原因", "报损原因"),
    type: "dict",
    dictType: "INV_LOSS_REASON",
    required: true
  }, {
    key: "operator",
    label: t("ui.报损人", "报损人"),
    type: "user"
  }, {
    key: "attachment_url",
    label: t("ui.报损证明", "报损证明"),
    type: "attachment"
  }, {
    key: "status",
    label: t("common.status", "状态"),
    type: "select",
    options: [{
      label: t("ui.草稿", "草稿"),
      value: "DRAFT"
    }, {
      label: t("ui.待审批", "待审批"),
      value: "DONE"
    }]
  }];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [allRows, setAllRows] = useState<Row[]>([]);

  // KPI 数据：独立拉取全量（DataTable 分页显示，KPI 需全量）
  useEffect(() => {
    crudApi.list<Row>(TABLE, {
      limit: 500
    }).then(res => setAllRows(res.data ?? [])).catch(() => {});
  }, [refreshKey]);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew = useCallback(() => {
    if (!canCreateInout) return;
    setEditing(null);
    setDrawerOpen(true);
  }, [canCreateInout]);
  const isMutableRow = useCallback((row: Row) => {
    return String(row.status ?? "").toUpperCase() !== "APPROVED";
  }, []);
  const openEdit = useCallback((row: Row) => {
    if (!canEditInout || !isMutableRow(row)) return;
    setEditing(row);
    setDrawerOpen(true);
  }, [canEditInout, isMutableRow]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const payload = editing?.id ? values : {
        ...values,
        stocktake_no: values.stocktake_no || "LR-" + Date.now().toString().slice(-6),
        status: values.status || "DONE",
        date: new Date().toISOString().slice(0, 10)
      };
      editing?.id ? await crudApi.update(TABLE, editing.id as number, payload) : await crudApi.create(TABLE, payload);
      setDrawerOpen(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }, [editing, refresh]);
  const handleDelete = useCallback((row: Row) => {
    if (!canDeleteInout || !isMutableRow(row)) return;
    setDeleteTarget(row);
    setConfirmOpen(true);
  }, [canDeleteInout, isMutableRow]);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false);
    refresh();
  }, [deleteTarget, refresh]);
  const handleApprove = useCallback((row: Row) => {
    if (!canApproveInout) return;
    setApproveTarget(row);
    setApproveOpen(true);
  }, [canApproveInout]);
  const confirmApprove = useCallback(async () => {
    if (!approveTarget?.stocktake_no) return;
    await request("/inventory/loss/approve", {
      method: "POST",
      body: JSON.stringify({
        loss_no: approveTarget.stocktake_no,
        batch_no: approveTarget.batch_no,
        loss_qty: approveTarget.diff_qty,
        reason: approveTarget.reason,
      }),
    });
    invalidateBatchLookups();
    setApproveOpen(false);
    refresh();
  }, [approveTarget, refresh]);

  // 只显示 LR- 前缀的报损单
  const lossRows = allRows.filter(r => String(r.stocktake_no ?? "").startsWith("LR-"));
  const pendingCount = lossRows.filter(r => r.status === "DONE").length;
  const totalLoss = lossRows.reduce((s, r) => s + Math.abs(Number(r.diff_qty ?? 0)), 0);
  const COLUMNS: Column<Row>[] = [{
    key: "stocktake_no",
    title: t("ui.报损单号", "报损单号"),
    width: 160
  }, {
    key: "warehouse_code",
    title: t("ui.报损仓库", "报损仓库"),
    width: 120,
    render: (v, row) => <MasterLabel>{formatMasterData(row, 'warehouse_name', v, lang, { canonicalFallback: true })}</MasterLabel>
  }, {
    key: "zone_code",
    title: t("ui.报损库区", "报损库区"),
    width: 130,
    render: (v, row) => <MasterLabel>{masterDisplayLabel(zoneNames, 'zone', v, lang, row)}</MasterLabel>
  }, {
    key: "batch_no",
    title: t("ui.报损批次", "报损批次"),
    width: 130
  }, {
    key: "item",
    title: t("ui.报损品目", "报损品目"),
    width: 150,
    render: (value, row) => String(row.item_name || value || "—") + (row.item_name && value && row.item_name !== value ? `（${String(value)}）` : "")
  }, {
    key: "diff_qty",
    title: t("ui.报损数量", "报损数量"),
    width: 90,
    align: "right",
    render: v => <span style={moneyCell("danger", "md")}>{String(v ?? 0)}</span>
  }, {
    key: "book_qty",
    title: t("ui.损失估值LAK", "损失估值(LAK)"),
    width: 110,
    align: "right",
    render: v => <span style={moneyCell("danger", "md")}>{v ? Number(v).toLocaleString() : "—"}</span>
  }, {
    key: "operator",
    title: t("ui.报损人", "报损人"),
    width: 90
  }, {
    key: "status",
    title: t("common.status", "状态"),
    width: 90,
    align: "center",
    render: v => {
      const cfg = STATUS_BADGE[String(v)] ?? { tone: "default" as Tone, label: String(v ?? "—") };
      return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
    }
  }, {
    key: "_actions",
    title: t("common.operation", "操作"),
    width: 180,
    align: "center",
    render: (_, row) => (
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {canApproveInout && row.status === "DONE" && (
          <button type="button" style={actionPill("success")} onClick={() => handleApprove(row)}>
            <CheckCircle size={11} />{t("ui.审批", "审批")}
          </button>
        )}
        {canEditInout && isMutableRow(row) && <button type="button" style={actionPill("default")} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>}
        {canDeleteInout && isMutableRow(row) && <button type="button" style={actionPill("danger")} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>}
      </div>
    )
  }];
  return <div>
      <PageHeader
        title={t("ui.报损管理", "报损管理")}
        subtitle={t("ui.库存损耗记录与审批管理", "库存损耗记录与审批管理")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.报损管理", "报损管理")]}
        actions={canCreateInout ? (
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新建报损单", "新建报损单")}
          </button>
        ) : undefined}
      />

      {/* g200e KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        {([
          { label: t("ui.系统拦截阻挡", "系统拦截/阻挡"), val: "0",                                                tone: "danger"  as Tone },
          { label: t("ui.总报损批次",   "总报损批次"),   val: `${lossRows.length} ${t("ui.批", "批")}`,            tone: "warning" as Tone },
          { label: t("ui.待审批",       "待审批"),       val: `${pendingCount} ${t("ui.单", "单")}`,               tone: "info"    as Tone },
          { label: t("ui.累计报损量",   "累计报损量"),   val: `${totalLoss.toLocaleString()} ${t("ui.枚", "枚")}`, tone: "brand"   as Tone },
        ]).map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={kpiCardCompactValue(c.tone)}>{c.val}</div>
          </div>
        ))}
      </div>

      <DataTable table={TABLE} columns={COLUMNS} params={{
      stocktake_no__like: "LR-%"
    }} onNew={canCreateInout ? openNew : undefined} onEdit={canEditInout ? openEdit : undefined} onDelete={canDeleteInout ? handleDelete : undefined} showActions={false} refreshKey={refreshKey} emptyText={t("ui.暂无报损记录点击新建报损单开始记录", "暂无报损记录，点击「新建报损单」开始记录")} pageSize={30} />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑报损单", "编辑报损单") : t("ui.新建报损单", "新建报损单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} batchRefreshKey={refreshKey} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")} onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title={t("ui.确认审批报损单", "确认审批报损单")} message={`${t("ui.确认审批通过报损单", "确认审批通过报损单")}「${approveTarget?.stocktake_no ?? ""}」？${t("ui.这将影响账面资产", "这将影响账面资产！")}`} onConfirm={confirmApprove} onCancel={() => setApproveOpen(false)} />
    </div>;
}
