"use client";

// G171：在线用户——基于 SSE 长连接的实时在线状态。每 20s 刷新。
import { useState, useEffect, useCallback, useRef } from "react";
import u from "@/styles/uix-utils.module.css";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
import { RefreshCw, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import request from "@/lib/api-client";
import usePermission from "@/hooks/usePermission";
import { useLanguage } from "@/contexts/LanguageContext";

interface OnlineUser {
  userId: string;
  username: string | null;
  realNameZh: string | null;
  roleNameZh: string | null;
  storeCode: string | null;
  connections: number;
  lastSeen: number;
  since: number;
}

function fmtTime(ms?: number) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString("zh-CN"); } catch { return "—"; }
}
function fmtDuration(sinceMs?: number) {
  if (!sinceMs) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  if (sec < 60) return `${sec} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`;
  return `${Math.floor(sec / 86400)} 天`;
}

export default function OnlineUsersPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const onlineUsersPerm = usePermission("MENU_SETTINGS_ONLINE_USER");
  const [items, setItems] = useState<OnlineUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const shownErr = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!onlineUsersPerm.canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // silent：失败不派发全局 toast（页面级 toast.error 已足够提示，避免 20s 轮询刷屏）
      const r = await request<{ total: number; items: OnlineUser[] }>("/system/online-users", { silent: true });
      setItems(r?.items ?? []);
      setTotal(r?.total ?? 0);
      setErr('');
      shownErr.current = false;
    } catch {
      if (!silent && !shownErr.current) {
        toast.error(t('ui.加载失败（需管理员权限）','加载失败（需管理员权限）'));
        shownErr.current = true;
      }
      setErr('加载失败');
    } finally {
      setLoading(false);
    }
  }, [onlineUsersPerm.canView, toast]);

  useEffect(() => {
    if (!onlineUsersPerm.canView) return;
    load();
    const id = setInterval(() => load(true), 20000);
    return () => clearInterval(id);
  }, [load, onlineUsersPerm.canView]);

  if (!onlineUsersPerm.canView) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('ui.在线用户','在线用户')} subtitle={t('ui.需要系统监控查看权限','需要系统监控查看权限')} breadcrumb={[t('ui.系统设置','系统设置'), t('ui.在线用户','在线用户')]} />
        <div className={u.emptyCenter}>{t('ui.无权限访问在线用户','无权限访问在线用户')}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.在线用户','在线用户')} subtitle={`当前在线 ${total} 人 · 基于实时连接，每 20 秒刷新`} breadcrumb={[t('ui.系统设置','系统设置'), t('ui.在线用户','在线用户')]}
        actions={
          <button type="button" className={`${s.btnSecondary} ${u.flexRow}`} onClick={() => load()} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> {t('ui.刷新','刷新')}
          </button>
        } />

      <div style={{ overflowX: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <table className={s.table} style={{ width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('ui.姓名','姓名')}</th><th>{t('ui.账号','账号')}</th><th>{t('ui.角色','角色')}</th><th>{t('ui.公司','公司')}</th><th className={u.tac}>{t('ui.连接数','连接数')}</th><th>{t('ui.上次活跃','上次活跃')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={6} className={u.emptyCenter}>{t('ui.加载中…','加载中…')}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className={u.emptyCenter}><Users size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />{t('ui.当前无在线用户','当前无在线用户')}</td></tr>
            ) : items.map((it) => (
              <tr key={it.userId}>
                <td style={{ wordBreak: "break-word" }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 7, background: "var(--status-success)", marginRight: 6 }} />
                  {it.realNameZh || it.username || it.userId}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{it.username ?? "—"}</td>
                <td style={{ wordBreak: "break-word" }}>{it.roleNameZh ?? "—"}</td>
                <td style={{ wordBreak: "break-word" }}>{it.storeCode ?? "—"}</td>
                <td className={u.tac}>{it.connections}</td>
                <td title={`在线时长 ${fmtDuration(it.since)}`}>{fmtTime(it.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
