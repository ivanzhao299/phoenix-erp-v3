'use client';

import { useState, useEffect, useCallback } from 'react';
import u from "@/styles/uix-utils.module.css";
import { Activity, AlertTriangle, CheckCircle, Clock, TrendingUp, Users, RefreshCw, BarChart3, ArrowUpCircle, Bell, Wifi, WifiOff } from 'lucide-react';
import s from "@/components/ui/admin-ui.module.css";

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface Overview {
  pendingTasks: number;
  overdueTasks: number;
  completedToday: number;
  escalatedTasks: number;
  avgApprovalHours: number | null;
  avgCompletionHours: number | null;
}
interface Bottleneck {
  role: string;
  pendingCount: number;
  overdueCount: number;
  avgHours: number | null;
}
interface OverdueTask {
  stepId: string;
  instanceId: string;
  bizType: string;
  bizNo: string | null;
  approverRole: string | null;
  assigneeId: string | null;
  dueAt: string;
  reminderCount: number;
  escalationLevel: number;
  createdAt: string;
  overdueHours: number;
}
interface EscalatedTask {
  stepId: string;
  instanceId: string;
  bizType: string;
  bizNo: string | null;
  approverRole: string | null;
  assigneeId: string | null;
  dueAt: string | null;
  escalationLevel: number;
  sourceTaskId: string | null;
  createdAt: string;
}
interface PushHealth {
  enabled: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  subject: string | null;
  subscriptionCount: number;
  activeSubscriptionCount: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}
