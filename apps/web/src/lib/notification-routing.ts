export interface NotificationRouteLike {
  notificationType?: string | null;
  content?: string | null;
  linkType?: string | null;
  linkId?: string | null;
  bizType?: string | null;
}

export interface NotificationRouteOptions {
  mobile?: boolean;
}

function safeInternalPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function extractRelatedPath(content?: string | null): string | null {
  if (!content) return null;
  const match = content.match(/路径[:：]\s*([^\s\n\r]+)/);
  return safeInternalPath(match?.[1]);
}

export function isSystemAlertNotification(n: NotificationRouteLike): boolean {
  return n.notificationType === "SYSTEM_ALERT"
    || n.linkType === "SYSTEM_ALERT"
    || n.bizType === "SYS_ALERT";
}

export function getSystemAlertId(n: NotificationRouteLike): string | null {
  if (!isSystemAlertNotification(n)) return null;
  const raw = n.linkId ?? null;
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function extractAlertJson(content?: string | null): Record<string, unknown> | null {
  if (!content) return null;
  const marker = content.indexOf("详情：");
  const jsonText = marker >= 0 ? content.slice(marker + "详情：".length).trim() : "";
  if (!jsonText.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

export function summarizeNotificationContent(n: NotificationRouteLike): string {
  if (!isSystemAlertNotification(n)) return n.content ?? "";
  const detail = extractAlertJson(n.content);
  const relatedPath = extractRelatedPath(n.content);
  if (!detail) {
    return [
      "系统告警",
      relatedPath ? `相关页面：${relatedPath}` : null,
    ].filter(Boolean).join(" · ");
  }

  const house = str(detail.houseCode);
  const property = str(detail.propertyCode);
  const current = str(detail.currentValue);
  const threshold = str(detail.thresholdValue);
  const unit = str(detail.unit);
  const alertType = str(detail.alertType);
  const alertNo = str(detail.alertNo);
  const valueText = current && threshold
    ? `当前 ${current}${unit} / 阈值 ${threshold}${unit}`
    : "";

  return [
    house ? `鸡舍 ${house}` : null,
    property ? `指标 ${property}` : null,
    alertType || null,
    valueText || null,
    alertNo ? `告警号 ${alertNo}` : null,
    relatedPath ? `相关页面：${relatedPath}` : null,
  ].filter(Boolean).join(" · ");
}

export function resolveNotificationHref(
  n: NotificationRouteLike,
  options: NotificationRouteOptions = {},
): string {
  const approvalHome = options.mobile ? "/mobile/workflow" : "/workflow/todos";
  const notificationHome = options.mobile ? "/mobile/notifications" : "/notifications";

  const directLinkType = safeInternalPath(n.linkType);
  if (directLinkType) return directLinkType;

  if (n.linkType === "PAGE") {
    return safeInternalPath(n.linkId) ?? notificationHome;
  }

  if (n.linkType === "APPROVAL_INSTANCE") {
    return n.linkId
      ? `${approvalHome}?instanceId=${encodeURIComponent(n.linkId)}`
      : approvalHome;
  }

  if (isSystemAlertNotification(n)) {
    const alertId = getSystemAlertId(n);
    const params = new URLSearchParams();
    if (alertId) params.set("alertId", alertId);
    const relatedPath = extractRelatedPath(n.content);
    if (relatedPath) params.set("relatedPath", relatedPath);
    const query = params.toString();
    return query ? `/system/alerts?${query}` : "/system/alerts";
  }

  return notificationHome;
}
