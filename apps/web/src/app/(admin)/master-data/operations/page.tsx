"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import u from "@/styles/uix-utils.module.css";
import PageHeader from "@/components/PageHeader";
import request from "@/lib/api-client";
import { usePermission } from "@/hooks/usePermission";
import { secondaryActionButton } from "@/components/design-system/cockpit-styles";
import { RefreshCw, CheckSquare, AlertTriangle, Users, Copy, Lock, ExternalLink, Briefcase } from "lucide-react";

/**
 * G5.5-E — 主数据运营工作台
 *
 * 4 类待办：
 *   1. 待审批主数据（按 type 分组 + 跳转）
 *   2. 缺联系人/电话（客户 + 供应商）
 *   3. 重复编码风险
 *   4. 归档阻断历史（近 7 天 md_governance_events）
 */

interface Todo {
  pendingApprovals: Array<{
    type: string;
    count: number;
    examples: string[];
    href: string;
  }>;
  missingContact: Array<{
    source: string;
    count: number;
  }>;
  duplicateCodes: Array<{
    source: string;
    count: number;
  }>;
  archiveBlocked: Array<{
    object_type: string;
    object_code: string;
    message: string;
    created_at: string;
  }>;
  asOf: string;
}
const TYPE_LABEL: Record<string, string> = {
  customer: '客户',
  supplier: '供应商',
  project: '项目',
  store: '门店',
  product: '产品',
  sku: 'SKU',
  warehouse: '仓库',
  driver: '司机',
  vehicle: '车辆',
  'cash-account': '资金账户',
  'bank-account': '银行账户',
  organization: '组织',
  company: '公司',
  grade: '产品等级',
  spec: '包装规格',
  dict: '字典'
};
export default function OperationsPage() {
  const centerPerm = usePermission("MENU_MD_CENTER");
  const masterDataPerm = usePermission("MENU_MASTER_DATA");
  const canView = centerPerm.canView || masterDataPerm.canView;
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTodo(await request<Todo>('/master-data/operations/todo'));
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  const summary = useMemo(() => todo ? {
    pendingTotal: todo.pendingApprovals.reduce((s, p) => s + p.count, 0),
    missingTotal: todo.missingContact.reduce((s, m) => s + m.count, 0),
    duplicateTotal: todo.duplicateCodes.reduce((s, d) => s + d.count, 0),
    blockedTotal: todo.archiveBlocked.length
  } : null, [todo]);
  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);
  if (!canView) return <div className={u.emptyPad40}>无权限访问主数据运营工作台</div>;
  return <div>
      <PageHeader title="主数据运营工作台" subtitle="待审批 · 待补资料 · 重复风险 · 归档阻断 — 运营每日工作集中处理" breadcrumb={['主数据中心', '运营工作台']} actions={<button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
            <RefreshCw size={13} style={{
        animation: loading ? 'spin 1s linear infinite' : 'none'
      }} /> 刷新
          </button>} />

      {error && <div style={{
      padding: 10,
      background: 'var(--status-danger-bg-faint)',
      color: 'var(--status-danger)',
      borderRadius: 8,
      marginBottom: 14
    }}>{error}</div>}

      {/* 4 大统计卡 */}
      {summary && <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12,
      marginBottom: 20
    }}>
          <KpiCard label="待审批主数据" value={summary.pendingTotal} icon={CheckSquare} accent="var(--status-warning)" />
          <KpiCard label="缺联系信息" value={summary.missingTotal} icon={Users} accent="var(--status-info)" />
          <KpiCard label="重复编码风险" value={summary.duplicateTotal} icon={Copy} accent="var(--status-danger)" />
          <KpiCard label="近 7 天归档阻断" value={summary.blockedTotal} icon={Lock} accent="var(--color-purple-500)" />
        </div>}

      {/* 1. 待审批 */}
      <Section title="待审批主数据" icon={CheckSquare} count={summary?.pendingTotal ?? 0}>
        {todo?.pendingApprovals.length === 0 ? <EmptyHint text="🎉 暂无待审批主数据" /> : <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 10
      }}>
           {todo?.pendingApprovals.map(p => <a key={p.type} href={p.href} style={cardLinkStyle}>
               <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
                 <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--status-warning-bg-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
                   <CheckSquare size={16} style={{
                color: 'var(--status-warning)'
              }} />
                 </div>
                 <div className={u.flex1}>
                   <div style={{
                fontSize: 13,
                fontWeight: 600
              }}>
                     {TYPE_LABEL[p.type] ?? p.type}
                     <span style={{
                  marginLeft: 6,
                  padding: '1px 8px',
                  borderRadius: 4,
                  background: 'var(--status-warning-bg-medium)',
                  color: 'var(--status-warning)',
                  fontSize: 11
                }}>
                       × {p.count}
                     </span>
                   </div>
                   <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                marginTop: 2
              }}>
                     例：{p.examples.slice(0, 3).join('、') || '—'}
                   </div>
                 </div>
                 <ExternalLink size={13} style={{
              color: 'var(--text-disabled)'
            }} />
               </div>
             </a>)}
         </div>}
      </Section>

      {/* 2. 缺联系信息 */}
      <Section title="缺联系信息" icon={Users} count={summary?.missingTotal ?? 0}>
        {todo?.missingContact.length === 0 ? <EmptyHint text="✓ 客户/供应商联系信息完整" /> : <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10
      }}>
           {todo?.missingContact.map(m => <a key={m.source} href={m.source === 'customer' ? '/master-data/customers' : '/master-data/suppliers'} style={cardLinkStyle}>
               <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
                 <Users size={16} style={{
              color: 'var(--status-info)'
            }} />
                 <div className={u.flex1}>
                   <div style={{
                fontSize: 13,
                fontWeight: 600
              }}>{TYPE_LABEL[m.source] ?? m.source}</div>
                   <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)'
              }}>
                     <strong style={{
                  color: 'var(--status-danger)'
                }}>{m.count}</strong> 条 ACTIVE 记录缺电话
                   </div>
                 </div>
                 <ExternalLink size={13} style={{
              color: 'var(--text-disabled)'
            }} />
               </div>
             </a>)}
         </div>}
      </Section>

      {/* 3. 重复编码 */}
      <Section title="重复编码风险" icon={Copy} count={summary?.duplicateTotal ?? 0}>
        {todo?.duplicateCodes.length === 0 ? <EmptyHint text="✓ 无重复编码" /> : <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10
      }}>
           {todo?.duplicateCodes.filter(d => d.count > 0).map(d => <div key={d.source} style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--status-danger-bg-faint)',
          border: '1px solid var(--status-danger-bg-medium)'
        }}>
               <div className={u.flexRow8}>
                 <Copy size={14} style={{
              color: 'var(--status-danger)'
            }} />
                 <div style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600
            }}>{TYPE_LABEL[d.source] ?? d.source}</div>
                 <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--status-danger)'
            }}>{d.count} 组</span>
               </div>
             </div>)}
           {todo?.duplicateCodes.every(d => d.count === 0) && <EmptyHint text="✓ 无重复编码" />}
         </div>}
      </Section>

      {/* 4. 归档阻断历史 */}
      <Section title="归档阻断历史（近 7 天）" icon={Lock} count={summary?.blockedTotal ?? 0}>
        {todo?.archiveBlocked.length === 0 ? <EmptyHint text="✓ 近期无归档阻断事件" /> : <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
           {todo?.archiveBlocked.map((e, i) => <div key={i} style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--bg-muted)',
          border: '1px solid var(--border)'
        }}>
               <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4
          }}>
                 <span style={{
              padding: '1px 8px',
              borderRadius: 4,
              background: 'rgba(139,92,246,0.15)',
              color: 'var(--color-purple-600)',
              fontSize: 11,
              fontWeight: 600
            }}>{e.object_type}</span>
                 <span style={{
              fontSize: 13,
              fontFamily: 'monospace',
              color: 'var(--color-primary)',
              fontWeight: 600
            }}>{e.object_code}</span>
                 <span style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: 'var(--text-secondary)'
            }}>
                   {new Date(e.created_at).toLocaleString('zh-CN')}
                 </span>
               </div>
               <div className={u.muted12}>{e.message}</div>
             </div>)}
         </div>}
      </Section>

      {loading && !todo && <div style={{
      padding: 60,
      textAlign: 'center',
      color: 'var(--text-secondary)'
    }}>加载中…</div>}
    </div>;
}
function KpiCard({
  label,
  value,
  icon: Icon,
  accent
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
}) {
  return <div style={{
    padding: 16,
    borderRadius: 12,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${accent}`
  }}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }}>
        <Icon size={14} style={{
        color: accent
      }} />
        <div style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        fontWeight: 600
      }}>{label}</div>
      </div>
      <div style={{
      fontSize: 28,
      fontWeight: 800,
      color: accent,
      lineHeight: 1
    }}>{value}</div>
    </div>;
}
function Section({
  title,
  icon: Icon,
  count,
  children
}: {
  title: string;
  icon: any;
  count: number;
  children: React.ReactNode;
}) {
  return <section className={u.mb20}>
      <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }}>
        <Icon size={16} />
        <h2 style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 700
      }}>{title}</h2>
        {count > 0 && <span style={{
        padding: '1px 8px',
        borderRadius: 4,
        background: 'var(--bg-muted)',
        fontSize: 11,
        color: 'var(--text-secondary)'
      }}>{count}</span>}
      </div>
      {children}
    </section>;
}
function EmptyHint({
  text
}: {
  text: string;
}) {
  return <div style={{
    padding: 20,
    color: 'var(--text-secondary)',
    fontSize: 13,
    textAlign: 'center',
    background: 'var(--bg-muted)',
    borderRadius: 8
  }}>
      {text}
    </div>;
}
const cardLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '12px 14px',
  borderRadius: 10,
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  textDecoration: 'none',
  color: 'var(--text-primary)'
};
