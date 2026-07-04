export interface NotificationRouteLike {
  notificationType?: string | null;
  notification_type?: string | null;
  content?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  linkId?: string | null;
  link_id?: string | null;
  bizType?: string | null;
  biz_type?: string | null;
  bizNo?: string | null;
  biz_no?: string | null;
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

function isDeviceAlertContent(content?: string | null): boolean {
  if (!content) return false;
  return /IOT_DEVICE_ALERT|设备预警|设备告警|\/breeding\/device/.test(content);
}

function mobilePathFromRelatedPath(path: string | null): string | null {
  if (!path) return null;
  let url: URL;
  try {
    url = new URL(path, "http://phoenix.local");
  } catch {
    return null;
  }

  if (url.pathname === "/breeding/device"
    || url.pathname === "/breeding/device-alerts"
    || url.pathname === "/breeding/device-ops") {
    const params = new URLSearchParams();
    const house = url.searchParams.get("house");
    if (house) params.set("house", house);
    const query = params.toString();
    return query ? `/mobile/device?${query}` : "/mobile/device";
  }

  if (url.pathname === "/notifications") return "/mobile/notifications";

  return null;
}

export function isSystemAlertNotification(n: NotificationRouteLike): boolean {
  const notificationType = n.notificationType ?? n.notification_type;
  const linkType = n.linkType ?? n.link_type;
  const bizType = n.bizType ?? n.biz_type;
  return notificationType === "SYSTEM_ALERT"
    || linkType === "SYSTEM_ALERT"
    || bizType === "SYS_ALERT";
}

export function getSystemAlertId(n: NotificationRouteLike): string | null {
  if (!isSystemAlertNotification(n)) return null;
  const raw = n.linkId ?? n.link_id ?? n.bizNo ?? n.biz_no ?? null;
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
  const linkType = n.linkType ?? n.link_type;
  const linkId = n.linkId ?? n.link_id;

  if (isSystemAlertNotification(n)) {
    const alertId = getSystemAlertId(n);
    const relatedPath = extractRelatedPath(n.content);

    if (options.mobile) {
      const mobileRelatedPath = mobilePathFromRelatedPath(relatedPath);
      if (mobileRelatedPath) {
        const separator = mobileRelatedPath.includes("?") ? "&" : "?";
        return alertId ? `${mobileRelatedPath}${separator}alertId=${encodeURIComponent(alertId)}` : mobileRelatedPath;
      }
      if (isDeviceAlertContent(n.content)) {
        return alertId ? `/mobile/device?alertId=${encodeURIComponent(alertId)}` : "/mobile/device";
      }
      return notificationHome;
    }

    const params = new URLSearchParams();
    if (alertId) params.set("alertId", alertId);
    if (relatedPath) params.set("relatedPath", relatedPath);
    const query = params.toString();
    return query ? `/system/alerts?${query}` : "/system/alerts";
  }

  const directLinkType = safeInternalPath(linkType);
  if (directLinkType) return directLinkType;

  if (linkType === "PAGE") {
    return safeInternalPath(linkId) ?? notificationHome;
  }

  if (linkType === "APPROVAL_INSTANCE") {
    return linkId
      ? `${approvalHome}?instanceId=${encodeURIComponent(linkId)}`
      : approvalHome;
  }

  return notificationHome;
}
