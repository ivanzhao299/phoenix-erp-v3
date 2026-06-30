"use client";

import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import { Settings2, RefreshCw, Save, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import s from "@/components/ui/admin-ui.module.css";
interface Config {
  id: number;
  config_group: string;
  config_key: string;
  config_value: string;
  value_type: string;
  description: string | null;
  is_readonly: boolean;
  updated_by: string | null;
  updated_at: string | null;
}
export default function SystemConfigsPage() {
  const { t } = useLanguage();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterGroup, setFilterGroup] = useState("");
  const tok = () => sessionStorage.getItem("phoenix_token") ?? "";
  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterGroup ? `?group=${filterGroup}` : "";
      const res = await fetch(`/api/system/configs${params}`, {
        headers: {
          Authorization: `Bearer ${tok()}`
        }
      });
      if (res.ok) setConfigs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filterGroup]);
  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);
  const handleEdit = (cfg: Config) => {
    setEditId(cfg.id);
    setEditValue(cfg.config_value);
  };
  const handleSave = async (key: string) => {
    if (!editValue.trim()) return alert(t('ui.配置值不能为空', '配置值不能为空'));
    setSaving(true);
    try {
      const res = await fetch(`/api/system/configs/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tok()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          value: editValue
        })
      });
      if (res.ok) {
        setEditId(null);
        fetchConfigs();
      } else {
        const e = await res.json();
        alert(e.msg ?? t('ui.修改失败', '修改失败'));
      }
    } finally {
      setSaving(false);
    }
  };
  const groups = Array.from(new Set(configs.map(c => c.config_group)));
  return <div>
      <PageHeader title={t('ui.生产配置治理', '生产配置治理')} subtitle={t('ui.禁止硬编码业务参数；所有修改须记录 updated_by / updated_at', '禁止硬编码业务参数；所有修改须记录 updated_by / updated_at')} actions={<div className={u.flexRow8}>
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{
        padding: "6px 12px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        fontSize: 13
      }}>
              <option value="">{t('ui.全部分组', '全部分组')}</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button onClick={fetchConfigs} disabled={loading} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: "var(--radius-md)",
        background: "var(--primary)",
        color: "var(--bg-card)",
        border: "none",
        cursor: "pointer",
        fontSize: 13
      }}>
              <RefreshCw size={13} />{t('ui.刷新', '刷新')}
            </button>
          </div>} />

      <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden"
    }}>
        <table className={s.table}>
          <thead>
            <tr>
              {[t('ui.分组', '分组'), t('ui.配置键', '配置键'), t('ui.当前值', '当前值'), t('ui.类型', '类型'), t('ui.说明', '说明'), t('ui.最后修改', '最后修改'), t('ui.操作', '操作')].map(h => <th key={h} className={u.nowrap}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg, i) => <tr key={cfg.id}>
                <td>
                  <span style={{
                padding: "1px 8px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 700,
                background: "var(--status-info-bg)",
                color: "var(--color-accent)"
              }}>{cfg.config_group}</span>
                </td>
                <td style={{
              fontFamily: "monospace",
              fontSize: 12
            }}>{cfg.config_key}</td>
                <td>
                  {editId === cfg.id ? <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{
                padding: "4px 8px",
                border: "1px solid var(--primary)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                width: "100%",
                minWidth: 120
              }} autoFocus /> : <span style={{
                fontFamily: "monospace"
              }}>{cfg.config_value}</span>}
                </td>
                <td style={{
              color: "var(--text-secondary)",
              fontSize: 11
            }}>{cfg.value_type}</td>
                <td style={{
              color: "var(--text-secondary)",
              maxWidth: 200
            }}>{cfg.description ?? "—"}</td>
                <td style={{
              color: "var(--text-secondary)",
              fontSize: 11,
              whiteSpace: "nowrap"
            }}>
                  {cfg.updated_by ? `${cfg.updated_by} · ${new Date(cfg.updated_at!).toLocaleDateString("zh-CN")}` : "—"}
                </td>
                <td>
                  {cfg.is_readonly ? <span style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "var(--text-secondary)",
                fontSize: 11
              }}>
                      <Lock size={12} />{t('ui.只读', '只读')}
                    </span> : editId === cfg.id ? <div style={{
                display: "flex",
                gap: 6
              }}>
                      <button onClick={() => handleSave(cfg.config_key)} disabled={saving} style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--status-success)",
                  color: "var(--bg-card)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600
                }}>
                        <Save size={11} />
                      </button>
                      <button onClick={() => setEditId(null)} style={{
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: 12
                }}>
                        {t('ui.取消', '取消')}
                      </button>
                    </div> : <button onClick={() => handleEdit(cfg)} style={{
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                background: "var(--primary)",
                color: "var(--bg-card)",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600
              }}>
                      {t('ui.编辑', '编辑')}
                    </button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}