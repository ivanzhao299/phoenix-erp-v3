"use client";
import { useState, useEffect, FormEvent, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Shield, User, Lock, AlertTriangle, Globe, ChevronDown, ChevronUp, Info } from "lucide-react";

const LAST_USER_KEY = "phoenix_last_username";   // 记忆上次登录的账户名（不存密码）

const IS_DEV   = process.env.NODE_ENV !== "production";

// ── 快捷测试账号（仅开发环境） ──────────────────────────────────────────────
const TEST_GROUPS = IS_DEV ? [
  { label: "集团管理层", color: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#d97706" }, accounts: [
    { u: "admin",        p: "admin123", label: "🔑 系统超管",   sub: "ROLE_ADMIN" },
    { u: "test_ceo",     p: "123456",   label: "👑 集团总裁",   sub: "ROLE_CEO" },
    { u: "test_auditor", p: "123456",   label: "🕵 审计专员",   sub: "ROLE_AUDITOR" },
    { u: "test_sysops",  p: "123456",   label: "🖥 运维管理员", sub: "ROLE_SYSOPS" },
  ]},
  { label: "养殖品控线", color: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#16a34a" }, accounts: [
    { u: "test_farm",   p: "123456", label: "🏡 养殖场长", sub: "ROLE_FARM_MGR" },
    { u: "test_vet",    p: "123456", label: "💉 驻场兽医", sub: "ROLE_VET" },
    { u: "test_qa_mgr", p: "123456", label: "🔬 品控总监", sub: "ROLE_QA_MGR" },
  ]},
  { label: "包装 · 仓储 · 物流", color: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", text: "#2563eb" }, accounts: [
    { u: "test_pkg",  p: "123456", label: "📦 车间主任", sub: "ROLE_PKG_MGR" },
    { u: "test_wms",  p: "123456", label: "🏗 仓储经理", sub: "ROLE_WMS_MGR" },
    { u: "test_log",  p: "123456", label: "🚛 物流调度", sub: "ROLE_LOG_MGR" },
    { u: "test_buyer",p: "123456", label: "🛒 采购专员", sub: "ROLE_PRC_BUYER" },
  ]},
  { label: "🖥️ 现场作业台（Terminal自动跳转）", color: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", text: "#d97706" }, accounts: [
    { u: "test_pkg_op",  p: "123456", label: "📦 包装操作员",  sub: "ROLE_PKG_OP"    },
    { u: "test_qc",      p: "123456", label: "🔍 质检员",      sub: "ROLE_QC_INSPECTOR"    },
    { u: "test_wh_clk",  p: "123456", label: "🏭 仓管员",      sub: "ROLE_WH_CLERK"        },
    { u: "test_sup",     p: "123456", label: "👷 班组长",      sub: "ROLE_LINE_SUPERVISOR" },
  ]},
  { label: "销售 & 订货", color: { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.25)", text: "#9333ea" }, accounts: [
    { u: "test_sales_rep", p: "123456", label: "💼 业务员",   sub: "ROLE_SALES_REP" },
    { u: "test_sales_mgr", p: "123456", label: "📊 销售主管", sub: "ROLE_SALES_MGR" },
    { u: "test_b2b",       p: "123456", label: "🤝 大客户总监",sub: "ROLE_B2B_MGR" },
  ]},
  { label: "门店 & 财务", color: { bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.25)", text: "#db2777" }, accounts: [
    { u: "test_store",   p: "123456", label: "🏪 直营店长",   sub: "ROLE_STORE_MGR" },
    { u: "test_cashier", p: "123456", label: "💳 门店收银",   sub: "ROLE_CASHIER" },
    { u: "test_cfo",     p: "123456", label: "💰 财务总监",   sub: "ROLE_FIN_CFO" },
    { u: "test_acct",    p: "123456", label: "🧾 财务会计",   sub: "ROLE_FIN_ACCT" },
  ]},
] : [];

