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

function isSystemAlert(n: NotificationRouteLike): boolean {
  return n.notificationType === "SYSTEM_ALERT"
    || n.linkType === "SYSTEM_ALERT"
    || n.bizType === "SYS_ALERT";
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

  if (isSystemAlert(n)) {
    return extractRelatedPath(n.content) ?? "/system/alerts";
  }

  return notificationHome;
}
