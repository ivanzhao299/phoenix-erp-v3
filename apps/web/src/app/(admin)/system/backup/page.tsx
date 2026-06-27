"use client";
/**
 * Phoenix ERP V3 — 备份策略
 * 接 /api/system/backup(记录 + 计划配置 + 手动请求)。
 * 安全:真备份由服务器运维脚本(scripts/backup-db.sh)+ cron 执行;本页只展示历史、
 *      改计划/保留、提交手动请求(入队 PENDING),应用不直接跑 pg_dump。
 */
import { useState, useEffect, useCallback } from "react";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import PageHeader from "@/components/PageHeader";
import { Database, RefreshCw, PlayCircle, Save, Loader2, Info } from "lucide-react";

interface BackupRow {
  id: number; backup_no: string; backup_type: string; trigger_type: string;
  status: string; file_path: string | null; size_bytes: number | null;
  operator: string | null; note: string | null;
  started_at: string | null; finished_at: string | null; created_at: string;
}
interface Cfg { enabled: boolean; cron_expr: string; retention_days: number; }

const tok = () => (typeof window === "undefined" ? "" : sessionStorage.getItem("phoenix_token") ?? "");
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "var(--status-info-bg)", color: "var(--color-accent)", label: "排队中" },
  RUNNING: { bg: "var(--status-warning-bg-faint)", color: "var(--status-warning)", label: "执行中" },
  SUCCESS: { bg: "var(--status-success-bg)", color: "var(--status-success)", label: "成功" },
  FAILED:  { bg: "var(--status-danger-bg-faint)", color: "var(--status-danger)", label: "失败" },
};

function fmtSize(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export default function BackupPage() {
  const [rows, setRows]       = useState<BackupRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cfg, setCfg]         = useState<Cfg | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [msg, setMsg]         = useState<{ t: "ok" | "err"; m: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, cfgRes] = await Promise.all([
        fetch(`/api/system/backup/records?limit=50`, { headers: hdr() }),
        fetch(`/api/system/backup/config`, { headers: hdr() }),
      ]);
      if (recRes.ok) { const d = await recRes.json(); setRows(d.items ?? []); setTotal(d.total ?? 0); }
      if (cfgRes.ok) setCfg(await cfgRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const requestBackup = async () => {
    setRequesting(true); setMsg(null);
    try {
      const res = await fetch(`/api/system/backup/request`, { method: "POST", headers: hdr(), body: JSON.stringify({ backupType: "FULL" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message ?? `HTTP ${res.status}`);
      setMsg({ t: "ok", m: `已提交备份请求 ${d.backup_no}，由运维 runner 执行` });
      fetchAll();
    } catch (e: any) { setMsg({ t: "err", m: e.message }); } finally { setRequesting(false); }
  };

  const saveCfg = async () => {
    if (!cfg) return;
    setSavingCfg(true); setMsg(null);
    try {
      const res = await fetch(`/api/system/backup/config`, { method: "PUT", headers: hdr(),
        body: JSON.stringify({ enabled: cfg.enabled, cronExpr: cfg.cron_expr, retentionDays: cfg.retention_days }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message ?? `HTTP ${res.status}`);
      setCfg(d); setMsg({ t: "ok", m: "备份计划已保存" });
    } catch (e: any) { setMsg({ t: "err", m: e.message }); } finally { setSavingCfg(false); }
  };

  return (
    <div>
      <PageHeader
        title="备份策略"
        subtitle={`共 ${total} 条记录 · 数据库备份 / 定时计划 / 保留策略`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchAll} disabled={loading} style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} /> 刷新
            </button>
            <button onClick={requestBackup} disabled={requesting} style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-accent)", color: "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: requesting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              {requesting ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />} 手动备份
            </button>
          </div>
        }
      />

      {msg && (
        <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: "var(--radius-md)", fontSize: 13,
          background: msg.t === "ok" ? "var(--status-success-bg)" : "var(--status-danger-bg-faint)",
          color: msg.t === "ok" ? "var(--status-success)" : "var(--status-danger)" }}>{msg.m}</div>
      )}

      {/* 安全边界说明 */}
      <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-muted)", color: "var(--text-secondary)", fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>真备份(pg_dump)由服务器运维脚本 + 定时任务执行;本页"手动备份"提交请求入队，由运维 runner 拾取执行并回写状态。应用不直接操作数据库文件。</span>
      </div>

      {/* 计划配置 */}
      {cfg && (
        <div style={{ marginBottom: 16, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>定时备份计划</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> 启用定时备份
            </label>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 3 }}>cron 表达式</div>
              <input value={cfg.cron_expr} onChange={e => setCfg({ ...cfg, cron_expr: e.target.value })}
                style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, width: 160, fontFamily: "monospace" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 3 }}>保留天数</div>
              <input type="number" min={1} max={3650} value={cfg.retention_days} onChange={e => setCfg({ ...cfg, retention_days: Math.max(1, Number(e.target.value) || 1) })}
                style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, width: 100 }} />
            </div>
            <button onClick={saveCfg} disabled={savingCfg} style={{ padding: "6px 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--status-success)", color: "var(--bg-card)", fontSize: 13, fontWeight: 600, cursor: savingCfg ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Save size={14} /> {savingCfg ? "保存中..." : "保存计划"}
            </button>
          </div>
        </div>
      )}

      {/* 备份记录 */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <table className={s.table}>
          <thead>
            <tr>{["备份编号", "类型", "触发", "状态", "大小", "文件", "操作人", "时间"].map(h => <th key={h} className={u.nowrap}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}><Loader2 size={22} className="animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>
                <Database size={26} /><p style={{ margin: "8px 0 0", fontWeight: 600 }}>暂无备份记录</p>
                <p style={{ margin: "4px 0 0", fontSize: 12 }}>点右上"手动备份"提交一次请求</p>
              </td></tr>
            ) : rows.map(r => {
              const st = STATUS_STYLE[r.status] ?? { bg: "var(--bg-muted)", color: "var(--text-secondary)", label: r.status };
              return (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.backup_no}</td>
                  <td style={{ fontSize: 12 }}>{r.backup_type}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.trigger_type === "MANUAL" ? "手动" : "定时"}</td>
                  <td><span style={{ padding: "1px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span></td>
                  <td style={{ fontSize: 12 }}>{fmtSize(r.size_bytes)}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.file_path ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{r.operator ?? "—"}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
