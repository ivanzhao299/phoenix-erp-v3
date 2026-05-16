"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MapPin, Plus, Edit2, Trash2, RefreshCw, Search, X, Check, BarChart2 } from "lucide-react";
import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

// ✅ V3 表: wms_locations
// 字段: location_code, warehouse_code, zone_code, location_name, row_no, layer_no, capacity_qty, status, remark
// V2 对应: LocationList.jsx（完整迁移，含库区热力图、占用率KPI、使用进度条）

const TABLE = "wms_locations";
const STATUS_OPTS  = ["EMPTY", "NORMAL", "LOCKED", "FULL"] as const;
type Status = typeof STATUS_OPTS[number];
// ✅ 状态文字色 → CSS 类（替代 STATUS_COLOR hex 字符串）
const STATUS_TEXT_CLS: Record<Status, string> = { EMPTY: s.textSuccess, NORMAL: s.textInfo, LOCKED: s.textWarning, FULL: s.textDanger };
const OCCUPIED = new Set<Status>(["NORMAL", "FULL", "LOCKED"]);

type Row = Record<string, unknown>;
// B3: wms_locations 真实列只有 location_code / warehouse_code / zone_code / location_name / capacity_qty / status / store_code
//     原 row_no / layer_no / remark 在 DB 不存在 — 写入静默丢失。删除虚构字段。
const EMPTY_FORM: Row = { location_code: "", warehouse_code: "WMS-VTE-MAIN", zone_code: "", location_name: "", capacity_qty: 0, status: "EMPTY" };

function usagePct(status: string) {
  return ({ FULL: 100, NORMAL: 65, LOCKED: 50, EMPTY: 0 } as Record<string, number>)[status] ?? 0;
}
// ✅ usageColor(hex) 已废弃，改用 CSS 类映射
function usageBarCls(pct: number): string {
  return pct >= 85 ? s.progressBarDanger : pct >= 60 ? s.progressBarWarning : s.progressBarSuccess;
}
function usageTextCls(pct: number): string {
  return pct >= 85 ? s.textDanger : pct >= 60 ? s.textWarning : s.textSuccess;
}
function usageZoneCls(pct: number): string {
  return pct >= 85 ? s.zoneCardHigh : pct >= 60 ? s.zoneCardMedium : s.zoneCardLow;
}
function usageCardCls(pct: number): string {
  return pct >= 85 ? s.statCardDanger : pct >= 60 ? s.statCardWarning : s.statCardSuccess;
}

