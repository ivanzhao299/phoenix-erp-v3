"use client";
import { useState, useCallback } from "react";
import { crudApi } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { CrudForm, type FormField } from "@/components/ui/CrudForm";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: wms_transfer
// 字段: transfer_no, from_warehouse, to_warehouse, batch_no, qty, operator, reason, status, date
// V2 对应: StockTransfer.jsx (wms_stock_transfers) - 字段已对齐至 V3 schema

const TABLE = "wms_transfer";

type Row = Record<string, unknown>;

const getRole = () => {
  try { return JSON.parse(sessionStorage.getItem("phoenix_user") || "{}").role || ""; }
  catch { return ""; }
};
const isManager = () => ["ROLE_ADMIN", "ROLE_WMS_MGR"].includes(getRole());

export default function TransferPage() {
  const { t } = useLanguage();

  // ✅ 状态 → 全局 badge CSS 类
  const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
    PENDING:   { cls: s.badgeWarning, label: t("status.pending", "待确认") },
    DONE:      { cls: s.badgeSuccess, label: t("status.done", "已完成") },
    CANCELLED: { cls: s.badgeNeutral, label: t("status.cancelled", "已取消") },
  };

  const FIELDS: FormField[] = [
    { key: "transfer_no",    label: t("ui.调拨单号", "调拨单号"),  type: "text",   placeholder: t("ui.留空自动生成WT", "留空自动生成 WT-XXXXXX") },
    { key: "from_warehouse", label: t("ui.调出仓库", "调出仓库"),  type: "text",   required: true },
    { key: "to_warehouse",   label: t("ui.调入仓库", "调入仓库"),  type: "text",   required: true },
    { key: "batch_no",       label: t("ui.批次号", "批次号"),    type: "text"   },
    { key: "qty",            label: t("ui.调拨数量", "调拨数量"),  type: "number", required: true },
    { key: "reason",         label: t("ui.调拨原因", "调拨原因"),  type: "text"   },
    { key: "operator",       label: t("ui.经办人", "经办人"),    type: "text"   },
    { key: "status", label: t("common.status", "状态"), type: "select", options: [
      { label: t("status.pending", "待确认"), value: "PENDING"   },
      { label: t("status.done", "已完成"),    value: "DONE"      },
      { label: t("status.cancelled", "已取消"), value: "CANCELLED" },
    ]},
  ];

  const COLUMNS: Column<Row>[] = [
    { key: "transfer_no",    title: t("ui.调拨单号", "调拨单号"),  width: 160 },
    { key: "from_warehouse", title: t("ui.调出仓库", "调出仓库"),  width: 130 },
    { key: "to_warehouse",   title: t("ui.调入仓库", "调入仓库"),  width: 130 },
    { key: "batch_no",       title: t("ui.批次号", "批次号"),    width: 150 },
    { key: "qty",            title: t("ui.数量", "数量"),      width: 80, align: "right",
      render: v => <b>{String(v ?? 0)}</b> },
    { key: "reason",         title: t("ui.调拨原因", "调拨原因"),  width: 130 },
    { key: "operator",       title: t("ui.经办人", "经办人"),    width: 90  },
    { key: "status",         title: t("common.status", "状态"),      width: 90, align: "center",
      render: v => {
        const cfg = STATUS_BADGE[String(v)] ?? { cls: s.badgeNeutral, label: String(v ?? "—") };
        return <span className={`${s.badge} ${cfg.cls}`}>{cfg.label}</span>;
      }},
  ];

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Row | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [scanCode,     setScanCode]     = useState("");

  const refresh     = useCallback(() => setRefreshKey(k => k + 1), []);
  const openNew     = useCallback(() => { setEditing(null); setDrawerOpen(true); }, []);
  const openEdit    = useCallback((row: Row) => { setEditing(row); setDrawerOpen(true); }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleSave = useCallback(async (values: Row) => {
    setSaving(true);
    try {
      if (editing?.id) {
        // 已存在的单据走 CRUD 改字段（仅元信息编辑，不重新走库存事务）
        await crudApi.update(TABLE, editing.id as number, values);
      } else {
        // A4: 新建调拨 → 走 /api/inventory/transfer/confirm 原子端点
        //     源 batch FOR UPDATE 扣减 + 目标新 batch 增加 + 双向 inv_ledger 流水
        const token = typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") : "";
        const r = await fetch("/api/inventory/transfer/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            from_warehouse: values.from_warehouse,
            to_warehouse:   values.to_warehouse,
            transfer_no:    values.transfer_no || `WT-${Date.now().toString().slice(-6)}`,
            items: [{ batch_no: values.batch_no, qty: Number(values.qty || values.total_qty || 0) }],
            operator: values.operator,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.code !== 200) {
          throw new Error(j?.msg || `HTTP ${r.status}`);
        }
      }
      setDrawerOpen(false); refresh();
    } catch (e) {
      console.error("[transfer] confirm failed:", e);
      // 简单 alert，避免 dialog 引入；详细错误已 console.error
      if (typeof window !== "undefined") window.alert(`${t("ui.调拨失败", "调拨失败")}：${(e as Error).message}`);
    } finally { setSaving(false); }
  }, [editing, refresh]);

  const handleDelete  = useCallback((row: Row) => {
    if (!isManager()) { window.alert(t("ui.权限不足仅管理员可删除调拨单", "权限不足：仅管理员可删除调拨单")); return; }
    setDeleteTarget(row); setConfirmOpen(true);
  }, [t]);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id) return;
    await crudApi.delete(TABLE, deleteTarget.id as number);
    setConfirmOpen(false); refresh();
  }, [deleteTarget, refresh]);

  // 扫码确认调入（快速更新单号对应记录状态）
  const handleScan = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !scanCode.trim()) return;
    // 按照 transfer_no 查询并更新为 DONE
    const res = await crudApi.list(TABLE, { transfer_no: scanCode.trim(), limit: 1 } as any).catch(() => null);
    const record = (res as any)?.data?.[0] ?? (res as any)?.[0];
    if (record?.id) {
      await crudApi.update(TABLE, record.id as number, { status: "DONE" });
      refresh();
    }
    setScanCode("");
  }, [scanCode, refresh]);

  return (
    <div>
      <PageHeader
        title={t("ui.库存调拨", "库存调拨")}
        subtitle={t("ui.库区间及仓店间库存调拨管理", "库区间及仓店间库存调拨管理（表：wms_transfer）")}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.库存调拨", "库存调拨")]}
        actions={
          <button type="button" className={s.btnPrimary} onClick={openNew}>
            <Plus size={14} />{t("ui.新建调拨单", "新建调拨单")}
          </button>
        }
      />

      {/* KPI 汇总 + 扫码区 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 14, marginBottom: 20 }}>
        <div className={`${s.statCard} ${s.statCardWarning}`}>
          <div className={s.statLabel}>{t("ui.等待调入确认", "等待调入确认")}</div>
          <div className={`${s.statValue} ${s.textWarning}`} style={{ fontSize: 24 }}>—</div>
          <div className={s.statSub}>{t("status.pending", "待确认单")}</div>
        </div>
        <div className={`${s.statCard} ${s.statCardSuccess}`}>
          <div className={s.statLabel}>{t("ui.本月已完成", "本月已完成")}</div>
          <div className={`${s.statValue} ${s.textSuccess}`} style={{ fontSize: 24 }}>—</div>
          <div className={s.statSub}>{t("ui.已完成单", "已完成单")}</div>
        </div>
        <div className={s.card} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            📷 {t("ui.扫码快速确认调入", "扫码快速确认调入")}
          </div>
          <input
            value={scanCode}
            onChange={e => setScanCode(e.target.value)}
            onKeyDown={handleScan}
            placeholder={t("ui.扫描调拨单号按回车确认", "扫描调拨单号 → 按回车确认")}
            style={{
              flex: 1, padding: "9px 14px", borderRadius: 8, fontSize: 13,
              border: "1px solid var(--border)",
              background: "var(--bg-page)",
            }}
          />
        </div>
      </div>

      <DataTable
        table={TABLE}
        columns={COLUMNS}
        onNew={openNew}
        onEdit={openEdit}
        onDelete={handleDelete}
        showActions
        refreshKey={refreshKey}
        emptyText={t("ui.暂无调拨记录", "暂无调拨记录")}
        pageSize={30}
      />

      <RightDrawer open={drawerOpen} title={editing ? t("ui.编辑调拨单", "编辑调拨单") : t("ui.新建调拨单", "新建调拨单")} onClose={closeDrawer}>
        <CrudForm fields={FIELDS} initialValues={editing ?? {}} onSubmit={handleSave} onCancel={closeDrawer} loading={saving} />
      </RightDrawer>

      <ConfirmDialog open={confirmOpen} title={t("common.confirm", "确认删除")} message={t("ui.删除后不可恢复确认继续", "删除后不可恢复，确认继续？")}
        onConfirm={confirmDelete} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
}
