"use client";
import { useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, Star, X as XIcon, Info, Eye, EyeOff } from "lucide-react";

// ── 角色级别颜色 ────────────────────────────────────────────────────────────────
export const LEVEL_COLOR: Record<number, string> = {
  4: "var(--status-warning)", 3: "var(--status-special)", 2: "var(--color-accent)", 1: "var(--status-success)", 0: "var(--text-secondary)",
};
export const levelColor = (lv: number) => LEVEL_COLOR[lv] ?? "var(--text-secondary)";

// 角色优先级标签
export function LevelBadge({ level }: { level: number }) {
  const col = levelColor(level);
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
      background: col + "22", color: col, border: `1px solid ${col}44`, marginLeft: 3 }}>
      L{level}
    </span>
  );
}

export interface UserRole {
  role_code: string;
  role_name_zh: string;
  approval_level: number;
  is_primary: boolean;
  is_visible?: boolean;  // 前台是否显示该角色名（默认 true）
}
export interface RoleOption {
  role_code: string;
  role_name_zh: string;
  role_type: string;
  approval_level: number;
  description?: string;
}

// ── Role type grouping color (for RolePicker) ────────────────────
export const TYPE_COLOR: Record<string, string> = {
  SYSTEM: "var(--status-warning)", DECISION: "var(--status-special)", FINANCE: "var(--color-accent)",
  MANAGEMENT: "var(--color-accent)", PRODUCTION: "var(--status-success)", QUALITY: "var(--status-success)",
  PACKAGING: "var(--status-success)", WAREHOUSE: "var(--status-warning)", LOGISTICS: "var(--status-warning)",
  PROCUREMENT: "var(--status-special)", STORE: "var(--color-accent)", SALES: "var(--color-accent)",
  EXTERNAL: "var(--text-secondary)", custom: "var(--text-disabled)",
};