// ✅ 进度条组件：纯 CSS 类，无任何 inline 颜色
function UsageBar({ pct, slim = false }: { pct: number; slim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div className={s.progressWrap} style={{ flex: 1, height: slim ? 5 : 8 }}>
        <div
          className={`${s.progressBar} ${usageBarCls(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {!slim && <span className={usageTextCls(pct)} style={{ fontSize: 11, fontWeight: 700, minWidth: 32 }}>{pct}%</span>}
    </div>
  );
}

export default function LocationsPage() {
  const { t } = useLanguage();

  const STATUS_LABEL: Record<Status, string> = {
    EMPTY:  t("ui.空闲", "空闲"),
    NORMAL: t("ui.在用", "在用"),
    LOCKED: t("ui.锁定", "锁定"),
    FULL:   t("ui.已满", "已满"),
  };

  const [rows,         setRows]         = useState<Row[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filterZone,   setFilterZone]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");
  const [modal,        setModal]        = useState<"add" | "edit" | null>(null);
  const [form,         setForm]         = useState<Row>(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await crudApi.list(TABLE, { limit: 500 } as any).catch(() => ({ data: [] }));
    setRows(Array.isArray(res) ? res : ((res as any).data ?? []));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const active      = useMemo(() => rows.filter(r => r.status !== "DELETED"), [rows]);
  const zones       = useMemo(() => [...new Set(active.map(r => String(r.zone_code ?? "")).filter(Boolean))].sort(), [active]);
  const filtered    = useMemo(() => active.filter(r => {
    const matchZone   = !filterZone   || r.zone_code   === filterZone;
    const matchStatus = !filterStatus || r.status      === filterStatus;
    const q           = search.toLowerCase();
    const matchSearch = !q || String(r.location_code ?? "").toLowerCase().includes(q) || String(r.location_name ?? "").toLowerCase().includes(q);
    return matchZone && matchStatus && matchSearch;
  }), [active, filterZone, filterStatus, search]);

  const stats = useMemo(() => {
    const total = active.length;
    const occupied = active.filter(r => OCCUPIED.has(r.status as Status)).length;
    return {
      total, occupied,
      occupancyPct: total > 0 ? Math.round(occupied / total * 100) : 0,
      empty:  active.filter(r => r.status === "EMPTY").length,
      normal: active.filter(r => r.status === "NORMAL").length,
      locked: active.filter(r => r.status === "LOCKED").length,
      full:   active.filter(r => r.status === "FULL").length,
    };
  }, [active]);

  const zoneSummary = useMemo(() => {
    const map: Record<string, { total: number; occupied: number; cap: number }> = {};
    active.forEach(r => {
      const z = String(r.zone_code ?? t("ui.未分区", "未分区"));
      if (!map[z]) map[z] = { total: 0, occupied: 0, cap: 0 };
      map[z].total++;
      if (OCCUPIED.has(r.status as Status)) map[z].occupied++;
      map[z].cap += Number(r.capacity_qty ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([zone, v]) => ({
      zone, total: v.total, occupied: v.occupied, cap: v.cap,
      pct: v.total > 0 ? Math.round(v.occupied / v.total * 100) : 0,
    }));
  }, [active]);

  const openAdd  = () => { setForm(EMPTY_FORM); setModal("add"); };
  const openEdit = (row: Row) => { setForm({ ...EMPTY_FORM, ...row }); setModal("edit"); };
  const closeModal = () => { setModal(null); setSaving(false); };

  const handleSave = async () => {
    if (!String(form.location_code ?? "").trim() || !String(form.warehouse_code ?? "").trim()) return;
    setSaving(true);
    try {
      // B3: 只 POST DB 存在的列；filter 掉前端历史残留的 row_no/layer_no/remark
      const { row_no, layer_no, remark, ...rest } = form as Record<string, unknown>;
      void row_no; void layer_no; void remark;
      const payload = { ...rest, capacity_qty: Number((rest as Record<string, unknown>).capacity_qty) };
      modal === "add" ? await crudApi.create(TABLE, payload) : await crudApi.update(TABLE, form.id as number, payload as any);
      closeModal(); await load();
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await crudApi.update(TABLE, deleteTarget.id as number, { status: "DELETED" } as any);
    setConfirmOpen(false); setDeleteTarget(null); await load();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 12px",
    border: "1px solid var(--border-color, #e2e8f0)", borderRadius: 8,
    background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: 14,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4, fontWeight: 600 };

  return (
    <div>
      <PageHeader
        title={t("ui.库位管理", "库位管理")}
        subtitle={`${t("ui.仓库货位档案维护", "仓库货位档案维护")} · wms_locations · ${t("common.total", "共")} ${active.length} ${t("ui.个库位", "个库位")}`}
        breadcrumb={[t("ui.仓储管理", "仓储管理"), t("ui.库位管理", "库位管理")]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={load}><RefreshCw size={13} />{t("common.refresh", "刷新")}</button>
            <button type="button" className={s.btnPrimary} onClick={openAdd}><Plus size={14} />{t("ui.新增库位", "新增库位")}</button>
          </div>
        }
      />

      {/* KPI 统计卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* 总体占用率 — 左边框颜色由 usageCardCls 决定 */}
        <div className={`${s.card} ${usageCardCls(stats.occupancyPct)}`} style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div className={usageTextCls(stats.occupancyPct)} style={{ fontSize: 22, fontWeight: 800 }}>{loading ? "…" : `${stats.occupancyPct}%`}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{t("ui.总体占用率", "总体占用率")}</div>
            </div>
            <BarChart2 size={20} color="var(--text-secondary)" />
          </div>
          <UsageBar pct={stats.occupancyPct} />
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{stats.occupied} {t("ui.占用", "占用")} / {stats.total} {t("ui.总库位", "总库位")}</div>
        </div>
        {([
          { label: t("ui.库位总数", "库位总数"), val: stats.total,               cardCls: s.statCardPrimary, valCls: "" },
          { label: t("ui.空闲", "空闲"),     val: stats.empty,               cardCls: s.statCardSuccess, valCls: s.textSuccess },
          { label: t("ui.在用", "在用"),     val: stats.normal,              cardCls: s.statCardInfo,    valCls: s.textInfo    },
          { label: t("ui.锁定满", "锁定/满"), val: stats.locked + stats.full, cardCls: s.statCardWarning, valCls: s.textWarning },
        ] as const).map(item => (
          <div key={item.label} className={`${s.card} ${item.cardCls}`} style={{ padding: "16px 20px" }}>
            <div className={`${item.valCls}`} style={{ fontSize: 22, fontWeight: 800 }}>{loading ? "…" : (item as any).val}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* 库区使用率热力图 */}
      {!loading && zoneSummary.length > 0 && (
        <div className={s.card} style={{ padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={15} color="var(--color-primary)" /> {t("ui.库区使用率分析", "库区使用率分析")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {zoneSummary.map(z => (
              /* ✅ zoneCardLow/Medium/High 替代 border/bg inline 内联样式 + 移除 onMouseEnter/onMouseLeave */
              <div
                key={z.zone}
                onClick={() => setFilterZone(filterZone === z.zone ? "" : z.zone)}
                className={`${usageZoneCls(z.pct)} ${filterZone === z.zone ? s.zoneCardActive : ""}`}
                style={{ padding: "12px 14px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{z.zone} {t("ui.区", "区")}</span>
                  <span className={usageTextCls(z.pct)} style={{ fontSize: 18, fontWeight: 900 }}>{z.pct}%</span>
                </div>
                <UsageBar pct={z.pct} slim />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                  <span>{z.occupied}/{z.total} {t("ui.已用", "已用")}</span>
                  {z.cap > 0 && <span>{t("ui.容量", "容量")} {z.cap.toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
          {filterZone && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-primary)", cursor: "pointer", fontWeight: 600 }} onClick={() => setFilterZone("")}>
              ✕ {t("ui.清除库区筛选", "清除库区筛选")}
            </div>
          )}
        </div>
      )}

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ui.搜索库位编码名称", "搜索库位编码/名称…")} style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)} style={{ ...inputStyle, width: 130 }}>
          <option value="">{t("ui.全部库区", "全部库区")}</option>
          {zones.map(z => <option key={z} value={z}>{z} {t("ui.区", "区")}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 120 }}>
          <option value="">{t("ui.全部状态", "全部状态")}</option>
          {STATUS_OPTS.map(st => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
        </select>
      </div>

      {/* 数据表格 */}
      <div className={s.card} style={{ overflow: "hidden", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-element, #f8fafc)", borderBottom: "1px solid var(--border-color)" }}>
              {[
                t("ui.库位编码", "库位编码"),
                t("ui.库位名称", "库位名称"),
                t("ui.仓库", "仓库"),
                t("ui.库区", "库区"),
                t("ui.排层", "排/层"),
                t("ui.容量枚", "容量(枚)"),
                t("ui.使用率", "使用率"),
                t("common.status", "状态"),
                t("common.remark", "备注"),
                t("common.operation", "操作"),
              ].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>{t("common.loading", "加载中…")}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                {t("ui.暂无库位数据点击新增库位开始维护仓库档案", "暂无库位数据，点击「新增库位」开始维护仓库档案。")}
              </td></tr>
            )}
            {!loading && filtered.map((row, i, arr) => {
              const pct = usagePct(String(row.status ?? "EMPTY"));
              return (
                <tr key={String(row.id)}
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border-color)" : "none", transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-element, #f8fafc)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={12} />{String(row.location_code ?? "")}</div>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{String(row.location_name ?? "—")}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-secondary)" }}>{String(row.warehouse_code ?? "")}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700 }}>{String(row.zone_code ?? "—")}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-secondary)" }}>{String(row.zone_code ?? "—")}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.capacity_qty ? Number(row.capacity_qty).toLocaleString() : "—"}</td>
                  <td style={{ padding: "12px 14px", minWidth: 110 }}>
                    {OCCUPIED.has(row.status as Status) ? (
                      <div><UsageBar pct={pct} slim /><div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>{pct}%</div></div>
                    ) : <span className={s.textSuccess} style={{ fontSize: 11, fontWeight: 600 }}>{t("ui.空闲", "空闲")}</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {/* ✅ STATUS_TEXT_CLS 替代 STATUS_COLOR + badge 类替代 inline span */}
                    <span className={`${s.badge} ${STATUS_TEXT_CLS[row.status as Status] ? (row.status === 'EMPTY' ? s.badgeSuccess : row.status === 'NORMAL' ? s.badgeInfo : row.status === 'LOCKED' ? s.badgeWarning : s.badgeDanger) : s.badgeNeutral}`}>
                      {STATUS_LABEL[row.status as Status] ?? String(row.status ?? "")}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-secondary)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String(row.location_name ?? "—")}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" onClick={() => openEdit(row)} className={s.btnSecondary} style={{ padding: "4px 10px", fontSize: 12 }}><Edit2 size={12} />{t("common.edit", "编辑")}</button>
                      <button type="button" onClick={() => { setDeleteTarget(row); setConfirmOpen(true); }} className={s.btnDanger} style={{ padding: "4px 10px", fontSize: 12 }}><Trash2 size={12} />{t("common.delete", "删除")}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8, textAlign: "right" }}>
        {t("common.total", "共显示")} {filtered.length} / {active.length} {t("ui.条", "条")}
      </div>

      {/* 新增/编辑模态框 */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: "var(--bg-card, #fff)", borderRadius: 16, padding: "28px 32px", width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{modal === "add" ? t("ui.新增库位", "新增库位") : t("ui.编辑库位", "编辑库位")}</h2>
              <button type="button" onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>{t("ui.库位编码", "库位编码")} <span style={{ color: "var(--status-danger, #ef4444)" }}>*</span></label>
                <input value={String(form.location_code ?? "")} onChange={e => setForm(f => ({ ...f, location_code: e.target.value }))} placeholder={t("ui.如LOCA0101", "如 LOC-A-01-01")} style={inputStyle} disabled={modal === "edit"} />
              </div>
              <div><label style={labelStyle}>{t("ui.库位名称", "库位名称")}</label><input value={String(form.location_name ?? "")} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} placeholder={t("ui.如A区1排1层", "如 A区1排1层")} style={inputStyle} /></div>
              <div><label style={labelStyle}>{t("ui.仓库编码", "仓库编码")} <span style={{ color: "var(--status-danger, #ef4444)" }}>*</span></label><input value={String(form.warehouse_code ?? "")} onChange={e => setForm(f => ({ ...f, warehouse_code: e.target.value }))} placeholder={t("ui.如WMSVTEMAIN", "如 WMS-VTE-MAIN")} style={inputStyle} /></div>
              <div><label style={labelStyle}>{t("ui.库区", "库区")}</label><input value={String(form.zone_code ?? "")} onChange={e => setForm(f => ({ ...f, zone_code: e.target.value }))} placeholder={t("ui.如AB冷库", "如 A / B / 冷库")} style={inputStyle} /></div>
              <div><label style={labelStyle}>{t("common.status", "状态")}</label>
                <select value={String(form.status ?? "EMPTY")} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  {STATUS_OPTS.map(st => <option key={st} value={st}>{STATUS_LABEL[st]}（{st}）</option>)}
                </select>
              </div>
              {/* B3 删除：wms_locations DB 无 row_no / layer_no 列 */}
              <div><label style={labelStyle}>{t("ui.额定容量枚", "额定容量（枚）")}</label><input type="number" min={0} value={Number(form.capacity_qty ?? 0)} onChange={e => setForm(f => ({ ...f, capacity_qty: e.target.value }))} style={inputStyle} /></div>
              {/* B3 删除：wms_locations DB 无 remark 列；如需备注 — 加 DB migration */}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button type="button" onClick={closeModal} className={s.btnSecondary} style={{ padding: "9px 20px" }}>{t("common.cancel", "取消")}</button>
              <button type="button" onClick={handleSave} disabled={saving || !form.location_code || !form.warehouse_code} className={s.btnPrimary} style={{ padding: "9px 22px", opacity: saving ? 0.7 : 1 }}>
                <Check size={14} />{saving ? t("ui.保存中", "保存中…") : t("common.save", "确认保存")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmOpen} title={t("ui.确认删除库位", "确认删除库位")}
        message={`${t("ui.将把库位标记为DELETED该操作不可通过界面撤销", "将把库位")}「${deleteTarget?.location_code ?? ""}」${t("ui.标记为DELETED该操作不可通过界面撤销", "标记为 DELETED，该操作不可通过界面撤销。")}`}
        onConfirm={confirmDelete} onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }} />
    </div>
  );
}
