"use client";

import type { AuditLogRow, UserRecord } from "@/types";
import u from "@/styles/uix-utils.module.css";
import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Lock, Shield, FileText, AlertTriangle, Database, Users, Clock } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { PermissionDeniedState } from "@/components/design-system/feedback/States";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill, toolbarFilterPill } from "@/components/design-system/cockpit-styles";
const hdr = () => ({
  Authorization: `Bearer ${typeof window !== "undefined" ? sessionStorage.getItem("phoenix_token") || "" : ""}`
});
const card: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  marginBottom: 20
};
export default function SecurityPolicyPage() {
  const {
    t
  } = useLanguage();
  const securityPerm = usePermission("MENU_SETTINGS_SECURITY");
  const userPerm = usePermission("MENU_SETTINGS_USER");
  const auditPerm = usePermission("MENU_SETTINGS_AUDIT");
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [frozenUsers, setFrozenUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!securityPerm.canView) {
      setLoading(false);
      return;
    }
    const auditRequest = auditPerm.canView
      ? fetch("/api/audit/logs?limit=50", {
        headers: hdr()
      }).then(r => r.json()).catch(() => ({}))
      : Promise.resolve({ data: [] });
    const usersRequest = userPerm.canView
      ? fetch("/api/users", {
        headers: hdr()
      }).then(r => r.json()).catch(() => ({
        data: []
      }))
      : Promise.resolve({ data: [] });
    Promise.all([auditRequest, usersRequest]).then(([ld, ud]) => {
      setLogs(Array.isArray(ld.data) ? ld.data : Array.isArray(ld) ? ld : []);
      const users = Array.isArray(ud.data) ? ud.data : Array.isArray(ud) ? ud : [];
      setFrozenUsers(users.filter((u: UserRecord) => u.status === "FROZEN" || u.status === "INACTIVE"));
      setLoading(false);
    });
  }, [auditPerm.canView, securityPerm.canView, userPerm.canView]);
  const InfoCard = ({
    icon,
    title,
    value,
    desc,
    color = "var(--color-primary)"
  }: {
    icon: React.ReactNode;
    title: string;
    value: React.ReactNode;
    desc: string;
    color?: string;
  }) => <div style={{
    padding: 20,
    background: "var(--bg-card)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)"
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 10
    }}>
        <div style={{
        color
      }}>{icon}</div>
        <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-secondary)"
      }}>{title}</span>
      </div>
      <div style={{
      fontSize: 20,
      fontWeight: 800,
      color: "var(--text-primary)",
      marginBottom: 4
    }}>{value}</div>
      <div className={u.muted12}>{desc}</div>
    </div>;
  const STATUS_COLOR: Record<string, string> = {
    APPROVED: "var(--status-success)",
    REJECTED: "var(--status-danger)",
    PENDING: "var(--status-warning)",
    SUBMITTED: "var(--color-accent)",
    CANCELLED: "var(--text-secondary)"
  };
  if (!securityPerm.canView) {
    return <div className="animate-fade-in">
        <PageHeader title={t('ui.安全策略', '安全策略')} subtitle={t('ui.系统登录配置操作审批日志与账户安全状态', '系统登录配置、操作审批日志与账户安全状态')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.安全策略', '安全策略')]} />
        <PermissionDeniedState message={t('ui.无权限访问安全策略', '无权限访问安全策略，请联系管理员授予 MENU_SETTINGS_SECURITY 查看权限。')} />
      </div>;
  }
  return <div className="animate-fade-in">
      <PageHeader title={t('ui.安全策略', '安全策略')} subtitle={t('ui.系统登录配置操作审批日志与账户安全状态', '系统登录配置、操作审批日志与账户安全状态')} breadcrumb={[t('ui.系统设置', '系统设置'), t('ui.安全策略', '安全策略')]} />
      <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 16,
      marginBottom: 20
    }}>
        <InfoCard icon={<Clock size={20} />} title={t('ui.Token有效期', 'Token 有效期')} value={t('ui.8小时', '8 小时')} desc={t('ui.登录状态自动失效时间', '登录状态自动失效时间')} />
        <InfoCard icon={<Shield size={20} />} title={t('ui.API请求限制', 'API 请求限制')} value={t('ui.300次15分钟', '300次/15分钟')} desc={t('ui.按IP防暴力破解', '按 IP 防暴力破解')} color="var(--color-warning)" />
        <InfoCard icon={<Users size={20} />} title={t('ui.冻结账户', '冻结账户')} value={!userPerm.canView ? t('ui.受限', '受限') : loading ? "…" : frozenUsers.length} desc={!userPerm.canView ? t('ui.需要用户管理权限查看账户状态', '需要用户管理权限查看账户状态') : frozenUsers.length > 0 ? frozenUsers.map(u => u.username).join(", ") : t('ui.无冻结账户', '无冻结账户')} color={frozenUsers.length > 0 ? "var(--status-danger)" : "var(--status-success)"} />
        <InfoCard icon={<Lock size={20} />} title={t('ui.密码加密', '密码加密')} value="bcrypt+Salt" desc={t('ui.独立随机盐无彩虹表风险', '独立随机盐，无彩虹表风险')} color="var(--status-success)" />
      </div>
      <div style={{
      ...card,
      borderLeft: "var(--card-accent-width) solid var(--color-warning)",
      padding: "16px 20px"
    }}>
        <div style={{
        fontWeight: 700,
        fontSize: 14,
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <AlertTriangle size={16} color="var(--color-warning)" />{t('ui.安全注意事项', '安全注意事项')}
        </div>
        <ul style={{
        margin: 0,
        paddingLeft: 20,
        fontSize: 13,
        color: "var(--text-secondary)",
        lineHeight: 1.9
      }}>
          <li>JWT_SECRET {t('ui.当前为开发模式值正式上线前必须通过环境变量重新配置', '当前为开发模式值，')}<strong style={{
            color: "var(--status-danger)"
          }}>{t('ui.正式上线前必须通过环境变量重新配置', '正式上线前必须通过环境变量重新配置')}</strong></li>
          <li>{t('ui.API限流已启用请勿在内网场景下关闭防止内部设备密码爆破', 'API 限流已启用，请勿在内网场景下关闭，防止内部设备密码爆破')}</li>
          <li>{t('ui.建议定期轮换管理员密码周期不超过90天', '建议定期轮换管理员密码，周期 ≤ 90 天')}</li>
          <li>{t('ui.系统初始化页面在生产环境应额外二次验证或完全禁用', '系统初始化页面（/settings/system-init）在生产环境应额外二次验证或完全禁用')}</li>
        </ul>
      </div>
      <div style={card}>
        <h3 style={{
        fontSize: 15,
        fontWeight: 700,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <Database size={18} color="var(--color-primary)" />{t('ui.数据库信息', '数据库信息')}
        </h3>
        <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        fontSize: 13
      }}>
          {[{
          label: t('ui.数据库引擎', '数据库引擎'),
          value: "PostgreSQL 16"
        }, {
          label: t('ui.ORM框架', 'ORM 框架'),
          value: "TypeORM（NestJS）"
        }, {
          label: t('ui.API框架', 'API 框架'),
          value: "NestJS + Express"
        }, {
          label: t('ui.鉴权方案', '鉴权方案'),
          value: "JWT Bearer Token（8h 过期）"
        }].map(item => <div key={item.label} style={{
          padding: 12,
          background: "var(--bg-page)",
          borderRadius: "var(--radius-md)"
        }}>
              <div style={{
            color: "var(--text-secondary)",
            marginBottom: 4,
            fontSize: 12
          }}>{item.label}</div>
              <div className={u.fw600}>{item.value}</div>
            </div>)}
        </div>
      </div>
      <div style={{
      ...card,
      padding: 0
    }}>
        <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <FileText size={16} color="var(--color-primary)" />
          <span style={{
          fontWeight: 700,
          fontSize: 14
        }}>{t('ui.审批操作日志最近50条', '审批操作日志（最近50条）')}</span>
        </div>
        {!auditPerm.canView ? <div className={u.emptyPad40}>{t('ui.需要审计日志权限查看最近审批操作', '需要审计日志权限查看最近审批操作')}</div> : loading ? <div className={u.emptyPad40}>{t('common.loading', '加载中…')}</div> : logs.length === 0 ? <div className={u.emptyPad40}>{t('ui.暂无审批日志', '暂无审批日志')}</div> : <table className={s.table}>
              <thead>
                <tr>
                  {[t('ui.流程号', '流程号'), t('ui.模块', '模块'), t('ui.操作人', '操作人'), t('ui.操作时间', '操作时间'), t('common.status', '状态')].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => <tr key={i}>
                    <td style={{
              fontFamily: "monospace",
              fontSize: 11
            }}>{log.flow_no || log.record_id || "—"}</td>
                    <td>{log.module || log.table_name || "—"}</td>
                    <td>{log.submitter || log.operator || "—"}</td>
                    <td className={u.muted12}>{log.created_at ? new Date(log.created_at).toLocaleString("zh-CN") : "—"}</td>
                    <td>
                      <span style={{
                padding: "3px 8px",
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                background: (STATUS_COLOR[log.status ?? ''] || "var(--text-disabled)") + "22",
                color: STATUS_COLOR[log.status ?? ''] || "var(--text-disabled)"
              }}>
                        {log.status || "PENDING"}
                      </span>
                    </td>
                  </tr>)}
              </tbody>
            </table>}
      </div>
    </div>;
}
