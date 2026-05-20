"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { User, Lock, Save, Eye, EyeOff, Shield, CheckCircle, Building2, Clock, Key } from "lucide-react";

const tok = () => (typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : "");
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${tok()}` });

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 40px 10px 12px", border: "1px solid var(--border)",
  borderRadius: 8, fontSize: 14, outline: "none", background: "var(--bg-card)", color: "var(--text-primary)", boxSizing: "border-box",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [pwdForm, setPwdForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [showPwd, setShowPwd] = useState({ old: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loginInfo] = useState({
    ip: "—", lastLogin: new Date().toLocaleString("zh-CN"), device: navigator.userAgent.includes("Mac") ? t('ui.macOS浏览器', 'macOS 浏览器') : t('ui.Windows浏览器', 'Windows 浏览器'),
  });

  const strength = (pwd: string) => {
    if (!pwd) return null;
    const score = [pwd.length >= 8, /[A-Z]/.test(pwd), /[a-z]/.test(pwd), /[0-9]/.test(pwd), /[^A-Za-z0-9]/.test(pwd)].filter(Boolean).length;
    if (score <= 2) return { label: t('ui.弱', '弱'), color: "#dc2626", width: "30%" };
    if (score === 3) return { label: t('ui.中', '中'), color: "#d97706", width: "60%" };
    return { label: t('ui.强', '强'), color: "#16a34a", width: "100%" };
  };

  const pwdStrength = strength(pwdForm.newPassword);

  const handleChangePwd = async () => {
    const { oldPassword, newPassword, confirmPassword } = pwdForm;
    if (!oldPassword || !newPassword || !confirmPassword) return setMsg({ type: "error", text: t('ui.请填写所有密码字段', '请填写所有密码字段') });
    if (newPassword !== confirmPassword)                   return setMsg({ type: "error", text: t('ui.新密码与确认密码不一致', '新密码与确认密码不一致') });
    if (newPassword.length < 8)                           return setMsg({ type: "error", text: t('ui.新密码至少需要8位字符', '新密码至少需要 8 位字符') });
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return setMsg({ type: "error", text: t('ui.新密码需包含字母和数字', '新密码需包含字母和数字') });

    setLoading(true); setMsg(null);
    try {
      const res  = await fetch(`/api/users/${(user as any)?.userId || ""}/password`, {
        method: "PUT", headers: hdr(), body: JSON.stringify({ oldPassword, password: newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.code === 200) {
        setMsg({ type: "success", text: t('ui.密码修改成功下次登录请使用新密码', '密码修改成功！下次登录请使用新密码') });
        setPwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
        toast.success(t('ui.密码已更新', '密码已更新'));
      } else {
        setMsg({ type: "error", text: data.msg || t('ui.密码修改失败请重试', '密码修改失败，请重试') });
      }
    } catch { setMsg({ type: "error", text: t('ui.网络错误请检查后端服务', '网络错误，请检查后端服务') }); }
    finally { setLoading(false); }
  };

  const PwdInput = ({ field, label, placeholder }: { field: "old" | "new" | "confirm"; label: string; placeholder: string }) => {
    const key = field === "old" ? "oldPassword" : field === "new" ? "newPassword" : "confirmPassword";
    return (
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>{label}</label>
        <div style={{ position: "relative" }}>
          <input type={showPwd[field] ? "text" : "password"} value={pwdForm[key]}
            onChange={e => { setPwdForm(p => ({ ...p, [key]: e.target.value })); setMsg(null); }}
            placeholder={placeholder} style={inp}/>
          <button type="button" onClick={() => setShowPwd(s => ({ ...s, [field]: !s[field] }))}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
            {showPwd[field] ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
        {field === "new" && pwdForm.newPassword && pwdStrength && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: pwdStrength.width, background: pwdStrength.color, borderRadius: 2, transition: "all 0.3s" }}/>
            </div>
            <span style={{ fontSize: 11, color: pwdStrength.color, marginTop: 4, display: "block" }}>{t('ui.密码强度', '密码强度')}：{pwdStrength.label}</span>
          </div>
        )}
      </div>
    );
  };

  const u = user as any;
  const INFO_ITEMS = [
    { icon: <User size={16}/>, label: t('ui.登录账号', '登录账号'), value: u?.username || "—",          mono: true,  color: "var(--color-primary)" },
    { icon: <User size={16}/>, label: t('ui.真实姓名', '真实姓名'), value: u?.realNameZh || u?.name || "—", mono: false, color: "var(--text-primary)" },
    { icon: <Shield size={16}/>, label: t('ui.系统角色', '系统角色'), value: u?.roleNameZh || u?.role || "—", mono: false, color: "#d97706" },
    { icon: <Building2 size={16}/>, label: t('ui.所属组织', '所属组织'), value: u?.orgName || t('ui.全局无门店限制', '全局（无门店限制）'), mono: false, color: "#10b981" },
    { icon: <Key size={16}/>, label: t('ui.绑定门店', '绑定门店'), value: u?.storeCode || u?.store_code || "—", mono: true, color: "#6366f1" },
    { icon: <Clock size={16}/>, label: t('ui.本次登录', '本次登录'), value: loginInfo.lastLogin, mono: false, color: "var(--text-secondary)" },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: 860, paddingBottom: 60 }}>
      <PageHeader title={t('ui.个人中心', '个人中心')} subtitle={t('ui.管理您的账号信息与登录密码', '管理您的账号信息与登录密码')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.个人中心', '个人中心')]}/>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* 账号信息卡 */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <User size={18} color="var(--color-primary)"/> {t('ui.账号基本信息', '账号基本信息')}
          </h3>
          {user ? (
            <>
              {/* 头像 */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: 16, background: "var(--bg-page)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, var(--color-primary), #1e3a8a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "white", flexShrink: 0 }}>
                  {(u?.realNameZh || u?.username || "U").charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{u?.realNameZh || u?.username || t('ui.未知用户', '未知用户')}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{u?.username} · {u?.roleNameZh || u?.role || t('ui.无角色', '无角色')}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {INFO_ITEMS.map(item => (
                  <div key={item.label} style={{ padding: 14, background: "var(--bg-page)", borderRadius: 10, border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                      <span style={{ color: item.color }}>{item.icon}</span>{item.label}
                    </div>
                    <div style={{ fontWeight: 700, fontFamily: item.mono ? "monospace" : "inherit", fontSize: item.mono ? 13 : 14, color: "var(--text-primary)" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>{t('ui.未检测到登录用户请重新登录', '未检测到登录用户，请重新登录')}</div>
          )}
        </div>

        {/* 修改密码卡 */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
            <Lock size={18} color="#d97706"/> {t('ui.修改登录密码', '修改登录密码')}
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
            {t('ui.新密码须至少8位包含字母与数字修改后当前Session保持有效下次登录使用新密码', '新密码须至少 8 位，包含字母与数字。修改后当前 Session 保持有效，下次登录使用新密码。')}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
            <PwdInput field="old"     label={t('ui.当前密码', '当前密码')}   placeholder={t('ui.输入当前密码验证身份', '输入当前密码验证身份')}/>
            <PwdInput field="new"     label={t('ui.新密码', '新密码')}     placeholder={t('ui.至少8位含字母加数字', '至少 8 位，含字母 + 数字')}/>
            <PwdInput field="confirm" label={t('ui.确认新密码', '确认新密码')} placeholder={t('ui.再次输入新密码', '再次输入新密码')}/>

            {msg && (
              <div style={{ padding: 12, borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8,
                backgroundColor: msg.type === "success" ? "#f0fdf4" : "#fef2f2",
                color: msg.type === "success" ? "#16a34a" : "#dc2626",
                border: `1px solid ${msg.type === "success" ? "#86efac" : "#fca5a5"}` }}>
                {msg.type === "success" && <CheckCircle size={16}/>}{msg.text}
              </div>
            )}

            <button type="button" onClick={handleChangePwd} disabled={loading}
              style={{ padding: "12px 20px", background: "var(--color-primary)", color: "white", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: loading ? 0.7 : 1, width: "fit-content" }}>
              <Save size={16}/>{loading ? t('ui.修改中', '修改中...') : t('ui.确认修改密码', '确认修改密码')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