// 现场作业角色 → 自动进入 Terminal（无感跳转）
const TERMINAL_ROLES = new Set([
  "ROLE_PKG_OP",    // 包装操作员
  "ROLE_QC_INSPECTOR",    // 质检员
  "ROLE_WH_CLERK",        // 仓管员
  "ROLE_LINE_SUPERVISOR", // 班组长
]);

// 角色 → 首页映射
const ROLE_HOME: Record<string,string> = {
  ROLE_ADMIN: "/dashboard", ROLE_CEO: "/dashboard", ROLE_FARM_MGR: "/breeding",
  ROLE_VET: "/breeding", ROLE_BREEDER: "/breeding", ROLE_QA_MGR: "/quality",
  ROLE_WMS_MGR: "/warehouse", ROLE_PKG_MGR: "/packaging", ROLE_LOG_MGR: "/sales2/delivery",
  ROLE_STORE_MGR: "/store", ROLE_CASHIER: "/store-pos", ROLE_SALES_REP: "/sales2/orders",
  ROLE_FIN_CFO: "/finance2", ROLE_FIN_ACCT: "/finance2",
  // 现场作业角色 → Terminal 作业台
  ROLE_PKG_OP:    "/terminal/packaging/dashboard",
  ROLE_QC_INSPECTOR:    "/terminal/packaging/dashboard",
  ROLE_WH_CLERK:        "/terminal/packaging/dashboard",
  ROLE_LINE_SUPERVISOR: "/terminal/packaging/dashboard",
};

