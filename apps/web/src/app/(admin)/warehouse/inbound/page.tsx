"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import request, { crudApi, type ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { CheckSquare, Plus } from "lucide-react";
import {
  buildWarehouseInboundConfirmPayload,
  buildWarehouseInboundSavePayload,
  getWarehouseInboundConfirmKeyword,
} from "@/lib/warehouse-inbound";
import { formatMasterData } from "@/lib/business-display";
import { masterNameWithCode } from "@/lib/localized-master-data";
// g200e 模板 token(2026-06-20)
import {
  primaryActionButton, actionPill, toolbarFilterPill, moneyCell,
} from "@/components/design-system/cockpit-styles";

// ✅ V3 表: wms_inbound
const TABLE = "wms_inbound";

// B1 + B8: wms_inbound 真实列对齐 — type / item / qty / warehouse_code / operator / date / remark / inbound_no
//          状态枚举改用后端 wms.service 同款 (PENDING / PROCESSING / COMPLETED / CANCELLED)
const SOURCE_TYPES = ["", "PURCHASE", "PRODUCTION", "TRANSFER_RECEIVE", "RETURN", "ADJUSTMENT"] as const;

type Row = Record<string, unknown>;
type InboundConfirmResponse = { code?: number; msg?: string; message?: string };

export default function InboundPage() {
  const { t, lang } = useLanguage();
  const { user, canCreate, canEdit, canDelete, canApprove, hasPermission } = useAuth();
  const currentOperator = masterNameWithCode(String(user?.name || ""), String(user?.username || ""));
  const canCreateInout = canCreate("MENU_WMS_INOUT");
  const canEditInout = canEdit("MENU_WMS_INOUT");
  const canDeleteInout = canDelete("MENU_WMS_INOUT");
  const canApproveInout = canApprove("MENU_WMS_INOUT");
  const canConfirmInout = canApproveInout || canCreateInout;
  const canViewInventory = hasPermission("MENU_WMS_VIEW", "V");
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [editing,       setEditing]       = useState<Row | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<Row | null>(null);
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [approveOpen,   setApproveOpen]   = useState(false);
  const [approving,     setApproving]     = useState(false);
  const [approveError,  setApproveError]  = useState("");
  const [typeFilter,    setTypeFilter]    = useState("");

  const SOURCE_LABEL: Record<string, string> = {
    PRODUCTION: t("ui.生产入库", "生产入库"),
    PURCHASE:   t("ui.采购入库", "采购入库"),
    TRANSFER_RECEIVE: t("ui.调拨入库", "调拨入库"),
    RETURN:     t("ui.退货入库", "退货入库"),
    ADJUSTMENT: t("ui.盘盈入库", "盘盈入库"),
  };

  // g200e:状态徽章用 actionPill(tone),替换 s.badgeXxx 老 css module
  type BadgeTone = "warning" | "success" | "default" | "danger";
  const STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
    PENDING:    { tone: "warning", label: t("status.pending",   "待审核") },
    PROCESSING: { tone: "warning", label: t("ui.审核中",        "审核中") },
    COMPLETED:  { tone: "success", label: t("ui.已入库",        "已入库") },
    DONE:       { tone: "success", label: t("ui.已入库",        "已入库") },  // 历史数据兼容
    CANCELLED:  { tone: "default", label: t("status.cancelled", "已取消") },
  };

  // WMS 品目唯一口径：物料主数据（原料/饲料/兽药/包材/配件）+ 产成品 SKU。
  // 禁止自由文本入库，否则出库、批次和成本归集无法可靠匹配。
  const FIELDS: FormField[] = [
    { key: "inbound_no",     label: t("ui.入库单号", "入库单号"),  type: "text",   placeholder: t("ui.留空自动生成WI", "留空自动生成 WI-XXXXXX") },
    { key: "date",           label: t("ui.入库日期", "入库日期"),  type: "date",   required: true, defaultValue: new Date().toISOString().slice(0, 10) },
    { key: "type",           label: t("ui.入库类型", "入库类型"),  type: "dict",   dictType: "INV_INBOUND_TYPE", required: true },
    { key: "warehouse_code", label: t("ui.仓库",     "仓库"),      type: "warehouse", required: true },
    { key: "item",           label: t("ui.库存品目", "库存品目"), type: "inventory-item", required: true,
      onPickKeys: {
        item_name: "itemName",
        item_type: "itemType",
        material_type: "materialType",
        material_code: "materialCode",
        sku_code: "skuCode",
        product_code: "productCode",
        unit: "unit",
      } },
    { key: "item_name",      label: t("ui.品目名称", "品目名称"), type: "readonly" },
    { key: "unit",           label: t("ui.计量单位", "计量单位"), type: "readonly" },
    { key: "qty",            label: t("ui.入库数量", "入库数量"),  type: "number", required: true },
    { key: "operator",       label: t("ui.操作员",   "操作员"), type: "readonly", defaultValue: currentOperator },
    { key: "attachment_url", label: t("ui.入库附件", "入库附件"),  type: "attachment" },
    { key: "remark",         label: t("common.remark","备注"),     type: "textarea" },
  ];

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { if (!canCreateInout) return; setEditing(null); setDrawerOpen(true); }, [canCreateInout]);
  const openEdit    = useCallback((row: Row) => { if (!canEditInout) return; setEditing(row); setDrawerOpen(true); }, [canEditInout]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      const payload = buildWarehouseInboundSavePayload(values, { isEditing: Boolean(editing?.id) });
      editing?.id
        ? await crudApi.update(TABLE, editing.id as number, payload)
        : await crudApi.create(TABLE, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete   = useCallback((row: Row) => { if (!canDeleteInout) return; setDeleteTarget(row); setConfirmOpen(true); }, [canDeleteInout]);
  const confirmDelete  = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  const handleApprove  = useCallback((row: Row) => {
    if (!canConfirmInout) return;
    setApproveError("");
    setApproveTarget(row);
    setApproveOpen(true);
  }, [canConfirmInout]);
  const confirmApprove = useCallback(async () => {
    const built = buildWarehouseInboundConfirmPayload(approveTarget);
    if (!built.ok) {
      const reasonText: Record<typeof built.reason, string> = {
        missing_task_no: t("ui.入库单缺少任务号无法确认", "入库单缺少任务号，无法写入库存。"),
        missing_product_code: t("ui.入库单缺少产品编码无法确认", "入库单缺少产品编码/物料编码，无法写入库存。"),
        invalid_qty: t("ui.入库数量必须大于0", "入库数量必须大于 0。"),
      };
      setApproveError(reasonText[built.reason]);
      return;
    }

    setApproving(true);
    setApproveError("");
    try {
      const res = await request<InboundConfirmResponse>("/inbound/confirm", {
        method: "POST",
        body: JSON.stringify(built.payload),
      });
      if (res?.code && res.code >= 400) {
        setApproveError(res.msg || res.message || t("ui.入库确认失败", "入库确认失败"));
        return;
      }
      setApproveOpen(false);
      setApproveTarget(null);
      refresh();
    } catch (e) {
      const err = e as ApiError;
      setApproveError(err.message || t("ui.入库确认失败", "入库确认失败"));
    } finally {
      setApproving(false);
    }
  }, [approveTarget, refresh, t]);

  const COLUMNS: Column<Row>[] = [
    { key: "inbound_no",     title: t("ui.入库单号", "入库单号"),  width: 160 },
    { key: "date",           title: t("ui.入库日期", "入库日期"),  width: 110 },
    { key: "type",           title: t("ui.入库类型", "入库类型"),  width: 100,
      render: v => <span style={{ fontSize: 12, fontWeight: 600 }}>{SOURCE_LABEL[String(v)] ?? String(v ?? "—")}</span> },
    { key: "warehouse_code", title: t("ui.仓库", "仓库"), width: 160,
      render: (v, row) => formatMasterData(row, "warehouse_name", v, lang) },
    { key: "item", title: t("ui.品目", "品目"), width: 190,
      render: (v, row) => formatMasterData(row, "item_name", v, lang) },
    { key: "qty",            title: t("ui.入库数量", "入库数量"),  width: 90, align: "right",
      render: v => { const n = Number(v ?? 0); return <span style={moneyCell(n > 0 ? "success" : "default", "md")}>{n}</span>; } },
    { key: "status",         title: t("common.status", "状态"),    width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { tone: "default" as BadgeTone, label: String(v ?? "—") };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      }},
    { key: "operator", title: t("ui.操作员", "操作员"), width: 140,
      render: (v, row) => masterNameWithCode(String(row.operator_name || ""), String(v || "")) || "—" },
    { key: "_actions",       title: t("common.operation", "操作"), width: 240, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {canViewInventory && (
            <Link href={`/warehouse/query?q=${encodeURIComponent(getWarehouseInboundConfirmKeyword(row))}`} style={{ ...actionPill("info"), textDecoration: "none" }}>
              {t("ui.查库存", "查库存")}
            </Link>
          )}
          {canEditInout && <button type="button" style={actionPill("default")} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>}
          {canConfirmInout && row.status === "PENDING" && (
            <button type="button" style={actionPill("success")} onClick={() => handleApprove(row)}>
              <CheckSquare size={11} />{t("ui.确认入库", "确认入库")}
            </button>
          )}
          {canDeleteInout && (
            <button type="button" style={actionPill("danger")} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>
          )}
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("ui.入库管理", "入库管理")}
        subtitle={t("ui.管理各类仓库入库单审核数据追踪", "采购/生产/退货/调拨接收入库 · 批次台账 · 库存守恒")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.入库管理", "入库管理")]}
        actions={canCreateInout ? (
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新建入库单", "新建入库单")}
          </button>
        ) : undefined}
      />

      {/* g200e:过滤 tab pill 用 toolbarFilterPill token,替换 s.tabPill 老类 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {SOURCE_TYPES.map(tp => (
          <button key={tp} type="button" onClick={() => setTypeFilter(tp)} style={toolbarFilterPill(typeFilter === tp)}>
            {tp === "" ? t("ui.全部", "全部") : SOURCE_LABEL[tp]}
          </button>
        ))}
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={typeFilter ? { type: typeFilter } as any : undefined}
        onNew={canCreateInout ? openNew : undefined}
        onEdit={canEditInout ? openEdit : undefined}
        onDelete={canDeleteInout ? handleDelete : undefined}
        showActions={false}
        refreshKey={refreshKey}
        emptyText={t("common.no_data", "暂无入库记录")}
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑入库单", "编辑入库单") : t("ui.新建入库单", "新建入库单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={{ ...(editing ?? {}), operator: currentOperator }} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title={t("ui.确认入库", "确认入库")}
        message={`${approveError ? `${approveError} ` : ""}${t("ui.确认审核通过入库单", "确认审核通过入库单")}「${approveTarget?.inbound_no ?? approveTarget?.task_no ?? ""}」？${t("ui.确认后将写入库存查询", "确认后将写入库存台账，并可在库存查询中按产品编码/物料编码查询。")}`}
        confirmLabel={t("ui.确认入库", "确认入库")}
        loading={approving}
        onConfirm={confirmApprove} onCancel={() => { if (!approving) { setApproveOpen(false); setApproveError(""); } }} />
    </div>
  );
}