// ── Multi-role picker component ─────────────────────────────────
export function RolePicker({ allRoles, selected, onChange, maxHeight = 280 }: {
  allRoles: RoleOption[];
  selected: UserRole[];
  onChange: (roles: UserRole[]) => void;
  maxHeight?: number;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = allRoles.filter(r =>
      r.role_code.toLowerCase().includes(q) || r.role_name_zh.toLowerCase().includes(q)
    );
    const map = new Map<string, RoleOption[]>();
    for (const r of filtered) {
      const g = r.role_type || "custom";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const lvA = Math.max(...a[1].map(r => r.approval_level));
      const lvB = Math.max(...b[1].map(r => r.approval_level));
      return lvB - lvA;
    });
  }, [allRoles, search]);

  const selectedSet = new Set(selected.map(r => r.role_code));
  const primaryCode = selected.find(r => r.is_primary)?.role_code;

  const toggle = (role: RoleOption) => {
    if (selectedSet.has(role.role_code)) {
      const next = selected.filter(r => r.role_code !== role.role_code);
      // 如果删掉的是 primary，把剩余中 level 最高的设为 primary
      if (role.role_code === primaryCode && next.length > 0) {
        const maxLv = Math.max(...next.map(r => r.approval_level));
        const newPrim = next.find(r => r.approval_level === maxLv)!;
        onChange(next.map(r => ({ ...r, is_primary: r.role_code === newPrim.role_code })));
      } else {
        onChange(next);
      }
    } else {
      const isFirst = selected.length === 0;
      onChange([...selected, {
        role_code: role.role_code,
        role_name_zh: role.role_name_zh,
        approval_level: role.approval_level,
        is_primary: isFirst,
      }]);
    }
  };

  const setPrimary = (code: string) => {
    onChange(selected.map(r => ({ ...r, is_primary: r.role_code === code })));
  };

  // 切换该角色"是否在前台显示角色名"（is_visible，纯显示，不影响权限）
  const toggleVisible = (code: string) => {
    onChange(selected.map(r =>
      r.role_code === code ? { ...r, is_visible: r.is_visible === false ? true : false } : r
    ));
  };

  return (
    <div>
      {/* Already selected tags */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {[...selected].sort((a, b) => b.approval_level - a.approval_level).map(r => {
            const col = levelColor(r.approval_level);
            return (
              <div key={r.role_code} style={{ display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px 4px 10px", borderRadius: 20,
                background: col + "18", border: `1.5px solid ${col}44`,
                fontSize: 12, color: col, fontWeight: 600,
                opacity: r.is_visible === false ? 0.55 : 1,
                textDecoration: r.is_visible === false ? "line-through" : "none" }}>
                {r.is_primary && <Star size={10} style={{ fill: col }}/>}
                {r.role_name_zh}
                <LevelBadge level={r.approval_level}/>
                {/* 👁 toggle 前台显示开关（不影响权限）*/}
                <button type="button" onClick={() => toggleVisible(r.role_code)}
                  title={r.is_visible === false
                    ? t("ui.前台已隐藏点击恢复显示", "前台已隐藏，点击恢复显示")
                    : t("ui.前台已显示点击隐藏不影响权限", "前台已显示，点击隐藏（不影响权限）")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                    color: col, opacity: 0.7, display: "inline-flex", alignItems: "center" }}>
                  {r.is_visible === false ? <EyeOff size={11}/> : <Eye size={11}/>}
                </button>
                {!r.is_primary && selected.length > 1 && (
                  <button type="button" onClick={() => setPrimary(r.role_code)}
                    title={t("ui.设为主角色", "设为主角色")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                      color: col, opacity: 0.5, fontSize: 10, lineHeight: 1 }}>
                    ★
                  </button>
                )}
                <button type="button" onClick={() => toggle({ role_code: r.role_code, role_name_zh: r.role_name_zh,
                    role_type: "", approval_level: r.approval_level, description: "" })}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    padding: "0 2px", color: col, opacity: 0.7 }}>
                  <XIcon size={10}/>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        background: "var(--bg-page)", borderRadius: 8, padding: "6px 10px",
        border: "1px solid var(--border)" }}>
        <Search size={12} color="var(--text-secondary)"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("ui.搜索角色", "搜索角色...")}
          style={{ border: "none", background: "transparent", outline: "none",
            fontSize: 12, color: "var(--text-primary)", width: "100%" }}/>
      </div>

      {/* Role list grouped by type */}
      <div style={{ maxHeight, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {grouped.map(([type, roles]) => {
          const groupCol = TYPE_COLOR[type] ?? "var(--text-disabled)";
          return (
          // 每个角色分组整栏一个浅色块，区分上下各类别段
          <div key={type} style={{
            background: `color-mix(in srgb, ${groupCol} 7%, transparent)`,
            border: `1px solid color-mix(in srgb, ${groupCol} 16%, transparent)`,
            borderRadius: 8, padding: "8px 10px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: groupCol,
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              {type}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {roles.map(r => {
                const isSelected = selectedSet.has(r.role_code);
                const col = levelColor(r.approval_level);
                return (
                  <button type="button" key={r.role_code} onClick={() => toggle(r)}
                    title={`${r.role_code}${r.description ? " — " + r.description : ""}`}
                    style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: 12, cursor: "pointer",
                      fontWeight: isSelected ? 700 : 400,
                      // 卡片本身保持中性；分组色块负责区分类别
                      background: isSelected ? `color-mix(in srgb, ${col} 20%, var(--bg-card))` : "var(--bg-card)",
                      border: `1.5px solid ${isSelected ? col : "var(--border)"}`,
                      color: isSelected ? col : "var(--text-secondary)",
                      transition: "all 0.15s",
                    }}>
                    {isSelected && "✓ "}
                    {r.role_name_zh}
                    <LevelBadge level={r.approval_level}/>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 12, padding: "16px 0" }}>
            {t("common.no_data", "暂无数据")}
          </div>
        )}
      </div>

      {selected.length > 1 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)",
          display: "flex", alignItems: "center", gap: 4 }}>
          <Info size={10}/>
          {t("ui.星号角色为主角色点击角色旁星号切换", "★ 为主角色，点击角色旁 ★ 切换")}
        </div>
      )}
    </div>
  );
}

export default RolePicker;
