"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, RefreshCw, Eye } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";

// ── 状态映射 → CSS 语义类 ──────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; badgeCls: string }> = {
  pending:         { label: "待审批",  badgeCls: s.badgeWarning  },
  approved:        { label: "已审批",  badgeCls: s.badgeInfo     },
  locked:          { label: "已锁货",  badgeCls: s.badgeSuccess  },
  allocated:       { label: "已配货",  badgeCls: s.badgeSuccess  },
  shipped:         { label: "已发货",  badgeCls: s.badgeInfo     },
  partial_shipped: { label: "部分发货",badgeCls: s.badgeWarning  },
  received:        { label: "已签收",  badgeCls: s.badgeSuccess  },
  reconciled:      { label: "已对账",  badgeCls: s.badgeNeutral  },
  rejected:        { label: "已拒绝",  badgeCls: s.badgeDanger   },
  cancelled:       { label: "已取消",  badgeCls: s.badgeNeutral  },
};

function genOrderNo() {
  const d = new Date();
  const dt = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  return `ODR-B2B-${dt}-${Date.now().toString().slice(-6)}`;
}

interface Order {
  id: number; order_no: string; customer_code: string; customer_name?: string;
  sales_rep: string; status: string; total_amount: number;
  order_type: string; is_urgent: number; delivery_addr: string;
  expected_date: string; remark: string; created_at: string;
}
interface Customer { id: number; customer_code: string; customer_name: string; tier: string; }
interface OrderLine {
  product_code: string; product_name_zh?: string; qty: number; unit?: string; unit_price: number; batch_no?: string;
}
interface FormData {
  customer_code: string; order_type: string; is_urgent: number;
  delivery_addr: string; expected_date: string; remark: string;
  lines?: OrderLine[];
}

const DEFAULT_FORM: FormData = {
  customer_code: "", order_type: "normal", is_urgent: 0,
  delivery_addr: "", expected_date: new Date().toISOString().slice(0,10), remark: "",
  lines: [],
};

