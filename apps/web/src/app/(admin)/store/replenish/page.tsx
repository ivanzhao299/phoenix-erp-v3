"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  SkuSelector,
  StoreMembershipSelector,
} from "@/components/shared-selectors/MasterDataSelectors";
import {
  DataTableV3,
  DrawerV2,
  ErrorState,
  FormField,
  ModalV2,
  PageShell,
  Panel,
  SelectField,
  StatusBadge,
} from "@/components/design-system";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import { storePosRequest } from "@/lib/store-pos-api";
import {
  localizedMasterName,
  masterNameWithCode,
} from "@/lib/localized-master-data";
import {
  allowedAction,
  positiveQuantity,
  receiveSummary,
  REPLENISHMENT_STATUSES,
  ReplenishmentLine,
  ReceiveInput,
  validateReceive,
} from "./replenishment";
import styles from "./replenish.module.css";

type Warehouse = {
  warehouseCode: string;
  warehouseName: string;
  warehouseNameZh?: string;
  warehouseNameEn?: string;
  warehouseNameLo?: string;
};
type Line = {
  id?: number;
  skuCode: string;
  skuName?: string;
  requestedQty: number;
  remark?: string;
};
type Row = {
  id: number;
  request_no: string;
  store_code: string;
  store_name: string;
  source_warehouse_code?: string;
  source_warehouse_name?: string;
  source_warehouse_name_zh?: string;
  source_warehouse_name_en?: string;
  source_warehouse_name_lo?: string;
  target_warehouse_code: string;
  target_warehouse_name?: string;
  target_warehouse_name_zh?: string;
  target_warehouse_name_en?: string;
  target_warehouse_name_lo?: string;
  status: string;
  urgency: string;
  transfer_no?: string;
  reason?: string;
  created_at?: string;
  submitted_at?: string;
  approved_at?: string;
  dispatched_at?: string;
  received_at?: string;
  closed_at?: string;
  lines: Line[];
};
type Item = {
  id: number;
  sku_code: string;
  sku_name?: string;
  sku_name_en?: string;
  sku_name_lo?: string;
  source_batch_no: string;
  expected_qty: number;
};
type Diff = {
  id: number;
  discrepancy_type: string;
  qty: number;
  resolved_at?: string;
  resolution_type?: string;
  resolution_ref?: string;
};
type Transfer = {
  transfer_no: string;
  status: string;
  from_warehouse: string;
  from_warehouse_name?: string;
  from_warehouse_name_zh?: string;
  from_warehouse_name_en?: string;
  from_warehouse_name_lo?: string;
  to_warehouse: string;
  to_warehouse_name?: string;
  to_warehouse_name_zh?: string;
  to_warehouse_name_en?: string;
  to_warehouse_name_lo?: string;
  items: Item[];
  discrepancies: Diff[];
};
type Mode = "new" | "detail" | "receive" | "resolve";
type Action = "submit" | "approve" | "dispatch";

