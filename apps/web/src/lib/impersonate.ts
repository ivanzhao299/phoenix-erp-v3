/**
 * 影子登录（impersonate）客户端助手 —— 仅超管可用。
 * 进入：备份当前(超管)会话 → 调 /api/auth/impersonate 取目标用户真实会话 → 切换 → 跳转。
 * 退出：从备份恢复超管会话。
 * 后端已保证 token 带 impersonatedBy 标记 + 写审计。
 */
const ORIGIN_KEY = "phoenix_imp_origin";

function applySession(token: string, userInfo: any, cookieToken?: string) {
  const ck = cookieToken || token;
  sessionStorage.setItem("phoenix_token", token);
  sessionStorage.setItem("phoenix_user", JSON.stringify(userInfo));
  sessionStorage.setItem("phoenix_cookie_token", ck);
  localStorage.setItem("phoenix_token", token);
  localStorage.setItem("phoenix_user", JSON.stringify(userInfo));
  localStorage.setItem("phoenix_cookie_token", ck);
  document.cookie = `phoenix_access_token=${ck}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
}

/** 当前是否处于影子模式 → 返回 { by:发起超管, as:目标用户显示名 } 或 null */
export function getImpersonation(): { by: string; as: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const u = JSON.parse(sessionStorage.getItem("phoenix_user") || "null");
    if (u?.impersonatedBy) return { by: u.impersonatedBy.username, as: u.realNameZh || u.username };
  } catch { /* ignore */ }
  return null;
}

/** 进入影子模式：以 username 身份查看 */
export async function enterImpersonation(username: string): Promise<void> {
  const token = sessionStorage.getItem("phoenix_token") || "";
  if (!token) throw new Error("未登录");
  // 备份当前(超管)会话，供退出时还原
  sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({
    token,
    user: sessionStorage.getItem("phoenix_user"),
    cookie: sessionStorage.getItem("phoenix_cookie_token"),
  }));
  const r = await fetch("/api/auth/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  }).then((x) => x.json());
  if (r.code !== 200 || !r.token) {
    sessionStorage.removeItem(ORIGIN_KEY);
    throw new Error(r.msg || r.message || "影子登录失败");
  }
  applySession(r.token, r.user_info, r.cookie_token);
  window.location.href = "/dashboard";
}

/** 退出影子模式：还原超管会话 */
export function exitImpersonation(): void {
  const raw = sessionStorage.getItem(ORIGIN_KEY);
  if (raw) {
    try {
      const o = JSON.parse(raw);
      const user = o.user ? JSON.parse(o.user) : null;
      if (o.token && user) applySession(o.token, user, o.cookie);
    } catch { /* ignore */ }
    sessionStorage.removeItem(ORIGIN_KEY);
  }
  window.location.href = "/settings/users";
}
