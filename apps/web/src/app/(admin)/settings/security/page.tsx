"use client";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { Lock, Shield, FileText, AlertTriangle, Database, Users, Clock } from "lucide-react";

const hdr = () => ({ Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}` });
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20, marginBottom: 20 };

export default function SecurityPolicyPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [frozenUsers, setFrozenUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/crud/sys_approval_log?limit=50&sort=id&order=desc", { headers: hdr() }).then(r => r.json()).catch(() => ({})),
      fetch("/api/crud/sys_users?limit=500", { headers: hdr() }).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([ld, ud]) => {
      setLogs(Array.isArray(ld.data) ? ld.data : Array.isArray(ld) ? ld : []);
      const users = Array.isArray(ud.data) ? ud.data : Array.isArray(ud) ? ud : [];
      setFrozenUsers(users.filter((u: any) => u.status === "FROZEN" || u.status === "INACTIVE"));
      setLoading(false);
    });
  }, []);

  const InfoCard = ({ icon, title, value, desc, color = "var(--color-primary)" }: any) => (
    <div style={{ padding: 20, background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{desc}</div>
    </div>
  );

  const STATUS_COLOR: Record<string, string> = { APPROVED: "#16a34a", REJECTED: "#dc2626", PENDING: "#ca8a04", SUBMITTED: "#2563eb", CANCELLED: "#6b7280" };

  return (
    <div className="animate-fade-in">
      <PageHeader title="安全策略" subtitle="系统登录配置、操作审批日志与账户安全状态" breadcrumb={["系统设置", "安全策略"]}/>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <InfoCard icon={<Clock size={20}/>} title="Token 有效期" value="8 小时" desc="登录状态自动失效时间"/>
        <InfoCard icon={<Shield size={20}/>} title="API 请求限制" value="300次/15分钟" desc="按 IP 防暴力破解" color="var(--color-warning)"/>
        <InfoCard icon={<Users size={20}/>} title="冻结账户" value={loading ? "…" : frozenUsers.length} desc={frozenUsers.length > 0 ? frozenUsers.map((u: any) => u.username).join(", ") : "无冻结账户"} color={frozenUsers.length > 0 ? "#ef4444" : "#22c55e"}/>
        <InfoCard icon={<Lock size={20}/>} title="密码加密" value="bcrypt+Salt" desc="独立随机盐，无彩虹表风险" color="#22c55e"/>
      </div>
      <div style={{ ...card, borderLeft: "4px solid var(--color-warning)", padding: "16px 20px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} color="var(--color-warning)"/>安全注意事项
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          <li>JWT_SECRET 当前为开发模式值，<strong style={{ color: "#dc2626" }}>正式上线前必须通过环境变量重新配置</strong></li>
          <li>API 限流已启用，请勿在内网场景下关闭，防止内部设备密码爆破</li>
          <li>建议定期轮换管理员密码，周期 ≤ 90 天</li>
          <li>系统初始化页面（/settings/system-init）在生产环境应额外二次验证或完全禁用</li>
        </ul>
      </div>
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Database size={18} color="var(--color-primary)"/>数据库信息
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          {[
            { label: "数据库引擎", value: "PostgreSQL 16" },
            { label: "ORM 框架", value: "TypeORM（NestJS）" },
            { label: "API 框架", value: "NestJS + Express" },
            { label: "鉴权方案", value: "JWT Bearer Token（8h 过期）" },
          ].map(item => (
            <div key={item.label} style={{ padding: 12, background: "var(--bg-page)", borderRadius: "var(--radius-md)" }}>
              <div style={{ color: "var(--text-secondary)", marginBottom: 4, fontSize: 12 }}>{item.label}</div>
              <div style={{ fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card, padding: 0 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={16} color="var(--color-primary)"/>
          <span style={{ fontWeight: 700, fontSize: 14 }}>审批操作日志（最近50条）</span>
        </div>
        {loading ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>加载中…</div>
          : logs.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>暂无审批日志</div>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["流程号", "模块", "操作人", "操作时间", "状态"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 11 }}>{log.flow_no || log.record_id || "—"}</td>
                    <td style={{ padding: "10px 16px" }}>{log.module || log.table_name || "—"}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>{log.submitter || log.operator || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)", fontSize: 12 }}>{log.created_at ? new Date(log.created_at).toLocaleString("zh-CN") : "—"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: (STATUS_COLOR[log.status] || "#94a3b8") + "22", color: STATUS_COLOR[log.status] || "#94a3b8" }}>
                        {log.status || "PENDING"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