async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── KPI 卡片 ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  alert
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  alert?: boolean;
}) {
  return <div style={{
    background: 'var(--bg-card)',
    borderRadius: 16,
    minHeight: 112,
    boxSizing: 'border-box',
    padding: '20px 22px',
    border: `1.5px solid ${alert ? 'var(--status-danger)' : 'var(--bg-muted)'}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: alert ? '0 0 0 3px color-mix(in srgb, var(--status-danger) 10%, transparent)' : '0 1px 4px var(--overlay-black-06)'
  }}>
      <div className={u.flexBetween}>
        <span style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        fontWeight: 600
      }}>{label}</span>
        <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: `${color}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <div style={{
      fontSize: 32,
      fontWeight: 800,
      color: alert ? 'var(--status-danger)' : 'var(--text-primary)'
    }}>
        {value}
      </div>
      {sub && <div style={{
      fontSize: 12,
      color: 'var(--text-disabled)'
    }}>{sub}</div>}
    </div>;
}

// ── Section 容器 ──────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  iconColor,
  badge,
  children
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return <div style={{
    background: 'var(--bg-card)',
    borderRadius: 18,
    border: '1.5px solid var(--bg-muted)',
    boxShadow: '0 1px 6px var(--overlay-black-06)',
    overflow: 'hidden'
  }}>
      <div style={{
      padding: '18px 24px',
      borderBottom: '1px solid var(--bg-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }}>
        <Icon size={18} color={iconColor} />
        <span style={{
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--text-primary)'
      }}>{title}</span>
        {badge}
      </div>
      {children}
    </div>;
}

// ── 空状态 ─────────────────────────────────────────────────────────────────────

function EmptyState({
  msg
}: {
  msg: string;
}) {
  return <div style={{
    padding: '36px 24px',
    textAlign: 'center',
    color: 'var(--text-disabled)',
    fontSize: 14
  }}>{msg}</div>;
}

// ── Push 健康卡片 ──────────────────────────────────────────────────────────────

function PushHealthCard({
  health
}: {
  health: PushHealth;
}) {
  const ok = health.enabled && health.hasPublicKey && health.hasPrivateKey;
  return <div style={{
    background: ok ? 'color-mix(in srgb, var(--status-success) 12%, transparent)' : 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
    border: `1.5px solid ${ok ? 'var(--status-success)' : 'var(--status-danger)'}`,
    borderRadius: 16,
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16
  }}>
      <div style={{
      width: 40,
      height: 40,
      borderRadius: 10,
      background: ok ? 'var(--status-success)20' : 'var(--status-danger)20',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
        {ok ? <Wifi size={20} color="var(--status-success)" /> : <WifiOff size={20} color="var(--status-danger)" />}
      </div>
      <div className={u.flex1}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6
      }}>
          <span style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)'
        }}>Web Push 推送</span>
          <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 20,
          background: ok ? 'var(--status-success)' : 'var(--status-danger)',
          color: 'var(--text-on-dark)'
        }}>
            {ok ? '已启用' : '未配置'}
          </span>
        </div>
        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
        gap: '6px 16px',
        fontSize: 13,
        color: 'var(--text-secondary)'
      }}>
          <span>公钥：{health.hasPublicKey ? '✅ 已配置' : '❌ 缺失'}</span>
          <span>私钥：{health.hasPrivateKey ? '✅ 已配置' : '❌ 缺失'}</span>
          <span>Subject：{health.subject ? `✅ ${health.subject}` : '❌ 缺失'}</span>
          <span>总订阅：{health.subscriptionCount} 条</span>
          <span>活跃订阅：{health.activeSubscriptionCount} 条</span>
        </div>
        {!ok && <div style={{
        marginTop: 8,
        fontSize: 12,
        color: 'var(--status-danger)'
      }}>
            请在服务器设置 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 环境变量后重启服务
          </div>}
      </div>
    </div>;
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function WorkflowMetricsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([]);
  const [escalatedTasks, setEscalatedTasks] = useState<EscalatedTask[]>([]);
  const [pushHealth, setPushHealth] = useState<PushHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshingAt, setRefreshingAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, bn, od, es, ph] = await Promise.all([apiFetch<Overview>('/api/workflow/metrics/overview'), apiFetch<Bottleneck[]>('/api/workflow/metrics/bottlenecks'), apiFetch<OverdueTask[]>('/api/workflow/metrics/overdue-tasks'), apiFetch<EscalatedTask[]>('/api/workflow/metrics/escalated-tasks'), apiFetch<PushHealth>('/api/notifications/push/health').catch(() => null)]);
      setOverview(ov);
      setBottlenecks(bn);
      setOverdueTasks(od);
      setEscalatedTasks(es);
      if (ph) setPushHealth(ph);
      setRefreshingAt(new Date());
    } catch {
      setError('数据加载失败，请检查权限后重试');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const overdueRate = overview && overview.pendingTasks > 0 ? Math.round(overview.overdueTasks / overview.pendingTasks * 100) : 0;
  function fmtDueAt(dueAt: string | null) {
    if (!dueAt) return '—';
    return new Date(dueAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return <div style={{
    padding: '28px 32px',
    maxWidth: 1200,
    margin: '0 auto'
  }}>
      {/* 标题行 */}
      <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 28
    }}>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}>
          <div style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: 'var(--status-special)18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
            <BarChart3 size={22} color="var(--status-special)" />
          </div>
          <div>
            <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)'
          }}>审批流程健康看板</h1>
            <p style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--text-secondary)'
          }}>
              实时 SLA 监控 · 超期检测 · 瓶颈分析
              {refreshingAt && ` · 更新于 ${refreshingAt.toLocaleTimeString('zh-CN')}`}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 18px',
        borderRadius: 10,
        border: '1.5px solid var(--border)',
        background: loading ? 'var(--bg-muted)' : 'var(--bg-card)',
        color: 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer'
      }}>
          <RefreshCw size={14} style={{
          animation: loading ? 'spin 1s linear infinite' : 'none'
        }} />
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && <div style={{
      background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
      border: '1px solid var(--status-danger)',
      borderRadius: 12,
      padding: '12px 18px',
      marginBottom: 24,
      color: 'var(--status-danger)'
    }}>
          {error}
        </div>}

      {/* ── Push 健康状态 ── */}
      {pushHealth && <div className={u.mb24}>
          <PushHealthCard health={pushHealth} />
        </div>}

      {/* ── KPI 概览 ── */}
      {overview && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: 16,
      marginBottom: 32
    }}>
          <KpiCard label="待审批任务" value={overview.pendingTasks} sub="当前未完成" icon={Clock} color="var(--status-special)" />
          <KpiCard label="超期任务" value={overview.overdueTasks} sub={`超期率 ${overdueRate}%`} icon={AlertTriangle} color="var(--status-danger)" alert={overview.overdueTasks > 0} />
          <KpiCard label="今日完成" value={overview.completedToday} sub="含通过/拒绝" icon={CheckCircle} color="var(--status-success)" />
          <KpiCard label="升级任务" value={overview.escalatedTasks} sub="待升级审批人处理" icon={ArrowUpCircle} color="var(--status-warning)" alert={overview.escalatedTasks > 0} />
          <KpiCard label="平均处理时长" value={overview.avgApprovalHours != null ? `${overview.avgApprovalHours}h` : '—'} sub="含进行中" icon={TrendingUp} color="var(--color-accent)" />
          <KpiCard label="平均完成时长" value={overview.avgCompletionHours != null ? `${overview.avgCompletionHours}h` : '—'} sub="仅已完结实例" icon={Activity} color="var(--status-success)" />
        </div>}

      {/* ── 超期任务 Top 20 ── */}
      <div className={u.mb24}>
        <Section title="超期待办 Top 20" icon={AlertTriangle} iconColor="var(--status-danger)" badge={overdueTasks.length > 0 ? <span style={{
        fontSize: 12,
        color: 'var(--status-danger)',
        fontWeight: 700,
        marginLeft: 4
      }}>
                  {overdueTasks.length} 条
                </span> : <span style={{
        fontSize: 12,
        color: 'var(--text-disabled)',
        marginLeft: 4
      }}>按到期时间升序</span>}>
          {loading && !overdueTasks.length ? <EmptyState msg="加载中…" /> : overdueTasks.length === 0 ? <EmptyState msg="暂无超期任务 🎉" /> : <table className={s.table}>
                <thead>
                  <tr>
                    {['业务类型', '业务单号', '审批角色', '到期时间', '已超期', '催办次数'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {overdueTasks.map((t, i) => <tr key={t.stepId} style={{
              background: i % 2 === 0 ? 'var(--bg-card)' : 'color-mix(in srgb, var(--status-danger) 8%, transparent)'
            }}>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-primary)'
              }}>{t.bizType}</td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>{t.bizNo ?? '—'}</td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>{t.approverRole ?? '—'}</td>
                      <td style={{
                fontSize: 13,
                color: 'var(--status-danger)',
                fontWeight: 600
              }}>
                        {fmtDueAt(t.dueAt)}
                      </td>
                      <td>
                        <span style={{
                  display: 'inline-block',
                  padding: '2px 9px',
                  borderRadius: 20,
                  background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
                  color: 'var(--status-danger)',
                  fontWeight: 700,
                  fontSize: 12,
                  border: '1px solid var(--status-danger)'
                }}>
                          {t.overdueHours >= 24 ? `${Math.floor(t.overdueHours / 24)}天${t.overdueHours % 24}h` : `${t.overdueHours}h`}
                        </span>
                      </td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>
                        {t.reminderCount > 0 ? <span style={{
                  color: 'var(--status-warning)',
                  fontWeight: 700
                }}>{t.reminderCount} 次</span> : <span style={{
                  color: 'var(--text-disabled)'
                }}>0 次</span>}
                      </td>
                    </tr>)}
                </tbody>
              </table>}
        </Section>
      </div>

      {/* ── 升级任务列表 ── */}
      <div className={u.mb24}>
        <Section title="已升级任务" icon={ArrowUpCircle} iconColor="var(--status-warning)" badge={escalatedTasks.length > 0 ? <span style={{
        fontSize: 12,
        color: 'var(--status-warning)',
        fontWeight: 700,
        marginLeft: 4
      }}>
                  {escalatedTasks.length} 条
                </span> : <span style={{
        fontSize: 12,
        color: 'var(--text-disabled)',
        marginLeft: 4
      }}>升级层级降序</span>}>
          {loading && !escalatedTasks.length ? <EmptyState msg="加载中…" /> : escalatedTasks.length === 0 ? <EmptyState msg="暂无升级任务 ✅" /> : <table className={s.table}>
                <thead>
                  <tr>
                    {['业务类型', '业务单号', '升级审批角色', '升级层级', '到期时间', '创建时间'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {escalatedTasks.map((t, i) => <tr key={t.stepId} style={{
              background: i % 2 === 0 ? 'var(--bg-card)' : 'color-mix(in srgb, var(--status-warning) 10%, transparent)'
            }}>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-primary)'
              }}>{t.bizType}</td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>{t.bizNo ?? '—'}</td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>{t.approverRole ?? '—'}</td>
                      <td>
                        <span style={{
                  display: 'inline-block',
                  padding: '2px 9px',
                  borderRadius: 20,
                  background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
                  color: 'var(--status-warning)',
                  fontWeight: 700,
                  fontSize: 12,
                  border: '1px solid color-mix(in srgb, var(--status-warning) 16%, transparent)'
                }}>
                          L{t.escalationLevel}
                        </span>
                      </td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-secondary)'
              }}>
                        {fmtDueAt(t.dueAt)}
                      </td>
                      <td style={{
                fontSize: 13,
                color: 'var(--text-disabled)'
              }}>
                        {new Date(t.createdAt).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                      </td>
                    </tr>)}
                </tbody>
              </table>}
        </Section>
      </div>

      {/* ── 瓶颈角色 ── */}
      <Section title="瓶颈角色分析" icon={Users} iconColor="var(--status-special)" badge={<span style={{
      fontSize: 12,
      color: 'var(--text-disabled)',
      marginLeft: 4
    }}>按超期量排序</span>}>
        {loading && !bottlenecks.length ? <EmptyState msg="加载中…" /> : bottlenecks.length === 0 ? <EmptyState msg="暂无数据（尚无审批实例）" /> : <table className={s.table}>
              <thead>
                <tr>
                  {['审批角色', '待办量', '超期量', '平均处理时长'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {bottlenecks.map((row, i) => <tr key={i}>
                    <td style={{
              fontSize: 14,
              color: 'var(--text-primary)'
            }}>
                      {row.role}
                    </td>
                    <td style={{
              fontSize: 14,
              color: 'var(--text-secondary)'
            }}>
                      <span style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: 20,
                background: 'var(--status-special)18',
                color: 'var(--status-special)',
                fontWeight: 700
              }}>{row.pendingCount}</span>
                    </td>
                    <td className={u.fs14}>
                      {row.overdueCount > 0 ? <span style={{
                display: 'inline-block',
                padding: '2px 10px',
                borderRadius: 20,
                background: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
                color: 'var(--status-danger)',
                fontWeight: 700,
                border: '1px solid var(--status-danger)'
              }}>{row.overdueCount}</span> : <span style={{
                color: 'var(--text-disabled)'
              }}>—</span>}
                    </td>
                    <td style={{
              fontSize: 14,
              color: 'var(--text-secondary)'
            }}>
                      {row.avgHours != null ? `${row.avgHours}h` : <span style={{
                color: 'var(--text-disabled)'
              }}>—</span>}
                    </td>
                  </tr>)}
              </tbody>
            </table>}
      </Section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>;
}