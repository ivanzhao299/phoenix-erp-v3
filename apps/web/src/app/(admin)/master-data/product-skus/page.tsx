"use client";
import { useState, useEffect, useCallback } from "react";
import { Layers, Search, RefreshCw, Plus, Edit2 } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";

/**
 * 主数据中心 — SKU 档案
 * 数据来源：ProductMasterModule → GET /api/product-master/skus
 * 权限：MENU_MASTER_SKU V（查看）/ E（编辑）
 *
 * SKU = product_code + grade_code + spec_code 的唯一组合
 * 为 H3（价格接 SKU）和 H4（库存批次统一）做准备
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

interface Sku {
  id?: number;
  sku_code: string;
  product_code: string;
  product_name?: string;
  grade_code: string;
  spec_code: string;
  sku_name?: string;
  barcode?: string;
  status?: string;
  remark?: string;
}

interface SelectOption { value: string; label: string; }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "启用", color: "#10b981" },
  INACTIVE: { label: "停用", color: "#64748b" },
};

const EMPTY: Sku = { sku_code: "", product_code: "", product_name: "", grade_code: "", spec_code: "", sku_name: "", barcode: "", status: "ACTIVE", remark: "" };

export default function ProductSkusPage() {
  const { canView, canEdit } = usePermission("MENU_MASTER_SKU");
  const [items, setItems] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState<Sku>(EMPTY);
  const [editing, setEditing] = useState<Sku | null>(null);
  const [saving, setSaving] = useState(false);
  const [grades, setGrades]     = useState<SelectOption[]>([]);
  const [specs, setSpecs]       = useState<SelectOption[]>([]);
  const [products, setProducts] = useState<SelectOption[]>([]);

  const loadOptions = useCallback(async () => {
    try {
      const [gr, sp, pr] = await Promise.all([
        fetch("/api/product-master/grades", { headers: hdr() }).then(r => r.json()),
        fetch("/api/product-master/specs",  { headers: hdr() }).then(r => r.json()),
        fetch("/api/product-master/catalog/products", { headers: hdr() }).then(r => r.json()),
      ]);
      setGrades((gr.data ?? []).map((g: Record<string, string>) => ({ value: g.grade_code, label: `${g.grade_code} — ${g.grade_name}` })));
      setSpecs( (sp.data ?? []).map((s: Record<string, string>) => ({ value: s.spec_code,  label: `${s.spec_code} — ${s.spec_name}` })));
      setProducts((pr.data ?? []).map((p: Record<string, string>) => ({ value: p.product_code, label: `${p.product_code} — ${p.product_name_zh || p.product_code}` })));
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (!showAll) params.set("status", "ACTIVE");
      if (filterProduct) params.set("product_code", filterProduct);
      const res = await fetch(`/api/product-master/skus?${params}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "加载失败"); }
    finally { setLoading(false); }
  }, [showAll, filterProduct]);

  useEffect(() => { if (canView) { load(); loadOptions(); } }, [canView, load, loadOptions]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDrawer(true); };
  const openEdit   = (row: Sku) => { setEditing(row); setForm({ ...row }); setDrawer(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url    = editing ? `/api/product-master/skus/${editing.sku_code}` : `/api/product-master/skus`;
      const method = editing ? "PUT" : "POST";
      const body   = JSON.stringify(form);
      const res    = await fetch(url, { method, headers: hdr(), body });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `HTTP ${res.status}`); }
      setDrawer(false);
      await load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  if (!canView) return <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>无权限查看 SKU 档案</div>;

  const filtered = items.filter(s =>
    !search || s.sku_code.toLowerCase().includes(search.toLowerCase()) || (s.sku_name ?? "").includes(search)
  );

  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#e2e8f0", fontSize: 13, outline: "none", marginTop: 4, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#94a3b8", display: "block", marginTop: 12 };

  return (
    <div style={{ padding: "24px 32px", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      <PageHeader title="SKU 档案" subtitle="产品 × 等级 × 包装规格 · 销售/库存/价格统一维度" breadcrumb={["主数据中心", "SKU 档案"]} />

      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#94a3b8" }}>
        <span style={{ color: "#f59e0b", fontWeight: 600 }}>Phase H2 说明：</span>
        SKU 主档已建立。H3 阶段将把价格表接入 sku_code；H4 阶段将把库存批次统一等级编码。当前 SKU 与交易表暂未强关联。
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 SKU 编码 / 名称..." style={{ ...inp, marginTop: 0, paddingLeft: 32 }} />
        </div>
        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={{ ...inp, marginTop: 0, width: 200 }}>
          <option value="">所有产品</option>
          {products.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#94a3b8", cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          显示停用
        </label>
        <button onClick={load} style={{ padding: "7px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} /> 刷新
        </button>
        {canEdit && (
          <button onClick={openCreate} style={{ marginLeft: "auto", padding: "7px 16px", background: "#f59e0b", border: "none", borderRadius: 7, color: "#0f172a", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Plus size={14} /> 新增 SKU
          </button>
        )}
      </div>

      {error && <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#fca5a5", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>加载中...</div>
      ) : (
        <div style={{ background: "#1e293b", borderRadius: 10, overflow: "hidden", border: "1px solid #334155" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0f172a", color: "#94a3b8" }}>
                {["SKU 编码","SKU 名称","产品","等级","规格","条码","状态",""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#475569" }}>暂无 SKU 数据 — 点击「新增 SKU」创建</td></tr>
              )}
              {filtered.map((s, i) => (
                <tr key={s.sku_code} style={{ borderBottom: "1px solid #1e2d3f", background: i % 2 ? "rgba(30,41,59,0.4)" : "transparent" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 5, padding: "2px 8px", fontFamily: "monospace", fontWeight: 600, fontSize: 12 }}>{s.sku_code}</span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>{s.sku_name || "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{s.product_code}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: "#1e3a5f", color: "#60a5fa", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{s.grade_code}</span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: "#1e3a2f", color: "#34d399", padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{s.spec_code}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{s.barcode || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: (STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).color + "20", color: (STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).color, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      {(STATUS_MAP[s.status ?? ""] || STATUS_MAP.INACTIVE).label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {canEdit && (
                      <button onClick={() => openEdit(s)} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, padding: "4px 10px", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
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
          <div style={{ width: 440, background: "#1e293b", borderLeft: "1px solid #334155", padding: 28, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing ? "编辑 SKU" : "新增 SKU"}</h3>
              <button onClick={() => setDrawer(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            {!editing && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>SKU 编码将根据「产品+等级+规格」自动生成（如不填）</p>}
            <label style={lbl}>产品 <span style={{ color: "#f87171" }}>*</span></label>
            <select style={{ ...inp, ...(editing ? { background: "#0f172a", color: "#475569" } : {}) }} value={form.product_code} onChange={e => setForm(p => ({ ...p, product_code: e.target.value }))} disabled={!!editing}>
              <option value="">— 选择产品 —</option>
              {products.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <label style={lbl}>等级 <span style={{ color: "#f87171" }}>*</span></label>
            <select style={{ ...inp, ...(editing ? { background: "#0f172a", color: "#475569" } : {}) }} value={form.grade_code} onChange={e => setForm(p => ({ ...p, grade_code: e.target.value }))} disabled={!!editing}>
              <option value="">— 选择等级 —</option>
              {grades.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <label style={lbl}>包装规格 <span style={{ color: "#f87171" }}>*</span></label>
            <select style={{ ...inp, ...(editing ? { background: "#0f172a", color: "#475569" } : {}) }} value={form.spec_code} onChange={e => setForm(p => ({ ...p, spec_code: e.target.value }))} disabled={!!editing}>
              <option value="">— 选择规格 —</option>
              {specs.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label style={lbl}>SKU 编码（留空自动生成）</label>
            <input style={{ ...inp, ...(editing ? { background: "#0f172a", color: "#475569" } : {}) }} value={form.sku_code} onChange={e => setForm(p => ({ ...p, sku_code: e.target.value.toUpperCase() }))} disabled={!!editing} placeholder="如：EGG-AA-TRAY30" />
            <label style={lbl}>SKU 名称</label>
            <input style={inp} value={form.sku_name ?? ""} onChange={e => setForm(p => ({ ...p, sku_name: e.target.value }))} placeholder="留空自动生成" />
            <label style={lbl}>条码</label>
            <input style={inp} value={form.barcode ?? ""} onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))} placeholder="EAN-13 / 内部条码" />
            <label style={lbl}>状态</label>
            <select style={inp} value={form.status ?? "ACTIVE"} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="ACTIVE">启用</option>
              <option value="INACTIVE">停用</option>
            </select>
            <label style={lbl}>备注</label>
            <textarea style={{ ...inp, minHeight: 60, resize: "vertical" }} value={form.remark ?? ""} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} />
            <button onClick={save} disabled={saving} style={{ marginTop: 20, padding: "10px", width: "100%", background: "#f59e0b", border: "none", borderRadius: 8, color: "#0f172a", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
