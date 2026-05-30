"use client";
import { useState, useEffect, useCallback } from "react";
import { Tag, Search, RefreshCw, Plus, Edit2, CheckCircle, XCircle } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — 产品等级档案
 * 数据来源：ProductMasterModule → GET /api/product-master/grades
 * 权限：MENU_MASTER_GRADE V（查看）/ E（编辑）
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "启用", color: "#10b981" },
  INACTIVE: { label: "停用", color: "#64748b" },
};

interface Grade {
  id?: number;
  grade_code: string;
  grade_name: string;
  grade_name_lo?: string;
  sort_order?: number;
  is_saleable?: boolean;
  is_storable?: boolean;
  status?: string;
  remark?: string;
}

const EMPTY: Grade = { grade_code: "", grade_name: "", grade_name_lo: "", sort_order: 99, is_saleable: true, is_storable: true, status: "ACTIVE", remark: "" };

export default function ProductGradesPage() {
  const { canView, canEdit } = usePermission("MENU_MASTER_GRADE");
  const [items, setItems] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<Grade>(EMPTY);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const url = `/api/product-master/grades${showAll ? "?status=ALL" : ""}`;
      const res = await fetch(url, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  }, [showAll]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDrawer(true); };
  const openEdit   = (row: Grade) => { setEditing(row); setForm({ ...row }); setDrawer(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url  = editing ? `/api/product-master/grades/${editing.grade_code}` : `/api/product-master/grades`;
      const method = editing ? "PUT" : "POST";
      const body = JSON.stringify({ ...form, sort_order: Number(form.sort_order) || 99 });
      const res  = await fetch(url, { method, headers: hdr(), body });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `HTTP ${res.status}`); }
      setDrawer(false);
      await load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  if (!canView) return <div className="text-text-muted" style={{ padding: 40, textAlign: "center" }}>无权限查看产品等级档案</div>;

  const filtered = items.filter(g =>
    !search || g.grade_code.toLowerCase().includes(search.toLowerCase()) || g.grade_name.includes(search)
  );

  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 7, fontSize: 13, outline: "none", marginTop: 4 };
  const lbl: React.CSSProperties = { fontSize: 12, display: "block", marginTop: 12 };

  return (
    <div className="bg-bg-card text-text min-h-screen" style={{ padding: "24px 32px" }}>
      <PageHeader title="产品等级档案" subtitle="统一 grade_code 值集 · AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED" breadcrumb={["主数据中心", "产品等级档案"]} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索等级编码 / 名称..."
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
          <button onClick={openCreate} style={{ marginLeft: "auto", padding: "7px 16px", background: "#f59e0b", border: "none", borderRadius: 7, color: "#0f172a", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Plus size={14} /> 新增等级
          </button>
        )}
      </div>

      {error && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>加载中...</div>
      ) : (
        <div className="bg-bg-muted border border-border" style={{ borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr className="bg-bg-card text-text-muted">
                {["等级编码","等级名称","排序","可销售","可入库","状态","备注",""].map((h, i) => (
                  <th key={i} className="border-b border-border" style={{ padding: "10px 14px", textAlign: "left", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#475569" }}>暂无数据</td></tr>
              )}
              {filtered.map((g, i) => (
                <tr key={g.grade_code} className="border-b border-border" style={{ background: i % 2 ? "rgba(148,163,184,0.05)" : "transparent" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <span className="bg-bg-card border border-border" style={{ borderRadius: 5, padding: "2px 8px", fontFamily: "monospace", fontWeight: 600 }}>{g.grade_code}</span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>{g.grade_name}</td>
                  <td className="text-text-muted" style={{ padding: "10px 14px" }}>{g.sort_order ?? "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {g.is_saleable ? <CheckCircle size={16} color="#10b981" /> : <XCircle size={16} color="#64748b" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {g.is_storable ? <CheckCircle size={16} color="#10b981" /> : <XCircle size={16} color="#64748b" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: (STATUS_MAP[g.status ?? ""] || STATUS_MAP.INACTIVE).color + "20", color: (STATUS_MAP[g.status ?? ""] || STATUS_MAP.INACTIVE).color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      {(STATUS_MAP[g.status ?? ""] || STATUS_MAP.INACTIVE).label}
                    </span>
                  </td>
                  <td className="text-text-muted" style={{ padding: "10px 14px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.remark || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {canEdit && (
                      <button onClick={() => openEdit(g)} className="border border-border text-text-muted" style={{ background: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
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

      {/* Drawer */}
      {drawer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div className="bg-bg-muted border-l border-border text-text" style={{ width: 400, padding: 28, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing ? "编辑等级" : "新增等级"}</h3>
              <button onClick={() => setDrawer(false)} className="text-text-muted" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <label className="text-text-muted" style={lbl}>等级编码 {!editing && <span style={{ color: "#f87171" }}>*</span>}</label>
            <input
              className={`bg-bg-muted border border-border text-text ${editing ? "opacity-50" : ""}`}
              style={inp}
              value={form.grade_code}
              onChange={e => setForm(p => ({ ...p, grade_code: e.target.value.toUpperCase() }))}
              disabled={!!editing}
              placeholder="如：AA / A / DIRTY"
            />
            <label className="text-text-muted" style={lbl}>等级名称 <span style={{ color: "#f87171" }}>*</span></label>
            <input className="bg-bg-muted border border-border text-text" style={inp} value={form.grade_name ?? ""} onChange={e => setForm(p => ({ ...p, grade_name: e.target.value }))} placeholder="如：特级蛋 / 一级蛋" />
            <label className="text-text-muted" style={lbl}>名称（Lao）</label>
            <input className="bg-bg-muted border border-border text-text" style={inp} value={form.grade_name_lo ?? ""} onChange={e => setForm(p => ({ ...p, grade_name_lo: e.target.value }))} placeholder="Grade AA" />
            <label className="text-text-muted" style={lbl}>排序号</label>
            <input type="number" className="bg-bg-muted border border-border text-text" style={inp} value={form.sort_order ?? 99} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} />
            <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
              <label className="text-text" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!form.is_saleable} onChange={e => setForm(p => ({ ...p, is_saleable: e.target.checked }))} />
                可销售
              </label>
              <label className="text-text" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={!!form.is_storable} onChange={e => setForm(p => ({ ...p, is_storable: e.target.checked }))} />
                可入库
              </label>
            </div>
            <label className="text-text-muted" style={lbl}>状态</label>
            <select className="bg-bg-muted border border-border text-text" style={inp} value={form.status ?? "ACTIVE"} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
            </select>
            <label className="text-text-muted" style={lbl}>备注</label>
            <textarea className="bg-bg-muted border border-border text-text" style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.remark ?? ""} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} />
            <button onClick={save} disabled={saving} style={{ marginTop: 20, padding: "10px", background: "#f59e0b", border: "none", borderRadius: 8, color: "#0f172a", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
