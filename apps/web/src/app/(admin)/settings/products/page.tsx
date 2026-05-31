"use client";
import type { ProductRow } from "@/types";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import { useDialog } from "@/contexts/DialogContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Package, Plus, Edit2, Trash2, Filter, Egg, Languages, Save, Globe, Layers, AlertTriangle, CheckCircle, X } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";

const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}` });

const CAT_MAP: Record<string, string> = {
  EGG: "普通鲜蛋", SPECIAL: "特色包装蛋", BABY: "初生蛋",
  BULK: "整件蛋批发", PACK: "包装耗材", FEED: "饲料", VET: "兽药", MEAT: "肉类副产品", MISC: "其他",
};
const catLabel = (code: string) => CAT_MAP[code] || code || "未分类";

const EMPTY_FORM = { code: "", name_zh: "", name_lo: "", category: "EGG", unit: "", shelfLife: "", specs: "", price: "", status: "active", image_url: "" };
const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };

export default function ProductsPage() {
  const toast = useToast();
  const { showConfirm } = useDialog();
  const { t } = useLanguage();
  const [data, setData] = useState<ProductRow[]>([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [bilingualModal, setBilingualModal] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crud/mst_products?limit=500", { headers: hdr() });
      const d = await r.json();
      setData((d.data || d || []).map((p: any) => ({
        id: p.product_code, code: p.product_code, name_zh: p.product_name_zh || "",
        name_lo: p.product_name_lo || "", category_code: p.category_code || "",
        unit: p.unit_zh || "", shelfLife: p.shelf_life_days || "", specs: p.specs || "",
        price: p.price_retail || 0, status: p.status || "active", image_url: p.image_url || "",
      })).reverse());
    } catch { toast.error(t('ui.加载失败', '加载失败')); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setDrawer(true); };
  const openEdit = (row: ProductRow) => { setEditing(row); setForm({ ...EMPTY_FORM, ...row, category: row.category_code ?? '', shelfLife: String(row.shelfLife ?? ''), price: String(row.price ?? '') }); setDrawer(true); };

  const handleDelete = async (row: ProductRow) => {
    const ok = await showConfirm({ icon: "🗑️", type: "danger", title: t('common.confirm', '确认删除'), message: `${t('ui.确认删除', '确认删除')}「${row.name_zh}」？`, confirmLabel: t('common.confirm', '确认删除') });
    if (!ok) return;
    await fetch(`/api/crud/mst_products/product_code/${row.id}`, { method: "DELETE", headers: hdr() });
    toast.success(t('ui.已删除', '已删除')); load();
  };

  const handleSubmit = async () => {
    if (!form.name_zh?.trim()) { toast.error(t('ui.商品中文名称不能为空', '商品中文名称不能为空')); return; }
    const payload = {
      product_code: form.code || undefined, product_name_zh: form.name_zh,
      product_name_lo: form.name_lo, category_code: form.category,
      unit_zh: form.unit, shelf_life_days: Number(form.shelfLife) || 0,
      price_retail: Number(form.price) || 0, status: (form.status || "active").toUpperCase(),
      image_url: form.image_url || "", specs: form.specs,
    };
    if (!payload.product_code) delete (payload as any).product_code;
    setLoading(true);
    try {
      if (editing) {
        await fetch(`/api/crud/mst_products/product_code/${editing.id}`, { method: "PUT", headers: hdr(), body: JSON.stringify(payload) });
        toast.success(t('ui.已更新', '已更新'));
      } else {
        await fetch("/api/crud/mst_products", { method: "POST", headers: hdr(), body: JSON.stringify(payload) });
        toast.success(t('ui.商品已添加', '商品已添加'));
      }
      setDrawer(false); load();
    } catch { toast.error(t('ui.保存失败', '保存失败')); } finally { setLoading(false); }
  };

  const uniqueCodes = [...new Set(data.map(d => d.category_code ?? "").filter(Boolean))];
  const categoryList = [
    { code: "ALL", label: t('ui.全部', '全部'), count: data.length },
    ...uniqueCodes.map(code => ({ code, label: catLabel(code), count: data.filter(d => (d.category_code ?? "") === code).length })),
  ];
  const filtered = (activeCategory === "ALL" ? data : data.filter(d => (d.category_code ?? "") === activeCategory))
    .filter(d => !search || (d.name_zh ?? "").includes(search) || (d.code ?? "").includes(search) || (d.name_lo ?? "").includes(search));
  const missingLo = data.filter(d => !d.name_lo?.trim());

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>
      <PageHeader title={t('ui.商品主数据管理', '商品主数据管理')} subtitle={t('ui.管理蛋品及相关物料主数据', '管理蛋品及相关物料主数据，支持双语名称与分类维护')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.商品主数据', '商品主数据')]}/>
      <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 560 }}>

        {/* 左侧分类 */}
        <div style={{ width: 240, flexShrink: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 14 }}>{t('ui.商品分类', '商品分类')}</div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {categoryList.map(cat => (
              <div key={cat.code} onClick={() => setActiveCategory(cat.code)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "var(--radius-md)", cursor: "pointer", backgroundColor: activeCategory === cat.code ? "rgba(var(--color-primary-rgb),0.08)" : "transparent", color: activeCategory === cat.code ? "var(--color-primary)" : "var(--text-primary)", fontWeight: activeCategory === cat.code ? 700 : 400, borderLeft: activeCategory === cat.code ? "3px solid var(--color-primary)" : "3px solid transparent", transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Egg size={14}/>{cat.label}</div>
                <span style={{ fontSize: 12, background: activeCategory === cat.code ? "var(--color-primary)" : "var(--bg-page)", color: activeCategory === cat.code ? "#fff" : "var(--text-secondary)", padding: "2px 7px", borderRadius: 10 }}>{cat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧数据 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 工具栏 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('ui.搜索商品代码中文名', '搜索商品代码、中文名…')} style={{ ...inp, width: 240 }}/>
            <button type="button" onClick={() => setBilingualModal(true)} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-card)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
              <Globe size={14}/>{t('ui.双语检查', '双语检查')}{missingLo.length > 0 && <span style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{missingLo.length}</span>}
            </button>
            <button type="button" onClick={openNew} style={{ marginLeft: "auto", padding: "8px 16px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14}/>{t('ui.新增商品', '新增商品')}
            </button>
          </div>

          {/* 表格 */}
          <div style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <table className={s.table}>
              <thead>
                <tr>
                  {[t('ui.商品编码', '商品编码'), t('ui.名称双语', '名称（双语）'), t('ui.分类', '分类'), t('ui.规格保质期', '规格 / 保质期'), t('ui.零售价', '零售价'), t('common.status', '状态'), t('common.operation', '操作')].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>{t('common.loading', '加载中…')}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>{t('common.no_data', '暂无商品数据')}</td></tr>
                ) : filtered.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 12 }}>{row.code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name_zh}</div>
                      <div style={{ fontSize: 12, color: row.name_lo ? "var(--text-secondary)" : "#ef4444" }}>{row.name_lo || `⚠ ${t('ui.缺老挝语', '缺老挝语')}`}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, background: "var(--bg-page)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 10 }}>{catLabel(row.category_code ?? "")}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>{row.specs || row.unit}</div>
                      <div style={{ fontSize: 11, color: "var(--color-warning)" }}>{t('ui.保质期', '保质期')} {row.shelfLife}{t('ui.天', '天')}</div>
                    </td>
                    <td>LAK {row.price}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: row.status === "active" || row.status === "ACTIVE" ? "#dcfce7" : "#fee2e2", color: row.status === "active" || row.status === "ACTIVE" ? "#16a34a" : "#dc2626" }}>
                        {row.status === "active" || row.status === "ACTIVE" ? t('status.active', '启用') : t('status.inactive', '停用')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => openEdit(row)} style={{ padding: 6, background: "#ecfeff", color: "#1e40af", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}><Edit2 size={13}/></button>
                        <button type="button" onClick={() => handleDelete(row)} style={{ padding: 6, background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 双语检查 Modal —— 通过 Portal 挂载到 body */}
      {bilingualModal && typeof window !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setBilingualModal(false)}
        >
          <div
            style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, margin: 0 }}><Languages size={18} color="var(--color-primary)"/>{t('ui.双语完整性检查', '双语完整性检查')}</h3>
              <button type="button" onClick={() => setBilingualModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18}/></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
              {[{ label: t('ui.总条目', '总条目'), val: data.length, color: "var(--color-primary)" }, { label: t('ui.双语完整', '双语完整'), val: data.length - missingLo.length, color: "#22c55e" }, { label: t('ui.缺老挝语', '缺老挝语'), val: missingLo.length, color: missingLo.length > 0 ? "#ef4444" : "#22c55e" }].map(k => (
                <div key={k.label} style={{ textAlign: "center", padding: 12, background: "var(--bg-page)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.val}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {missingLo.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#22c55e" }}><CheckCircle size={48} style={{ display: "block", margin: "0 auto 12px" }}/><div style={{ fontWeight: 600 }}>{t('ui.全部商品双语翻译完整', '全部商品双语翻译完整 🎉')}</div></div>
              ) : missingLo.map(row => (
                <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid #fee2e2", background: "#fff5f5", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", marginRight: 8 }}>{row.code}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{row.name_zh}</span>
                  </div>
                  <button type="button" onClick={() => { setBilingualModal(false); openEdit(row); }} style={{ padding: "4px 10px", fontSize: 12, background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>{t('ui.去补充', '去补充')}</button>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
              <button type="button" onClick={() => setBilingualModal(false)} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", cursor: "pointer" }}>{t('ui.关闭报告', '关闭报告')}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 新增/编辑抽屉 */}
      <RightDrawer open={drawer} onClose={() => setDrawer(false)} title={editing ? t('ui.编辑商品', '编辑商品') : t('ui.新增商品', '新增商品')} width="560px">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ background: "var(--bg-page)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#1e40af", display: "flex", alignItems: "center", gap: 6 }}><Languages size={15}/>{t('ui.双语名称', '双语名称')}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={lbl}>{t('ui.商品名称中文', '商品名称（中文）')}<span style={{ color: "#dc2626" }}>*</span></label><input style={inp} value={form.name_zh} onChange={e => setForm(p => ({ ...p, name_zh: e.target.value }))} placeholder={t('ui.如AA级鲜蛋30枚托', '如：AA级鲜蛋 30枚/托')}/></div>
              <div><label style={lbl}>{t('ui.商品名称老挝语', '商品名称（老挝语）')}{!form.name_lo && <span style={{ color: "#dc2626", marginLeft: 6, fontSize: 11 }}>⚠ {t('ui.必填双语合规', '必填（双语合规）')}</span>}</label><input style={{ ...inp, borderColor: !form.name_lo ? "#ef4444" : undefined }} value={form.name_lo} onChange={e => setForm(p => ({ ...p, name_lo: e.target.value }))} placeholder="ແປພາສາທ້ອງຖິ່ນ"/></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>{t('ui.商品代码', '商品代码')}</label><input style={inp} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder={t('ui.留空自动生成', '留空自动生成')}/></div>
                <div>
                  <label style={lbl}>{t('ui.商品分类', '商品分类')}</label>
                  <select style={inp} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {Object.entries(CAT_MAP).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div style={{ background: "var(--bg-page)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#1e40af", display: "flex", alignItems: "center", gap: 6 }}><Egg size={15}/>{t('ui.规格参数', '规格参数')}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div><label style={lbl}>{t('ui.计量单位', '计量单位')}</label><input style={inp} value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder={t('ui.枚托箱', '枚、托、箱')}/></div>
              <div><label style={lbl}>{t('ui.规格说明', '规格说明')}</label><input style={inp} value={form.specs} onChange={e => setForm(p => ({ ...p, specs: e.target.value }))} placeholder={t('ui.30枚托55g枚', '30枚/托，55g/枚')}/></div>
              <div><label style={lbl}>{t('ui.保质期天', '保质期（天）')}</label><input type="number" style={inp} value={form.shelfLife} onChange={e => setForm(p => ({ ...p, shelfLife: e.target.value }))} placeholder={t('ui.天数', '天数')}/></div>
              <div><label style={lbl}>{t('ui.零售含税价LAK', '零售含税价（LAK）')}</label><input type="number" style={inp} value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="195"/></div>
              <div>
                <label style={lbl}>{t('common.status', '状态')}</label>
                <select style={inp} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="active">{t('status.active', '启用')}</option><option value="inactive">{t('status.inactive', '停用')}</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={() => setDrawer(false)} style={{ padding: "9px 18px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-page)", cursor: "pointer" }}>{t('common.cancel', '取消')}</button>
            <button type="button" onClick={handleSubmit} disabled={loading} style={{ padding: "9px 18px", background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, opacity: loading ? 0.7 : 1 }}>
              <Save size={14}/>{loading ? t('ui.保存中', '保存中…') : t('common.save', '保存')}
            </button>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
