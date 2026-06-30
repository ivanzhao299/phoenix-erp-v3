"use client";

import s from "@/components/ui/admin-ui.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

export function WorkflowTimeline({ actions = [] }: { actions?: Record<string, unknown>[] }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {actions.map((action, idx) => (
        <div key={idx} style={{ borderLeft: "3px solid var(--color-primary)", paddingLeft: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{String(action.action || "-")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {String(action.actor_name || t('ui.系统','系统'))} · {String(action.created_at || "")}
          </div>
          {action.comment ? <div style={{ marginTop: 4, fontSize: 13 }}>{String(action.comment)}</div> : null}
        </div>
      ))}
      {actions.length === 0 ? (
        <div className={s.emptyState} style={{ padding: "28px 16px" }}>
          <div className={s.emptyStateText}>{t('ui.暂无轨迹','暂无轨迹')}</div>
        </div>
      ) : null}
    </div>
  );
}
