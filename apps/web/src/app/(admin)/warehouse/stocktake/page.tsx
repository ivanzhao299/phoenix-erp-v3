"use client";

import { useState, useCallback, useEffect } from "react";
import request, { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Download, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatMasterData } from "@/lib/business-display";
import { masterNameWithCode } from "@/lib/localized-master-data";
// g200e 模板 token(2026-06-20)
import {
  primaryActionButton, secondaryActionButton, actionPill, moneyCell,
  kpiCardCompact, kpiCardCompactLabel, kpiCardCompactValue,
} from "@/components/design-system/cockpit-styles";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// ✅ V3 表: wms_stocktake
// 字段: take_no, warehouse_code, zone_code, book_qty, actual_qty, diff_qty, operator, status, date
// 权限由 MENU_WMS_INOUT 原子权限控制，不再前端硬编码角色。
import u from "@/styles/uix-utils.module.css";
const TABLE = "wms_stocktake";
type Row = Record<string, unknown>;
export default function StocktakePage() {
  const { user, canCreate, canEdit, canDelete, canApprove, canExport } = useAuth();
  const canCreateInout = canCreate("MENU_WMS_INOUT");
  const canEditInout = canEdit("MENU_WMS_INOUT");
  const canDeleteInout = canDelete("MENU_WMS_INOUT");
  const canApproveInout = canApprove("MENU_WMS_INOUT");
  const canExportInout = canExport("MENU_WMS_INOUT");
  const { t, lang } = useLanguage();
  const currentOperator = masterNameWithCode(String(user?.name || ""), String(user?.username || ""));

  // g200e:状态 tone → actionPill(tone)
  const STATUS_BADGE: Record<string, { tone: Tone; label: string }> = {
    DRAFT:       { tone: "default", label: t("ui.草稿",          "草稿") },
    IN_PROGRESS: { tone: "info",    label: t("ui.盘点中",        "盘点中") },
    DONE:        { tone: "warning", label: t("ui.待审核",        "待审核") },
    APPROVED:    { tone: "success", label: t("status.approved",  "已审核") },
  };

  // G4-D：盘点单 — 仓库/库区/货位/品目/盘点员 主数据化；盘点类型 → sys_dict(INV_COUNT_TYPE)；盘点附件统一上传
  const FIELDS: FormField[] = [{
    key: "stocktake_no",
    label: t("ui.盘点单号", "盘点单号"),
    type: "text",
    placeholder: t("ui.留空自动生成ST", "留空自动生成 ST-XXXXXX")
  }, {
    key: "batch_no",
    label: t("ui.盘点批次", "盘点批次"),
    type: "batch",
    onPickKeys: { item: "inventory_item_code", warehouse_code: "warehouse_code" }
  }, {
    key: "count_type",
    label: t("ui.盘点类型", "盘点类型"),
    type: "dict",
    dictType: "INV_COUNT_TYPE",
    required: true
  }, {
    key: "warehouse_code",
    label: t("ui.仓库", "仓库"),
    type: "warehouse",
    required: true
  }, {
    key: "zone_code",
    label: t("ui.库区", "库区"),
    type: "zone",
    filterBy: {
      warehouseField: "warehouse_code"
    }
  }, {
    key: "location_code",
    label: t("ui.货位", "货位"),
    type: "location",
    filterBy: {
      warehouseField: "warehouse_code",
      zoneField: "zone_code"
    }
  }, {
    key: "item",
    label: t("ui.盘点品目", "盘点品目"),
    type: "sku",
    onPickKeys: {
      item_name: "sku_name",
      spec_code: "spec_code",
      grade_code: "grade_code"
    }
  }, {
    key: "sys_qty",
    label: t("ui.账面数量", "账面数量"),
    type: "number"
  }, {
    key: "act_qty",
    label: t("ui.实际数量", "实际数量"),
    type: "number"
  }, {
    key: "diff_qty",
    label: t("ui.差异数量", "差异数量"),
    type: "number"
  }, {
    key: "operator",
    label: t("ui.录入员", "录入员"),
    type: "readonly",
    defaultValue: currentOperator
  }, {
    key: "auditor",
    label: t("ui.盘点员", "盘点员"),
    type: "user"
  }, {
    key: "attachment_url",
    label: t("ui.盘点附件", "盘点附件"),
    type: "attachment"
  }, {
    key: "status",
    label: t("common.status", "状态"),
    type: "select",
    options: [{
      label: t("ui.草稿", "草稿"),
      value: "DRAFT"
    }, {
      label: t("ui.盘点中", "盘点中"),
      value: "IN_PROGRESS"
    }, {
      label: t("ui.待审核", "待审核"),
      value: "DONE"
    }, {
      label: t("status.approved", "已审核"),
      value: "APPROVED"
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

  // KPI 数据：独立拉取（DataTable 分页显示，KPI 需全量）
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
  const openEdit = useCallback((row: Row) => {
    if (!canEditInout) return;
    setEditing(row);
    setDrawerOpen(true);
  }, [canEditInout]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // CSV 导出
  function exportCSV(rows: Row[]) {
    const headers = [t("ui.盘点单号", "盘点单号"), t("ui.仓库", "仓库"), t("ui.库区", "库区"), t("ui.账面量", "账面量"), t("ui.实际量", "实际量"), t("ui.差异量", "差异量"), t("ui.差异率%", "差异率%"), t("common.status", "状态"), t("ui.盘点员", "盘点员")];
    const lines = rows.map(r => {
      const book = Number(r.sys_qty ?? 0);
      const actual = Number(r.act_qty ?? 0);
      const diff = Number(r.diff_qty ?? 0);
      const rate = book > 0 ? (Math.abs(diff) / book * 100).toFixed(2) : "0.00";
      const status = STATUS_BADGE[String(r.status)]?.label ?? String(r.status ?? "");
      return [r.stocktake_no, r.warehouse_code, r.item ?? "", book, actual, diff, rate, status, r.auditor ?? ""].join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `盘点记录_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const diffQty = Number(values.act_qty ?? 0) - Number(values.sys_qty ?? 0);
      const payload = editing?.id ? {
        ...values,
        diff_qty: String(diffQty)
      } : {
        ...values,
        stocktake_no: values.stocktake_no || "ST-" + Date.now().toString().slice(-6),
        status: values.status || "DRAFT",
        diff_qty: String(diffQty),
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
    if (!canDeleteInout) return;
    setDeleteTarget(row);
    setConfirmOpen(true);
  }, [canDeleteInout]);
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
    await request("/inventory/stocktake/approve", {
      method: "POST",
      body: JSON.stringify({
        stocktake_no: approveTarget.stocktake_no,
        batch_no: approveTarget.batch_no,
        diff_qty: approveTarget.diff_qty,
        item: approveTarget.item,
      }),
    });
    setApproveOpen(false);
    refresh();
  }, [approveTarget, refresh]);

  // 统计 KPI（按 wms_stocktake 真实列 sys_qty/act_qty/diff_qty）
  const pending = allRows.filter(r => r.status === "DONE").length;
  const highRisk = allRows.filter(r => {
    const b = Number(r.sys_qty ?? 0);
    return b > 0 && Math.abs(Number(r.diff_qty ?? 0)) / b > 0.05;
  }).length;
  const totalDiff = allRows.reduce((s, r) => s + Math.abs(Number(r.diff_qty ?? 0)), 0);
  const COLUMNS: Column<Row>[] = [{
    key: "stocktake_no",
    title: t("ui.盘点单号", "盘点单号"),
    width: 160
  }, {
    key: "warehouse_code",
    title: t("ui.仓库", "仓库"),
    width: 170,
    render: (v, row) => formatMasterData(row, "warehouse_name", v, lang)
  }, {
    key: "item",
    title: t("ui.品目", "品目"),
    width: 180,
    render: (v, row) => formatMasterData(row, "item_name", v, lang)
  }, {
    key: "sys_qty",
    title: t("ui.账面量", "账面量"),
    width: 80,
    align: "right"
  }, {
    key: "act_qty",
    title: t("ui.实际量", "实际量"),
    width: 80,
    align: "right"
  }, {
    key: "diff_qty",
    title: t("ui.差异量", "差异量"),
    width: 80,
    align: "right",
    render: v => {
      const n = Number(v ?? 0);
      const moneyTone: "default" | "success" | "warning" | "danger" = n === 0 ? "success" : n > 0 ? "default" : "danger";
      return <span style={moneyCell(moneyTone, "md")}>{n === 0 ? "—" : n > 0 ? `+${n}` : String(n)}</span>;
    }
  }, {
    key: "_rate",
    title: t("ui.差异率", "差异率"),
    width: 100,
    align: "center",
    render: (_, row) => {
      const book = Number(row.sys_qty ?? 0);
      const diff = Number(row.diff_qty ?? 0);
      const rate = book > 0 ? Math.abs(diff) / book * 100 : 0;
      const isHigh = rate > 5;
      const tone: Tone = rate === 0 ? "success" : isHigh ? "danger" : "warning";
      return (
        <span style={{ ...actionPill(tone), display: "inline-flex", alignItems: "center", gap: 4 }}>
          {rate.toFixed(2)}%{isHigh && <AlertTriangle size={11} />}
        </span>
      );
    }
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
    key: "operator",
    title: t("ui.录入员", "录入员"),
    width: 140,
    render: (v, row) => masterNameWithCode(String(row.operator_name || ""), String(v || "")) || "—"
  }, {
    key: "auditor",
    title: t("ui.盘点员", "盘点员"),
    width: 140,
    render: (v, row) => masterNameWithCode(String(row.auditor_name || ""), String(v || "")) || "—"
  }, {
    key: "_actions",
    title: t("common.operation", "操作"),
    width: 180,
    align: "center",
    render: (_, row) => (
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {canEditInout && <button type="button" style={actionPill("default")} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>}
        {canApproveInout && row.status === "DONE" && (
          <button type="button" style={actionPill("success")} onClick={() => handleApprove(row)}>
            <CheckCircle size={11} />{t("ui.审批", "审批")}
          </button>
        )}
        {canDeleteInout && <button type="button" style={actionPill("danger")} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>}
      </div>
    )
  }];
  return <div>
      <PageHeader
        title={t("ui.盘点管理", "盘点管理")}
        subtitle={t("ui.库存盘点作业差异追踪审批确认", "库存盘点作业 · 差异追踪 · 审批确认")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.盘点管理", "盘点管理")]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {canExportInout && <button type="button" style={{ ...secondaryActionButton, opacity: allRows.length === 0 ? 0.5 : 1 }} onClick={() => exportCSV(allRows)} disabled={allRows.length === 0}>
              <Download size={13} />{t("common.export", "导出")} CSV
            </button>}
            <button type="button" style={secondaryActionButton} onClick={refresh}>
              <RefreshCw size={13} />{t("common.refresh", "刷新")}
            </button>
            {canCreateInout && <button type="button" style={primaryActionButton} onClick={openNew}>
              <Plus size={14} />{t("ui.新建盘点单", "新建盘点单")}
            </button>}
          </div>
        }
      />

      {/* g200e KPI 4 卡 — kpiCardCompact(tone) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        {([
          { label: t("ui.历史盘点次数", "历史盘点次数"), val: "—",                            tone: "info"    as Tone },
          { label: t("ui.待审批",       "待审批"),       val: String(pending),                tone: "warning" as Tone },
          { label: t("ui.高风险5%",     "高风险(>5%)"),  val: String(highRisk),               tone: "danger"  as Tone },
          { label: t("ui.累计差异量",   "累计差异量"),   val: totalDiff.toLocaleString(),     tone: "brand"   as Tone },
        ]).map(c => (
          <div key={c.label} style={kpiCardCompact(c.tone)}>
            <div style={kpiCardCompactLabel}>{c.label}</div>
            <div style={kpiCardCompactValue(c.tone)}>{c.val}</div>
          </div>
        ))}
      </div>

      <DataTable table={TABLE} columns={COLUMNS} onNew={canCreateInout ? openNew : undefined} onEdit={canEditInout ? openEdit : undefined} onDelete={canDeleteInout ? handleDelete : undefined} showActions={false} refreshKey={refreshKey} emptyText={t("ui.暂无盘点记录", "暂无盘点记录")} pageSize={30} />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑盘点单", "编辑盘点单") : t("ui.新建盘点单", "新建盘点单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={{ ...(editing ?? {}), operator: currentOperator }} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")} onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title={t("ui.确认审批通过", "确认审批通过")} message={`${t("ui.确认审批盘点单", "确认审批盘点单")}「${approveTarget?.stocktake_no ?? ""}」？${t("ui.可能影响账面库存数据", "可能影响账面库存数据")}`} onConfirm={confirmApprove} onCancel={() => setApproveOpen(false)} />
    </div>;
}
