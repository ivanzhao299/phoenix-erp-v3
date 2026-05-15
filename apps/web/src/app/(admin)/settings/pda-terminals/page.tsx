"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { Smartphone, Plus, Settings, Wifi, WifiOff, Edit2, Trash2, RefreshCw, Clock, Save } from "lucide-react";

const tok = () => typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const PROTOCOLS = [
  { value: "keyboard",   label: "⌨️ 键盘楔入（通用/所有品牌）" },
  { value: "newland",    label: "📡 新大陆 Newland SDK" },
  { value: "urovo",      label: "📡 优博讯 Urovo SDK" },
  { value: "zebra",      label: "📡 斑马 Zebra DataWedge" },
  { value: "chainway",   label: "📡 成为 Chainway SDK" },
  { value: "honeywell",  label: "📡 霍尼韦尔 Honeywell SDK" },
  { value: "custom",     label: "🔧 自定义" },
];

const ALL_MODULES = [
  { id: "receipt",    label: "入库收货", icon: "📦" },
  { id: "picking",    label: "出库拣货", icon: "🚚" },
  { id: "inspection", label: "质检扫码", icon: "🔍" },
  { id: "loading",    label: "装车复核", icon: "🏗️" },
  { id: "stocktake",  label: "库存盘点", icon: "📋" },
  { id: "labels",     label: "标签生成", icon: "🏷️" },
  { id: "sync",       label: "离线补传", icon: "🔄" },
];

const STATUS_BADGE: Record<string, { text: string; color: string }> = {
  active:      { text: "活跃",   color: "#22c55e" },
  inactive:    { text: "停用",   color: "#94a3b8" },
  pending:     { text: "待审核", color: "#f59e0b" },
  maintenance: { text: "维护中", color: "#3b82f6" },
};

