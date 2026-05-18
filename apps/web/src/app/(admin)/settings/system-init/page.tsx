"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { Database, AlertTriangle, Zap, ShieldAlert, RefreshCw } from "lucide-react";

const MOCK_ORGS = [
  { id: 1, org_name: "凤凰农业食品集团总司", org_type: "集团", parent_id: 0 },
  { id: 2, org_name: "财务与审计中心",       org_type: "中心", parent_id: 1 },
  { id: 3, org_name: "养殖基地事业部",       org_type: "部门", parent_id: 1 },
  { id: 4, org_name: "东彭蛋鸡场",          org_type: "基地", parent_id: 3 },
  { id: 5, org_name: "孟赛蛋鸡场",          org_type: "基地", parent_id: 3 },
  { id: 6, org_name: "市场销售事业群",       org_type: "部门", parent_id: 1 },
  { id: 7, org_name: "万象终端商超门店组",   org_type: "大区", parent_id: 6 },
  { id: 8, org_name: "万象直营1店(核心)",    org_type: "门店", parent_id: 7 },
];
const MOCK_ROLES = [
  { role_code: "ROLE_ADMIN",    role_name_zh: "系统管理员",   description: "全系统管理权限" },
  { role_code: "ROLE_FARM_MGR", role_name_zh: "养殖基地场长", description: "养殖场生产、健康及预警管理" },
  { role_code: "ROLE_WMS_MGR",  role_name_zh: "全国仓储总调度", description: "仓储调度、出入库与物流" },
  { role_code: "ROLE_SALES",    role_name_zh: "销售总监",     description: "批发客户定价与合同签署" },
  { role_code: "ROLE_STORE_MGR",role_name_zh: "直营门店店长", description: "门店收银、补货与日结操作" },
];
const MOCK_USERS = [
  { username: "admin",      real_name: "系统管理员",       role: "ROLE_ADMIN",    org_id: 1 },
  { username: "li_dongpeng",real_name: "李大强(东彭场长)", role: "ROLE_FARM_MGR", org_id: 4 },
  { username: "chen_wms",   real_name: "陈仓保(总控仓管)", role: "ROLE_WMS_MGR",  org_id: 1 },
  { username: "zhao_sales", real_name: "赵行销(销售总监)", role: "ROLE_SALES",    org_id: 6 },
  { username: "sun_store1", real_name: "孙小妹(万象1店长)",role: "ROLE_STORE_MGR",org_id: 8 },
];

type LogEntry = { time: string; msg: string; type: "info"|"success"|"warning"|"error" };

