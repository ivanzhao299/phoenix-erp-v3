"use client";

// G171：顶栏在线人数小指示。在线用户走 MENU_SETTINGS_ONLINE_USER 原子菜单码；
//   无权限时前端不渲染，后端 /api/system/online-count 也会 403 fail-closed。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import request from "@/lib/api-client";
import { usePermission } from "@/hooks/usePermission";
import { useLanguage } from "@/contexts/LanguageContext";

export function OnlineUsersIndicator() {
  const { t } = useLanguage();
  const router = useRouter();
  const onlineUsersPerm = usePermission("MENU_SETTINGS_ONLINE_USER");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!onlineUsersPerm.hasAccess) {
      setCount(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await request<{ count: number }>("/system/online-count", { silent: true });
        if (alive) setCount(r?.count ?? 0);
      } catch { /* 无权限/网络：保持 null → 不显示 */ }
    };
    load();
    const id = setInterval(load, 30000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [onlineUsersPerm.hasAccess]);

  if (count === null) return null;
  return (
    <button type="button" onClick={() => router.push("/settings/online-users")} title={t('ui.在线用户','在线用户')}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
        borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-card)",
        color: "var(--text-secondary)", cursor: "pointer", fontSize: 12.5, whiteSpace: "nowrap",
      }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: "var(--status-success)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--status-success) 30%, transparent)" }} />
      <Users size={14} /> {t('ui.在线','在线')} {count}
    </button>
  );
}

export default OnlineUsersIndicator;
