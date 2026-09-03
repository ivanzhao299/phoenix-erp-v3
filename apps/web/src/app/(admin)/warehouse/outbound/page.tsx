"use client";
import { useState, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Plus } from "lucide-react";
import apiRequest from "@/lib/api-client";
import { OUTBOUND_DESTINATIONS, validateOutboundItem, validateOutboundQuantity } from "@/lib/warehouse-outbound";
import { formatMasterData } from "@/lib/business-display";
import { masterNameWithCode } from "@/lib/localized-master-data";
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
const OUT_TYPES = [
  "",
  "SALE",
  "TRANSFER",
  "PRODUCTION_USE",
  "FEED_DISTRIBUTION",
  "MEDICINE_DISTRIBUTION",
  "LOGISTICS_USE",
  "SPARE_PART_USE",
  "OFFICE_USE",
  "MAINTENANCE_USE",
  "SCRAP",
  "RETURN",
] as const;

const ISSUE_TYPES = new Set([
  "PRODUCTION_USE",
  "FEED_DISTRIBUTION",
  "MEDICINE_DISTRIBUTION",
  "LOGISTICS_USE",
  "SPARE_PART_USE",
  "OFFICE_USE",
  "MAINTENANCE_USE",
]);

type Row = Record<string, unknown>;

export default function OutboundPage() {
  const { t, lang } = useLanguage();
  const pathname = usePathname();
  const issueOnly = pathname === "/warehouse/issues";
  const { user, canCreate, canEdit, canDelete, hasPermission } = useAuth();
  const currentOperator = masterNameWithCode(String(user?.name || ""), String(user?.username || ""));
  const canCreateInout = canCreate("MENU_WMS_INOUT");
  const canEditInout = canEdit("MENU_WMS_INOUT");
  const canDeleteInout = canDelete("MENU_WMS_INOUT");
  const canCreateIssue = canCreate("MENU_WMS_ISSUE");
  const canEditIssue = canEdit("MENU_WMS_ISSUE");
  const canDeleteIssue = canDelete("MENU_WMS_ISSUE");
  const canViewIssue = hasPermission("MENU_WMS_ISSUE", "V");
  const canCreateAny = canCreateInout || canCreateIssue;
  const canEditAny = canEditInout || canEditIssue;
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [typeFilter,   setTypeFilter]   = useState(issueOnly ? "PRODUCTION_USE" : "");
  const [confirmingNo, setConfirmingNo] = useState("");

  // 当前用户的 site/farm 推导 — 用于 Selector 过滤
  const userStore = useMemo(() => getStoreCode(), []);
  const isSite = userStore.startsWith("SITE-");
  const siteCode = isSite ? userStore : undefined;

  // g200e:tone 替换 cls,接 actionPill(tone)
  const TYPE_LABEL: Record<string, { label: string; tone: ActionTone }> = {
    SALE:                   { label: t("ui.销售出库",     "销售出库"), tone: "info"    },
    TRANSFER:               { label: t("ui.调拨出库",     "调拨出库"), tone: "brand"   },
    PRODUCTION_USE:         { label: t("ui.生产领用",     "生产领用"), tone: "success" },
    FEED_DISTRIBUTION:      { label: t("ui.饲料发放",     "饲料发放"), tone: "success" },
    MEDICINE_DISTRIBUTION:  { label: t("ui.兽药发放",     "兽药发放"), tone: "success" },
    LOGISTICS_USE:          { label: t("ui.后勤领用",     "后勤领用"), tone: "brand"   },
    SPARE_PART_USE:         { label: t("ui.配件领用",     "配件领用"), tone: "brand"   },
    OFFICE_USE:             { label: t("ui.办公领用",     "办公领用"), tone: "info"    },
    MAINTENANCE_USE:        { label: t("ui.维修领用",     "维修领用"), tone: "warning" },
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
    { key: "type",           label: t("ui.出库类型", "出库类型"), type: "select", required: true,
      options: (issueOnly
        ? OUT_TYPES.filter(type => ISSUE_TYPES.has(type))
        : OUT_TYPES.filter(type => ["SALE", "SCRAP", "RETURN"].includes(type))
      ).map(type => ({ value: type, label: TYPE_LABEL[type]?.label ?? type })) },
    { key: "warehouse_code", label: t("ui.出库仓库", "出库仓库"), type: "warehouse", required: true,
      ...(siteCode ? { filterBy: { siteCode } } : {}) } as any,
    { key: "item",           label: t("ui.库存物料/SKU", "库存物料/SKU"), type: "inventory-item", required: true,
      validate: validateOutboundItem,
      onPickKeys: {
        item_name: "itemName",
        item_type: "itemType",
        material_type: "materialType",
        material_code: "materialCode",
        sku_code: "skuCode",
        product_code: "productCode",
        unit: "unit",
      } },
    { key: "item_name",      label: t("ui.物料名称", "物料名称"), type: "readonly" },
    { key: "unit",           label: t("ui.计量单位", "计量单位"), type: "readonly" },
    { key: "batch_no",       label: t("ui.库存批次", "库存批次(可选，不选则按物料先进先出)"), type: "batch",
      onPickKeys: {
        item: "inventory_item_code",
        warehouse_code: "warehouse_code",
      } },
    { key: "qty",            label: t("ui.出库数量", "出库数量"), type: "number", required: true,
      validate: validateOutboundQuantity },
    { key: "destination_type",          label: t("ui.去向类型", "去向类型"), type: "dict", dictType: "INV_OUTBOUND_DEST_TYPE", required: true,
      allowedValuesByField: { field: "type", values: OUTBOUND_DESTINATIONS } },
    { key: "destination_house_code",    label: t("ui.领用鸡舍", "领用鸡舍"), type: "house",
      required: true,
      visibleWhen: { field: "destination_type", values: ["HOUSE"] },
      ...(siteCode ? { filterBy: { siteCode } } : {}) } as any,
    { key: "destination_customer_code", label: t("ui.收货客户", "收货客户"), type: "customer",
      required: true,
      visibleWhen: { field: "destination_type", values: ["CUSTOMER"] } },
    { key: "destination_warehouse_code", label: t("ui.调入仓库", "调入仓库"), type: "warehouse",
      required: true,
      visibleWhen: { field: "destination_type", values: ["WAREHOUSE"] } },
    { key: "destination_store_code", label: t("ui.收货门店", "收货门店"), type: "store",
      required: true,
      visibleWhen: { field: "destination_type", values: ["STORE"] } },
    { key: "department_code", label: t("ui.领用部门", "领用部门"), type: "department",
      required: true,
      visibleWhen: { field: "destination_type", values: ["DEPARTMENT"] },
      filterBy: { companyField: "company_code" } },
    { key: "project_code", label: t("ui.领用项目", "领用项目"), type: "project",
      required: true,
      visibleWhen: { field: "destination_type", values: ["PROJECT"] } },
    { key: "receiver_username", label: t("ui.领用人", "领用人"), type: "user",
      required: true,
      visibleWhen: { field: "destination_type", values: ["EMPLOYEE"] } },
    { key: "destination_code", label: t("ui.供应商", "供应商"), type: "supplier",
      required: true, visibleWhen: { field: "destination_type", values: ["SUPPLIER"] } },
    { key: "destination_code", label: t("ui.其他去向", "其他去向"), type: "text",
      required: true,
      visibleWhen: { field: "destination_type", values: ["OTHER"] } },
    { key: "company_code", label: t("ui.归属公司", "归属公司"), type: "company" },
    { key: "purpose_code", label: t("ui.用途/工单", "用途/工单"), type: "text",
      placeholder: t("ui.填写用途工单设备或维修事项", "填写用途、工单、设备或维修事项") },
    { key: "picker",         label: t("ui.拣货员",   "拣货员"),   type: "user" },
    { key: "operator",       label: t("ui.操作员",   "操作员"), type: "readonly", defaultValue: currentOperator },
    { key: "ref_no",         label: t("ui.关联单据", "关联单据(可选)"), type: "text" },
    { key: "order_no",       label: t("ui.关联订单", "关联订单(可选)"), type: "text" },
    { key: "remark",         label: t("common.remark", "备注"), type: "textarea" },
    { key: "attachment_url", label: t("ui.出库附件", "出库附件"), type: "attachment" },
  ];

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const canCreateType = useCallback((type: unknown) => {
    return ISSUE_TYPES.has(String(type || "")) ? canCreateIssue : canCreateInout;
  }, [canCreateInout, canCreateIssue]);
  const canEditType = useCallback((type: unknown) => {
    return ISSUE_TYPES.has(String(type || "")) ? canEditIssue : canEditInout;
  }, [canEditInout, canEditIssue]);
  const canDeleteType = useCallback((type: unknown) => {
    return ISSUE_TYPES.has(String(type || "")) ? canDeleteIssue : canDeleteInout;
  }, [canDeleteInout, canDeleteIssue]);
  const canCreateCurrent = issueOnly ? canCreateIssue : canCreateAny;
  const openNew     = useCallback(() => { if (!canCreateCurrent) return; setEditing(null); setDrawerOpen(true); }, [canCreateCurrent]);
  const openEdit    = useCallback((row: Row) => { if (!canEditType(row.type)) return; setEditing(row); setDrawerOpen(true); }, [canEditType]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      // G17：outbound_no 后端 UNIQUE 约束护底；前端兜底生成；site_code 自动注入
      if (!canCreateType(values.type) && !editing) return;
      if (!canEditType(values.type) && editing) return;
      const payload = {
        ...values,
        outbound_no: values.outbound_no || ("WO-" + Date.now().toString().slice(-8)),
        status:      values.status || "PENDING",
        date:        values.date   || new Date().toISOString().slice(0, 10),
        ...(siteCode ? { site_code: siteCode } : {}),
      };
      const outboundNo = encodeURIComponent(String(payload.outbound_no));
      await apiRequest(
        editing
          ? `/outbound/standalone/${outboundNo}`
          : "/outbound/standalone",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [canCreateType, canEditType, editing, refresh, siteCode]);

  const handleDelete = (row: Row) => {
    if (!canDeleteType(row.type)) return;
    setDeleteTarget(row);
    setConfirmOpen(true);
  };
  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  };

  const confirmOutbound = useCallback(async (row: Row) => {
    const outboundNo = String(row.outbound_no || "").trim();
    if (!outboundNo || confirmingNo) return;
    if (!window.confirm(t("ui.确认出库将扣减库存并写入台账是否继续", "确认出库将扣减库存并写入台账，是否继续？"))) return;
    setConfirmingNo(outboundNo);
    try {
      await apiRequest(`/outbound/standalone/${encodeURIComponent(outboundNo)}/confirm`, {
        method: "POST",
      });
      refresh();
    } finally {
      setConfirmingNo("");
    }
  }, [confirmingNo, refresh, t]);

  const COLUMNS: Column<Row>[] = [
    { key: "outbound_no",     title: t("ui.出库单号", "出库单号"), width: 160 },
    { key: "date",            title: t("ui.出库日期", "出库日期"), width: 110 },
    { key: "type",            title: t("ui.出库类型", "出库类型"), width: 110,
      render: v => {
        const cfg = TYPE_LABEL[String(v)];
        return cfg ? <span style={actionPill(cfg.tone)}>{cfg.label}</span> : <span>{String(v ?? "—")}</span>;
      }},
    { key: "warehouse_code", title: t("ui.出库仓库", "出库仓库"), width: 170,
      render: (v, row) => formatMasterData(row, "warehouse_name", v, lang) },
    { key: "item", title: t("ui.物料", "物料"), width: 190,
      render: (v, row) => formatMasterData(row, "item_name", v, lang) },
    { key: "qty",             title: t("ui.数量",     "数量"),     width: 80, align: "right",
      render: v => <span style={moneyCell("default", "md")}>{String(v ?? 0)}</span> },
    { key: "destination_display_code", title: t("ui.去向", "去向"), width: 190,
      render: (v, row) => formatMasterData(row, "destination_name", v, lang) },
    { key: "operator", title: t("ui.操作员", "操作员"), width: 140,
      render: (v, row) => masterNameWithCode(String(row.operator_name || ""), String(v || "")) || "—" },
    { key: "status",          title: t("common.status", "状态"), width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { tone: "default" as ActionTone, label: String(v ?? "—") };
        return <span style={actionPill(cfg.tone)}>{cfg.label}</span>;
      }},
    { key: "_actions",        title: t("common.operation", "操作"), width: 140, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {canEditType(row.type) && ["PENDING", "PICKING"].includes(String(row.status)) && (
            <button type="button" style={actionPill("success")} disabled={confirmingNo === String(row.outbound_no)}
              onClick={() => confirmOutbound(row)}>
              {confirmingNo === String(row.outbound_no) ? t("common.processing", "处理中") : t("ui.确认出库", "确认出库")}
            </button>
          )}
          {canEditType(row.type) && String(row.status) !== "DONE" && <button type="button" style={actionPill("default")} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>}
          {canDeleteType(row.type) && String(row.status) === "PENDING" && (
            <button type="button" style={actionPill("danger")} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>
          )}
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("ui.出库与领用管理", "出库与领用管理")}
        subtitle={t("ui.统一管理销售出库调拨和内部领用", "统一管理销售出库、调拨、生产领用、后勤领用、配件领用与报废退货")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.出库与领用管理", "出库与领用管理")]}
        actions={canCreateCurrent ? (
          <button type="button" style={primaryActionButton} onClick={openNew}>
            <Plus size={14} />{t("ui.新建出库领用单", "新建出库/领用单")}
          </button>
        ) : undefined}
      />

      {/* g200e:tab pill → toolbarFilterPill token */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {OUT_TYPES.filter(tp => {
          if (!tp) return !issueOnly;
          if (issueOnly) return ISSUE_TYPES.has(tp);
          return ISSUE_TYPES.has(tp) ? canViewIssue : hasPermission("MENU_WMS_INOUT", "V");
        }).map(tp => (
          <button key={tp} type="button" onClick={() => setTypeFilter(tp)} style={toolbarFilterPill(typeFilter === tp)}>
            {tp === "" ? t("ui.全部", "全部") : (TYPE_LABEL[tp]?.label ?? tp)}
          </button>
        ))}
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={typeFilter ? { type: typeFilter } as any : undefined}
        onNew={canCreateCurrent ? openNew : undefined}
        onEdit={canEditAny ? openEdit : undefined}
        onDelete={(canDeleteInout || canDeleteIssue) ? handleDelete : undefined}
        showActions={false}
        refreshKey={refreshKey}
        emptyText={t("common.no_data", "暂无出库记录")}
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑出库单", "编辑出库单") : t("ui.新建出库单", "新建出库单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={{ ...(editing ?? {}), operator: currentOperator }} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