function timeAgo(ts: string) {
  if (!ts) return "从未";
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return `${Math.floor(diff/1000)}s 前`;
  if (diff < 3600000) return `${Math.floor(diff/60000)}min 前`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h 前`;
  return `${Math.floor(diff/86400000)}天前`;
}

const EMPTY_FORM = { name: "", brand: "", model: "", serial: "", scan_protocol: "keyboard", scan_prefix: "", scan_suffix: "", location: "", printer_ip: "", enabled_modules: ALL_MODULES.map(m => m.id), status: "active", notes: "" };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none" };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4, fontWeight: 600 };

export default function PdaTerminalPage() {
  const toast = useToast();
  const { showConfirm } = useDialog();
  const [terminals, setTerminals] = useState<any[]>([]);
  const [sysConfig, setSysConfig] = useState<any>({ server_url: "", api_url: "", scan_debounce_ms: "200", heartbeat_interval_s: "30", label_paper_size: "100x70" });
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [cfgDrawer, setCfgDrawer] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crud/pda_terminals?limit=200", { headers: hdr() });
      const d = await r.json();
      setTerminals(d.data || d || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setErr(""); setDrawer(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ ...EMPTY_FORM, ...t, enabled_modules: t.enabled_modules || ALL_MODULES.map(m => m.id) }); setErr(""); setDrawer(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("终端名称不能为空"); return; }
    setSaving(true); setErr("");
    try {
      if (editing) {
        await fetch(`/api/crud/pda_terminals/id/${editing.id}`, { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
        toast.success("终端已更新");
      } else {
        await fetch("/api/crud/pda_terminals", { method: "POST", headers: hdr(), body: JSON.stringify(form) });
        toast.success("终端已添加");
      }
      setDrawer(false); load();
    } catch { setErr("保存失败，请重试"); } finally { setSaving(false); }
  };

  const handleDelete = async (t: any) => {
    const ok = await showConfirm({ icon: "🗑️", type: "danger", title: "确认删除", message: `确认删除终端「${t.name}」？`, confirmLabel: "确认删除" });
    if (!ok) return;
    await fetch(`/api/crud/pda_terminals/id/${t.id}`, { method: "DELETE", headers: hdr() });
    toast.success("已删除"); load();
  };

  const handleApprove = async (id: number) => {
    await fetch(`/api/crud/pda_terminals/id/${id}`, { method: "PUT", headers: hdr(), body: JSON.stringify({ status: "active" }) });
    load();
  };

  const toggleModule = (id: string) => {
    setForm((p: any) => ({
      ...p,
      enabled_modules: p.enabled_modules.includes(id)
        ? p.enabled_modules.filter((m: string) => m !== id)
        : [...p.enabled_modules, id],
    }));
  };

  const stats = {
    online:  terminals.filter(t => t.online && t.status === "active").length,
    offline: terminals.filter(t => !t.online && t.status === "active").length,
    pending: terminals.filter(t => t.status === "pending").length,
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="PDA 终端管理" subtitle="注册并管理所有 PDA 手持终端设备" breadcrumb={["系统设置", "PDA终端管理"]}/>

      {/* 操作栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "在线", value: stats.online,  color: "#22c55e" },
            { label: "离线", value: stats.offline, color: "#94a3b8" },
            { label: "待审核", value: stats.pending, color: "#f59e0b" },
            { label: "总计", value: terminals.length, color: "var(--color-primary)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={load} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <RefreshCw size={14}/>刷新
          </button>
          <button type="button" onClick={() => setCfgDrawer(true)} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)" }}>
            <Settings size={14}/>系统配置
          </button>
          <button type="button" onClick={openNew} style={{ padding: "8px 16px", background: "var(--color-primary)", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#fff" }}>
            <Plus size={14}/>新增终端
          </button>
        </div>
      </div>

      {/* 终端列表 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px", padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
          <span>终端名称</span><span>品牌/型号</span><span>区域</span><span>扫码协议</span><span>状态</span><span>最后在线</span><span>操作</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</div>
        ) : terminals.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>
            <Smartphone size={40} style={{ opacity: 0.2, display: "block", margin: "0 auto 12px" }}/>
            暂无 PDA 终端，点击右上角「新增终端」
          </div>
        ) : terminals.map(t => {
          const st = STATUS_BADGE[t.status] || STATUS_BADGE.inactive;
          const online = t.online && t.status === "active";
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px", padding: "12px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", transition: "background 0.1s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-page)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "#22c55e" : "#475569", display: "inline-block", flexShrink: 0 }}/>
                  {t.name}
                </div>
                {t.serial && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, fontFamily: "monospace" }}>{t.serial}</div>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{[t.brand, t.model].filter(Boolean).join(" ") || "—"}</div>
              <div style={{ fontSize: 13 }}>{t.location || "—"}</div>
              <div style={{ fontSize: 12, color: "var(--color-primary)" }}>{PROTOCOLS.find(p => p.value === t.scan_protocol)?.label.split("（")[0] || t.scan_protocol || "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: st.color, fontWeight: 600 }}>
                {online ? <Wifi size={12}/> : <WifiOff size={12}/>} {st.text}
                {t.status === "pending" && (
                  <button type="button" onClick={() => handleApprove(t.id)} style={{ marginLeft: 4, padding: "2px 6px", background: "#22c55e22", border: "1px solid #22c55e", borderRadius: 4, color: "#22c55e", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>审核</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{timeAgo(t.last_seen)}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => openEdit(t)} style={{ padding: 5, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer" }}>
                  <Edit2 size={13}/>
                </button>
                <button type="button" onClick={() => handleDelete(t)} style={{ padding: 5, background: "transparent", border: "1px solid #dc262633", borderRadius: "var(--radius-sm)", color: "#dc2626", cursor: "pointer" }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 编辑抽屉 */}
      <RightDrawer isOpen={drawer} onClose={() => setDrawer(false)} title={editing ? `编辑：${editing.name}` : "新增 PDA 终端"} width="540px">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>终端名称 *</label>
              <input style={inp} value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} placeholder="如：仓库A-01号PDA"/>
            </div>
            <div><label style={lbl}>品牌</label><input style={inp} value={form.brand} onChange={e => setForm((p: any) => ({ ...p, brand: e.target.value }))} placeholder="如：新大陆"/></div>
            <div><label style={lbl}>型号</label><input style={inp} value={form.model} onChange={e => setForm((p: any) => ({ ...p, model: e.target.value }))} placeholder="如：N7 Pro"/></div>
            <div><label style={lbl}>设备序列号 / MAC</label><input style={inp} value={form.serial} onChange={e => setForm((p: any) => ({ ...p, serial: e.target.value }))} placeholder="唯一标识符"/></div>
            <div><label style={lbl}>分配区域</label><input style={inp} value={form.location} onChange={e => setForm((p: any) => ({ ...p, location: e.target.value }))} placeholder="如：A仓收货区"/></div>
          </div>
          <div>
            <label style={lbl}>扫码协议</label>
            <select style={inp} value={form.scan_protocol} onChange={e => setForm((p: any) => ({ ...p, scan_protocol: e.target.value }))}>
              {PROTOCOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {form.scan_protocol !== "keyboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>扫码前缀（可选）</label><input style={inp} value={form.scan_prefix} onChange={e => setForm((p: any) => ({ ...p, scan_prefix: e.target.value }))} placeholder="部分品牌附加前缀"/></div>
              <div><label style={lbl}>扫码后缀（可选）</label><input style={inp} value={form.scan_suffix} onChange={e => setForm((p: any) => ({ ...p, scan_suffix: e.target.value }))} placeholder="如：\n"/></div>
            </div>
          )}
          <div>
            <label style={{ ...lbl, marginBottom: 8 }}>开放功能模块（设备级权限）</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_MODULES.map(m => {
                const on = form.enabled_modules?.includes(m.id);
                return (
                  <button type="button" key={m.id} onClick={() => toggleModule(m.id)} style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, background: on ? "rgba(var(--color-primary-rgb),0.15)" : "var(--bg-page)", border: `1px solid ${on ? "var(--color-primary)" : "var(--border)"}`, color: on ? "var(--color-primary)" : "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>绑定打印机 IP（可选）</label><input style={inp} value={form.printer_ip} onChange={e => setForm((p: any) => ({ ...p, printer_ip: e.target.value }))} placeholder="如：192.168.31.50"/></div>
            {editing && (
              <div>
                <label style={lbl}>状态</label>
                <select style={inp} value={form.status} onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))}>
                  <option value="active">活跃</option>
                  <option value="inactive">停用</option>
                  <option value="maintenance">维护中</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>备注</label>
            <textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="可选备注信息"/>
          </div>
          {err && <div style={{ color: "#dc2626", fontSize: 12 }}>⚠️ {err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={() => setDrawer(false)} style={{ padding: "10px 20px", background: "var(--bg-page)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>取消</button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <Save size={14}/>{saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* 系统配置抽屉 */}
      <RightDrawer isOpen={cfgDrawer} onClose={() => setCfgDrawer(false)} title="PDA 全局系统配置" width="420px">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "server_url",           label: "前端服务地址",     placeholder: "http://192.168.31.32:3010" },
            { key: "api_url",              label: "API 服务地址",     placeholder: "http://192.168.31.32:3100" },
            { key: "scan_debounce_ms",     label: "扫码防抖延迟 (ms)", placeholder: "200" },
            { key: "heartbeat_interval_s", label: "心跳间隔 (秒)",    placeholder: "30" },
            { key: "label_paper_size",     label: "默认标签纸规格",   placeholder: "100x70" },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} value={sysConfig[f.key] || ""} onChange={e => setSysConfig((p: any) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}/>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => setCfgDrawer(false)} style={{ padding: "10px 20px", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>取消</button>
            <button type="button" onClick={() => { toast.success("系统配置已保存"); setCfgDrawer(false); }} style={{ padding: "10px 20px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700 }}>保存配置</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