function LoginInner() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
  const { login } = useAuth();
  const { brand } = useBrand();
  const { t, lang, setAppLanguage } = useLanguage();
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername]           = useState("");
  const [password, setPassword]           = useState("");
  const [loading,  setLoading]            = useState(false);
  const [error,    setError]              = useState("");
  const [notice,   setNotice]             = useState("");  // 友好提示（蓝色），如"登录已过期"
  const [expandedGroup, setExpandedGroup] = useState<number|null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // 启动时：回填上次用户名 + 处理"被踢回来"的提示
  useEffect(() => {
    if (typeof window === "undefined") return;
    const last = localStorage.getItem(LAST_USER_KEY) || "";
    if (last) {
      setUsername(last);
      // 让光标停在密码框，用户回车即可重登
      setTimeout(() => passwordRef.current?.focus(), 60);
    }
    const reason = sp.get("reason");
    if (reason === "expired") setNotice(t('ui.登录已过期', '登录已过期，请重新登录以继续'));
    else if (reason === "perms_changed") setNotice(t('ui.权限已更新', '权限刚刚更新，请重新登录'));
    else if (reason === "logout") setNotice(t('ui.已安全退出', '您已安全退出'));
  }, [sp, t]);

  const doLogin = async (u: string, p: string) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.trim(), password: p.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.code !== 200) {
        setError(data.msg || data.message || t('ui.账户或密码错误', '账户或密码错误'));
        return;
      }
      const info = data.user_info;
      login(data.token, {
        ...info,
        role:  info?.role  || info?.roles?.[0] || "",
        roles: info?.roles || (info?.role ? [info.role] : []),
        name:  info?.realNameZh || info?.username || u,
        permissions: Array.isArray(info?.permissions) ? info.permissions : [],
      });
      // 记忆账户名（无密码），下次回填
      try { localStorage.setItem(LAST_USER_KEY, u.trim()); } catch { /* noop */ }
      // 优先跳回 middleware 附带的 returnUrl，其次走角色首页
      // 特例：returnUrl 是通用 /dashboard（根路径兜底重定向产生）且该角色有专属首页时，
      // 角色首页优先，避免 terminal 操作员被送到管理后台
      const returnUrl = sp.get("return");
      const allRoles: string[] = Array.isArray(info?.roles) ? info.roles : (info?.role ? [info.role] : []);
      // ROLE_ADMIN 优先：只要 roles 数组中含超管角色，强制走 /dashboard
      // 避免超管同时持有其他角色时被错误路由到 terminal/packaging
      const isAdmin = allRoles.includes("ROLE_ADMIN") || info?.permissions?.includes("*");
      const effectiveRole = isAdmin ? "ROLE_ADMIN" : (info?.role || allRoles[0] || "");
      const roleDest      = ROLE_HOME[effectiveRole] || "/dashboard";
      // returnUrl='/dashboard' 是 middleware 对 '/' 的通用兜底，不代表真实意图
      // terminal 操作员的 returnUrl 不应覆盖他们专属的 terminal 首页
      const isGenericDashboard = returnUrl === "/dashboard";
      const isTerminalRole = TERMINAL_ROLES.has(effectiveRole);
      const dest = (returnUrl && returnUrl.startsWith("/") && !isGenericDashboard && !isTerminalRole)
        ? returnUrl
        : roleDest;
      router.replace(dest);
    } catch {
      setError(t('ui.网络连接失败', '网络连接失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); doLogin(username, password); };

  return (
    <div style={{ minHeight:"100vh", display:"flex", background:"#070b14" }}>

      {/* ── 左侧品牌区 ─────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px", background:"linear-gradient(145deg,#0f1929 0%,#0a0f1e 100%)", borderRight:"1px solid rgba(255,255,255,0.04)" }}>
        {/* Logo — 动态品牌 */}
        {brand.logo_url
          ? <img src={brand.logo_url} alt="logo"
              style={{ width:80, height:80, objectFit:"contain", borderRadius:20,
                background:"rgba(255,255,255,0.06)", padding:8, marginBottom:24,
                boxShadow:"0 16px 40px rgba(0,0,0,0.4)" }} />
          : <div style={{ width:80, height:80, borderRadius:20, background:"linear-gradient(135deg,#f59e0b,#d97706)",
              boxShadow:"0 16px 40px rgba(245,158,11,0.3)", display:"flex", alignItems:"center",
              justifyContent:"center", marginBottom:24 }}>
              <Shield size={40} color="white"/>
            </div>
        }
        <div style={{ fontSize:28, fontWeight:900, color:"white", marginBottom:8, letterSpacing:"-0.5px" }}>{brand.system_name || '金凤凰 ERP'}</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.3)", marginBottom:48 }}>{brand.company_name || '企业级直营运营系统'} · Phoenix V3</div>

        {/* 快捷测试账号面板（仅开发环境） */}
        {IS_DEV && TEST_GROUPS.length > 0 && (
          <div style={{ width:"100%", maxWidth:480 }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", textTransform:"uppercase", letterSpacing:2, marginBottom:14, textAlign:"center" }}>
              测试账号面板 · 请选择测试角色
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {TEST_GROUPS.map((grp, gi) => (
                <div key={gi} style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${grp.color.border}`, background:grp.color.bg }}>
                  <button type="button" onClick={() => setExpandedGroup(expandedGroup===gi?null:gi)}
                    style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:"transparent", border:"none", cursor:"pointer", color:grp.color.text, fontSize:12, fontWeight:700 }}>
                    <span>{grp.label}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ opacity:0.6, fontWeight:400 }}>{grp.accounts.length} 个角色</span>
                      {expandedGroup===gi ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    </div>
                  </button>
                  {expandedGroup===gi && (
                    <div style={{ padding:"8px 12px 12px", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                      {grp.accounts.map(acc => (
                        <button type="button" key={acc.u} onClick={() => { setUsername(acc.u); setPassword(acc.p); doLogin(acc.u, acc.p); }}
                          style={{ padding:"8px 6px", background:"rgba(0,0,0,0.3)", border:`1px solid ${grp.color.border}`, borderRadius:8, cursor:"pointer", textAlign:"left" }}>
                          <div style={{ fontSize:12, color:grp.color.text, fontWeight:600, marginBottom:2 }}>{acc.label}</div>
                          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>{acc.u}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.15)" }}>
              统一密码: <code style={{ color:"rgba(255,255,255,0.3)" }}>123456</code> · 超管: <code style={{ color:"rgba(255,255,255,0.3)" }}>admin123</code>
            </div>
          </div>
        )}
      </div>

      {/* ── 右侧表单区 ─────────────────────────────────────────────────── */}
      <div style={{ width:440, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:48, position:"relative" }}>
        {/* 语言切换 */}
        <div style={{ position:"absolute", top:24, right:24, display:"flex", alignItems:"center", gap:4 }}>
          {(['zh','lo','en'] as const).map(l => (
            <button key={l} type="button" onClick={() => setAppLanguage(l)}
              style={{ fontSize:11, padding:"3px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.12)",
                background: lang===l ? "rgba(245,158,11,0.2)" : "transparent",
                color: lang===l ? "#f59e0b" : "rgba(255,255,255,0.3)", cursor:"pointer", fontWeight: lang===l ? 700 : 400 }}>
              {l==='zh'?'中文':l==='lo'?'ລາວ':'EN'}
            </button>
          ))}
        </div>

        <div style={{ width:"100%" }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:"white", marginBottom:6 }}>{t('ui.欢迎回来', '欢迎回来')}</h1>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", marginBottom:36 }}>{t('ui.登录Phoenix平台', '登录 Phoenix 企业管理平台')}</p>

          {error && (
            <div style={{ marginBottom:20, padding:14, background:"#fee2e2", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, color:"#dc2626", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
              <AlertTriangle size={16}/> {error}
            </div>
          )}

          {!error && notice && (
            <div style={{ marginBottom:20, padding:14, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.3)", borderRadius:10, color:"#60a5fa", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
              <Info size={16}/> {notice}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* 账号 */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", marginBottom:6, color:"rgba(255,255,255,0.4)", fontSize:12, fontWeight:600, letterSpacing:"0.5px" }}>{t('ui.账户名', '账户名')}</label>
              <div style={{ position:"relative" }}>
                <User size={16} color="#555" style={{ position:"absolute", left:14, top:14 }}/>
                <input value={username} onChange={e=>{ setUsername(e.target.value); setError(""); }}
                  type="text" placeholder={t('ui.输入账户名', '输入账户名')} autoComplete="username" required
                  style={{ width:"100%", padding:"13px 14px 13px 40px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"white", outline:"none", fontSize:14, boxSizing:"border-box" }}/>
              </div>
            </div>

            {/* 密码 */}
            <div style={{ marginBottom:28 }}>
              <label style={{ display:"block", marginBottom:6, color:"rgba(255,255,255,0.4)", fontSize:12, fontWeight:600, letterSpacing:"0.5px" }}>{t('ui.密码', '密码')}</label>
              <div style={{ position:"relative" }}>
                <Lock size={16} color="#555" style={{ position:"absolute", left:14, top:14 }}/>
                <input ref={passwordRef} value={password} onChange={e=>{ setPassword(e.target.value); setError(""); setNotice(""); }}
                  type="password" placeholder={t('ui.输入密码', '输入密码')} autoComplete="current-password" required
                  style={{ width:"100%", padding:"13px 14px 13px 40px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"white", outline:"none", fontSize:14, boxSizing:"border-box" }}/>
              </div>
            </div>

            <button id="submit-btn" type="submit" disabled={loading}
              style={{ width:"100%", padding:15, background:"linear-gradient(135deg,#f59e0b,#d97706)", color:"white", border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:loading?"not-allowed":"pointer", boxShadow:"0 8px 24px rgba(245,158,11,0.3)", opacity:loading?0.7:1, letterSpacing:"0.5px" }}>
              {loading ? t('ui.登录中', '登录中...') : t('ui.登录', '登  录')}
            </button>
          </form>

          <div style={{ marginTop:32, paddingTop:20, borderTop:"1px solid rgba(255,255,255,0.05)", textAlign:"center" }}>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.15)" }}>Phoenix ERP V3 · 企业级管理系统</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // 整个文件已声明 'use client'，无需 Suspense 保护 useSearchParams；
  // 保留外层 div 作为 fallback 壳，消除 SSR hydration mismatch
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", background: "#070b14" }} />
      }
    >
      <LoginInner />
    </Suspense>
  );
}