export default function SystemInitPage() {
  const { t } = useLanguage();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3100";
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [confirm, setConfirm] = useState<null|"init"|"blood">(null);

  const addLog = (msg: string, type: LogEntry["type"] = "info") =>
    setLogs(p => [...p, { time: new Date().toLocaleTimeString(), msg, type }]);

  const executePost = async (table: string, dataList: any[], name: string) => {
    addLog(`⏳ ${t('ui.开始处理清除旧数据并写入', '开始处理')} [${table}]，${t('ui.清除旧数据并写入', '清除旧数据并写入')}…`, "info");
    let deleted = 0, created = 0;
    try {
      const getRes = await fetch(`${API_BASE}/api/crud/${table}`);
      if (getRes.ok) {
        const { data: cur } = await getRes.json();
        if (cur?.length) {
          addLog(`🧹 ${t('ui.检测到旧数据正在清除', '检测到')} ${cur.length} ${t('ui.条旧数据正在清除', '条旧数据，正在清除')}…`, "warning");
          for (const row of cur) {
            const pk = table === "sys_roles" ? row.role_code : row.id;
            const col = table === "sys_roles" ? "role_code" : "id";
            if (pk) { await fetch(`${API_BASE}/api/crud/${table}/${col}/${pk}`, { method: "DELETE" }); deleted++; }
          }
        }
      }
    } catch { /* ignore */ }
    for (const item of dataList) {
      const r = await fetch(`${API_BASE}/api/crud/${table}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
      if (r.ok) created++; else { const e = await r.json(); addLog(`❌ [${table}] ${t('ui.写入失败', '写入失败')}: ${e.msg || r.statusText}`, "error"); }
    }
    addLog(`✅ [${table}] ${name} ${t('ui.完成', '完成')}（${t('ui.清除', '清除')}: ${deleted}，${t('ui.新建', '新建')}: ${created}）`, "success");
  };

  const doInit = async () => {
    if (confirm !== "init") { setConfirm("init"); return; }
    setConfirm(null); setLoading(true); setLogs([]);
    addLog(`🔥 ${t('ui.开始写入凤凰集团标准架构数据', '开始写入《凤凰集团标准架构数据》')}…`, "warning");
    await executePost("sys_orgs",  MOCK_ORGS,  t('ui.组织架构', '组织架构'));
    await executePost("sys_roles", MOCK_ROLES, t('ui.角色权限', '角色权限'));
    await executePost("sys_users",  MOCK_USERS, t('ui.初始用户账号', '初始用户账号'));
    addLog(`🎉 ${t('ui.系统初始化完成所有基础数据已就绪', '系统初始化完成，所有基础数据已就绪！')}`, "success");
    setLoading(false);
  };

  const doBlood = async () => {
    if (confirm !== "blood") { setConfirm("blood"); return; }
    setConfirm(null); setLoading(true); setLogs([]);
    addLog(`▶ ${t('ui.开始初始化业务演示数据', '开始初始化业务演示数据')}…`, "warning");
    const wmsMock: any[] = [];
    for (let i = 0; i < 30; i++) {
      wmsMock.push({ inbound_no: `WMS-SIM-${Date.now()}-${i}`, type: ["IN","OUT","TRANSFER"][i%3], qty: Math.floor(Math.random()*2000)+100, date: new Date(Date.now()-i*3600000).toISOString(), status: "COMPLETED" });
    }
    await executePost("wms_inbound", wmsMock, t('ui.仓储出入库记录', '仓储出入库记录'));
    addLog(`🎉 ${t('ui.演示数据初始化完成', '演示数据初始化完成！')}`, "success");
    setLoading(false);
  };

  const LOG_COLOR: Record<string, string> = { error: "#ef4444", success: "#22c55e", warning: "#f59e0b", info: "#38bdf8" };

  const ConfirmBanner = ({ mode, onOk, label, color }: any) => (
    <div style={{ padding: 14, background: color+"22", border: `1px solid ${color}44`, borderRadius: "var(--radius-md)" }}>
      <p style={{ fontSize: 13, color, fontWeight: 700, marginBottom: 10 }}>⚠️ {t('ui.此操作将清除并重写相关数据不可撤销', '此操作将清除并重写相关数据，不可撤销！')}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onOk} style={{ flex: 1, padding: "10px", background: color, color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{label}</button>
        <button type="button" onClick={() => setConfirm(null)} style={{ flex: 1, padding: "10px", background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 13 }}>{t('common.cancel', '取消')}</button>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('ui.系统初始化', '系统初始化')} subtitle={t('ui.初始化组织架构角色权限与初始用户数据危险操作区', '初始化组织架构、角色权限与初始用户数据（危险操作区）')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.系统初始化', '系统初始化')]}/>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,380px) 1fr", gap: 24 }}>

        {/* 左：控制台 */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 12, background: "#fef2f2", borderRadius: "var(--radius-md)", color: "#dc2626" }}><ShieldAlert size={28}/></div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t('ui.初始化操作中心', '初始化操作中心')}</h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{t('ui.操作不可撤销执行前请确认环境与备份', '操作不可撤销，执行前请确认环境与备份')}</p>
            </div>
          </div>
          <div style={{ padding: 16, background: "var(--bg-page)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.8 }}>
            <strong style={{ color: "#1e40af" }}>{t('ui.初始化内容清单', '初始化内容清单')}</strong><br/>
            • 🏢 <strong>{t('ui.组织架构', '组织架构')}</strong>：{t('ui.构建集团3大事业群管理层级', '构建集团3大事业群管理层级')}<br/>
            • 🔑 <strong>{t('ui.角色权限', '角色权限')}</strong>：{t('ui.配置5类标准角色权限矩阵', '配置5类标准角色权限矩阵')}<br/>
            • 👤 <strong>{t('ui.初始账号', '初始账号')}</strong>：{t('ui.创建各业务域管理员账号', '创建各业务域管理员账号')}
          </div>
          {confirm === "init"
            ? <ConfirmBanner mode="init" onOk={doInit} label={t('ui.确认执行初始化', '确认执行初始化')} color="#dc2626"/>
            : (
              <button type="button" onClick={doInit} disabled={loading} style={{ padding: "16px", background: loading ? "#ccc" : "linear-gradient(135deg,#dc2626,#991b1b)", color: "#fff", border: "none", borderRadius: "var(--radius-lg)", fontSize: 16, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 15px rgba(220,38,38,0.3)", transition: "all 0.3s" }}>
                {loading ? <RefreshCw className="spin" size={20}/> : <Zap size={20}/>}
                {loading ? t('ui.正在写入数据请勿关闭', '正在写入数据，请勿关闭…') : t('ui.开始系统初始化', '开始系统初始化')}
              </button>
            )}
          {confirm === "blood"
            ? <ConfirmBanner mode="blood" onOk={doBlood} label={t('ui.确认初始化演示数据', '确认初始化演示数据')} color="#2563eb"/>
            : (
              <button type="button" onClick={doBlood} disabled={loading} style={{ padding: "16px", background: loading ? "#ccc" : "linear-gradient(135deg,var(--color-primary),#1e3a8a)", color: "#fff", border: "none", borderRadius: "var(--radius-lg)", fontSize: 16, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 4px 15px rgba(30,58,138,0.3)", transition: "all 0.3s" }}>
                {loading ? <RefreshCw size={20}/> : <Zap size={20}/>}
                {loading ? t('ui.初始化中请稍候', '初始化中，请稍候…') : t('ui.初始化演示数据', '初始化演示数据')}
              </button>
            )}
        </div>

        {/* 右：日志 */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "var(--radius-lg)", padding: 24, display: "flex", flexDirection: "column", minHeight: 400, fontFamily: "monospace" }}>
          <h3 style={{ fontSize: 14, borderBottom: "1px solid #1e293b", paddingBottom: 12, marginBottom: 16, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={16}/>{t('ui.执行日志', '执行日志')}
          </h3>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {logs.length === 0
              ? <div style={{ color: "#475569", textAlign: "center", marginTop: 80 }}>{t('ui.等待执行指令', '等待执行指令…')}</div>
              : logs.map((L, i) => (
                <div key={i} style={{ fontSize: 13, display: "flex", gap: 12 }}>
                  <span style={{ color: "#64748b", flexShrink: 0 }}>[{L.time}]</span>
                  <span style={{ color: LOG_COLOR[L.type] || "#38bdf8" }}>{L.msg}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
