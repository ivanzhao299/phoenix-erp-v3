"use client";

export function WorkflowTimeline({ actions = [] }: { actions?: Record<string, unknown>[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {actions.map((action, idx) => (
        <div key={idx} style={{ borderLeft: "3px solid var(--color-primary)", paddingLeft: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{String(action.action || "-")}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {String(action.actor_name || "系统")} · {String(action.created_at || "")}
          </div>
          {action.comment ? <div style={{ marginTop: 4, fontSize: 13 }}>{String(action.comment)}</div> : null}
        </div>
      ))}
      {actions.length === 0 ? <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>暂无轨迹</div> : null}
    </div>
  );
}
