"use client";
import { useState, useCallback, useEffect } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CheckSquare, Plus } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

// ✅ V3 表: wms_inbound
const TABLE = "wms_inbound";

const getRole = () => {
  try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || ""; }
  catch { return ""; }
};
const isManager = () => ["ROLE_ADMIN", "ROLE_WMS_MGR", "ROLE_PKG_MGR"].includes(getRole());

// B1 + B8: wms_inbound 真实列对齐 — type / item / qty / warehouse_code / operator / date / remark / inbound_no
//          状态枚举改用后端 wms.service 同款 (PENDING / PROCESSING / COMPLETED / CANCELLED)
const SOURCE_TYPES = ["", "PRODUCTION", "PURCHASE", "TRANSFER", "RETURN"] as const;
const SOURCE_LABEL: Record<string, string> = {
  PRODUCTION: "生产入库", PURCHASE: "采购入库",
  TRANSFER:   "调拨入库", RETURN:   "退货入库",
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  PENDING:    { cls: s.badgeWarning, label: "待审核" },
  PROCESSING: { cls: s.badgeWarning, label: "审核中" },
  COMPLETED:  { cls: s.badgeSuccess, label: "已入库" },
  DONE:       { cls: s.badgeSuccess, label: "已入库" },  // 历史数据兼容
  CANCELLED:  { cls: s.badgeNeutral, label: "已取消" },
};

type Row = Record<string, unknown>;

const FIELDS: FormField[] = [
  { key: "inbound_no",     label: "入库单号",  type: "text",   placeholder: "留空自动生成 WI-XXXXXX" },
  { key: "type",           label: "入库类型",  type: "select", options: [
    { label: "生产入库", value: "PRODUCTION" },
    { label: "采购入库", value: "PURCHASE"  },
    { label: "调拨入库", value: "TRANSFER"  },
    { label: "退货入库", value: "RETURN"    },
  ]},
  { key: "warehouse_code", label: "入库仓库",  type: "text",   required: true },
  { key: "item",           label: "品目",      type: "text"   },
  { key: "qty",            label: "数量",      type: "number" },
  { key: "operator",       label: "操作员",    type: "text"   },
  { key: "remark",         label: "备注",      type: "text"   },
  { key: "status", label: "状态", type: "select", options: [
    { label: "待审核", value: "PENDING"    },
    { label: "审核中", value: "PROCESSING" },
    { label: "已入库", value: "COMPLETED"  },
    { label: "已取消", value: "CANCELLED"  },
  ]},
];

export default function InboundPage() {
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [editing,       setEditing]       = useState<Row | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);
  const [confirmOpen,   setConfirmOpen]   = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<Row | null>(null);
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [approveOpen,   setApproveOpen]   = useState(false);
  const [typeFilter,    setTypeFilter]    = useState("");

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      // B5（packaging 同款）: task_no 是 wms_inbound 的 NOT NULL PK，必须前端生成
      const payload = editing?.id
        ? values
        : {
            ...values,
            task_no:    values.task_no    || ("INB-" + new Date().toISOString().slice(0,10).replace(/-/g,'') + "-" + Math.random().toString(36).slice(2,6).toUpperCase()),
            inbound_no: values.inbound_no || ("WI-"  + Date.now().toString().slice(-6)),
            status:     values.status     || "PENDING",
            date:       new Date().toISOString().slice(0, 10),
          };
      editing?.id
        ? await crudApi.update(TABLE, editing.id as number, payload)
        : await crudApi.create(TABLE, payload);
      setDrawerOpen(false); refresh();
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete   = useCallback((row: Row) => { setDeleteTarget(row); setConfirmOpen(true); }, []);
  const confirmDelete  = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  const handleApprove  = useCallback((row: Row) => { setApproveTarget(row); setApproveOpen(true); }, []);
  const confirmApprove = useCallback(async () => {
    if (!approveTarget?.id) return;
    await crudApi.update(TABLE, approveTarget.id as number, { status: "DONE" });
    setApproveOpen(false); refresh();
  }, [approveTarget, refresh]);

  const COLUMNS: Column<Row>[] = [
    { key: "inbound_no",     title: "入库单号",  width: 160 },
    { key: "type",           title: "入库类型",  width: 100,
      render: v => <span style={{ fontSize: 12, fontWeight: 600 }}>{SOURCE_LABEL[String(v)] ?? String(v ?? "—")}</span> },
    { key: "warehouse_code", title: "仓库",      width: 120 },
    { key: "item",           title: "品目",      width: 150 },
    { key: "qty",            title: "数量",      width: 80, align: "right",
      render: v => { const n = Number(v ?? 0); return <b className={n > 0 ? s.textSuccess : ""}>{n}</b>; } },
    { key: "status",         title: "状态",      width: 90, align: "center",
      // ✅ 使用 badge 全局类，深/浅色主题自动适配
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { cls: s.badgeNeutral, label: String(v ?? "—") };
        return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
      }},
    { key: "operator",       title: "操作员",    width: 90  },
    { key: "_actions",       title: "操作",      width: 140, align: "center",
      render: (_, row) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {/* ✅ 纯 CSS 类，无 inline 颜色覆盖 */}
          <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} onClick={() => openEdit(row)}>编辑</button>
          {isManager() && row.status === "PENDING" && (
            <button type="button" className={`${s.btnSuccess} ${s.btnSm}`} onClick={() => handleApprove(row)}>
              <CheckSquare size={11} />审核
            </button>
          )}
          {isManager() && (
            <button type="button" className={`${s.btnDanger} ${s.btnSm}`} onClick={() => handleDelete(row)}>删除</button>
          )}
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title="入库管理"
        subtitle="管理各类仓库入库单 · 审核 · 数据追踪（表：wms_inbound）"
        breadcrumb={["仓储管理", "入库管理"]}
        actions={
          <button type="button" className={s.btnPrimary} onClick={openNew}>
            <Plus size={14} />新建入库单
          </button>
        }
      />

      {/* ✅ 过滤标签 — 使用全局 tabPill / tabPillActive（深色主题自适应）*/}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {SOURCE_TYPES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`${s.tabPill} ${typeFilter === t ? s.tabPillActive : ""}`}
          >
            {t === "" ? "全部" : SOURCE_LABEL[t]}
          </button>
        ))}
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        params={typeFilter ? { type: typeFilter } as any : undefined}
        onNew={openNew}
        onEdit={openEdit as any}
        onDelete={handleDelete as any}
        showActions={false}
        refreshKey={refreshKey}
        emptyText="暂无入库记录"
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? "编辑入库单" : "新建入库单"} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title="确认删除" message="删除后不可恢复，确认继续？"
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog open={approveOpen} title="确认审核入库"
        message={`确认审核通过入库单「${approveTarget?.inbound_no ?? ""}」？状态将变更为【已入库】。`}
        onConfirm={confirmApprove} onCancel={() => setApproveOpen(false)} />
    </div>
  );
}
