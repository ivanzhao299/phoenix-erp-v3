"use client";
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import { Settings2, RefreshCw, Save, Lock } from "lucide-react";

interface Config {
  id:           number;
  config_group: string;
  config_key:   string;
  config_value: string;
  value_type:   string;
  description:  string | null;
  is_readonly:  boolean;
  updated_by:   string | null;
  updated_at:   string | null;
}

export default function SystemConfigsPage() {
  const [configs,    setConfigs]    = useState<Config[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [editId,     setEditId]     = useState<number | null>(null);
  const [editValue,  setEditValue]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [filterGroup, setFilterGroup] = useState("");

  const tok = () => sessionStorage.getItem("phoenix_token") ?? "";

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterGroup ? `?group=${filterGroup}` : "";
      const res = await fetch(`/api/system/configs${params}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) setConfigs(await res.json());
    } finally { setLoading(false); }
  }, [filterGroup]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleEdit = (cfg: Config) => {
    setEditId(cfg.id);
    setEditValue(cfg.config_value);
  };

  const handleSave = async (key: string) => {
    if (!editValue.trim()) return alert("配置值不能为空");
    setSaving(true);
    try {
      const res = await fetch(`/api/system/configs/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: editValue }),
      });
      if (res.ok) { setEditId(null); fetchConfigs(); }
      else { const e = await res.json(); alert(e.msg ?? "修改失败"); }
    } finally { setSaving(false); }
  };

  const groups = Array.from(new Set(configs.map(c => c.config_group)));

  return (
    <div>
      <PageHeader
        title="生产配置治理"
        subtitle="禁止硬编码业务参数；所有修改须记录 updated_by / updated_at"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13 }}
            >
              <option value="">全部分组</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button
              onClick={fetchConfigs}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                borderRadius: "var(--radius-md)", background: "var(--primary)", color: "#fff",
                border: "none", cursor: "pointer", fontSize: 13,
              }}
            >
              <RefreshCw size={13} />刷新
            </button>
          </div>
        }
      />

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
              {["分组", "配置键", "当前值", "类型", "说明", "最后修改", "操作"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg, i) => (
              <tr key={cfg.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-surface)" }}>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>{cfg.config_group}</span>
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12 }}>{cfg.config_key}</td>
                <td style={{ padding: "10px 14px" }}>
                  {editId === cfg.id ? (
                    <input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      style={{ padding: "4px 8px", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", fontSize: 13, width: "100%", minWidth: 120 }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontFamily: "monospace" }}>{cfg.config_value}</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: 11 }}>{cfg.value_type}</td>
                <td style={{ padding: "10px 14px", color: "var(--text-secondary)", maxWidth: 200 }}>{cfg.description ?? "—"}</td>
                <td style={{ padding: "10px 14px", color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>
                  {cfg.updated_by ? `${cfg.updated_by} · ${new Date(cfg.updated_at!).toLocaleDateString("zh-CN")}` : "—"}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {cfg.is_readonly ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary)", fontSize: 11 }}>
                      <Lock size={12} />只读
                    </span>
                  ) : editId === cfg.id ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleSave(cfg.config_key)}
                        disabled={saving}
                        style={{ padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "#16a34a", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                      >
                        <Save size={11} />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        style={{ padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(cfg)}
                      style={{ padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      编辑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
