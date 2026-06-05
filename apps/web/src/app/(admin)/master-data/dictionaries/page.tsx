"use client";
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import { BookOpen, Search, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

/**
 * 主数据中心 — 系统字典
 * 数据来源：Generic CRUD → GET /api/crud/sys_dict
 * 完整管理入口：/settings/dict
 */

const tok = () =>
  typeof window !== "undefined"
    ? sessionStorage.getItem("phoenix_token") || localStorage.getItem("phoenix_token") || ""
    : "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const COLORS = ["var(--color-accent)","var(--status-special)","var(--status-success)","var(--status-warning)","var(--status-danger)","var(--color-accent)","var(--status-special)","var(--status-success)","var(--status-warning)","var(--status-special)"];
const typeColor = (t: string) => COLORS[(t.charCodeAt(0) ?? 0) % COLORS.length];

interface DictRow {
  id?: number;
  dict_code: string;
  dict_type?: string;
  dict_label_zh?: string;
  dict_label_lo?: string;
  dict_label_en?: string;
  sort_no?: number;
  status?: string;
}

// dict_type 中文标签
const TYPE_LABEL_MAP: Record<string, string> = {
  PKG_EGG_GRADE:          "鸡蛋等级",
  PKG_ANOMALY_REASON:     "包装异常原因",
  PKG_EGG_DEFECT:         "蛋品缺陷类型",
  SAL_RETURN_REASON:      "退货原因",
  SAL_VOID_REASON:        "作废原因",
  SAL_DISCOUNT_TYPE:      "优惠类型",
  WMS_LOSS_REASON:        "仓库报损原因",
  WMS_TRANSFER_REASON:    "调拨原因",
  APPROVAL_TYPE:          "审批类型",
  STORE_LOSS_REASON:      "门店损耗原因",
  FARM_MEDICINE_TYPE:     "用药分类",
  FARM_DISEASE_TYPE:      "疾病分类",
  QA_DEFECT_TYPE:         "质检缺陷类型",
  QA_NC_DISPOSITION:      "不合格品处置",
  FEED_CATEGORY:          "饲料品类",
};

export default function MdDictionariesPage() {
  const { canView } = usePermission("MENU_SETTINGS_DATA");
  const [items, setItems] = useState<DictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crud/sys_dict?limit=500", { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.rows ?? data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return (
    <div style={{ padding: 40, color: "var(--text-disabled)", textAlign: "center" }}>无权限查看系统字典</div>
  );

  const types = Array.from(new Set(items.map(d => d.dict_type ?? ""))).filter(Boolean).sort();

  const filtered = items.filter(d => {
    const matchSearch = !search ||
      (d.dict_code ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.dict_label_zh ?? "").includes(search) ||
      (d.dict_type ?? "").includes(search);
    const matchType = !typeFilter || d.dict_type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div style={{ padding: "24px 32px", background: "var(--text-primary)", minHeight: "100vh", color: "var(--border)" }}>
      <PageHeader
        title="系统字典"
        subtitle="等级 / 规格 / 原因 / 类型 · 全系统统一编码"
        breadcrumb={["主数据中心", "系统字典"]}
      />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 240px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索字典码 / 标签..." style={{ width: "100%", padding: "7px 10px 7px 32px", background: "var(--text-primary)", border: "1px solid var(--text-primary)", borderRadius: 7, color: "var(--border)", fontSize: 13, outline: "none" }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "7px 12px", background: "var(--text-primary)", border: "1px solid var(--text-primary)", borderRadius: 7, color: "var(--text-disabled)", fontSize: 13, maxWidth: 200 }}>
          <option value="">全部分类 ({types.length})</option>
          {types.map(t => <option key={t} value={t}>{TYPE_LABEL_MAP[t] ?? t}</option>)}
        </select>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--text-primary)", border: "1px solid var(--text-primary)", borderRadius: 7, color: "var(--text-disabled)", fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={13} /> 刷新
        </button>
        <div className={u.flex1} />
        <Link href="/settings/dict" style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--status-special)", border: "none", borderRadius: 7, color: "var(--text-on-dark)", fontSize: 13, cursor: "pointer", textDecoration: "none", fontWeight: 600 }}>
          <ExternalLink size={13} /> 完整管理
        </Link>
      </div>

      <div style={{ marginBottom: 12, color: "var(--text-secondary)", fontSize: 12 }}>
        共 <span style={{ color: "var(--text-disabled)", fontWeight: 600 }}>{filtered.length}</span> 条字典项目
        {types.length > 0 && <span style={{ marginLeft: 12 }}>共 <span style={{ color: "var(--text-disabled)", fontWeight: 600 }}>{types.length}</span> 种分类</span>}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>加载中...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--status-danger)" }}>{error}</div>
      ) : (
        <div style={{ background: "var(--text-primary)", borderRadius: 10, border: "1px solid var(--text-primary)", overflow: "auto" }}>
          <table className={s.table}>
            <thead>
              <tr>
                {["分类", "字典码", "中文标签", "老挝语标签", "英文标签", "排序", "状态"].map(h => (
                  <th key={h} style={h === "排序" ? { textAlign: "center" } : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>暂无数据</td></tr>
              ) : filtered.map((d, i) => {
                const tColor = typeColor(d.dict_type ?? "A");
                const st = d.status === "INACTIVE" ? { label: "停用", color: "var(--text-secondary)" } : { label: "启用", color: "var(--status-success)" };
                return (
                  <tr key={d.id ?? i} style={{ borderBottom: "1px solid var(--text-primary)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${tColor}22`, color: tColor, fontSize: 11, fontWeight: 600 }}>
                        {TYPE_LABEL_MAP[d.dict_type ?? ""] ?? d.dict_type ?? "-"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-disabled)", fontFamily: "monospace", fontSize: 12 }}>{d.dict_code}</td>
                    <td style={{ color: "var(--bg-muted)" }}>{d.dict_label_zh ?? "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{d.dict_label_lo ?? "-"}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{d.dict_label_en ?? "-"}</td>
                    <td style={{ color: "var(--text-secondary)", textAlign: "center" }}>{d.sort_no ?? "-"}</td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: `${st.color}22`, color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
