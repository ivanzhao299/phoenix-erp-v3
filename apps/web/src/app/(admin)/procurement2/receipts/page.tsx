"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { useToast } from "@/contexts/ToastContext";
import { RightDrawer } from "@/components/ui/RightDrawer";
import s from "@/components/ui/admin-ui.module.css";
import { Search, RefreshCw, Plus, Eye, CheckCircle, X } from "lucide-react";
import { DictSelect } from "@/components/shared-selectors/DictSelect"; // G2 字典
import { WarehouseSelector, UserSelector, MaterialSelector } from "@/components/shared-selectors/MasterDataSelectors"; // G4-B 主数据选择器
import { tableInputCell } from "@/components/design-system/cockpit-styles"; // G94 全局表格输入 token

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReceiptItem {
  id?: string;
  poItemId?: string;
  itemCode?: string;
  itemName: string;
  spec?: string;
  expectedQty: number;
  actualQty: number;
  rejectedQty: number;
  unit?: string;
  qualityStatus?: string;
  remark?: string;
}
interface Receipt {
  id: string;
  receiptNo: string;
  poId: string;
  poNo: string;
  shipmentId?: string;
  shipmentNo?: string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
  warehouseCode?: string;
  receiverName?: string;
  receiptDate?: string;
  status: string;
  confirmedAt?: string;
  remark?: string;
  items?: ReceiptItem[];
  approvals?: ApprovalLog[];
  po?: {
    poNo: string;
    planQty: number;
    receivedQty: number;
    status: string;
  };
}
interface ApprovalLog {
  id: string;
  approvalNode: string;
  action: string;
  approverName: string;
  comment?: string;
  createdAt: string;
}
interface PoOrderItem {
  id: string;
  itemName: string;
  itemCode?: string;
  spec?: string;
  qty: number;
  receivedQty: number;
  unit?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  PARTIAL: "部分收货",
  REJECTED: "拒收",
  CANCELLED: "已取消"
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: s.badgeNeutral,
  CONFIRMED: s.badgeSuccess,
  PARTIAL: s.badgeWarning,
  REJECTED: s.badgeDanger,
  CANCELLED: s.badgeDanger
};
const QUALITY_LABELS: Record<string, string> = {
  PASS: "合格",
  PARTIAL: "部分合格",
  REJECT: "不合格"
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
const emptyItem = (): ReceiptItem => ({
  itemName: "",
  expectedQty: 0,
  actualQty: 0,
  rejectedQty: 0,
  qualityStatus: "PASS"
});

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const toast = useToast();

  // ── List ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");

  // ── Form drawer ───────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formPoId, setFormPoId] = useState("");
  const [formPoNo, setFormPoNo] = useState("");
  const [formShipId, setFormShipId] = useState("");
  const [formShipNo, setFormShipNo] = useState("");
  const [formWh, setFormWh] = useState("");
  const [formReceiver, setFormReceiver] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formRemark, setFormRemark] = useState("");
  const [formItems, setFormItems] = useState<ReceiptItem[]>([emptyItem()]);
  const [formSaving, setFormSaving] = useState(false);
  const [poItemsLoading, setPoItemsLoading] = useState(false);

  // ── Detail drawer ─────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<Receipt | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Confirm modal ─────────────────────────────────────────────────────────
  const [confirmTarget, setConfirmTarget] = useState<Receipt | null>(null);
  const [confirmComment, setConfirmComment] = useState("");
  const [confirmSaving, setConfirmSaving] = useState(false);

  // ── Cancel modal ──────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<Receipt | null>(null);
  const [cancelComment, setCancelComment] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // ── Load list ─────────────────────────────────────────────────────────────
  const loadList = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize)
      });
      if (keyword) params.set("keyword", keyword);
      if (status) params.set("status", status);
      const res = await fetch(`/api/v2/procurement/receipts?${params}`, {
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
  }, [page, pageSize, keyword, status, toast]);
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
    setTimeout(() => loadList(1), 0);
  };

  // ── Load PO items for pre-fill ─────────────────────────────────────────────
  const loadPoItems = async (poId: string) => {
    if (!poId) return;
    setPoItemsLoading(true);
    try {
      const res = await fetch(`/api/v2/procurement/orders/${poId}`, {
        headers: hdr()
      });
      if (!res.ok) return;
      const po = await res.json();
      const poItems: PoOrderItem[] = po.items ?? [];
      if (poItems.length > 0) {
        setFormItems(poItems.map(i => ({
          poItemId: i.id,
          itemCode: i.itemCode,
          itemName: i.itemName,
          spec: i.spec,
          expectedQty: Number(i.qty) - Number(i.receivedQty),
          actualQty: 0,
          rejectedQty: 0,
          unit: i.unit,
          qualityStatus: "PASS"
        })));
      }
    } catch {/* ignore */} finally {
      setPoItemsLoading(false);
    }
  };
  const openNew = () => {
    setFormPoId("");
    setFormPoNo("");
    setFormShipId("");
    setFormShipNo("");
    setFormWh("");
    setFormReceiver("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormRemark("");
    setFormItems([emptyItem()]);
    setFormOpen(true);
  };

  // ── Save new receipt ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formPoId || !formPoNo) {
      toast.error("请填写 采购订单 ID 和 采购订单号");
      return;
    }
    if (formItems.length === 0) {
      toast.error("请至少添加一行收货明细");
      return;
    }
    setFormSaving(true);
    try {
      const res = await fetch("/api/v2/procurement/receipts", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          poId: formPoId,
          poNo: formPoNo,
          shipmentId: formShipId || undefined,
          shipmentNo: formShipNo || undefined,
          warehouseCode: formWh || undefined,
          receiverName: formReceiver || undefined,
          receiptDate: formDate,
          remark: formRemark || undefined,
          items: formItems
        })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("收货单创建成功");
      setFormOpen(false);
      loadList(1);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setFormSaving(false);
    }
  };

  // ── Detail ─────────────────────────────────────────────────────────────────
  const openDetail = async (row: Receipt) => {
    try {
      const res = await fetch(`/api/v2/procurement/receipts/${row.id}`, {
        headers: hdr()
      });
      if (!res.ok) throw new Error(await res.text());
      setDetail(await res.json());
      setDetailOpen(true);
    } catch (e) {
      toast.error(String(e));
    }
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!confirmTarget) return;
    setConfirmSaving(true);
    try {
      const res = await fetch(`/api/v2/procurement/receipts/${confirmTarget.id}/confirm`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          comment: confirmComment
        })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("收货确认成功，采购订单已自动更新");
      setConfirmTarget(null);
      loadList(page);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setConfirmSaving(false);
    }
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelSaving(true);
    try {
      const res = await fetch(`/api/v2/procurement/receipts/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          comment: cancelComment
        })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("已取消");
      setCancelTarget(null);
      loadList(page);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCancelSaving(false);
    }
  };

  // ── Item helpers ──────────────────────────────────────────────────────────
  const setItemField = (idx: number, field: keyof ReceiptItem, value: string | number) => {
    setFormItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      [field]: value
    } : it));
  };
  const addItem = () => setFormItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));
  const totalPages = Math.ceil(total / pageSize);
  // 明细单元格输入框（与全局 .inp 同档，企业级留白）
  // G94：并入全局表格输入 token（取代本页自定义）
  const cellInp: React.CSSProperties = tableInputCell;
  // 表单分组容器与标题（带主色强调条，区块间距充足）
  const formBlock: React.CSSProperties = {
    marginBottom: 28
  };
  const blockTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    marginBottom: 16,
    paddingLeft: 10,
    borderLeft: "3px solid var(--color-primary)",
    lineHeight: 1.25,
    letterSpacing: "0.02em"
  };
  const thStyle: React.CSSProperties = {
    padding: "10px 8px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap"
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
        <input placeholder="搜索收货单号 / 采购订单号 / 运单号" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} style={{
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
        <button className={s.btnPrimary} onClick={handleSearch} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}><Search size={13} /> 查询</button>
        <button className={s.btnSecondary} onClick={handleReset} style={{
        display: "flex",
        alignItems: "center",
        gap: 4
      }}><RefreshCw size={13} /> 重置</button>
        <button className={s.btnPrimary} onClick={openNew} style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 4
      }}><Plus size={13} /> 新建收货单</button>
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
              <th>收货单号</th>
              <th>关联PO</th>
              <th>关联运单</th>
              <th>仓库</th>
              <th>收货人</th>
              <th>收货日期</th>
              <th>状态</th>
              <th>确认时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className={u.emptyCenter}>加载中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={9} className={u.emptyCenter}>暂无数据</td></tr>}
            {!loading && items.map(row => <tr key={row.id}>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.receiptNo}</td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.poNo}</td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{row.shipmentNo || "—"}</td>
                <td className={u.fs12}>{row.warehouseCode || "—"}</td>
                <td className={u.fs12}>{row.receiverName || "—"}</td>
                <td className={u.fs12}>{row.receiptDate || "—"}</td>
                <td><span className={`${s.badge} ${STATUS_COLOR[row.status] ?? s.badgeNeutral}`}>{STATUS_LABELS[row.status] ?? row.status}</span></td>
                <td className={u.fs12}>{row.confirmedAt ? new Date(row.confirmedAt).toLocaleString("zh-CN") : "—"}</td>
                <td style={{
              display: "flex",
              gap: 4
            }}>
                  <button className={s.btnIcon} title="详情" onClick={() => openDetail(row)}><Eye size={13} /></button>
                  {["DRAFT", "PARTIAL"].includes(row.status) && <button className={s.btnIcon} title="确认收货" onClick={() => {
                setConfirmTarget(row);
                setConfirmComment("");
              }}><CheckCircle size={13} /></button>}
                  {["DRAFT", "PARTIAL"].includes(row.status) && <button className={s.btnIconDanger} title="取消" onClick={() => {
                setCancelTarget(row);
                setCancelComment("");
              }}><X size={13} /></button>}
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

      {/* ── New Receipt Drawer ── */}
      <RightDrawer open={formOpen} onClose={() => setFormOpen(false)} title="新建收货单" width={880}>
        <div style={{
        padding: "8px 28px 28px"
      }}>
          <div style={formBlock}>
            <div style={blockTitle}>关联信息</div>
            <div className={s.fieldRow}>
              <div className={s.field}>
                <label className={s.lbl}>采购订单 ID <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formPoId} onChange={e => setFormPoId(e.target.value)} onBlur={() => formPoId && loadPoItems(formPoId)} placeholder="采购订单内部 ID（填完后自动加载明细）" />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>采购订单号 <span style={{
                  color: "var(--color-danger)"
                }}>*</span></label>
                <input className={s.inp} value={formPoNo} onChange={e => setFormPoNo(e.target.value)} placeholder="PO2-..." />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>运单 ID</label>
                <input className={s.inp} value={formShipId} onChange={e => setFormShipId(e.target.value)} placeholder="可选" />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>运单号</label>
                <input className={s.inp} value={formShipNo} onChange={e => setFormShipNo(e.target.value)} placeholder="SHP2-..." />
              </div>
            </div>
          </div>

          <div style={formBlock}>
            <div style={blockTitle}>收货信息</div>
            <div className={s.fieldRow3}>
              <div className={s.field}>
                <label className={s.lbl}>仓库</label>
                {/* G4-B：仓库主数据(wms_warehouses，仅 ACTIVE) */}
                <WarehouseSelector value={formWh} onChange={setFormWh} />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>收货人</label>
                {/* G4-B：用户主数据(sys_user，仅 ACTIVE) */}
                <UserSelector value={formReceiver} onChange={setFormReceiver} />
              </div>
              <div className={s.field}>
                <label className={s.lbl}>收货日期</label>
                <input type="date" className={s.inp} value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Receipt items table */}
          <div style={formBlock}>
            <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14
          }}>
              <div style={{
              ...blockTitle,
              marginBottom: 0
            }}>
                收货明细 {poItemsLoading && <span style={{
                color: "var(--text-secondary)",
                fontWeight: 400,
                fontSize: 12
              }}>加载中...</span>}
              </div>
              <button className={s.btnSecondary} onClick={addItem} style={{
              fontSize: 13,
              padding: "7px 14px",
              whiteSpace: "nowrap"
            }}>+ 添加行</button>
            </div>
            <div style={{
            overflowX: "auto",
            border: "1px solid var(--border)",
            borderRadius: 8
          }}>
              <table className={s.table}>
                <thead>
                  <tr style={{
                  background: "var(--bg-table-head)",
                  borderBottom: "1px solid var(--border)"
                }}>
                    <th style={{
                    ...thStyle,
                    minWidth: 180
                  }}>物料名称 <span style={{
                      color: "var(--color-danger)"
                    }}>*</span></th>
                    <th style={{
                    ...thStyle,
                    textAlign: "right",
                    minWidth: 96
                  }}>应收数量</th>
                    <th style={{
                    ...thStyle,
                    textAlign: "right",
                    minWidth: 96
                  }}>实收数量 <span style={{
                      color: "var(--color-danger)"
                    }}>*</span></th>
                    <th style={{
                    ...thStyle,
                    textAlign: "right",
                    minWidth: 96
                  }}>拒收数量</th>
                    <th style={{
                    ...thStyle,
                    minWidth: 80
                  }}>单位</th>
                    <th style={{
                    ...thStyle,
                    minWidth: 120
                  }}>质量状态</th>
                    <th style={{
                    ...thStyle,
                    width: 44,
                    textAlign: "center"
                  }}></th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, idx) => <tr key={idx} style={{
                  borderBottom: idx === formItems.length - 1 ? "none" : "1px solid var(--border)"
                }}>
                      <td style={{
                    padding: "8px"
                  }}>
                        {/* 物料主数据（mst_materials runtime）选择，自动带出 material_name/spec/unit */}
                        <MaterialSelector value={item.itemCode ?? ""} onChange={code => setItemField(idx, "itemCode", code)} onPick={o => {
                      setItemField(idx, "itemName", o?.raw?.material_name ?? o?.raw?.name ?? "");
                      setItemField(idx, "spec", o?.raw?.spec ?? "");
                      setItemField(idx, "unit", o?.raw?.unit ?? "");
                    }} style={{
                      fontSize: 13,
                      padding: "5px 8px"
                    }} />
                      </td>
                      <td style={{
                    padding: "8px"
                  }}>
                        <input type="number" style={{
                      ...cellInp,
                      textAlign: "right"
                    }} value={item.expectedQty} onChange={e => setItemField(idx, "expectedQty", Number(e.target.value))} min={0} step="0.0001" />
                      </td>
                      <td style={{
                    padding: "8px"
                  }}>
                        <input type="number" style={{
                      ...cellInp,
                      textAlign: "right"
                    }} value={item.actualQty} onChange={e => setItemField(idx, "actualQty", Number(e.target.value))} min={0} step="0.0001" />
                      </td>
                      <td style={{
                    padding: "8px"
                  }}>
                        <input type="number" style={{
                      ...cellInp,
                      textAlign: "right"
                    }} value={item.rejectedQty} onChange={e => setItemField(idx, "rejectedQty", Number(e.target.value))} min={0} step="0.0001" />
                      </td>
                      <td style={{
                    padding: "8px"
                  }}>
                        <input style={cellInp} value={item.unit ?? ""} onChange={e => setItemField(idx, "unit", e.target.value)} placeholder="单位" />
                      </td>
                      <td style={{
                    padding: "8px"
                  }}>
                        {/* G4-B：质量状态来自 sys_dict(PRC_QUALITY_STATUS) */}
                        <DictSelect dictType="PRC_QUALITY_STATUS" value={item.qualityStatus ?? "PASS"} onChange={v => setItemField(idx, "qualityStatus", v)} allowEmpty={false} />
                      </td>
                      <td style={{
                    padding: "8px",
                    textAlign: "center"
                  }}>
                        {formItems.length > 1 && <button className={s.btnIconDanger} onClick={() => removeItem(idx)} style={{
                      padding: 4
                    }}><X size={13} /></button>}
                      </td>
                    </tr>)}
                </tbody>
                <tfoot>
                  <tr style={{
                  borderTop: "2px solid var(--border)"
                }}>
                    <td style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    fontSize: 12,
                    fontWeight: 600
                  }}>合计</td>
                    <td style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums"
                  }}>{formItems.reduce((sum, it) => sum + (Number(it.expectedQty) || 0), 0).toLocaleString("zh-CN")}</td>
                    <td style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums"
                  }}>{formItems.reduce((sum, it) => sum + (Number(it.actualQty) || 0), 0).toLocaleString("zh-CN")}</td>
                    <td style={{
                    textAlign: "right",
                    padding: "6px 8px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums"
                  }}>{formItems.reduce((sum, it) => sum + (Number(it.rejectedQty) || 0), 0).toLocaleString("zh-CN")}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style={formBlock}>
            <div style={blockTitle}>备注</div>
            <div className={s.field} style={{
            marginBottom: 0
          }}>
              <textarea className={s.textarea} rows={3} value={formRemark} onChange={e => setFormRemark(e.target.value)} placeholder="选填，补充收货说明" />
            </div>
          </div>

          <div className={s.drawerFooter}>
            <button className={s.btnSecondary} onClick={() => setFormOpen(false)}>取消</button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={formSaving}>
              {formSaving ? "保存中..." : "创建收货单"}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* ── Detail Drawer ── */}
      <RightDrawer open={detailOpen} onClose={() => setDetailOpen(false)} title={`收货详情 - ${detail?.receiptNo ?? ""}`} width={680}>
        {detail && <div style={{
        padding: "0 24px 24px"
      }}>
            <div style={{
          display: "flex",
          gap: 8,
          marginBottom: 16
        }}>
              <span className={`${s.badge} ${STATUS_COLOR[detail.status] ?? s.badgeNeutral}`}>{STATUS_LABELS[detail.status] ?? detail.status}</span>
            </div>
            <DRow label="收货单号" value={detail.receiptNo} mono />
            <DRow label="关联PO" value={detail.poNo} mono />
            <DRow label="关联运单" value={detail.shipmentNo || "—"} mono />
            <DRow label="仓库" value={detail.warehouseCode || "—"} />
            <DRow label="收货人" value={detail.receiverName || "—"} />
            <DRow label="收货日期" value={detail.receiptDate || "—"} />
            {detail.confirmedAt && <DRow label="确认时间" value={new Date(detail.confirmedAt).toLocaleString("zh-CN")} />}

            {detail.po && <div style={{
          marginTop: 16,
          padding: 12,
          background: "var(--bg-card)",
          borderRadius: 8,
          border: "1px solid var(--border)"
        }}>
                <div style={{
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8
          }}>采购订单收货进度</div>
                <div style={{
            display: "flex",
            gap: 16,
            fontSize: 13
          }}>
                  <span>计划: {detail.po.planQty}</span>
                  <span>已收: <strong style={{
                color: "var(--color-success)"
              }}>{detail.po.receivedQty}</strong></span>
                  <span className={`${s.badge} ${s.badgeNeutral}`}>{detail.po.status}</span>
                </div>
              </div>}

            {(detail.items ?? []).length > 0 && <div style={{
          marginTop: 16
        }}>
                <div style={{
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8
          }}>收货明细</div>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>物料</th>
                      <th className={u.tar}>应收</th>
                      <th className={u.tar}>实收</th>
                      <th className={u.tar}>拒收</th>
                      <th>质检</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items!.map((item, idx) => <tr key={idx}>
                        <td>{item.itemName}</td>
                        <td className={u.tar}>{item.expectedQty}</td>
                        <td style={{
                  textAlign: "right",
                  color: "var(--color-success)"
                }}>{item.actualQty}</td>
                        <td style={{
                  textAlign: "right",
                  color: "var(--color-danger)"
                }}>{item.rejectedQty || "0"}</td>
                        <td>{QUALITY_LABELS[item.qualityStatus ?? ""] ?? item.qualityStatus ?? "—"}</td>
                      </tr>)}
                  </tbody>
                </table>
              </div>}

            {(detail.approvals ?? []).length > 0 && <div style={{
          marginTop: 16
        }}>
                <div style={{
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8
          }}>操作日志</div>
                {detail.approvals!.map((log, idx) => <div key={idx} style={{
            display: "flex",
            gap: 8,
            fontSize: 12,
            padding: "4px 0",
            borderBottom: "1px solid var(--border)"
          }}>
                    <span className={u.muted}>{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                    <span className={`${s.badge} ${s.badgeNeutral}`}>{log.action}</span>
                    <span>{log.approverName}</span>
                    {log.comment && <span className={u.muted}>{log.comment}</span>}
                  </div>)}
              </div>}
          </div>}
      </RightDrawer>

      {/* ── Confirm Modal ── */}
      {confirmTarget && <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--overlay-black-50)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }} onClick={() => setConfirmTarget(null)}>
          <div style={{
        background: "var(--bg-card)",
        borderRadius: 12,
        padding: 24,
        width: 400
      }} onClick={e => e.stopPropagation()}>
            <div style={{
          fontWeight: 700,
          fontSize: 16,
          marginBottom: 8
        }}>确认收货</div>
            <div style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 4
        }}>收货单：{confirmTarget.receiptNo}</div>
            <div style={{
          fontSize: 12,
          color: "var(--color-warning)",
          marginBottom: 16,
          padding: "8px 12px",
          background: "var(--status-warning-bg-light)",
          borderRadius: 6
        }}>
              确认后将自动更新采购订单已收数量及状态，不可撤销。
            </div>
            <div className={u.mb16}>
              <label className={u.muted12}>备注（可选）</label>
              <textarea className={s.textarea} rows={2} value={confirmComment} onChange={e => setConfirmComment(e.target.value)} style={{
            marginTop: 4
          }} />
            </div>
            <div style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end"
        }}>
              <button className={s.btnSecondary} onClick={() => setConfirmTarget(null)}>取消</button>
              <button className={s.btnPrimary} onClick={handleConfirm} disabled={confirmSaving}>
                {confirmSaving ? "确认中..." : "确认收货"}
              </button>
            </div>
          </div>
        </div>}

      {/* ── Cancel Modal ── */}
      {cancelTarget && <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--overlay-black-50)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }} onClick={() => setCancelTarget(null)}>
          <div style={{
        background: "var(--bg-card)",
        borderRadius: 12,
        padding: 24,
        width: 400
      }} onClick={e => e.stopPropagation()}>
            <div style={{
          fontWeight: 700,
          fontSize: 16,
          marginBottom: 8
        }}>取消收货单</div>
            <div style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 16
        }}>收货单：{cancelTarget.receiptNo}</div>
            <div className={u.mb16}>
              <label className={u.muted12}>原因（可选）</label>
              <textarea className={s.textarea} rows={2} value={cancelComment} onChange={e => setCancelComment(e.target.value)} style={{
            marginTop: 4
          }} />
            </div>
            <div style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end"
        }}>
              <button className={s.btnSecondary} onClick={() => setCancelTarget(null)}>返回</button>
              <button className={s.btnDanger} onClick={handleCancel} disabled={cancelSaving}>
                {cancelSaving ? "处理中..." : "确认取消"}
              </button>
            </div>
          </div>
        </div>}
    </div>;
}
function DRow({
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