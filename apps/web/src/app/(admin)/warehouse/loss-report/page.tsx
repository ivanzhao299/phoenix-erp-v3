"use client";

import { useState, useCallback, useEffect } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, CheckCircle } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 报损管理页面 (对应 V2: LossReport.jsx)
// 数据来源: wms_stocktake 表 (复用，loss_no 前缀区分)
// 权限: ROLE_ADMIN / ROLE_WMS_MGR / ROLE_FIN_CFO 可审批 & 删除
import u from "@/styles/uix-utils.module.css";
const TABLE = "wms_stocktake";
const getRole = () => {
  try {
    return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || "";
  } catch {
    return "";
  }
};
const isApprover = () => ["ROLE_ADMIN", "ROLE_WMS_MGR", "ROLE_FIN_CFO", "ROLE_FIN_ACCT"].includes(getRole());
type Row = Record<string, unknown>;
export default function LossReportPage() {
  const {
    t
  } = useLanguage();

  // ✅ 状态 → 全局 badge CSS 类
  const STATUS_BADGE: Record<string, {
    cls: string;
    label: string;
  }> = {
    DRAFT: {
      cls: s.badgeNeutral,
      label: t("ui.草稿", "草稿")
    },
    DONE: {
      cls: s.badgeWarning,
      label: t("ui.待审批", "待审批")
    },
    APPROVED: {
      cls: s.badgeSuccess,
      label: t("status.approved", "已审批")
    }
  };

  // G4-D：报损单 — 仓库/库区/货位/SKU/报损人 主数据化；报损原因 → sys_dict(INV_LOSS_REASON)；报损证明附件统一上传
  const FIELDS: FormField[] = [{
    key: "stocktake_no",
    label: t("ui.报损单号", "报损单号"),
    type: "text",
    placeholder: t("ui.留空自动生成LR", "留空自动生成 LR-XXXXXX")
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
    }, {
      label: t("status.approved", "已审批"),
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

  // KPI 数据：独立拉取全量（DataTable 分页显示，KPI 需全量）
  useEffect(() => {
    crudApi.list<Row>(TABLE, {
      limit: 500
    }).then(res => setAllRows(res.data ?? [])).catch(() => {});
  }, [refreshKey]);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew = useCallback(() => {
    setEditing(null);
    setDrawerOpen(true);
  }, []);
  const openEdit = useCallback((row: Row) => {
    setEditing(row);
    setDrawerOpen(true);
  }, []);
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
    setDeleteTarget(row);
    setConfirmOpen(true);
  }, []);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false);
    refresh();
  }, [deleteTarget, refresh]);
  const handleApprove = useCallback((row: Row) => {
    setApproveTarget(row);
    setApproveOpen(true);
  }, []);
  const confirmApprove = useCallback(async () => {
    if (!approveTarget?.id) return;
    await crudApi.update(TABLE, approveTarget.id as number, {
      status: "APPROVED"
    });
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
    key: "zone_code",
    title: t("ui.报损品目", "报损品目"),
    width: 120
  }, {
    key: "warehouse_code",
    title: t("ui.批次库区", "批次/库区"),
    width: 130
  }, {
    key: "diff_qty",
    title: t("ui.报损数量", "报损数量"),
    width: 90,
    align: "right",
    render: v => <b className={s.textDanger}>{String(v ?? 0)}</b>
  }, {
    key: "book_qty",
    title: t("ui.损失估值LAK", "损失估值(LAK)"),
    width: 110,
    align: "right",
    render: v => <span className={`${s.textDanger} ${u.fw700}`}>{v ? Number(v).toLocaleString() : "—"}</span>
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
      const cfg = STATUS_BADGE[String(v)] ?? {
        cls: s.badgeNeutral,
        label: String(v ?? "—")
      };
      return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
    }
  }, {
    key: "_actions",
    title: t("common.operation", "操作"),
    width: 140,
    align: "center",
    render: (_, row) => <div style={{
      display: "flex",
      gap: 6,
      justifyContent: "center"
    }}>
          {isApprover() && row.status === "DONE" && <button type="button" className={`${s.btnSuccess} ${s.btnSm}`} onClick={() => handleApprove(row)}>
              <CheckCircle size={11} />{t("ui.审批", "审批")}
            </button>}
          <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>{t("common.edit", "编辑")}</button>
          {isApprover() && <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>{t("common.delete", "删除")}</button>}
        </div>
  }];
  return <div>
      <PageHeader title={t("ui.报损管理", "报损管理")} subtitle={t("ui.库存损耗记录与审批管理", "库存损耗记录与审批管理")} breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.报损管理", "报损管理")]} actions={<button type="button" className={s.btnPrimary} onClick={openNew}>
            <Plus size={14} />{t("ui.新建报损单", "新建报损单")}
          </button>} />

      {/* KPI 统计 */}
      <div className={`${s.statsRow} ${u.mb20}`}>
        {[{
        label: t("ui.系统拦截阻挡", "系统拦截/阻挡"),
        val: "0",
        cardCls: s.statCardDanger,
        valCls: s.textDanger
      }, {
        label: t("ui.总报损批次", "总报损批次"),
        val: `${lossRows.length} ${t("ui.批", "批")}`,
        cardCls: s.statCardWarning,
        valCls: s.textWarning
      }, {
        label: t("ui.待审批", "待审批"),
        val: `${pendingCount} ${t("ui.单", "单")}`,
        cardCls: s.statCardInfo,
        valCls: s.textInfo
      }, {
        label: t("ui.累计报损量", "累计报损量"),
        val: `${totalLoss.toLocaleString()} ${t("ui.枚", "枚")}`,
        cardCls: s.statCardPurple,
        valCls: s.textPurple
      }].map(c => <div key={c.label} className={`${s.statCard} ${c.cardCls}`}>
            <div className={`${s.statValue} ${c.valCls}`}>{c.val}</div>
            <div className={s.statLabel}>{c.label}</div>
          </div>)}
      </div>

      <DataTable table={TABLE} columns={COLUMNS} params={{
      stocktake_no__like: "LR-%"
    }} onNew={openNew} onEdit={openEdit} onDelete={handleDelete} showActions={false} refreshKey={refreshKey} emptyText={t("ui.暂无报损记录点击新建报损单开始记录", "暂无报损记录，点击「新建报损单」开始记录")} pageSize={30} />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑报损单", "编辑报损单") : t("ui.新建报损单", "新建报损单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")} onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title={t("ui.确认审批报损单", "确认审批报损单")} message={`${t("ui.确认审批通过报损单", "确认审批通过报损单")}「${approveTarget?.stocktake_no ?? ""}」？${t("ui.这将影响账面资产", "这将影响账面资产！")}`} onConfirm={confirmApprove} onCancel={() => setApproveOpen(false)} />
    </div>;
}