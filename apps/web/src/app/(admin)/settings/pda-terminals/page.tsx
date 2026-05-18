"use client";
import { useState, useEffect, useCallback } from "react";

interface PdaTerminal {
  id: number;
  name: string;
  serial?: string;
  brand?: string;
  model?: string;
  location?: string;
  scan_protocol?: string;
  status: string;
  online?: boolean;
  last_seen?: string;
  enabled_modules?: string[];
}
import PageHeader from "@/components/PageHeader";
import RightDrawer from "@/components/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { t } = useLanguage();
  const [terminals, setTerminals] = useState<PdaTerminal[]>([]);
  const [sysConfig, setSysConfig] = useState<Record<string, string>>({ server_url: "", api_url: "", scan_debounce_ms: "200", heartbeat_interval_s: "30", label_paper_size: "100x70" });
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [cfgDrawer, setCfgDrawer] = useState(false);
  const [editing, setEditing] = useState<PdaTerminal | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const STATUS_BADGE: Record<string, { text: string; color: string }> = {
    active:      { text: t('status.active', '活跃'),   color: "#22c55e" },
    inactive:    { text: t('status.inactive', '停用'),   color: "#94a3b8" },
    pending:     { text: t('ui.待审核', '待审核'), color: "#f59e0b" },
    maintenance: { text: t('ui.维护中', '维护中'), color: "#3b82f6" },
  };

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
  const openEdit = (terminal: PdaTerminal) => { setEditing(terminal); setForm({ ...EMPTY_FORM, ...terminal, enabled_modules: terminal.enabled_modules || ALL_MODULES.map(m => m.id) }); setErr(""); setDrawer(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr(t('ui.终端名称不能为空', '终端名称不能为空')); return; }
    setSaving(true); setErr("");
    try {
      if (editing) {
        await fetch(`/api/crud/pda_terminals/id/${editing.id}`, { method: "PUT", headers: hdr(), body: JSON.stringify(form) });
        toast.success(t('ui.终端已更新', '终端已更新'));
      } else {
        await fetch("/api/crud/pda_terminals", { method: "POST", headers: hdr(), body: JSON.stringify(form) });
        toast.success(t('ui.终端已添加', '终端已添加'));
      }
      setDrawer(false); load();
    } catch { setErr(t('ui.保存失败请重试', '保存失败，请重试')); } finally { setSaving(false); }
  };

  const handleDelete = async (terminal: PdaTerminal) => {
    const ok = await showConfirm({ icon: "🗑️", type: "danger", title: t('common.confirm', '确认删除'), message: `${t('ui.确认删除终端', '确认删除终端')}「${terminal.name}」？`, confirmLabel: t('common.confirm', '确认删除') });
    if (!ok) return;
    await fetch(`/api/crud/pda_terminals/id/${terminal.id}`, { method: "DELETE", headers: hdr() });
    toast.success(t('ui.已删除', '已删除')); load();
  };

  const handleApprove = async (id: number) => {
    await fetch(`/api/crud/pda_terminals/id/${id}`, { method: "PUT", headers: hdr(), body: JSON.stringify({ status: "active" }) });
    load();
  };

  const toggleModule = (id: string) => {
    setForm(p => ({
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
      <PageHeader title={t('ui.PDA终端管理', 'PDA 终端管理')} subtitle={t('ui.注册并管理所有PDA手持终端设备', '注册并管理所有 PDA 手持终端设备')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.PDA终端管理', 'PDA终端管理')]}/>

      {/* 操作栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: t('ui.在线', '在线'), value: stats.online,  color: "#22c55e" },
            { label: t('ui.离线', '离线'), value: stats.offline, color: "#94a3b8" },
            { label: t('ui.待审核', '待审核'), value: stats.pending, color: "#f59e0b" },
            { label: t('common.total', '总计'), value: terminals.length, color: "var(--color-primary)" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={load} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <RefreshCw size={14}/>{t('common.refresh', '刷新')}
          </button>
          <button type="button" onClick={() => setCfgDrawer(true)} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)" }}>
            <Settings size={14}/>{t('ui.系统配置', '系统配置')}
          </button>
          <button type="button" onClick={openNew} style={{ padding: "8px 16px", background: "var(--color-primary)", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#fff" }}>
            <Plus size={14}/>{t('ui.新增终端', '新增终端')}
          </button>
        </div>
      </div>

      {/* 终端列表 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px", padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
          <span>{t('ui.终端名称', '终端名称')}</span><span>{t('ui.品牌型号', '品牌/型号')}</span><span>{t('ui.区域', '区域')}</span><span>{t('ui.扫码协议', '扫码协议')}</span><span>{t('common.status', '状态')}</span><span>{t('ui.最后在线', '最后在线')}</span><span>{t('common.operation', '操作')}</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t('common.loading', '加载中…')}</div>
        ) : terminals.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>
            <Smartphone size={40} style={{ opacity: 0.2, display: "block", margin: "0 auto 12px" }}/>
            {t('ui.暂无PDA终端点击右上角新增终端', '暂无 PDA 终端，点击右上角「新增终端」')}
          </div>
        ) : terminals.map(terminal => {
          const st = STATUS_BADGE[terminal.status] || STATUS_BADGE.inactive;
          const online = terminal.online && terminal.status === "active";
          return (
            <div key={terminal.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px", padding: "12px 16px", borderBottom: "1px solid var(--border)", alignItems: "center", transition: "background 0.1s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-page)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? "#22c55e" : "#475569", display: "inline-block", flexShrink: 0 }}/>
                  {terminal.name}
                </div>
                {terminal.serial && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, fontFamily: "monospace" }}>{terminal.serial}</div>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{[terminal.brand, terminal.model].filter(Boolean).join(" ") || "—"}</div>
              <div style={{ fontSize: 13 }}>{terminal.location || "—"}</div>
              <div style={{ fontSize: 12, color: "var(--color-primary)" }}>{PROTOCOLS.find(p => p.value === terminal.scan_protocol)?.label.split("（")[0] || terminal.scan_protocol || "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: st.color, fontWeight: 600 }}>
                {online ? <Wifi size={12}/> : <WifiOff size={12}/>} {st.text}
                {terminal.status === "pending" && (
                  <button type="button" onClick={() => handleApprove(terminal.id)} style={{ marginLeft: 4, padding: "2px 6px", background: "#22c55e22", border: "1px solid #22c55e", borderRadius: 4, color: "#22c55e", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{t('ui.审核', '审核')}</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{timeAgo(terminal.last_seen ?? "")}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => openEdit(terminal)} style={{ padding: 5, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer" }}>
                  <Edit2 size={13}/>
                </button>
                <button type="button" onClick={() => handleDelete(terminal)} style={{ padding: 5, background: "transparent", border: "1px solid #dc262633", borderRadius: "var(--radius-sm)", color: "#dc2626", cursor: "pointer" }}>
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 编辑抽屉 */}
      <RightDrawer isOpen={drawer} onClose={() => setDrawer(false)} title={editing ? `${t('common.edit', '编辑')}：${editing.name}` : t('ui.新增PDA终端', '新增 PDA 终端')} width="540px">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>{t('ui.终端名称', '终端名称')} *</label>
              <input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t('ui.如仓库A01号PDA', '如：仓库A-01号PDA')}/>
            </div>
            <div><label style={lbl}>{t('ui.品牌', '品牌')}</label><input style={inp} value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} placeholder={t('ui.如新大陆', '如：新大陆')}/></div>
            <div><label style={lbl}>{t('ui.型号', '型号')}</label><input style={inp} value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder={t('ui.如N7Pro', '如：N7 Pro')}/></div>
            <div><label style={lbl}>{t('ui.设备序列号MAC', '设备序列号 / MAC')}</label><input style={inp} value={form.serial} onChange={e => setForm(p => ({ ...p, serial: e.target.value }))} placeholder={t('ui.唯一标识符', '唯一标识符')}/></div>
            <div><label style={lbl}>{t('ui.分配区域', '分配区域')}</label><input style={inp} value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder={t('ui.如A仓收货区', '如：A仓收货区')}/></div>
          </div>
          <div>
            <label style={lbl}>{t('ui.扫码协议', '扫码协议')}</label>
            <select style={inp} value={form.scan_protocol} onChange={e => setForm(p => ({ ...p, scan_protocol: e.target.value }))}>
              {PROTOCOLS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {form.scan_protocol !== "keyboard" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>{t('ui.扫码前缀可选', '扫码前缀（可选）')}</label><input style={inp} value={form.scan_prefix} onChange={e => setForm(p => ({ ...p, scan_prefix: e.target.value }))} placeholder={t('ui.部分品牌附加前缀', '部分品牌附加前缀')}/></div>
              <div><label style={lbl}>{t('ui.扫码后缀可选', '扫码后缀（可选）')}</label><input style={inp} value={form.scan_suffix} onChange={e => setForm(p => ({ ...p, scan_suffix: e.target.value }))} placeholder={t('ui.如换行符', '如：\\n')}/></div>
            </div>
          )}
          <div>
            <label style={{ ...lbl, marginBottom: 8 }}>{t('ui.开放功能模块设备级权限', '开放功能模块（设备级权限）')}</label>
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
            <div><label style={lbl}>{t('ui.绑定打印机IP可选', '绑定打印机 IP（可选）')}</label><input style={inp} value={form.printer_ip} onChange={e => setForm(p => ({ ...p, printer_ip: e.target.value }))} placeholder={t('ui.如192168xx', '如：192.168.31.50')}/></div>
            {editing && (
              <div>
                <label style={lbl}>{t('common.status', '状态')}</label>
                <select style={inp} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">{t('status.active', '活跃')}</option>
                  <option value="inactive">{t('status.inactive', '停用')}</option>
                  <option value="maintenance">{t('ui.维护中', '维护中')}</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>{t('common.remark', '备注')}</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} placeholder={t('ui.可选备注信息', '可选备注信息')}/>
          </div>
          {err && <div style={{ color: "#dc2626", fontSize: 12 }}>⚠️ {err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={() => setDrawer(false)} style={{ padding: "10px 20px", background: "var(--bg-page)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>{t('common.cancel', '取消')}</button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <Save size={14}/>{saving ? t('ui.保存中', '保存中…') : t('common.save', '保存')}
            </button>
          </div>
        </div>
      </RightDrawer>

      {/* 系统配置抽屉 */}
      <RightDrawer isOpen={cfgDrawer} onClose={() => setCfgDrawer(false)} title={t('ui.PDA全局系统配置', 'PDA 全局系统配置')} width="420px">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "server_url",           label: t('ui.前端服务地址', '前端服务地址'),     placeholder: "http://192.168.31.32:3010" },
            { key: "api_url",              label: t('ui.API服务地址', 'API 服务地址'),     placeholder: "http://192.168.31.32:3100" },
            { key: "scan_debounce_ms",     label: t('ui.扫码防抖延迟ms', '扫码防抖延迟 (ms)'), placeholder: "200" },
            { key: "heartbeat_interval_s", label: t('ui.心跳间隔秒', '心跳间隔 (秒)'),    placeholder: "30" },
            { key: "label_paper_size",     label: t('ui.默认标签纸规格', '默认标签纸规格'),   placeholder: "100x70" },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} value={sysConfig[f.key] || ""} onChange={e => setSysConfig(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}/>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => setCfgDrawer(false)} style={{ padding: "10px 20px", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer" }}>{t('common.cancel', '取消')}</button>
            <button type="button" onClick={() => { toast.success(t('ui.系统配置已保存', '系统配置已保存')); setCfgDrawer(false); }} style={{ padding: "10px 20px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700 }}>{t('ui.保存配置', '保存配置')}</button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
