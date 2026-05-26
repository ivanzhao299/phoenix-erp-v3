'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, TrendingDown, TrendingUp, Wallet, Users,
  Receipt, PieChart, CheckCircle, Clock, AlertTriangle, ArrowRight, RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  modules: Record<string, {
    status:      string;
    description: string;
    source?:     string;
    summary?:    Record<string, unknown>;
  }>;
  workflowPlatform: {
    status:      string;
    formRuntime: string;
    approvalEngine: string;
    sla:         string;
  };
  legacyFreeze: {
    frozenAt: string;
    tables:   string[];
    pages:    string[];
  };
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    READY:   { label: '✅ 已就绪',   bg: '#f0fdf4', color: '#059669' },
    ADAPTER: { label: '🔄 过渡层',   bg: '#eff6ff', color: '#2563eb' },
    PLANNED: { label: '📋 规划中',   bg: '#fafafa', color: '#6b7280' },
    FROZEN:  { label: '🔒 已冻结',   bg: '#fef3c7', color: '#d97706' },
  };
  const cfg = map[status] ?? { label: status, bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  status,
  description,
  path,
  highlight,
}: {
  icon: React.ElementType;
  title: string;
  status: string;
  description: string;
  path?: string;
  highlight?: Record<string, unknown>;
}) {
  const router = useRouter();
  const canNavigate = path && (status === 'ADAPTER' || status === 'READY');

  return (
    <div
      onClick={() => canNavigate && router.push(path)}
      style={{
        background: '#fff', borderRadius: 16, border: '1.5px solid #f1f5f9',
        padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: canNavigate ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        opacity: status === 'PLANNED' ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (canNavigate) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#c7d2fe'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#f1f5f9'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color="#475569" />
        </div>
        <StatusBadge status={status} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: highlight ? 12 : 0 }}>
        {description}
      </div>

      {highlight && Object.keys(highlight).length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
          background: '#f8fafc', borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: '#475569',
        }}>
          {Object.entries(highlight).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: '#94a3b8' }}>{k}：</span>
              <span style={{ fontWeight: 600 }}>{String(v ?? '-')}</span>
            </div>
          ))}
        </div>
      )}

      {canNavigate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: '#6366f1' }}>
          进入 <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function Finance2DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const d = await apiFetch<DashboardData>('/api/v2/finance/dashboard');
      setData(d);
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apSummary = data?.modules?.ap?.summary;

  return (
    <div>
      <PageHeader
        title="Finance V2"
        subtitle="Finance V2 Workflow Native 财务平台 — Phase 0 基线"
        breadcrumb={['Finance V2', 'Dashboard']}
        actions={
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: '1.5px solid #e2e8f0', background: '#fff',
              fontSize: 13, cursor: 'pointer', color: '#475569',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            刷新
          </button>
        }
      />

      {/* Phase 0 Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
        borderRadius: 16, padding: '20px 28px', marginBottom: 24, color: '#fff',
      }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
          🚀 Finance V2 Phase 0 — 基线建立
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.7 }}>
          旧 Finance 模块已冻结 · AP Runtime 适配层已就绪（来自 prc2_ap_ledger）
          · Workflow 2.0 Platform 底座已完成（Phase A-I）
          · 后续将按 Phase 1-5 逐步建立真实 Finance Runtime
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Workflow Platform', value: data?.workflowPlatform?.status ?? '…' },
            { label: 'Form Runtime',      value: data?.workflowPlatform?.formRuntime ?? '…' },
            { label: 'Approval Engine',   value: data?.workflowPlatform?.approvalEngine ?? '…' },
            { label: 'SLA Engine',        value: data?.workflowPlatform?.sla ?? '…' },
          ].map(item => (
            <div key={item.label} style={{ fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>{item.label}</span>
              <span style={{ marginLeft: 6, fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '1px 8px', borderRadius: 10 }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', marginBottom: 20, color: '#ef4444', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* AP 汇总快览 */}
      {apSummary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12, marginBottom: 24,
        }}>
          {[
            { label: 'AP 总笔数',  value: String(apSummary.total_count ?? '-'),  icon: Receipt,       color: '#6366f1' },
            { label: '未付',       value: String(apSummary.open_count ?? '-'),    icon: Clock,         color: '#f59e0b' },
            { label: '部分付款',   value: String(apSummary.partial_count ?? '-'), icon: TrendingDown,  color: '#3b82f6' },
            { label: '已付清',     value: String(apSummary.paid_count ?? '-'),    icon: CheckCircle,   color: '#10b981' },
            { label: '待付余额',   value: `¥${Number(apSummary.total_balance ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`, icon: Wallet, color: '#ef4444' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: '#fff', borderRadius: 12, padding: '16px 18px',
              border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <kpi.icon size={16} color={kpi.color} />
                <span style={{ fontSize: 12, color: '#64748b' }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{loading ? '…' : kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 模块状态矩阵 */}
      <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#374151' }}>Finance V2 模块路线图</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        <ModuleCard
          icon={TrendingDown}
          title="AP Runtime（应付账款）"
          status={data?.modules?.ap?.status ?? 'ADAPTER'}
          description="应付台账、付款核销、多币种。当前使用 prc2_ap_ledger 适配层，Phase 1 建立 fin_ap_invoices。"
          path="/finance2/ap"
          highlight={apSummary ? {
            '待付笔数': String(apSummary.open_count ?? '-'),
            '待付余额': `¥${Number(apSummary.total_balance ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`,
          } : undefined}
        />
        <ModuleCard
          icon={TrendingUp}
          title="AR Runtime（应收账款）"
          status="PLANNED"
          description="客户发票、收款记录、账龄分析。Phase 1 建立 fin_ar_invoices。"
        />
        <ModuleCard
          icon={Wallet}
          title="资金账户中心"
          status="PLANNED"
          description="多账户余额追踪、资金流水、账户间转账。Phase 2 建立 fin_cash_accounts。"
          path="/finance2/cash-accounts"
        />
        <ModuleCard
          icon={Users}
          title="股东资金 Runtime"
          status={data?.modules?.shareholder?.status ?? 'ADAPTER'}
          description="股东出资/代付、资金结算、利息计算。当前使用 prc2_shareholder_funds 适配层。"
          path="/finance2/shareholder-funds"
        />
        <ModuleCard
          icon={Receipt}
          title="费用 Runtime"
          status="PLANNED"
          description="费用申请 → Workflow Form Runtime → ApprovalEngine。Phase 3 建立。"
        />
        <ModuleCard
          icon={PieChart}
          title="预算 Runtime"
          status="PLANNED"
          description="预算编制、执行追踪、超预算审批工作流。Phase 4 建立。"
        />
      </div>

      {/* 旧模块冻结清单 */}
      {data?.legacyFreeze && (
        <div style={{ background: '#fffbeb', borderRadius: 14, padding: '18px 22px', border: '1.5px solid #fcd34d' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 10 }}>
            🔒 Legacy Finance 冻结清单（冻结日期：{data.legacyFreeze.frozenAt}）
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12, color: '#78350f' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>已冻结表：</div>
              {data.legacyFreeze.tables.map(t => (
                <div key={t} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {t}</div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>已冻结页面：</div>
              {data.legacyFreeze.pages.map(p => (
                <div key={p} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {p}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