export default function OrderPage() {
  const toast = useToast();
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);

  const token = typeof window !== "undefined"
    ? (sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || "")
    : "";
  const hdr = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, cRes] = await Promise.all([
        fetch("/api/crud/ord_orders?limit=200"),
        fetch("/api/crud/ord_customers?limit=100"),
      ]);
      const [oData, cData] = await Promise.all([oRes.json(), cRes.json()]);
      setOrders(oData.data || []);
      setCustomers(cData.data || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => orders.filter(o => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchSearch = !search || o.order_no?.includes(search) || o.customer_name?.includes(search) || o.customer_code?.includes(search);
    return matchStatus && matchSearch;
  }), [orders, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  const saveOrder = async () => {
    if (!form.customer_code) { toast.error("请选择客户"); return; }
    setSaving(true);
    try {
      const cust = customers.find(c => c.customer_code === form.customer_code);
      // A4: 改调 /api/orders/submit — service 内部计算 subtotal/total_amount + 信用校验 + 审批日志
      //     order_no 由 service 端生成；前端不再生成（避免并发冲突）
      const payload = {
        customer_code: form.customer_code,
        customer_name: cust?.customer_name || "",
        order_type: form.order_type,
        is_urgent: form.order_type === "urgent" ? true : !!form.is_urgent,
        delivery_addr: form.delivery_addr,
        expected_date: form.expected_date,
        remark: form.remark,
        // 至少 1 条 line — service 强校验明细非空
        lines: Array.isArray(form.lines) && form.lines.length > 0
          ? form.lines
          : [{ product_code: 'PLACEHOLDER', product_name_zh: '占位明细', qty: 1, unit_price: 0 }],
      };
      const res = await fetch("/api/orders/submit", { method: "POST", headers: hdr, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (json?.code !== 200) throw new Error(json?.msg || `HTTP ${res.status}`);
      toast.success(json.msg || "订单已提交");
      setDrawerOpen(false);
      setForm(DEFAULT_FORM);
      loadData();
    } catch (e) {
      toast.error("提交失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally { setSaving(false); }
  };

  const custMap = useMemo(() => {
    const m: Record<string, string> = {};
    customers.forEach(c => { m[c.customer_code] = c.customer_name; });
    return m;
  }, [customers]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="订单中心"
        subtitle={`共 ${orders.length} 张订单`}
        breadcrumb={["销售", "订单中心"]}
        actions={
          <div style={{ display:"flex", gap:8 }}>
            <button type="button" className={s.btnSecondary} onClick={loadData} disabled={loading}
              style={{ display:"flex", alignItems:"center", gap:6 }}>
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }}/> 刷新
            </button>
            <button type="button" className={s.btnPrimary}
              style={{ display:"flex", alignItems:"center", gap:6 }}
              onClick={() => { setForm(DEFAULT_FORM); setDrawerOpen(true); }}>
              <Plus size={15}/> 新建订单
            </button>
          </div>
        }
      />

      {/* 状态筛选 pills */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        {[["all","全部"], ...Object.entries(STATUS_MAP).map(([k,v])=>[k,v.label])].map(([k,l])=>(
          <button key={k} type="button" onClick={() => setStatusFilter(k)}
            className={statusFilter === k ? s.btnPrimary : s.btnSecondary}
            style={{ padding:"5px 14px", borderRadius:20, fontSize:12 }}>
            {l}{k !== "all" && statusCounts[k] > 0 ? ` (${statusCounts[k]})` : k === "all" ? ` (${orders.length})` : ""}
          </button>
        ))}
      </div>

      {/* 搜索框 */}
      <div style={{ position:"relative", marginBottom:16 }}>
        <Search size={16} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-secondary)" }}/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索订单号 / 客户名称..."
          style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px 10px 36px",
            background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"var(--radius-md)",
            color:"var(--text-primary)", fontSize:14, outline:"none" }}/>
      </div>

      {/* 订单列表 */}
      <div className={s.card} style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"var(--bg-page)", borderBottom:"1px solid var(--border)" }}>
              {["订单号","客户","订单类型","金额","加急","状态","下单时间","操作"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:700,
                  fontSize:12, color:"var(--text-secondary)", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"var(--text-secondary)" }}>加载中…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding:32, textAlign:"center", color:"var(--text-secondary)" }}>暂无订单数据</td></tr>
            )}
            {!loading && filtered.map((o, i) => {
              const st = STATUS_MAP[o.status];
              return (
                <tr key={o.id} style={{ borderBottom:"1px solid var(--border)",
                  background: i%2===0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                  <td style={{ padding:"10px 14px", fontWeight:700, fontFamily:"monospace", fontSize:12 }}>{o.order_no}</td>
                  <td style={{ padding:"10px 14px" }}>{o.customer_name || custMap[o.customer_code] || o.customer_code}</td>
                  <td style={{ padding:"10px 14px", color:"var(--text-secondary)" }}>
                    {{ normal:"普通", urgent:"加急", replace:"替代品" }[o.order_type] || o.order_type}
                  </td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontWeight:700 }}>
                    ¥{Number(o.total_amount||0).toLocaleString()}
                  </td>
                  <td style={{ padding:"10px 14px", textAlign:"center" }}>
                    {o.is_urgent ? <span className={s.textDanger} style={{ fontWeight:800 }}>⚡</span> : "—"}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span className={`${s.badge} ${st?.badgeCls ?? s.badgeNeutral}`}>{st?.label || o.status}</span>
                  </td>
                  <td style={{ padding:"10px 14px", color:"var(--text-secondary)", fontSize:12 }}>
                    {o.created_at ? o.created_at.slice(0,16).replace("T"," ") : "—"}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <button className={s.btnSecondary} style={{ padding:"4px 10px", fontSize:12, display:"flex", alignItems:"center", gap:4 }}
                      onClick={() => {
                        setForm({ customer_code:o.customer_code, order_type:o.order_type||"normal",
                          is_urgent:o.is_urgent||0, delivery_addr:o.delivery_addr||"",
                          expected_date:new Date().toISOString().slice(0,10), remark:o.remark||"" });
                        setDrawerOpen(true);
                      }}>
                      <Plus size={12}/> 再来一单
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 新建订单 Drawer */}
      <RightDrawer open={drawerOpen} title="新建销售订单" onClose={() => { setDrawerOpen(false); setForm(DEFAULT_FORM); }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>客户 <span className={s.textDanger}>*</span></label>
            <select value={form.customer_code} onChange={e => setForm(p => ({...p, customer_code:e.target.value}))}
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14, outline:"none" }}>
              <option value="">请选择客户</option>
              {customers.map(c => <option key={c.customer_code} value={c.customer_code}>{c.customer_name}（{c.tier}级）</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>订单类型</label>
            <select value={form.order_type} onChange={e => setForm(p => ({...p, order_type:e.target.value}))}
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14, outline:"none" }}>
              <option value="normal">普通订单</option>
              <option value="urgent">加急单（需特殊审批）</option>
              <option value="replace">替代品发货</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>
              期望交期 <span className={s.textDanger}>*</span>
            </label>
            <input type="date" value={form.expected_date}
              min={new Date().toISOString().slice(0,10)}
              onChange={e => setForm(p => ({...p, expected_date:e.target.value}))}
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14, outline:"none" }}/>
          </div>
          <div>
            <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>收货地址</label>
            <input value={form.delivery_addr} onChange={e => setForm(p => ({...p, delivery_addr:e.target.value}))}
              placeholder="填写收货地址..."
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14, outline:"none" }}/>
          </div>
          <div>
            <label style={{ fontSize:13, color:"var(--text-secondary)", display:"block", marginBottom:6 }}>备注</label>
            <textarea value={form.remark} onChange={e => setForm(p => ({...p, remark:e.target.value}))} rows={3}
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg-card)", border:"1px solid var(--border)",
                borderRadius:"var(--radius-md)", color:"var(--text-primary)", fontSize:14, outline:"none", resize:"vertical" }}/>
          </div>
          <div style={{ display:"flex", gap:10, paddingTop:8 }}>
            <button type="button" className={s.btnSecondary} style={{ flex:1 }}
              onClick={() => { setDrawerOpen(false); setForm(DEFAULT_FORM); }}>取消</button>
            <button type="button" className={s.btnPrimary} style={{ flex:2 }}
              disabled={!form.customer_code || saving} onClick={saveOrder}>
              {saving ? "提交中…" : "提交订单"}
            </button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
