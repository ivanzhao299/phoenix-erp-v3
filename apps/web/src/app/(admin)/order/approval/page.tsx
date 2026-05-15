"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ShieldAlert, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

interface Order {
  id: number; order_no: string; customer_name?: string; customer_code: string;
  total_amount: number; sales_rep: string; expected_date: string; remark: string;
  need_price_approval: boolean; need_credit_approval: boolean;
  need_period_approval: boolean; is_urgent: number; status: string;
}

const APPROVAL_FLAGS = [
  { key: "need_price_approval",  label: "低价审批",  cls: s.badgeWarning },
  { key: "need_credit_approval", label: "信用审批",  cls: s.badgeDanger  },
  { key: "need_period_approval", label: "账期审批",  cls: s.badgeInfo    },
  { key: "is_urgent",            label: "⚡ 加急单", cls: s.badgeWarning },
];

export default function ApprovalPage() {
  const toast = useToast();
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [action,   setAction]   = useState<"approve"|"reject">("approve");
  const [reason,   setReason]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "")
    : "";
  const hdr = (extra = {}) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/crud/ord_orders?limit=200");
      const data = await res.json();
      // 状态匹配 DRAFT (V3 标准) + pending (V2 兼容)
      const needApproval = (data.data || []).filter((o: Order) => {
        const st = String(o.status || "").toUpperCase();
        return (st === "DRAFT" || st === "PENDING") &&
          (o.need_price_approval || o.need_credit_approval || o.need_period_approval || o.is_urgent);
      });
      setOrders(needApproval);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openApproval = (order: Order, act: "approve" | "reject") => {
    setSelected(order); setAction(act); setReason(""); setDrawerOpen(true);
  };

  const user = typeof window !== "undefined"
    ? JSON.parse(sessionStorage.getItem("phoenix_user") || localStorage.getItem("phoenix_user") || "{}")
    : {};

  const submitApproval = async () => {
    if (!selected) return;
    if (action === "reject" && !reason.trim()) { toast.error("请填写拒绝原因"); return; }
    setSubmitting(true);
    try {
      // A2: 改调 /api/orders/:order_no/transition — 真业务路径
      //     service 内部: 状态机校验 + 信用额度释放 + 审批日志 + APPROVED 时联动 WMS
      const targetStatus = action === "approve" ? "APPROVED" : "REJECTED";
      const r = await fetch(`/api/orders/${encodeURIComponent(selected.order_no)}/transition`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ to_status: targetStatus, remark: reason || "" }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.code === 200) {
        toast.success(action === "approve" ? "订单已批准（已联动 WMS）" : "订单已拒绝");
        setDrawerOpen(false);
        loadData();
      } else {
        toast.error(j?.msg || "操作失败");
      }
    } catch { toast.error("操作失败，请重试"); } finally { setSubmitting(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="订单审批"
        subtitle={`${orders.length} 张待审批订单`}
        breadcrumb={["销售", "订单审批"]}
        actions={
          <button type="button" className={s.btnSecondary} onClick={loadData} disabled={loading}
            style={{ display:"flex", alignItems:"center", gap:6 }}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
          </button>
        }
      />

      {/* 空状态 */}
      {!loading && orders.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--text-secondary)" }}>
          <CheckCircle size={48} style={{ marginBottom:12, opacity:0.3 }}/>
          <div style={{ fontSize:16, fontWeight:600 }}>暂无待审批订单</div>
          <div style={{ fontSize:13, marginTop:6 }}>所有订单均已处理完毕</div>
        </div>
      )}

      {/* 审批卡片列表 */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {orders.map(order => (
          <div key={order.id} className={s.card}
            style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"start", padding:"18px 20px" }}>
            {/* 左侧信息 */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <ShieldAlert size={18} color="#f59e0b"/>
                <span style={{ fontWeight:700, fontSize:15, fontFamily:"monospace" }}>{order.order_no}</span>
              </div>
              <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:10 }}>
                客户：<strong style={{ color:"var(--text-primary)" }}>{order.customer_name || order.customer_code}</strong>
                &nbsp;·&nbsp;
                金额：<strong className={s.textInfo}>
                  {order.total_amount ? `${Number(order.total_amount).toLocaleString()} LAK` : "待录入"}
                </strong>
                &nbsp;·&nbsp;业务员：{order.sales_rep || "—"}
              </div>

              {/* 触发标志 badges */}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                {APPROVAL_FLAGS.filter(f => (order as unknown as Record<string,unknown>)[f.key]).map(f => (
                  <span key={f.key} className={`${s.badge} ${f.cls}`}
                    style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <AlertTriangle size={11}/>{f.label}
                  </span>
                ))}
              </div>

              <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
                期望交期：{order.expected_date || "未填写"}
                &nbsp;·&nbsp;备注：{order.remark || "—"}
              </div>
            </div>

            {/* 右侧操作 */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button type="button" className={s.btnSuccess}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px" }}
                onClick={() => openApproval(order, "approve")}>
                <CheckCircle size={14}/> 批准
              </button>
              <button type="button" className={s.btnDanger}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px" }}
                onClick={() => openApproval(order, "reject")}>
                <XCircle size={14}/> 拒绝
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 审批 Drawer */}
      <RightDrawer open={drawerOpen} title={`${action === "approve" ? "批准" : "拒绝"}订单`}
        onClose={() => setDrawerOpen(false)}>
        {selected && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {/* 订单摘要 */}
            <div style={{ background:"var(--bg-page)", borderRadius:"var(--radius-md)", padding:14 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{selected.order_no}</div>
              <div style={{ fontSize:12, color:"var(--text-secondary)" }}>
                {selected.customer_name || selected.customer_code}
                &nbsp;·&nbsp;¥{Number(selected.total_amount||0).toLocaleString()}
              </div>
            </div>

            <div>
              <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>
                {action === "reject" ? "拒绝原因（必填）" : "批准备注（选填）"}
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                placeholder={action === "reject" ? "请填写拒绝原因，将通知业务员..." : "填写批准附言..."}
                style={{ width:"100%", padding:10, background:"var(--bg-card)", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14,
                  outline:"none", resize:"vertical", boxSizing:"border-box" }}/>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button type="button" className={s.btnSecondary} style={{ flex:1 }}
                onClick={() => setDrawerOpen(false)}>取消</button>
              <button type="button"
                className={action === "approve" ? s.btnSuccess : s.btnDanger}
                style={{ flex:2 }}
                disabled={submitting || (action === "reject" && !reason.trim())}
                onClick={submitApproval}>
                {submitting ? "处理中…" : `确认${action === "approve" ? "批准" : "拒绝"}`}
              </button>
            </div>
          </div>
        )}
      </RightDrawer>
    </div>
  );
}
