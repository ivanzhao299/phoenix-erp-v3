"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { useToast } from "@/contexts/ToastContext";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { Search, RefreshCw, Plus, Eye, CheckCircle, Send, Truck, Package, X, AlertTriangle } from "lucide-react";

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

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  READY: "备货中",
  IN_TRANSIT: "运输中",
  CUSTOMS_CLEARING: "报关中",
  ARRIVED: "已到货",
  DELIVERED: "已完收",
  CANCELLED: "已取消"
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: s.badgeNeutral,
  READY: s.badgeInfo,
  IN_TRANSIT: s.badgeWarning,
  CUSTOMS_CLEARING: s.badgeWarning,
  ARRIVED: s.badgeSuccess,
  DELIVERED: s.badgeSuccess,
  CANCELLED: s.badgeDanger
};
const TYPE_LABELS: Record<string, string> = {
  DOMESTIC: "国内",
  CROSS_BORDER: "跨境",
  LOCAL: "本地"
};
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
  const toast = useToast();

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
  const openNew = () => {
    setFormData({
      shipmentType: "CROSS_BORDER",
      originCountry: "CN",
      destinationCountry: "LA",
      customsRequired: true
    });
    setFormOpen(true);
  };
  const handleSave = async () => {
    if (!formData.poId || !formData.poNo) {
      toast.error("请填写关联PO");
      return;
    }
    setFormSaving(true);
    try {
      const res = await fetch("/api/v2/procurement/shipments", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("运单创建成功");
      setFormOpen(false);
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
      toast.success("操作成功");
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
      label: "备货",
      type: "ready"
    }],
    READY: [{
      label: "发运",
      type: "dispatch"
    }],
    IN_TRANSIT: [{
      label: "报关",
      type: "customs"
    }, {
      label: "到货",
      type: "arrive"
    }],
    CUSTOMS_CLEARING: [{
      label: "到货",
      type: "arrive"
    }],
    ARRIVED: [],
    DELIVERED: [],
    CANCELLED: []
  };
  return <div style={{
    padding: 16
  }}>
      {/* Filter bar */}
      <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 12,
      alignItems: "center"
    }}>
        <input placeholder="搜索运单号 / 采购订单号 / 运单号 / 承运商" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} style={{
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
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={shipType} onChange={e => setShipType(e.target.value)} style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        fontSize: 13,
        background: "var(--bg-input)",
        color: "var(--text-primary)"
      }}>
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className={s.btnPrimary} onClick={handleSearch} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <Search size={13} /> 查询
        </button>
        <button className={s.btnSecondary} onClick={handleReset} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}>
          <RefreshCw size={13} /> 重置
        </button>
        <button className={s.btnPrimary} onClick={openNew} style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 4
      }}>
          <Plus size={13} /> 新建运单
        </button>
        <span style={{
        marginLeft: "auto",
        fontSize: 12,
        color: "var(--text-secondary)"
      }}>共 {total} 条</span>
      </div>

      {/* Table */}
      <div className={u.scrollX}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>运单号</th>
              <th>关联PO</th>
              <th>类型</th>
              <th>承运商</th>
              <th>运单跟踪</th>
              <th>发货国→目的地</th>
              <th>发货日</th>
              <th>预计到货</th>
              <th>海关状态</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className={u.emptyCenter}>加载中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={11} className={u.emptyCenter}>暂无数据</td></tr>}
            {!loading && items.map(row => <tr key={row.id}>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.shipmentNo}</td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.poNo}</td>
                <td>{TYPE_LABELS[row.shipmentType] ?? row.shipmentType}</td>
                <td>{row.carrierName || "—"}</td>
                <td className={u.fs12}>{row.trackingNo || "—"}</td>
                <td className={u.fs12}>{row.originCountry || "—"} → {row.destinationCountry || "—"}</td>
                <td className={u.fs12}>{row.departureDate || "—"}</td>
                <td className={u.fs12}>{row.arrivalDate || "—"}</td>
                <td className={u.fs12}>{row.customsRequired ? row.customsStatus || "待报关" : "不需要"}</td>
                <td><span className={`${s.badge} ${STATUS_COLOR[row.status] ?? s.badgeNeutral}`}>{STATUS_LABELS[row.status] ?? row.status}</span></td>
                <td style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap"
            }}>
                  <button className={s.btnIcon} title="查看详情" onClick={() => openDetail(row)}><Eye size={13} /></button>
                  {(nextActions[row.status] ?? []).map(a => <button key={a.type} className={a.color === "danger" ? s.btnIconDanger : s.btnIcon} title={a.label} onClick={() => openAction(row, a.type)}>
                      {a.type === "ready" && <Package size={13} />}
                      {a.type === "dispatch" && <Send size={13} />}
                      {a.type === "customs" && <AlertTriangle size={13} />}
                      {a.type === "arrive" && <CheckCircle size={13} />}
                      {a.type === "cancel" && <X size={13} />}
                    </button>)}
                  {["DRAFT", "READY"].includes(row.status) && <button className={s.btnIconDanger} title="取消" onClick={() => openAction(row, "cancel")}><X size={13} /></button>}
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
      }}>上一页</button>
          <span style={{
        lineHeight: "30px",
        fontSize: 13
      }}>第 {page} / {totalPages} 页</span>
          <button className={s.btnSecondary} disabled={page >= totalPages} onClick={() => {
        const p = page + 1;
        setPage(p);
        loadList(p);
      }}>下一页</button>
        </div>}

      {/* ── New Shipment Drawer ── */}
      <RightDrawer open={formOpen} onClose={() => setFormOpen(false)} title="新建物流运单" width={600}>
        <div style={{
        padding: "0 24px 24px"
      }}>
          <div className={s.formSection}>
            <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>关联采购订单</div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>采购订单 ID <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formData.poId ?? ""} onChange={e => setFormData(p => ({
                ...p,
                poId: e.target.value
              }))} placeholder="PO内部ID" />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>采购订单号 <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formData.poNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                poNo: e.target.value
              }))} placeholder="PO2-..." />
              </div>
            </div>
          </div>

          <div className={`${s.formSection} ${u.mt12}`}>
            <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>物流信息</div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>运输类型</label>
                <select className={s.inp} value={formData.shipmentType ?? "CROSS_BORDER"} onChange={e => setFormData(p => ({
                ...p,
                shipmentType: e.target.value
              }))}>
                  <option value="DOMESTIC">国内</option>
                  <option value="CROSS_BORDER">跨境</option>
                  <option value="LOCAL">本地</option>
                </select>
              </div>
              <div className={s.field}>
                <label className={s.lbl}>承运商</label>
                <input className={s.inp} value={formData.carrierName ?? ""} onChange={e => setFormData(p => ({
                ...p,
                carrierName: e.target.value
              }))} placeholder="承运商名称" />
              </div>
            </div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>运单号</label>
                <input className={s.inp} value={formData.trackingNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                trackingNo: e.target.value
              }))} placeholder="物流跟踪号" />
              </div>
            </div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>发货国</label>
                <input className={s.inp} value={formData.originCountry ?? "CN"} onChange={e => setFormData(p => ({
                ...p,
                originCountry: e.target.value
              }))} placeholder="CN" />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>目的国</label>
                <input className={s.inp} value={formData.destinationCountry ?? "LA"} onChange={e => setFormData(p => ({
                ...p,
                destinationCountry: e.target.value
              }))} placeholder="LA" />
              </div>
            </div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>发货日期</label>
                <input type="date" className={s.inp} value={formData.departureDate ?? ""} onChange={e => setFormData(p => ({
                ...p,
                departureDate: e.target.value
              }))} />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>预计到货</label>
                <input type="date" className={s.inp} value={formData.arrivalDate ?? ""} onChange={e => setFormData(p => ({
                ...p,
                arrivalDate: e.target.value
              }))} />
              </div>
            </div>
          </div>

          <div className={`${s.formSection} ${u.mt12}`}>
            <div style={{
            fontWeight: 600,
            marginBottom: 12,
            fontSize: 13
          }}>报关信息</div>
            <div className={s.fieldRow}>
              <div className={`${s.field} ${u.flexRow8}`}>
                <input type="checkbox" id="custReq" checked={formData.customsRequired ?? false} onChange={e => setFormData(p => ({
                ...p,
                customsRequired: e.target.checked
              }))} />
                <label htmlFor="custReq" className={u.fs13}>需要报关</label>
              </div>
            </div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>报关单号</label>
                <input className={s.inp} value={formData.customsDeclNo ?? ""} onChange={e => setFormData(p => ({
                ...p,
                customsDeclNo: e.target.value
              }))} />
              </div>
            </div>
          </div>

          <div className={`${s.formSection} ${u.mt12}`}>
            <div className={s.field}>
              <label className={s.lbl}>备注</label>
              <textarea className={s.textarea} rows={2} value={formData.remark ?? ""} onChange={e => setFormData(p => ({
              ...p,
              remark: e.target.value
            }))} />
            </div>
          </div>

          <div className={s.drawerFooter}>
            <button className={s.btnSecondary} onClick={() => setFormOpen(false)}>取消</button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={formSaving}>
              {formSaving ? "保存中..." : "创建运单"}
            </button>
          </div>
        </div>
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
              <span className={`${s.badge} ${STATUS_COLOR[detail.status] ?? s.badgeNeutral}`}>{STATUS_LABELS[detail.status] ?? detail.status}</span>
              {detail.customsRequired && <span className={`${s.badge} ${s.badgeInfo}`}>需报关</span>}
            </div>
            <DetailRow label="运单号" value={detail.shipmentNo} mono />
            <DetailRow label="关联PO" value={detail.poNo} mono />
            <DetailRow label="运输类型" value={TYPE_LABELS[detail.shipmentType] ?? detail.shipmentType ?? "—"} />
            <DetailRow label="承运商" value={detail.carrierName || "—"} />
            <DetailRow label="跟踪号" value={detail.trackingNo || "—"} />
            <DetailRow label="发货国→目的" value={`${detail.originCountry || "—"} → ${detail.destinationCountry || "—"}`} />
            <DetailRow label="发货日期" value={detail.departureDate || "—"} />
            <DetailRow label="到货日期" value={detail.arrivalDate || "—"} />
            <DetailRow label="报关单号" value={detail.customsDeclNo || "—"} />
            <DetailRow label="报关状态" value={detail.customsRequired ? detail.customsStatus || "待报关" : "不需要"} />
            {(detail.receipts ?? []).length > 0 && <div style={{
          marginTop: 16
        }}>
                <div style={{
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 13
          }}>关联收货单</div>
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

      {/* ── Action Modal ── */}
      {actionTarget && <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--overlay-black-50)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }} onClick={() => setActionTarget(null)}>
          <div style={{
        background: "var(--bg-card)",
        borderRadius: 12,
        padding: 24,
        width: 400,
        maxWidth: "90vw"
      }} onClick={e => e.stopPropagation()}>
            <div style={{
          fontWeight: 700,
          fontSize: 16,
          marginBottom: 12
        }}>
              {actionType === "ready" && "确认备货"}
              {actionType === "dispatch" && "确认发运"}
              {actionType === "customs" && "进入报关"}
              {actionType === "arrive" && "确认到货"}
              {actionType === "cancel" && "取消运单"}
            </div>
            <div style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 16
        }}>
              运单：{actionTarget.shipmentNo}
            </div>
            {actionType === "customs" && <div className={u.mb12}>
                <label className={u.muted12}>报关单号</label>
                <input className={s.inp} value={customsDeclNo} onChange={e => setCustomsDeclNo(e.target.value)} placeholder="可选" style={{
            marginTop: 4
          }} />
              </div>}
            {actionType === "arrive" && <div className={u.mb12}>
                <label className={u.muted12}>实际到货日期</label>
                <input type="date" className={s.inp} value={actualArrivalDate} onChange={e => setActualArrivalDate(e.target.value)} style={{
            marginTop: 4
          }} />
              </div>}
            <div className={u.mb16}>
              <label className={u.muted12}>备注（可选）</label>
              <textarea className={s.textarea} rows={2} value={actionComment} onChange={e => setActionComment(e.target.value)} style={{
            marginTop: 4
          }} />
            </div>
            <div style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end"
        }}>
              <button className={s.btnSecondary} onClick={() => setActionTarget(null)}>取消</button>
              <button className={actionType === "cancel" ? s.btnDanger : s.btnPrimary} onClick={handleAction} disabled={actionSaving}>
                {actionSaving ? "处理中..." : "确认"}
              </button>
            </div>
          </div>
        </div>}
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