export default function Page() {
  const perm = usePermission("MENU_STORE_REPLENISH"),
    { t, lang } = useLanguage(),
    toast = useToast(),
    tr = (k: string, z: string) => t(k, z);
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    store: "",
    source: "",
    date: "",
    no: "",
  });
  const [mode, setMode] = useState<Mode | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [detail, setDetail] = useState<Transfer | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState("");
  const [step, setStep] = useState(1),
    [store, setStore] = useState(""),
    [storeName, setStoreName] = useState(""),
    [source, setSource] = useState(""),
    [warehouses, setWarehouses] = useState<Warehouse[]>([]),
    [whBusy, setWhBusy] = useState(false),
    [whError, setWhError] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)),
    [urgency, setUrgency] = useState("NORMAL"),
    [reason, setReason] = useState(""),
    [lines, setLines] = useState<ReplenishmentLine[]>([]),
    [sku, setSku] = useState<any>(null),
    [qty, setQty] = useState("1"),
    [remark, setRemark] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<Action | null>(null),
    [approveSource, setApproveSource] = useState(""),
    [approveWhBusy, setApproveWhBusy] = useState(false),
    [approveWhError, setApproveWhError] = useState(""),
    [notice, setNotice] = useState(""),
    [highlight, setHighlight] = useState<number | null>(null);
  const [receiveMode, setReceiveMode] = useState<"all" | "batches">("all"),
    [receipts, setReceipts] = useState<ReceiveInput[]>([]),
    [resolutions, setResolutions] = useState<
      Record<number, { type: "LOSS" | "ADJUSTMENT"; ref: string }>
    >({});
  const seq = useRef(0);
  const labels: Record<string, string> = {
    DRAFT: tr("store.replenish.status.draft", "草稿"),
    SUBMITTED: tr("store.replenish.status.submitted", "待审批"),
    APPROVED: tr("store.replenish.status.approved", "待发运"),
    DISPATCHED: tr("store.replenish.status.dispatched", "在途"),
    RECEIVED: tr("store.replenish.status.received", "差异待确认"),
    CLOSED: tr("store.replenish.status.closed", "已关闭"),
    REJECTED: tr("store.replenish.status.rejected", "已驳回"),
    CANCELLED: tr("store.replenish.status.cancelled", "已取消"),
  };
  const warehouseLabel = (w: Warehouse) =>
    masterNameWithCode(
      localizedMasterName(w as Record<string, unknown>, "warehouseName", lang),
      w.warehouseCode,
    );
  const rowWarehouseLabel = (r: Row, side: "source" | "target") => {
    const code = r[`${side}_warehouse_code`];
    if (!code) return tr("store.replenish.source.pending", "待审批指定");
    return masterNameWithCode(
      localizedMasterName(r, `${side}_warehouse_name`, lang),
      code,
    );
  };
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const x = await storePosRequest<Row[]>(
        "GET",
        "/api/v2/store-replenishments",
      );
      setRows(Array.isArray(x) ? x : []);
    } catch (e: any) {
      setLoadError(
        e?.message || tr("store.replenish.list.error", "请检查网络后重试。"),
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (perm.canView) void load();
    else setLoading(false);
  }, [perm.canView, load]);
  useEffect(() => {
    const n = ++seq.current;
    setSource("");
    setWarehouses([]);
    setWhError("");
    if (!store) return;
    setWhBusy(true);
    void storePosRequest<Warehouse[]>(
      "GET",
      `/api/v2/store-replenishments/source-warehouses?storeCode=${encodeURIComponent(store)}`,
    )
      .then((x) => {
        if (n === seq.current) setWarehouses(x || []);
      })
      .catch((e: any) => {
        if (n === seq.current)
          setWhError(
            e?.message ||
              tr("store.replenish.warehouse.error", "源仓加载失败，请重试。"),
          );
      })
      .finally(() => {
        if (n === seq.current) setWhBusy(false);
      });
  }, [store]);
  const view = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!filters.status || r.status === filters.status) &&
          (!filters.store || r.store_code.includes(filters.store)) &&
          (!filters.source ||
            (r.source_warehouse_code || "").includes(filters.source)) &&
          (!filters.date ||
            (r.created_at || "").slice(0, 10) === filters.date) &&
          (!filters.no ||
            r.request_no.toLowerCase().includes(filters.no.toLowerCase())),
      ),
    [rows, filters],
  );
  const stats = useMemo(
    () =>
      Object.fromEntries(
        ["DRAFT", "SUBMITTED", "APPROVED", "DISPATCHED", "RECEIVED"].map(
          (s) => [s, rows.filter((r) => r.status === s).length],
        ),
      ),
    [rows],
  );
  const reset = () => {
    setStep(1);
    setStore("");
    setSource("");
    setLines([]);
    setSku(null);
    setQty("1");
    setRemark("");
    setReason("");
    setErrors({});
    setMode("new");
  };
  const closeDrawer = () => {
    if (
      mode === "new" &&
      (store || lines.length || reason) &&
      !window.confirm(
        tr("store.replenish.discard.confirm", "放弃本次未保存内容？"),
      )
    )
      return;
    setMode(null);
    setSelected(null);
    setDetail(null);
  };
  const add = () => {
    const n = positiveQuantity(qty),
      code = sku?.value || sku?.raw?.sku_code;
    if (!code || n === null) {
      setErrors({
        sku: !code
          ? tr("store.replenish.validation.sku", "请选择商品 SKU")
          : "",
        qty:
          n === null
            ? tr("store.replenish.validation.qty", "请输入大于 0 的有效数量")
            : "",
      });
      return;
    }
    const old = lines.find((x) => x.skuCode === code);
    if (
      old &&
      !window.confirm(
        tr(
          "store.replenish.duplicate.confirm",
          "该 SKU 已存在，是否合并数量？",
        ),
      )
    )
      return;
    setLines((x) =>
      old
        ? x.map((v) =>
            v.skuCode === code
              ? { ...v, qty: v.qty + n, remark: v.remark || remark }
              : v,
          )
        : [
            ...x,
            {
              skuCode: code,
              skuName: sku.label || sku.raw?.sku_name || code,
              qty: n,
              remark: remark || undefined,
            },
          ],
    );
    setSku(null);
    setQty("1");
    setRemark("");
    setErrors({});
  };
  const next = () => {
    if (step === 1 && !store)
      return setErrors({
        store: tr("store.replenish.validation.store", "请选择目标门店"),
      });
    if (step === 2 && !lines.length)
      return setErrors({
        lines: tr("store.replenish.validation.lines", "请至少添加一个商品"),
      });
    setErrors({});
    setStep((x) => x + 1);
  };
  const create = async (submit: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await storePosRequest<Row>(
        "POST",
        "/api/v2/store-replenishments",
        {
          storeCode: store,
          sourceWarehouseCode: source || undefined,
          requestedDate: date,
          urgency,
          reason: reason || undefined,
          lines,
        },
      );
      setHighlight(r.id);
      if (submit) {
        try {
          await storePosRequest(
            "POST",
            `/api/v2/store-replenishments/${r.id}/submit`,
          );
          toast.success(
            tr("store.replenish.submit.success", "申请已提交，等待仓管审批"),
          );
          setNotice(
            tr(
              "store.replenish.create.submitSuccess",
              "申请 {requestNo} 已保存并提交",
            ).replace("{requestNo}", r.request_no),
          );
        } catch {
          const m = tr(
            "store.replenish.create.partial",
            "草稿 {requestNo} 已保存，提交失败，可在列表重试",
          ).replace("{requestNo}", r.request_no);
          setNotice(m);
          toast.warning(m);
        }
      } else {
        const m = tr(
          "store.replenish.create.success",
          "草稿已保存：{requestNo}",
        ).replace("{requestNo}", r.request_no);
        setNotice(m);
        toast.success(m);
      }
      await load();
      setMode(null);
    } catch (e: any) {
      const m =
        e?.message ||
        tr("store.replenish.create.failed", "草稿未保存，已保留当前内容。");
      setNotice(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  };
  const open = async (r: Row, m: Mode = "detail") => {
    setSelected(r);
    setMode(m);
    setDetail(null);
    setDetailError("");
    if (!r.transfer_no) return;
    setDetailBusy(true);
    try {
      const d = await storePosRequest<Transfer>(
        "GET",
        `/api/v2/store-replenishments/${r.id}/transfer`,
      );
      setDetail(d);
      if (m === "receive")
        setReceipts(
          (d.items || []).map((x) => ({
            batchNo: x.source_batch_no,
            expected: Number(x.expected_qty),
            received: String(x.expected_qty),
            damaged: "0",
            note: "",
          })),
        );
      if (m === "resolve")
        setResolutions(
          Object.fromEntries(
            (d.discrepancies || [])
              .filter((x) => !x.resolved_at)
              .map((x) => [x.id, { type: "LOSS", ref: "" }]),
          ),
        );
    } catch (e: any) {
      setDetailError(
        e?.message || tr("store.replenish.detail.failed", "调拨详情加载失败。"),
      );
    } finally {
      setDetailBusy(false);
    }
  };
  const choose = (r: Row) => {
    const a = allowedAction(r.status, perm);
    setSelected(r);
    if (a === "receive" || a === "close")
      void open(r, a === "receive" ? "receive" : "resolve");
    else if (a) {
      setApproveSource(r.source_warehouse_code || "");
      if (a === "approve") {
        setWarehouses([]);
        setApproveWhError("");
        setApproveWhBusy(true);
        void storePosRequest<Warehouse[]>(
          "GET",
          `/api/v2/store-replenishments/source-warehouses?storeCode=${encodeURIComponent(r.store_code)}`,
        )
          .then((x) => setWarehouses(x || []))
          .catch((e: any) => {
            const message =
              e?.message ||
              tr("store.replenish.warehouse.error", "源仓加载失败，请重试。");
            setApproveWhError(message);
            toast.error(message);
          })
          .finally(() => setApproveWhBusy(false));
      }
      setConfirm(a as Action);
    }
  };
  const act = async () => {
    if (!selected || !confirm || busy) return;
    setBusy(true);
    try {
      if (confirm === "approve" && !approveSource)
        throw new Error(
          tr("store.replenish.validation.source", "审批必须选择调出仓库"),
        );
      await storePosRequest(
        "POST",
        `/api/v2/store-replenishments/${selected.id}/${confirm}`,
        confirm === "approve"
          ? { sourceWarehouseCode: approveSource }
          : undefined,
      );
      toast.success(
        confirm === "submit"
          ? tr("store.replenish.submit.success", "申请已提交，等待仓管审批")
          : confirm === "approve"
            ? tr("store.replenish.approve.success", "审批通过，已创建调拨单")
            : tr("store.replenish.dispatch.success", "已发运，门店可进行签收"),
      );
      setConfirm(null);
      setMode(null);
      await load();
    } catch (e: any) {
      toast.error(
        e?.message ||
          tr("store.replenish.action.failed", "操作失败，输入已保留。"),
      );
    } finally {
      setBusy(false);
    }
  };
  const receive = async () => {
    if (!selected || busy) return;
    const invalid = receiveMode === "batches" && receipts.find(validateReceive);
    if (invalid)
      return toast.error(
        tr(
          "store.replenish.receive.invalid",
          "实收和破损必须为有效非负数，且合计不能超过应收",
        ),
      );
    setBusy(true);
    try {
      await storePosRequest(
        "POST",
        `/api/v2/store-replenishments/${selected.id}/receive`,
        receiveMode === "all"
          ? { receive_all: true }
          : {
              items: receipts.map((x) => ({
                batch_no: x.batchNo,
                received_qty: Number(x.received),
                damaged_qty: Number(x.damaged),
                note: x.note || undefined,
              })),
            },
      );
      toast.success(
        tr("store.replenish.receive.success", "签收成功，差异已实时汇总"),
      );
      setMode(null);
      await load();
    } catch (e: any) {
      toast.error(
        e?.message ||
          tr("store.replenish.action.failed", "操作失败，输入已保留。"),
      );
    } finally {
      setBusy(false);
    }
  };
  const resolve = async () => {
    if (!selected || !detail || busy) return;
    const pending = detail.discrepancies.filter((x) => !x.resolved_at);
    if (pending.some((x) => !resolutions[x.id]?.ref.trim()))
      return toast.error(
        tr(
          "store.replenish.resolve.required",
          "每条差异都必须关联真实报损或调整单号",
        ),
      );
    setBusy(true);
    try {
      await storePosRequest(
        "POST",
        `/api/v2/store-replenishments/${selected.id}/close`,
        {
          resolutions: pending.map((x) => ({
            id: x.id,
            resolution_type: resolutions[x.id].type,
            resolution_ref: resolutions[x.id].ref.trim(),
          })),
        },
      );
      toast.success(
        tr("store.replenish.resolve.success", "差异已全部解决，申请已关闭"),
      );
      setMode(null);
      await load();
    } catch (e: any) {
      toast.error(
        e?.message ||
          tr("store.replenish.action.failed", "操作失败，输入已保留。"),
      );
    } finally {
      setBusy(false);
    }
  };
  const columns: any[] = [
    {
      key: "request_no",
      title: tr("store.replenish.column.no", "申请号"),
      render: (r: Row) => (
        <Button variant="link" size="sm" onClick={() => void open(r)}>
          {r.request_no}
        </Button>
      ),
    },
    {
      key: "store",
      title: tr("store.replenish.column.store", "门店"),
      render: (r: Row) => (
        <>
          {r.store_name}
          <div className={styles.muted}>{r.store_code}</div>
        </>
      ),
    },
    {
      key: "route",
      title: tr("store.replenish.column.route", "源仓 → 门店仓"),
      render: (r: Row) => (
        <>
          {rowWarehouseLabel(r, "source")} → {rowWarehouseLabel(r, "target")}
        </>
      ),
    },
    {
      key: "status",
      title: tr("store.replenish.column.status", "状态"),
      render: (r: Row) => (
        <StatusBadge
          status={r.status}
          label={labels[r.status] || tr("store.replenish.status.unknown", "未知状态")}
        />
      ),
    },
    {
      key: "skus",
      title: tr("store.replenish.column.skus", "SKU 数"),
      render: (r: Row) => r.lines.length,
    },
    {
      key: "qty",
      title: tr("store.replenish.column.quantity", "申请数量"),
      render: (r: Row) =>
        r.lines.reduce((n, x) => n + Number(x.requestedQty), 0),
    },
    {
      key: "created_at",
      title: tr("store.replenish.column.time", "时间"),
      type: "date",
    },
    {
      key: "op",
      title: tr("store.replenish.column.actions", "操作"),
      render: (r: Row) => (
        <div className={styles.actions}>
          <Button size="xs" variant="outline" onClick={() => void open(r)}>
            {tr("store.replenish.action.view", "查看详情")}
          </Button>
          {allowedAction(r.status, perm) && (
            <Button size="xs" onClick={() => choose(r)}>
              {tr(
                `store.replenish.action.${allowedAction(r.status, perm)}`,
                (
                  {
                    submit: "提交",
                    approve: "审批",
                    dispatch: "发运",
                    receive: "签收",
                    close: "关闭",
                  } as any
                )[allowedAction(r.status, perm)!],
              )}
            </Button>
          )}
        </div>
      ),
    },
  ];
  if (!perm.canView)
    return (
      <PageShell title={tr("store.replenish.title", "门店补货编排")}>
        <ErrorState
          title={tr(
            "store.replenish.forbidden",
            "你没有查看此页面的权限，请联系管理员。",
          )}
        />
      </PageShell>
    );
  return (
    <PageShell
      maxWidth={1680}
      title={tr("store.replenish.title", "门店补货编排")}
      subtitle={tr(
        "store.replenish.subtitle",
        "店长申请/签收/差异确认；仓管审批/发运。库存只经 WMS 调拨状态机。",
      )}
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/warehouse/transfer">
              {tr("store.replenish.transferDesk", "仓储调拨台")}
            </Link>
          </Button>
          {perm.canCreate && (
            <Button onClick={reset}>
              {tr("store.replenish.new", "新建补货申请")}
            </Button>
          )}
        </>
      }
    >
      {notice && (
        <div role="alert" className={styles.alert}>
          {notice}
        </div>
      )}
      <div className={styles.stats}>
        {["DRAFT", "SUBMITTED", "APPROVED", "DISPATCHED", "RECEIVED"].map(
          (s) => (
            <Button
              key={s}
              variant="outline"
              className={styles.stat}
              onClick={() => setFilters((x) => ({ ...x, status: s }))}
            >
              <span>{labels[s]}</span>
              <strong>{stats[s] || 0}</strong>
            </Button>
          ),
        )}
      </div>
      <Panel
        title={tr("store.replenish.list.title", "申请列表")}
        extra={
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            {tr("store.replenish.refresh", "刷新")}
          </Button>
        }
      >
        <Filters value={filters} set={setFilters} labels={labels} tr={tr} />
        {loadError ? (
          <ErrorState
            title={tr("store.replenish.list.failed", "补货申请加载失败")}
            message={loadError}
            onRetry={() => void load()}
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <DataTableV3
                rows={view}
                columns={columns}
                loading={loading}
                rowKey={(r) => r.id}
                emptyText={
                  rows.length
                    ? tr(
                        "store.replenish.empty.filtered",
                        "没有符合筛选条件的申请",
                      )
                    : tr("store.replenish.empty.none", "暂无补货申请")
                }
              />
            </div>
            <div className={styles.mobileCards}>
              {view.map((r) => (
                <article
                  key={r.id}
                  data-request-id={r.id}
                  className={`${styles.mobileCard} ${r.id === highlight ? styles.highlight : ""}`}
                >
                  <div className={styles.lineHead}>
                    <Button variant="link" onClick={() => void open(r)}>
                      {r.request_no}
                    </Button>
                    <StatusBadge status={r.status} label={labels[r.status]} />
                  </div>
                  <p>
                    {r.store_name} · {r.store_code}
                  </p>
                  <p className={styles.muted}>
                    {rowWarehouseLabel(r, "source")} → {rowWarehouseLabel(r, "target")} · {r.lines.length} SKU
                  </p>
                  <div className={styles.actions}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void open(r)}
                    >
                      {tr("store.replenish.action.view", "查看详情")}
                    </Button>
                    {allowedAction(r.status, perm) && (
                      <Button size="sm" onClick={() => choose(r)}>
                        {tr(
                          `store.replenish.action.${allowedAction(r.status, perm)}`,
                          (
                            {
                              submit: "提交",
                              approve: "审批",
                              dispatch: "发运",
                              receive: "签收",
                              close: "关闭",
                            } as any
                          )[allowedAction(r.status, perm)!],
                        )}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </Panel>
      <DrawerV2
        open={!!mode}
        onClose={closeDrawer}
        closeOnBackdrop={false}
        width={760}
        title={
          mode === "new"
            ? tr("store.replenish.new", "新建补货申请")
            : selected?.request_no
        }
        footer={
          mode === "new" ? (
            <div className={styles.sticky}>
              <Button variant="outline" onClick={closeDrawer}>
                {tr("store.replenish.cancel", "取消")}
              </Button>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((x) => x - 1)}>
                  {tr("store.replenish.previous", "上一步")}
                </Button>
              )}
              {step < 3 ? (
                <Button onClick={next}>
                  {tr("store.replenish.next", "下一步")}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void create(false)}
                  >
                    {busy
                      ? tr("store.replenish.saving", "正在保存草稿…")
                      : tr("store.replenish.saveDraft", "保存草稿")}
                  </Button>
                  <Button disabled={busy} onClick={() => void create(true)}>
                    {busy
                      ? tr("store.replenish.submitting", "正在提交…")
                      : tr("store.replenish.saveSubmit", "保存草稿并提交")}
                  </Button>
                </>
              )}
            </div>
          ) : undefined
        }
      >
        {mode === "new" ? (
          <Wizard
            step={step}
            store={store}
            storeName={storeName}
            setStore={(v: string) => {
              setStore(v);
              setLines([]);
            }}
            setStoreName={setStoreName}
            source={source}
            setSource={setSource}
            warehouses={warehouses}
            whBusy={whBusy}
            whError={whError}
            date={date}
            setDate={setDate}
            urgency={urgency}
            setUrgency={setUrgency}
            reason={reason}
            setReason={setReason}
            lines={lines}
            setLines={setLines}
            sku={sku}
            setSku={setSku}
            qty={qty}
            setQty={setQty}
            remark={remark}
            setRemark={setRemark}
            errors={errors}
            add={add}
            tr={tr}
            lang={lang}
          />
        ) : (
          <Details
            row={selected}
            detail={detail}
            busy={detailBusy}
            error={detailError}
            labels={labels}
            retry={() => selected && void open(selected, mode || "detail")}
            tr={tr}
            lang={lang}
          />
        )}
        {mode === "detail" && selected && (
          <div className={styles.sticky}>
            <Button variant="outline" onClick={closeDrawer}>
              {tr("store.replenish.closeDrawer", "关闭")}
            </Button>
            {allowedAction(selected.status, perm) && (
              <Button onClick={() => choose(selected)}>
                {tr(
                  `store.replenish.action.${allowedAction(selected.status, perm)}`,
                  (
                    {
                      submit: "提交",
                      approve: "审批",
                      dispatch: "发运",
                      receive: "签收",
                      close: "关闭",
                    } as any
                  )[allowedAction(selected.status, perm)!],
                )}
              </Button>
            )}
          </div>
        )}
        {mode === "receive" && detail && (
          <ReceiptForm
            values={receipts}
            set={setReceipts}
            mode={receiveMode}
            setMode={setReceiveMode}
            tr={tr}
          />
        )}{" "}
        {mode === "receive" && (
          <div className={styles.sticky}>
            <Button variant="outline" onClick={() => setMode("detail")}>
              {tr("store.replenish.cancel", "取消")}
            </Button>
            <Button
              disabled={busy || detailBusy}
              onClick={() => void receive()}
            >
              {busy
                ? tr("store.replenish.receiving", "正在签收…")
                : tr("store.replenish.receive.confirm", "确认签收")}
            </Button>
          </div>
        )}
        {mode === "resolve" && detail && (
          <ResolutionForm
            detail={detail}
            value={resolutions}
            set={setResolutions}
            tr={tr}
          />
        )}{" "}
        {mode === "resolve" && (
          <div className={styles.sticky}>
            <Button asChild variant="outline">
              <Link href="/warehouse/loss-report">
                {tr("store.replenish.loss.navigate", "前往报损页")}
              </Link>
            </Button>
            <Button
              disabled={busy || detailBusy}
              onClick={() => void resolve()}
            >
              {busy
                ? tr("store.replenish.closing", "正在关闭…")
                : tr("store.replenish.resolve.close", "确认差异并关闭")}
            </Button>
          </div>
        )}
      </DrawerV2>
      <ModalV2
        open={!!confirm}
        onClose={() => !busy && setConfirm(null)}
        title={
          confirm
            ? tr(
                `store.replenish.confirm.${confirm}`,
                (
                  {
                    submit: "确认提交申请",
                    approve: "确认审批并创建调拨",
                    dispatch: "确认发运",
                  } as any
                )[confirm],
              )
            : ""
        }
        footer={
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {tr("store.replenish.cancel", "取消")}
            </Button>
            <Button disabled={busy} onClick={() => void act()}>
              {busy
                ? tr("store.replenish.processing", "处理中…")
                : tr("store.replenish.confirmAction", "确认")}
            </Button>
          </>
        }
      >
        <p>
          {selected?.request_no} · {selected?.store_name} ·{" "}
          {selected?.lines.length} SKU
        </p>
        {confirm === "approve" && (
          <FormField
            label={tr("store.replenish.field.source", "调出仓库")}
            required
            error={
              approveWhError || (!approveSource
                ? tr(
                    "store.replenish.validation.source",
                    "审批必须选择调出仓库",
                  )
                : undefined)
            }
          >
            <select
              className={styles.fieldInput}
              value={approveSource}
              disabled={approveWhBusy}
              onChange={(e) => setApproveSource(e.target.value)}
            >
              <option value="">
                {approveWhBusy
                  ? tr("store.replenish.warehouse.loading", "正在加载可用源仓…")
                  : !approveWhError && warehouses.length === 0
                    ? tr("store.replenish.warehouse.empty", "当前门店没有可选源仓")
                    : tr("store.replenish.placeholder.source", "请选择调出仓库")}
              </option>
              {warehouses.map((w) => (
                <option key={w.warehouseCode} value={w.warehouseCode}>
                  {warehouseLabel(w)}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <p className={styles.muted}>
          {confirm === "approve"
            ? tr(
                "store.replenish.approve.inventory",
                "审批将按 AVAILABLE 批次及到期日校验库存。",
              )
            : tr(
                "store.replenish.confirm.irreversible",
                "操作后将进入下一流程状态。",
              )}
        </p>
      </ModalV2>
    </PageShell>
  );
}

function Filters({ value, set, labels, tr }: any) {
  return (
    <div className={styles.filters}>
      <FormField label={tr("store.replenish.filter.status", "状态")}>
        <SelectField
          value={value.status}
          onChange={(v: string) => set({ ...value, status: v })}
          options={REPLENISHMENT_STATUSES.map((x) => ({
            value: x,
            label: labels[x],
          }))}
          emptyLabel={tr("store.replenish.filter.all", "全部状态")}
        />
      </FormField>
      {[
        ["store", "门店编码"],
        ["source", "源仓编码"],
        ["no", "申请号"],
      ].map(([k, z]) => (
        <FormField key={k} label={tr(`store.replenish.filter.${k}`, z)}>
          <input
            className={styles.fieldInput}
            value={value[k]}
            onChange={(e) => set({ ...value, [k]: e.target.value })}
            placeholder={tr(`store.replenish.filter.${k}Placeholder`, z)}
          />
        </FormField>
      ))}
      <FormField label={tr("store.replenish.filter.date", "创建日期")}>
        <input
          className={styles.fieldInput}
          type="date"
          value={value.date}
          onChange={(e) => set({ ...value, date: e.target.value })}
        />
      </FormField>
    </div>
  );
}
function Wizard(p: any) {
  const { tr, lang } = p;
  const source = p.warehouses.find((w: Warehouse) => w.warehouseCode === p.source);
  const sourceLabel = source
    ? masterNameWithCode(localizedMasterName(source, "warehouseName", lang), source.warehouseCode)
    : tr("store.replenish.source.pending", "待审批指定");
  return (
    <>
      <div className={styles.steps}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`${styles.step} ${p.step === n ? styles.active : ""}`}
          >
            {n}.{" "}
            {
              [
                tr("store.replenish.step.store", "门店与源仓"),
                tr("store.replenish.step.items", "商品行"),
                tr("store.replenish.step.confirm", "确认提交"),
              ][n - 1]
            }
          </span>
        ))}
      </div>
      {p.step === 1 && (
        <div className={styles.grid2}>
          <FormField
            label={tr("store.replenish.field.store", "目标门店")}
            required
            hint={tr(
              "store.replenish.hint.store",
              "变更门店会清空源仓和商品参考数据",
            )}
            error={p.errors.store}
          >
            <StoreMembershipSelector
              value={p.store}
              onChange={p.setStore}
              onPick={(opt) => p.setStoreName(opt?.label || "")}
              placeholder={tr(
                "store.replenish.placeholder.store",
                "请选择需要补货的门店",
              )}
            />
          </FormField>
          <FormField
            label={tr("store.replenish.field.source", "调出仓库")}
            hint={tr(
              "store.replenish.hint.source",
              "可暂不选择，由仓管审批时指定",
            )}
            error={p.whError}
          >
            <select
              className={styles.fieldInput}
              value={p.source}
              disabled={!p.store || p.whBusy}
              onChange={(e) => p.setSource(e.target.value)}
            >
              <option value="">
                {p.whBusy
                  ? tr("store.replenish.warehouse.loading", "正在加载可用源仓…")
                  : p.warehouses.length
                    ? tr("store.replenish.placeholder.source", "请选择调出仓库")
                    : tr(
                        "store.replenish.warehouse.empty",
                        "当前门店没有可选源仓，可保存草稿并由仓管审批时处理。",
                      )}
              </option>
              {p.warehouses.map((w: Warehouse) => (
                <option key={w.warehouseCode} value={w.warehouseCode}>
                  {masterNameWithCode(
                    localizedMasterName(w, "warehouseName", lang),
                    w.warehouseCode,
                  )}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={tr("store.replenish.field.date", "申请日期")}>
            <input
              className={styles.fieldInput}
              type="date"
              value={p.date}
              onChange={(e) => p.setDate(e.target.value)}
            />
          </FormField>
          <FormField
            label={tr("store.replenish.field.urgency", "紧急程度")}
            hint={tr(
              "store.replenish.hint.urgency",
              "紧急仅用于排序提示，不跳过审批",
            )}
          >
            <SelectField
              value={p.urgency}
              onChange={p.setUrgency}
              allowEmpty={false}
              options={[
                {
                  value: "NORMAL",
                  label: tr("store.replenish.urgency.normal", "普通"),
                },
                {
                  value: "URGENT",
                  label: tr("store.replenish.urgency.urgent", "紧急"),
                },
              ]}
            />
          </FormField>
          <FormField
            label={tr("store.replenish.field.reason", "补货原因/备注")}
            hint={`${p.reason.length}/500`}
          >
            <textarea
              className={styles.fieldInput}
              maxLength={500}
              value={p.reason}
              onChange={(e) => p.setReason(e.target.value)}
              placeholder={tr(
                "store.replenish.placeholder.reason",
                "如：周末促销备货，预计销量…",
              )}
            />
          </FormField>
        </div>
      )}
      {p.step === 2 && (
        <>
          <div className={styles.grid3}>
            <FormField
              label={tr("store.replenish.field.sku", "商品 SKU")}
              required
              error={p.errors.sku}
            >
              <SkuSelector
                value={p.sku?.value || ""}
                onChange={() => {}}
                onPick={p.setSku}
                placeholder={tr(
                  "store.replenish.placeholder.sku",
                  "搜索 SKU 编码或名称",
                )}
              />
            </FormField>
            <FormField
              label={tr("store.replenish.field.qty", "申请数量")}
              required
              error={p.errors.qty}
            >
              <input
                className={styles.fieldInput}
                type="number"
                min="0.001"
                step="0.001"
                value={p.qty}
                onChange={(e) => p.setQty(e.target.value)}
                placeholder={tr(
                  "store.replenish.placeholder.qty",
                  "请输入正数",
                )}
              />
            </FormField>
            <FormField label={tr("store.replenish.field.lineRemark", "行备注")}>
              <input
                className={styles.fieldInput}
                value={p.remark}
                onChange={(e) => p.setRemark(e.target.value)}
                placeholder={tr(
                  "store.replenish.placeholder.lineRemark",
                  "选填",
                )}
              />
            </FormField>
          </div>
          <p className={styles.muted}>
            {tr(
              "store.replenish.inventory.unavailable",
              "暂无库存参考，审批时校验源仓库存",
            )}
          </p>
          <Button onClick={p.add}>
            {tr("store.replenish.addSku", "添加商品")}
          </Button>
          {p.errors.lines && <p role="alert">{p.errors.lines}</p>}
          {p.lines.map((l: ReplenishmentLine, i: number) => (
            <div className={styles.line} key={l.skuCode}>
              <div className={styles.lineHead}>
                <span>
                  {l.skuName}
                  <span className={styles.muted}> · {l.skuCode}</span>
                </span>
                <strong>× {l.qty}</strong>
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() =>
                    p.setLines((x: ReplenishmentLine[]) =>
                      x.filter((_, n) => n !== i),
                    )
                  }
                >
                  {tr("store.replenish.remove", "删除")}
                </Button>
              </div>
              {l.remark && <p className={styles.muted}>{l.remark}</p>}
            </div>
          ))}
          <div className={styles.summary}>
            {tr("store.replenish.summary.items", "{count} 种 SKU").replace(
              "{count}",
              String(p.lines.length),
            )}
            <strong>
              {tr("store.replenish.summary.qty", "申请总数：{qty}").replace(
                "{qty}",
                String(
                  p.lines.reduce(
                    (n: number, x: ReplenishmentLine) => n + x.qty,
                    0,
                  ),
                ),
              )}
            </strong>
          </div>
        </>
      )}
      {p.step === 3 && (
        <>
          <Panel title={tr("store.replenish.confirm.store", "门店与仓库")}>
            <p>
              {p.storeName || p.store} · {sourceLabel}
            </p>
            <p>
              {p.date} ·{" "}
              {p.urgency === "URGENT"
                ? tr("store.replenish.urgency.urgent", "紧急")
                : tr("store.replenish.urgency.normal", "普通")}
            </p>
          </Panel>
          <Panel title={tr("store.replenish.confirm.items", "商品汇总")}>
            {p.lines.map((l: ReplenishmentLine) => (
              <p key={l.skuCode}>
                {l.skuName} ({l.skuCode}) × {l.qty}
              </p>
            ))}
          </Panel>
          <Panel title={tr("store.replenish.confirm.info", "申请信息")}>
            <p>{p.reason || "—"}</p>
          </Panel>
        </>
      )}
    </>
  );
}
function Details({ row, detail, busy, error, labels, retry, tr, lang }: any) {
  if (!row) return null;
  const namedWarehouse = (value: any, base: string, code: string) =>
    masterNameWithCode(localizedMasterName(value, base, lang), code);
  const discrepancyLabel = (code: string) =>
    ({
      SHORTAGE: tr("store.replenish.discrepancy.shortage", "短收"),
      DAMAGE: tr("store.replenish.discrepancy.damage", "破损"),
    })[code] || tr("store.replenish.discrepancy.unknown", "未知差异");
  const resolutionLabel = (code?: string) =>
    code === "LOSS"
      ? tr("store.replenish.resolution.loss", "报损")
      : code === "ADJUSTMENT"
        ? tr("store.replenish.resolution.adjustment", "库存调整")
        : tr("store.replenish.pending", "待处理");
  return (
    <>
      <div className={styles.grid2}>
        <Panel title={tr("store.replenish.detail.request", "申请信息")}>
          <StatusBadge status={row.status} label={labels[row.status]} />
          <p>
            {row.store_name} ({row.store_code})
          </p>
          <p>
            {row.source_warehouse_code
              ? namedWarehouse(row, "source_warehouse_name", row.source_warehouse_code)
              : tr("store.replenish.source.pending", "待审批指定")}{" "}
            → {namedWarehouse(row, "target_warehouse_name", row.target_warehouse_code)}
          </p>
          <p>{row.reason || "—"}</p>
        </Panel>
        <Panel title={tr("store.replenish.detail.timeline", "状态时间轴")}>
          <div className={styles.timeline}>
            {[
              ["created_at", "DRAFT"],
              ["submitted_at", "SUBMITTED"],
              ["approved_at", "APPROVED"],
              ["dispatched_at", "DISPATCHED"],
              ["received_at", "RECEIVED"],
              ["closed_at", "CLOSED"],
            ]
              .filter(([k]) => row[k])
              .map(([k, s]) => (
                <div key={k}>
                  <strong>{labels[s]}</strong>
                  <br />
                  <span className={styles.muted}>{String(row[k])}</span>
                </div>
              ))}
          </div>
        </Panel>
      </div>
      <Panel title={tr("store.replenish.detail.lines", "商品明细")}>
        {row.lines.map((x: Line) => (
          <p key={x.id || x.skuCode}>
            {x.skuName || x.skuCode} ({x.skuCode}) × {x.requestedQty}
          </p>
        ))}
      </Panel>
      {busy ? (
        <p>{tr("store.replenish.detail.loading", "正在加载调拨详情…")}</p>
      ) : error ? (
        <ErrorState
          compact
          title={tr("store.replenish.detail.failed", "调拨详情加载失败。")}
          message={error}
          onRetry={retry}
        />
      ) : !row.transfer_no ? (
        <p>{tr("store.replenish.detail.noTransfer", "尚未生成调拨单。")}</p>
      ) : detail ? (
        <>
          <Panel
            title={`${tr("store.replenish.detail.transfer", "调拨详情")} · ${detail.transfer_no}`}
          >
            <p>
              {namedWarehouse(detail, "from_warehouse_name", detail.from_warehouse)} →{" "}
              {namedWarehouse(detail, "to_warehouse_name", detail.to_warehouse)} ·{" "}
              {labels[detail.status] || detail.status}
            </p>
            {detail.items.map((x: Item) => (
              <p key={x.id}>
                {masterNameWithCode(localizedMasterName(x, "sku_name", lang), x.sku_code)} ·{" "}
                {x.source_batch_no} · {x.expected_qty}
              </p>
            ))}
          </Panel>
          <Panel title={tr("store.replenish.detail.discrepancies", "差异详情")}>
            {detail.discrepancies.length ? (
              detail.discrepancies.map((x: Diff) => (
                <p key={x.id}>
                  #{x.id} · {discrepancyLabel(x.discrepancy_type)} · {x.qty} ·{" "}
                  {resolutionLabel(x.resolution_type)}{" "}
                  {x.resolution_ref || ""}
                </p>
              ))
            ) : (
              <p>{tr("store.replenish.noDifference", "无差异")}</p>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}
function ReceiptForm({ values, set, mode, setMode, tr }: any) {
  const s = receiveSummary(values);
  return (
    <>
      <FormField label={tr("store.replenish.receive.mode", "签收方式")}>
        <SelectField
          value={mode}
          onChange={setMode}
          allowEmpty={false}
          options={[
            {
              value: "all",
              label: tr("store.replenish.receive.all", "全部按应收数量签收"),
            },
            {
              value: "batches",
              label: tr("store.replenish.receive.batches", "逐批录入签收"),
            },
          ]}
        />
      </FormField>
      {mode === "batches" &&
        values.map((x: ReceiveInput, i: number) => {
          const err = validateReceive(x);
          return (
            <div className={styles.batch} key={x.batchNo}>
              <strong>
                {tr("store.replenish.receive.batch", "批次")} {x.batchNo}
              </strong>
              <div className={styles.grid3}>
                <FormField
                  label={tr("store.replenish.receive.expected", "应收")}
                >
                  <input
                    className={styles.fieldInput}
                    readOnly
                    value={x.expected}
                  />
                </FormField>
                <FormField
                  label={tr("store.replenish.receive.received", "实收")}
                  error={
                    err
                      ? tr(
                          "store.replenish.receive.invalid",
                          "请输入有效数量，实收与破损合计不得超过应收",
                        )
                      : undefined
                  }
                >
                  <input
                    className={styles.fieldInput}
                    inputMode="decimal"
                    value={x.received}
                    onChange={(e) =>
                      set(
                        values.map((v: ReceiveInput, n: number) =>
                          n === i ? { ...v, received: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField
                  label={tr("store.replenish.receive.damaged", "破损")}
                >
                  <input
                    className={styles.fieldInput}
                    inputMode="decimal"
                    value={x.damaged}
                    onChange={(e) =>
                      set(
                        values.map((v: ReceiveInput, n: number) =>
                          n === i ? { ...v, damaged: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </FormField>
              </div>
              <FormField label={tr("store.replenish.receive.note", "备注")}>
                <input
                  className={styles.fieldInput}
                  value={x.note}
                  onChange={(e) =>
                    set(
                      values.map((v: ReceiveInput, n: number) =>
                        n === i ? { ...v, note: e.target.value } : v,
                      ),
                    )
                  }
                />
              </FormField>
              <span className={styles.muted}>
                {tr("store.replenish.receive.remaining", "剩余差异")}：
                {Math.max(
                  0,
                  x.expected -
                    (Number(x.received) || 0) -
                    (Number(x.damaged) || 0),
                )}
              </span>
            </div>
          );
        })}
      <div className={styles.summary}>
        {tr(
          "store.replenish.receive.summary",
          "应收 {expected} / 实收 {received} / 破损 {damaged} / 短收 {shortage}",
        )
          .replace("{expected}", s.expected)
          .replace("{received}", s.received)
          .replace("{damaged}", s.damaged)
          .replace("{shortage}", s.shortage)}
      </div>
    </>
  );
}
function ResolutionForm({ detail, value, set, tr }: any) {
  const pending = detail.discrepancies.filter((x: Diff) => !x.resolved_at);
  const discrepancyLabel = (code: string) =>
    code === "SHORTAGE"
      ? tr("store.replenish.discrepancy.shortage", "短收")
      : code === "DAMAGE"
        ? tr("store.replenish.discrepancy.damage", "破损")
        : tr("store.replenish.discrepancy.unknown", "未知差异");
  return (
    <>
      {pending.map((x: Diff) => {
        const v = value[x.id] || { type: "LOSS", ref: "" };
        return (
          <div className={styles.difference} key={x.id}>
            <strong>
              #{x.id} · {discrepancyLabel(x.discrepancy_type)} · {x.qty}
            </strong>
            <div className={styles.grid2}>
              <FormField
                label={tr("store.replenish.resolve.type", "处理类型")}
                required
              >
                <SelectField
                  value={v.type}
                  onChange={(type: string) =>
                    set({ ...value, [x.id]: { ...v, type } })
                  }
                  allowEmpty={false}
                  options={[
                    {
                      value: "LOSS",
                      label: tr("store.replenish.resolution.loss", "报损"),
                    },
                    {
                      value: "ADJUSTMENT",
                      label: tr(
                        "store.replenish.resolution.adjustment",
                        "库存调整",
                      ),
                    },
                  ]}
                />
              </FormField>
              <FormField
                label={tr("store.replenish.resolve.ref", "真实处理单号")}
                required
                error={
                  !v.ref.trim()
                    ? tr(
                        "store.replenish.resolve.refRequired",
                        "必须填写真实报损或调整单号",
                      )
                    : undefined
                }
              >
                <input
                  className={styles.fieldInput}
                  value={v.ref}
                  onChange={(e) =>
                    set({ ...value, [x.id]: { ...v, ref: e.target.value } })
                  }
                  placeholder={tr(
                    "store.replenish.resolve.refPlaceholder",
                    "输入已存在的处理单号",
                  )}
                />
              </FormField>
            </div>
          </div>
        );
      })}
      {!pending.length && (
        <p>{tr("store.replenish.resolve.none", "没有未解决差异")}</p>
      )}
    </>
  );
}
