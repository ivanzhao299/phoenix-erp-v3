"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader"; // G157：统一全局页头
import { actBtn, actBtnTone } from "../_shared/actionButtons"; // G159：操作列文字按钮
import { ConfirmDialogV2 } from "@/components/design-system"; // G161：统一全局确认弹窗
import { useToast } from "@/contexts/ToastContext";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import styles from "./shipments.module.css";
import DictSelect from "@/components/shared-selectors/DictSelect";
import { Search, RefreshCw, Plus, Eye, CheckCircle, Send, Truck, Package, X, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import { formatBusinessEnum } from "@/lib/business-display";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Shipment {
  id: string;
  shipmentNo: string;
  poId: string;
  poNo: string;
  companyCode: string;
  companyName: string;
  projectCode: string;
  projectName: string;
  shipmentType: string;
  carrierName: string;
  trackingNo: string;
  originCountry: string;
  destinationCountry: string;
  customsRequired: boolean;
  customsStatus: string;
  customsDeclNo: string;
  departureDate: string;
  arrivalDate: string;
  freightAmount: number;
  freightCurrency: string;
  status: string;
  remark: string;
  receipts?: ReceiptSummary[];
}
interface ReceiptSummary {
  id: string;
  receiptNo: string;
  status: string;
  receiptDate: string;
}
type ShipmentPrefill = Pick<Partial<Shipment>, "poId" | "poNo" | "shipmentType">;

// ── Constants ──────────────────────────────────────────────────────────────────

const SHIPMENT_STATUSES = ["DRAFT", "READY", "IN_TRANSIT", "CUSTOMS_CLEARING", "ARRIVED", "CANCELLED"];
const STATUS_COLOR: Record<string, string> = {
  DRAFT: s.badgeNeutral,
  READY: s.badgeInfo,
  IN_TRANSIT: s.badgeWarning,
  CUSTOMS_CLEARING: s.badgeWarning,
  ARRIVED: s.badgeSuccess,
  DELIVERED: s.badgeSuccess,
  CANCELLED: s.badgeDanger
};
// DOMESTIC is retained as a legacy read value; new PO-linked shipments use LOCAL/CROSS_BORDER.
const SHIPMENT_TYPES = ["LOCAL", "CROSS_BORDER", "DOMESTIC"];
function getToken() {
  return sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "";
}
function hdr() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`
  };
}

// ── Shipments Page ────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const { t, lang } = useLanguage();
  const shipmentStatusLabel = (code: string) => formatBusinessEnum('procurementShipmentStatus', code, lang);
  const shipmentTypeLabel = (code: string) => formatBusinessEnum('procurementShipmentType', code, lang);
  const customsStatusLabel = (code: string) => formatBusinessEnum('procurementCustomsStatus', code, lang);
  const toast = useToast();
  const shipmentPerm = usePermission("MENU_PRC2_SHIPMENT");

  // ── List state ────────────────────────────────────────────────────────────
  const [items, setItems] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [shipType, setShipType] = useState("");

  // ── Drawer: new/edit ──────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Shipment>>({});
  const [formSaving, setFormSaving] = useState(false);
  const [poLocked, setPoLocked] = useState(false);
  const linkedPoHandledRef = useRef(false);

  // ── Drawer: detail ────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<Shipment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Modal: action ─────────────────────────────────────────────────────────
  const [actionTarget, setActionTarget] = useState<Shipment | null>(null);
  const [actionType, setActionType] = useState<string>("");
  const [actionComment, setActionComment] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [customsDeclNo, setCustomsDeclNo] = useState("");
  const [actualArrivalDate, setActualArrivalDate] = useState("");

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize)
      });
      if (keyword) params.set("keyword", keyword);
      if (status) params.set("status", status);
      if (shipType) params.set("shipmentType", shipType);
      const res = await fetch(`/api/v2/procurement/shipments?${params}`, {
        headers: hdr()
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status, shipType, toast]);
  useEffect(() => {
    loadList(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setPage(1);
    loadList(1);
  };
  const handleReset = () => {
    setKeyword("");
    setStatus("");
    setShipType("");
    setTimeout(() => loadList(1), 0);
  };
  const openDetail = async (row: Shipment) => {
    try {
      const res = await fetch(`/api/v2/procurement/shipments/${row.id}`, {
        headers: hdr()
      });
      if (!res.ok) throw new Error(await res.text());
      setDetail(await res.json());
      setDetailOpen(true);
    } catch (e) {
      toast.error(String(e));
    }
  };
  const openNew = useCallback((prefill: ShipmentPrefill = {}) => {
    const hasLinkedPo = Boolean(prefill.poId && prefill.poNo);
    setPoLocked(hasLinkedPo);
    setFormData({
      shipmentType: prefill.shipmentType || "CROSS_BORDER",
      originCountry: "CN",
      destinationCountry: "LA",
      customsRequired: true,
      poId: prefill.poId,
      poNo: prefill.poNo
    });
    setFormOpen(true);
  }, []);
  const closeForm = () => {
    setFormOpen(false);
    setPoLocked(false);
  };
  useEffect(() => {
    if (linkedPoHandledRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") !== "1") return;
    const poId = params.get("poId")?.trim();
    const poNo = params.get("poNo")?.trim();
    if (!poId || !poNo) return;
    if (!shipmentPerm.canCreate) return;
    linkedPoHandledRef.current = true;
    openNew({
      poId,
      poNo,
      shipmentType: params.get("shipmentType")?.trim() || undefined
    });
    setKeyword(poNo);
  }, [openNew, shipmentPerm.canCreate]);
  const handleSave = async () => {
    const payload = {
      ...formData,
      poId: formData.poId?.trim(),
      poNo: formData.poNo?.trim()
    };
    if (!payload.poId || !payload.poNo) {
      toast.error(t('ui.请填写关联PO','请填写关联PO'));
      return;
    }
    setFormSaving(true);
    try {
      const res = await fetch("/api/v2/procurement/shipments", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('ui.运单创建成功','运单创建成功'));
      closeForm();
      loadList(1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setFormSaving(false);
    }
  };
  const openAction = (row: Shipment, type: string) => {
    setActionTarget(row);
    setActionType(type);
    setActionComment("");
    setCustomsDeclNo("");
    setActualArrivalDate("");
  };
  const handleAction = async () => {
    if (!actionTarget) return;
    setActionSaving(true);
    const endpoints: Record<string, string> = {
      ready: "ready",
      dispatch: "dispatch",
      customs: "customs",
      arrive: "arrive",
      cancel: "cancel"
    };
    try {
      const body: Record<string, string> = {
        comment: actionComment
      };
      if (actionType === "customs" && customsDeclNo) body.customsDeclNo = customsDeclNo;
      if (actionType === "arrive" && actualArrivalDate) body.actualArrivalDate = actualArrivalDate;
      const res = await fetch(`/api/v2/procurement/shipments/${actionTarget.id}/${endpoints[actionType]}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(t('ui.操作成功','操作成功'));
      setActionTarget(null);
      loadList(page);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActionSaving(false);
    }
  };
  const totalPages = Math.ceil(total / pageSize);
  const nextActions: Record<string, {
    label: string;
    type: string;
    color?: string;
  }[]> = {
    DRAFT: [{
      label: t('ui.备货','备货'),
      type: "ready"
    }],
    READY: [{
      label: t('ui.发运','发运'),
      type: "dispatch"
    }],
    IN_TRANSIT: [{
      label: t('ui.报关','报关'),
      type: "customs"
    }, {
      label: t('ui.到货','到货'),
      type: "arrive"
    }],
    CUSTOMS_CLEARING: [{
      label: t('ui.到货','到货'),
      type: "arrive"
    }],
    ARRIVED: [],
    DELIVERED: [],
    CANCELLED: []
  };
  return <div style={{
    padding: 16
  }}>
      <PageHeader title={t('ui.采购物流','采购物流')} subtitle={t('ui.运单 / 在途跟踪','运单 / 在途跟踪')} breadcrumb={[t('ui.采购管理','采购管理'), t('ui.采购物流','采购物流')]} />
      {/* Filter bar */}
      <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 12,
      alignItems: "center"
    }}>
        <input placeholder={t('ui.搜索运单号 / 采购订单号 / 运单号 / 承运商','搜索运单号 / 采购订单号 / 运单号 / 承运商')} value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        width: 240,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }} />
        <select value={status} onChange={e => setStatus(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }}>
          <option value="">{t('ui.全部状态','全部状态')}</option>
          {SHIPMENT_STATUSES.map(v => <option key={v} value={v}>{shipmentStatusLabel(v)}</option>)}
        </select>
        <select value={shipType} onChange={e => setShipType(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }}>
          <option value="">{t('ui.全部类型','全部类型')}</option>
          {SHIPMENT_TYPES.map(v => <option key={v} value={v}>{shipmentTypeLabel(v)}</option>)}
        </select>
        <button className={s.btnPrimary} onClick={handleSearch} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <Search size={13} /> {t('ui.查询','查询')}
        </button>
        <button className={s.btnSecondary} onClick={handleReset} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <RefreshCw size={13} /> {t('ui.重置','重置')}
        </button>
        {shipmentPerm.canCreate && <button className={s.btnPrimary} onClick={() => openNew()} style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 4
      }}>
          <Plus size={13} /> {t('ui.新建运单','新建运单')}
        </button>}
        <span style={{
        marginLeft: "auto",
        fontSize: 12,
        color: "var(--text-secondary)"
      }}>{t('ui.共','共')} {total} {t('ui.条','条')}</span>
      </div>

      {/* Table */}
      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{t('ui.运单号','运单号')}</th>
              <th>{t('ui.关联PO','关联PO')}</th>
              <th>{t('ui.类型','类型')}</th>
              <th>{t('ui.承运商','承运商')}</th>
              <th>{t('ui.运单跟踪','运单跟踪')}</th>
              <th>{t('ui.发货国→目的地','发货国→目的地')}</th>
              <th>{t('ui.发货日','发货日')}</th>
              <th>{t('ui.预计到货','预计到货')}</th>
              <th>{t('ui.海关状态','海关状态')}</th>
              <th>{t('ui.状态','状态')}</th>
              <th>{t('ui.操作','操作')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className={u.emptyCenter}>{t('ui.加载中...','加载中...')}</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={11} className={u.emptyCenter}>{t('ui.暂无数据','暂无数据')}</td></tr>}
            {!loading && items.map(row => <tr key={row.id}>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.shipmentNo}</td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.poNo}</td>
                <td>{shipmentTypeLabel(row.shipmentType)}</td>
                <td>{row.carrierName || "—"}</td>
                <td className={u.fs12}>{row.trackingNo || "—"}</td>
                <td className={u.fs12}>{row.originCountry || "—"} → {row.destinationCountry || "—"}</td>
                <td className={u.fs12}>{row.departureDate || "—"}</td>
                <td className={u.fs12}>{row.arrivalDate || "—"}</td>
                <td className={u.fs12}>{row.customsRequired ? (row.customsStatus ? customsStatusLabel(row.customsStatus) : t('ui.待报关','待报关')) : t('ui.不需要','不需要')}</td>
                <td><span className={`${s.badge} ${STATUS_COLOR[row.status] ?? s.badgeNeutral}`}>{shipmentStatusLabel(row.status)}</span></td>
                <td style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap"
            }}>
                  <button style={actBtn} onClick={() => openDetail(row)}>{t('ui.查看','查看')}</button>
                  {(nextActions[row.status] ?? []).map(a => (
                    <button key={a.type} style={a.color === "danger" ? actBtnTone("danger") : actBtnTone("primary")} onClick={() => openAction(row, a.type)}>{a.label}</button>
                  ))}
                  {["DRAFT", "READY"].includes(row.status) && <button style={actBtnTone("danger")} onClick={() => openAction(row, "cancel")}>{t('ui.取消','取消')}</button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      marginTop: 16
    }}>
          <button className={s.btnSecondary} disabled={page <= 1} onClick={() => {
        const p = page - 1;
        setPage(p);
        loadList(p);
      }}>{t('ui.上一页','上一页')}</button>
          <span style={{
        lineHeight: "30px",
        fontSize: 13
      }}>{t('ui.第','第')} {page} / {totalPages} {t('ui.页','页')}</span>
          <button className={s.btnSecondary} disabled={page >= totalPages} onClick={() => {
        const p = page + 1;
        setPage(p);
        loadList(p);
      }}>{t('ui.下一页','下一页')}</button>
        </div>}

      {/* ── New Shipment Drawer ── */}
      <RightDrawer
        open={formOpen}
        onClose={closeForm}
        title={t('ui.新建物流运单','新建物流运单')}
        width={760}
        footer={formOpen ? (
          <div className={styles.drawerActions}>
            <button type="button" className={s.btnSecondary} onClick={closeForm}>{t('ui.取消','取消')}</button>
            <button type="button" className={s.btnPrimary} onClick={handleSave} disabled={formSaving}>
              {formSaving ? t('ui.保存中...','保存中...') : t('ui.创建运单','创建运单')}
            </button>
          </div>
        ) : null}
      >
        {/* G158：重表单仅 open 时挂载 */}
        {formOpen && <div className={styles.shipmentForm}>
          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>{t('ui.关联采购订单','关联采购订单')}</h4>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.采购订单 ID','采购订单 ID')} <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formData.poId ?? ""} onChange={e => setFormData(p => ({
                ...p,
                poId: e.target.value
              }))} placeholder={t('ui.PO内部ID','PO内部ID')} readOnly={poLocked} aria-readonly={poLocked} style={poLocked ? {
                background: "var(--bg-muted)",
                cursor: "not-allowed"
              } : undefined} />
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.采购订单号','采购订单号')} <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formData.poNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                poNo: e.target.value
              }))} placeholder="PO2-..." readOnly={poLocked} aria-readonly={poLocked} style={poLocked ? {
                background: "var(--bg-muted)",
                cursor: "not-allowed"
              } : undefined} />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>{t('ui.物流信息','物流信息')}</h4>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.运输类型','运输类型')}</label>
                <select className={s.inp} value={formData.shipmentType ?? "CROSS_BORDER"} onChange={e => setFormData(p => ({
                ...p,
                shipmentType: e.target.value
              }))}>
                  <option value="DOMESTIC">{t('ui.国内','国内')}</option>
                  <option value="CROSS_BORDER">{t('ui.跨境','跨境')}</option>
                  <option value="LOCAL">{t('ui.本地','本地')}</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.承运商','承运商')}</label>
                <input className={s.inp} value={formData.carrierName ?? ""} onChange={e => setFormData(p => ({
                ...p,
                carrierName: e.target.value
              }))} placeholder={t('ui.承运商名称','承运商名称')} />
              </div>
              <div className={`${styles.field} ${styles.fullSpan}`}>
                <label className={s.lbl}>{t('ui.运单号','运单号')}</label>
                <input className={s.inp} value={formData.trackingNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                trackingNo: e.target.value
              }))} placeholder={t('ui.物流跟踪号','物流跟踪号')} />
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.发货国','发货国')}</label>
                <DictSelect dictType="SYS_COUNTRY" value={formData.originCountry ?? "CN"} onChange={v => setFormData(p => ({
                ...p,
                originCountry: v
              }))} allowEmpty />
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.目的国','目的国')}</label>
                <DictSelect dictType="SYS_COUNTRY" value={formData.destinationCountry ?? "LA"} onChange={v => setFormData(p => ({
                ...p,
                destinationCountry: v
              }))} allowEmpty />
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.发货日期','发货日期')}</label>
                <input type="date" className={s.inp} value={formData.departureDate ?? ""} onChange={e => setFormData(p => ({
                ...p,
                departureDate: e.target.value
              }))} />
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.预计到货','预计到货')}</label>
                <input type="date" className={s.inp} value={formData.arrivalDate ?? ""} onChange={e => setFormData(p => ({
                ...p,
                arrivalDate: e.target.value
              }))} />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <h4 className={styles.sectionTitle}>{t('ui.报关信息','报关信息')}</h4>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.checkboxField}`}>
                <input type="checkbox" id="custReq" checked={formData.customsRequired ?? false} onChange={e => setFormData(p => ({
                ...p,
                customsRequired: e.target.checked
              }))} />
                <label htmlFor="custReq" className={u.fs13}>{t('ui.需要报关','需要报关')}</label>
              </div>
              <div className={styles.field}>
                <label className={s.lbl}>{t('ui.报关单号','报关单号')}</label>
                <input className={s.inp} value={formData.customsDeclNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                customsDeclNo: e.target.value
              }))} />
              </div>
            </div>
          </section>

          <section className={styles.formSection}>
            <div className={styles.field}>
              <label className={s.lbl}>{t('ui.备注','备注')}</label>
              <textarea className={s.textarea} rows={2} value={formData.remark ?? ""} onChange={e => setFormData(p => ({
              ...p,
              remark: e.target.value
            }))} />
            </div>
          </section>
        </div>}
      </RightDrawer>

      {/* ── Detail Drawer ── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={`运单详情 - ${detail?.shipmentNo ?? ""}`} width={600}>
        {detail && <div style={{
        padding: "0 24px 24px"
      }}>
            <div style={{
          display: "flex",
          gap: 8,
          marginBottom: 16
        }}>
              <span className={`${s.badge} ${STATUS_COLOR[detail.status] ?? s.badgeNeutral}`}>{shipmentStatusLabel(detail.status)}</span>
              {detail.customsRequired && <span className={`${s.badge} ${s.badgeInfo}`}>{t('ui.需报关','需报关')}</span>}
            </div>
            <DetailRow label={t('ui.运单号','运单号')} value={detail.shipmentNo} mono />
            <DetailRow label={t('ui.关联PO','关联PO')} value={detail.poNo} mono />
            <DetailRow label={t('ui.运输类型','运输类型')} value={shipmentTypeLabel(detail.shipmentType)} />
            <DetailRow label={t('ui.承运商','承运商')} value={detail.carrierName || "—"} />
            <DetailRow label={t('ui.跟踪号','跟踪号')} value={detail.trackingNo || "—"} />
            <DetailRow label={t('ui.发货国→目的','发货国→目的')} value={`${detail.originCountry || "—"} → ${detail.destinationCountry || "—"}`} />
            <DetailRow label={t('ui.发货日期','发货日期')} value={detail.departureDate || "—"} />
            <DetailRow label={t('ui.到货日期','到货日期')} value={detail.arrivalDate || "—"} />
            <DetailRow label={t('ui.报关单号','报关单号')} value={detail.customsDeclNo || "—"} />
            <DetailRow label={t('ui.报关状态','报关状态')} value={detail.customsRequired ? (detail.customsStatus ? customsStatusLabel(detail.customsStatus) : t('ui.待报关','待报关')) : t('ui.不需要','不需要')} />
            {(detail.receipts ?? []).length > 0 && <div style={{
          marginTop: 16
        }}>
                <div style={{
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 13
          }}>{t('ui.关联收货单','关联收货单')}</div>
                {detail.receipts!.map(r => <div key={r.id} style={{
            fontSize: 12,
            padding: "4px 0",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between"
          }}>
                    <span style={{
              fontFamily: "monospace"
            }}>{r.receiptNo}</span>
                    <span>{r.receiptDate}</span>
                    <span className={`${s.badge} ${s.badgeNeutral}`}>{r.status}</span>
                  </div>)}
              </div>}
          </div>}
      </RightDrawer>

      {/* G161：自写 fixed overlay → 全局 ConfirmDialogV2 */}
      <ConfirmDialogV2 open={!!actionTarget} danger={actionType === "cancel"}
        title={
          actionType === "ready" ? t('ui.确认备货','确认备货') :
          actionType === "dispatch" ? t('ui.确认发运','确认发运') :
          actionType === "customs" ? t('ui.进入报关','进入报关') :
          actionType === "arrive" ? t('ui.确认到货','确认到货') :
          actionType === "cancel" ? t('ui.取消运单','取消运单') : t('ui.确认','确认')
        }
        message={<>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{t('ui.运单：','运单：')}{actionTarget?.shipmentNo}</div>
          {actionType === "customs" && <div className={u.mb12}>
            <label className={u.muted12}>{t('ui.报关单号','报关单号')}</label>
            <input className={s.inp} value={customsDeclNo} onChange={e => setCustomsDeclNo(e.target.value)} placeholder={t('ui.可选','可选')} style={{ marginTop: 4 }} />
          </div>}
          {actionType === "arrive" && <div className={u.mb12}>
            <label className={u.muted12}>{t('ui.实际到货日期','实际到货日期')}</label>
            <input type="date" className={s.inp} value={actualArrivalDate} onChange={e => setActualArrivalDate(e.target.value)} style={{ marginTop: 4 }} />
          </div>}
          <div className={u.mb16}>
            <label className={u.muted12}>{t('ui.备注（可选）','备注（可选）')}</label>
            <textarea className={s.textarea} rows={2} value={actionComment} onChange={e => setActionComment(e.target.value)} style={{ marginTop: 4 }} />
          </div>
        </>}
        confirmLabel={actionSaving ? t('ui.处理中...','处理中...') : t('ui.确认','确认')} loading={actionSaving}
        onConfirm={handleAction} onCancel={() => setActionTarget(null)} />
    </div>;
}
function DetailRow({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return <div style={{
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8
  }}>
      <div style={{
      width: 90,
      flexShrink: 0,
      fontSize: 12,
      color: "var(--text-secondary)"
    }}>{label}</div>
      <div style={{
      fontSize: 13,
      fontFamily: mono ? "monospace" : undefined
    }}>{value}</div>
    </div>;
}
