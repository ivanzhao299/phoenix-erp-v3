"use client";
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from "react";
import { Package, Search, RefreshCw, Plus, Edit2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import ui from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 包装规格档案
 * 数据来源：ProductMasterModule → GET /api/product-master/specs
 * 权限：MENU_MASTER_PACKAGING V（查看）/ E（编辑）
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

interface Spec {
  id?: number;
  spec_code: string;
  spec_name: string;
  spec_name_lo?: string;
  qty_per_unit?: number;
  base_unit?: string;
  display_unit?: string;
  sort_order?: number;
  status?: string;
  remark?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "启用", color: "var(--status-success)" },
  INACTIVE: { label: "停用", color: "var(--text-secondary)" },
};

const EMPTY: Spec = { spec_code: "", spec_name: "", spec_name_lo: "", qty_per_unit: 1, base_unit: "枚", display_unit: "枚", sort_order: 99, status: "ACTIVE", remark: "" };

export default function PackagingSpecsPage() {
  const { canView, canEdit } = usePermission("MENU_MASTER_PACKAGING");
  const [items, setItems] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<Spec>(EMPTY);
  const [editing, setEditing] = useState<Spec | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const url = `/api/product-master/specs${showAll ? "?status=ALL" : ""}`;
      const res = await fetch(url, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  }, [showAll]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDrawer(true); };
  const openEdit   = (row: Spec) => { setEditing(row); setForm({ ...row }); setDrawer(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url    = editing ? `/api/product-master/specs/${editing.spec_code}` : `/api/product-master/specs`;
      const method = editing ? "PUT" : "POST";
      const body   = JSON.stringify({ ...form, qty_per_unit: Number(form.qty_per_unit) || 1, sort_order: Number(form.sort_order) || 99 });
      const res    = await fetch(url, { method, headers: hdr(), body });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `HTTP ${res.status}`); }
      setDrawer(false);
      await load();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  if (!canView) return <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看包装规格档案</div>;

  const filtered = items.filter(s =>
    !search || s.spec_code.toLowerCase().includes(search.toLowerCase()) || s.spec_name.includes(search)
  );

  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 7, fontSize: 13, outline: "none", marginTop: 4, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 12, display: "block", marginTop: 12 };

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader title="包装规格档案" subtitle="统一 packaging_spec 值集 · 含单位换算关系" breadcrumb={["主数据中心", "包装规格档案"]} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索规格编码 / 名称..."
            className="bg-bg-muted border border-border text-text"
            style={{ ...inp, marginTop: 0, paddingLeft: 32 }} />
        </div>
        <label className="text-text-muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          显示停用
        </label>
        <button onClick={load} className="bg-bg-muted border border-border text-text-muted" style={{ padding: "7px 12px", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} /> 刷新
        </button>
        {canEdit && (
          <button onClick={openCreate} style={{ marginLeft: "auto", padding: "7px 16px", background: "var(--status-warning)", border: "none", borderRadius: 7, color: "var(--text-primary)", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Plus size={14} /> 新增规格
          </button>
        )}
      </div>

      {error && <div style={{ background: "var(--status-danger)", border: "1px solid var(--status-danger)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "var(--status-danger)", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>加载中...</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "hidden" }}>
          <table className={ui.table}>
            <thead>
              <tr>
                {["规格编码","规格名称","每单位数量","基础单位","显示单位","排序","状态",""].map((h, i) => (
                  <th key={i} style={h === "每单位数量" ? { textAlign: "right" } : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
              )}
              {filtered.map((s, i) => (
                <tr key={s.spec_code} className="border-b border-border" style={{ background: i % 2 ? "rgba(148,163,184,0.05)" : "transparent" }}>
                  <td>
                    <span className="bg-bg-card border border-border" style={{ borderRadius: 5, padding: "2px 8px", fontFamily: "monospace", fontWeight: 600 }}>{s.spec_code}</span>
                  </td>
                  <td>{s.spec_name}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--status-warning)" }}>{s.qty_per_unit}</td>
                  <td className="text-text-muted">{s.base_unit}</td>
                  <td>{s.display_unit}</td>
                  <td className="text-text-muted">{s.sort_order}</td>
                  <td>
                    <span style={{ background: (STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).color + "20", color: (STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      {(STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).label}
                    </span>
                  </td>
                  <td>
                    {canEdit && (
                      <button onClick={() => openEdit(s)} className="border border-border text-text-muted" style={{ background: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <Edit2 size={12} /> 编辑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div className="bg-bg-muted border-l border-border text-text" style={{ width: 420, padding: 28, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing ? "编辑规格" : "新增规格"}</h3>
              <button onClick={() => setDrawer(false)} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <label className="text-text-muted" style={lbl}>规格编码 {!editing && <span style={{ color: "var(--status-danger)" }}>*</span>}</label>
            <input
              className={`bg-bg-muted border border-border text-text ${editing ? "opacity-50" : ""}`}
              style={inp}
              value={form.spec_code}
              onChange={e => setForm(p => ({ ...p, spec_code: e.target.value.toUpperCase() }))}
              disabled={!!editing}
              placeholder="如：TRAY30 / BOX360"
            />
            <label className="text-text-muted" style={lbl}>规格名称 <span style={{ color: "var(--status-danger)" }}>*</span></label>
            <input className="bg-bg-muted border border-border text-text" style={inp} value={form.spec_name ?? ""} onChange={e => setForm(p => ({ ...p, spec_name: e.target.value }))} placeholder="如：30枚/托" />
            <label className="text-text-muted" style={lbl}>名称（Lao）</label>
            <input className="bg-bg-muted border border-border text-text" style={inp} value={form.spec_name_lo ?? ""} onChange={e => setForm(p => ({ ...p, spec_name_lo: e.target.value }))} placeholder="30 pcs/tray" />
            <label className="text-text-muted" style={lbl}>每单位数量（基础单位枚）</label>
            <input type="number" className="bg-bg-muted border border-border text-text" style={inp} value={form.qty_per_unit ?? 1} onChange={e => setForm(p => ({ ...p, qty_per_unit: Number(e.target.value) }))} placeholder="30" />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="text-text-muted" style={lbl}>基础单位</label>
                <input className="bg-bg-muted border border-border text-text" style={inp} value={form.base_unit ?? "枚"} onChange={e => setForm(p => ({ ...p, base_unit: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-text-muted" style={lbl}>显示单位</label>
                <input className="bg-bg-muted border border-border text-text" style={inp} value={form.display_unit ?? "枚"} onChange={e => setForm(p => ({ ...p, display_unit: e.target.value }))} />
              </div>
            </div>
            <label className="text-text-muted" style={lbl}>排序号</label>
            <input type="number" className="bg-bg-muted border border-border text-text" style={inp} value={form.sort_order ?? 99} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} />
            <label className="text-text-muted" style={lbl}>状态</label>
            <select className="bg-bg-muted border border-border text-text" style={inp} value={form.status ?? "ACTIVE"} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
            </select>
            <label className="text-text-muted" style={lbl}>备注</label>
            <textarea className="bg-bg-muted border border-border text-text" style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.remark ?? ""} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} />
            <button onClick={save} disabled={saving} style={{ marginTop: 20, padding: "10px", width: "100%", background: "var(--status-warning)", border: "none", borderRadius: 8, color: "var(--text-primary)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
