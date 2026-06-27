"use client";
import { useState, useCallback, useMemo } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Plus } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
// g200e 模板 token(2026-06-20)
import {
  primaryActionButton, actionPill, toolbarFilterPill, moneyCell,
} from "@/components/design-system/cockpit-styles";

type ActionTone = "default" | "success" | "warning" | "danger" | "info" | "brand";

// ✅ V3 表: wms_outbound（实表列：outbound_no/type/item/qty/status/picker/ref_no/
//    order_no/operator/destination_type/destination_house_code/remark
//    + G17 补：warehouse_code/batch_no/attachment_url/date/destination_customer_code/
//      site_code/company_code）
const TABLE = "wms_outbound";

const getStoreCode = () => {
  try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").storeCode || ""; }
  catch { return ""; }
};

// 出库类型（与 sys_dict.INV_OUTBOUND_TYPE 对齐，G17 seed）
const OUT_TYPES = ["", "SALE", "TRANSFER", "PRODUCTION_USE", "FEED_DISTRIBUTION", "MEDICINE_DISTRIBUTION", "SCRAP", "RETURN"] as const;

type Row = Record<string, unknown>;

export default function OutboundPage() {
  const { t } = useLanguage();
  const { canCreate, canEdit, canDelete } = useAuth();
  const canCreateInout = canCreate("MENU_WMS_INOUT");
  const canEditInout = canEdit("MENU_WMS_INOUT");
  const canDeleteInout = canDelete("MENU_WMS_INOUT");
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [typeFilter,   setTypeFilter]   = useState("");

  // 当前用户的 site/farm 推导 — 用于 Selector 过滤
  const userStore = useMemo(() => getStoreCode(), []);
  const isSite = userStore.startsWith("SITE-");
  const isFarm = userStore.startsWith("LPH_") || userStore.startsWith("LPH-");
  const siteCode = isSite ? userStore : undefined;
  const companyCode = !isSite && !isFarm ? undefined : undefined;  // 暂从 site/farm 反推留后续

  // g200e:tone 替换 cls,接 actionPill(tone)
  const TYPE_LABEL: Record<string, { label: string; tone: ActionTone }> = {
    SALE:                   { label: t("ui.销售出库",     "销售出库"), tone: "info"    },
    TRANSFER:               { label: t("ui.调拨出库",     "调拨出库"), tone: "brand"   },
    PRODUCTION_USE:         { label: t("ui.生产领用",     "生产领用"), tone: "success" },
    FEED_DISTRIBUTION:      { label: t("ui.饲料发放",     "饲料发放"), tone: "success" },
    MEDICINE_DISTRIBUTION:  { label: t("ui.兽药发放",     "兽药发放"), tone: "success" },
    SCRAP:                  { label: t("ui.报废出库",     "报废出库"), tone: "danger"  },
    RETURN:                 { label: t("ui.退货出库",     "退货出库"), tone: "warning" },
  };

  const STATUS_BADGE: Record<string, { tone: ActionTone; label: string }> = {
    PENDING:   { tone: "warning", label: t("status.pending",   "待出库") },
    PICKING:   { tone: "info",    label: t("status.picking",   "拣货中") },
    DONE:      { tone: "success", label: t("status.done",      "已出库") },
    CANCELLED: { tone: "default", label: t("status.cancelled", "已取消") },
  };

  // G17：FIELDS 与 wms_outbound 真实列对齐
  //   warehouse_code: 出库源仓库（SiteCode 过滤）
  //   type:           出库类型（sys_dict INV_OUTBOUND_TYPE）
  //   destination_type:  去向类型（sys_dict INV_OUTBOUND_DEST_TYPE）
  //   destination_house_code:    去向鸡舍（当 dest_type=HOUSE）
  //   destination_customer_code: 去向客户（当 dest_type=CUSTOMER）
  //   item:    物料（SKU code）
  //   batch_no: 批次（可选，关联 inv_batches）
  const FIELDS: FormField[] = [
    { key: "outbound_no",    label: t("ui.出库单号", "出库单号"), type: "text",   placeholder: t("ui.留空自动生成WO", "留空自动生成 WO-XXXXXX") },
    { key: "date",           label: t("ui.出库日期", "出库日期"), type: "date",   required: true },
    { key: "type",           label: t("ui.出库类型", "出库类型"), type: "dict",   dictType: "INV_OUTBOUND_TYPE", required: true },
    { key: "warehouse_code", label: t("ui.出库仓库", "出库仓库"), type: "warehouse", required: true,
      ...(siteCode ? { filterBy: { siteCode } } : {}) } as any,
    { key: "item",           label: t("ui.物料/SKU", "物料/SKU"), type: "sku", required: true },
    { key: "batch_no",       label: t("ui.批次号",   "批次号(可选)"),   type: "text" },
    { key: "qty",            label: t("ui.出库数量", "出库数量"), type: "number", required: true },
    { key: "destination_type",          label: t("ui.去向类型", "去向类型"), type: "dict", dictType: "INV_OUTBOUND_DEST_TYPE" },
    { key: "destination_house_code",    label: t("ui.去向鸡舍", "去向鸡舍(去向=鸡舍时)"), type: "house",
      ...(siteCode ? { filterBy: { siteCode } } : {}) } as any,
    { key: "destination_customer_code", label: t("ui.去向客户", "去向客户(去向=客户时)"), type: "customer" },
    { key: "picker",         label: t("ui.拣货员",   "拣货员"),   type: "user" },
    { key: "operator",       label: t("ui.操作员",   "操作员"),   type: "user" },
    { key: "ref_no",         label: t("ui.关联单据", "关联单据(可选)"), type: "text" },
    { key: "order_no",       label: t("ui.关联订单", "关联订单(可选)"), type: "text" },
    { key: "remark",         label: t("common.remark", "备注"), type: "textarea" },
    { key: "attachment_url", label: t("ui.出库附件", "出库附件"), type: "attachment" },
    { key: "status", label: t("common.status", "状态"), type: "select", options: [
      { label: t("status.pending",   "待出库"), value: "PENDING"   },
      { label: t("status.picking",   "拣货中"), value: "PICKING"   },
      { label: t("status.done",      "已出库"), value: "DONE"      },
      { label: t("status.cancelled", "已取消"), value: "CANCELLED" },
    ]},
  ];

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { if (!canCreateInout) return; setEditing(null); setDrawerOpen(true); }, [canCreateInout]);
  const openEdit    = useCallback((row: Row) => { if (!canEditInout) return; setEditing(row); setDrawerOpen(true); }, [canEditInout]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      // G17：outbound_no 后端 UNIQUE 约束护底；前端兜底生成；site_code 自动注入
      const payload = editing?.id
        ? values
        : {
            ...values,
            outbound_no: values.outbound_no || ("WO-" + Date.now().toString().slice(-8)),
            status:      values.status || "PENDING",
            date:        values.date   || new Date().toISOString().slice(0, 10),
            ...(siteCode ? { site_code: siteCode } : {}),
          };
      editing?.id
        ? await crudApi.update(TABLE, editing.id as number, payload)
        : await crudApi.create(TABLE, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh, siteCode]);

  const handleDelete  = useCallback((row: Row) => { if (!canDeleteInout) return; setDeleteTarget(row); setConfirmOpen(true); }, [canDeleteInout]);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  const COLUMNS: Column<Row>[] = [
    { key: "outbound_no",     title: t("ui.出库单号", "出库单号"), width: 160 },
    { key: "date",            title: t("ui.出库日期", "出库日期"), width: 110 },
    { key: "type",            title: t("ui.出库类型", "出库类型"), width: 110,
      render: v => {
        const cfg = TYPE_LABEL[String(v)];
        return cfg ? <span style={actionPill(cfg.tone)}>{cfg.label}</span> : <span>{String(v ?? "—")}</span>;
      }},
    { key: "warehouse_code",  title: t("ui.出库仓库", "出库仓库"), width: 130 },
    { key: "item",            title: t("ui.物料",     "物料"),     width: 110 },
    { key: "qty",             title: t("ui.数量",     "数量"),     width: 80, align: "right",
      render: v => <span style={moneyCell("default", "md")}>{String(v ?? 0)}</span> },
    { key: "destination_house_code", title: t("ui.去向鸡舍", "去向鸡舍"), width: 110 },
    { key: "operator",        title: t("ui.操作员",   "操作员"),   width: 90 },
    { key: "status",          title: t("common.status", "状态"), width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { tone: "default" as ActionTone, label: String(v ?? "—") };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      }},
    { key: "_actions",        title: t("common.operation", "操作"), width: 140, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {canEditInout && <button type="button" style={actionPill("default")} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>}
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
        title={t("ui.出库管理", "出库管理")}
        subtitle={t("ui.各类出库单管理门店补货团购报废", "出库单据 · 销售/调拨/生产领用/饲料兽药发放/报废/退货")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.出库管理", "出库管理")]}
        actions={canCreateInout ? (
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新建出库单", "新建出库单")}
          </button>
        ) : undefined}
      />

      {/* g200e:tab pill → toolbarFilterPill token */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {OUT_TYPES.map(tp => (
          <button key={tp} type="button" onClick={() => setTypeFilter(tp)} style={toolbarFilterPill(typeFilter === tp)}>
            {tp === "" ? t("ui.全部", "全部") : (TYPE_LABEL[tp]?.label ?? tp)}
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
        emptyText={t("common.no_data", "暂无出库记录")}
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑出库单", "编辑出库单") : t("ui.新建出库单", "新建出库单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
