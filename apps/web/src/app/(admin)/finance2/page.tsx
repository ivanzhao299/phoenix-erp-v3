'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingDown, TrendingUp, Wallet, Users, PieChart,
  Receipt, CheckCircle, Clock, AlertTriangle, ArrowRight,
  RefreshCw, Activity, Database,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface HealthData {
  status:   string;
  module:   string;
  phase:    string;
  tables:   string[];
  legacy_frozen: string[];
  timestamp: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function PhaseBadge({ phase, status }: { phase: number; status: 'READY' | 'ACTIVE' | 'PLANNED' | 'FROZEN' }) {
  const map = {
    READY:   { label: '✅ 底座就绪', bg: '#f0fdf4', color: '#059669' },
    ACTIVE:  { label: '🔄 建设中',   bg: '#eff6ff', color: '#2563eb' },
    PLANNED: { label: `📋 Phase ${phase}`, bg: '#fafafa', color: '#6b7280' },
    FROZEN:  { label: '🔒 已废弃',   bg: '#fef3c7', color: '#d97706' },
  };
  const cfg = map[status];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

function ModuleCard({
  icon: Icon, title, description, phase, phaseStatus, path, iconColor,
}: {
  icon: React.ElementType; title: string; description: string;
  phase: number; phaseStatus: 'READY' | 'ACTIVE' | 'PLANNED' | 'FROZEN';
  path?: string; iconColor?: string;
}) {
  const router = useRouter();
  const canNav = !!path && (phaseStatus === 'ACTIVE' || phaseStatus === 'READY');

  return (
    <div
      onClick={() => canNav && router.push(path!)}
      style={{
        background: '#fff', borderRadius: 16, border: '1.5px solid #f1f5f9',
        padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: canNav ? 'pointer' : 'default',
        opacity: phaseStatus === 'PLANNED' && phase > 2 ? 0.65 : 1,
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (canNav) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#c7d2fe'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#f1f5f9'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${iconColor ?? '#6366f1'}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={iconColor ?? '#6366f1'} />
        </div>
        <PhaseBadge phase={phase} status={phaseStatus} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{description}</div>
      {canNav && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, color: '#6366f1' }}>
          进入 <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────

export default function Finance2DashboardPage() {
  const [health,  setHealth]  = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const h = await apiFetch<HealthData>('/api/v2/finance/health');
      setHealth(h);
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="Finance V2"
        subtitle="Workflow Native 财务平台 — Phase 1 AP Runtime"
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

      {/* Phase 1 AP Runtime Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #0891b2 100%)',
        borderRadius: 16, padding: '22px 28px', marginBottom: 24, color: '#fff',
      }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
          ✅ Finance V2 Phase 1 — AP Runtime 正式启用
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.8, marginBottom: 14 }}>
          fin_ap_invoices 已成为 AP 应付账款权威数据源 · 支持手工创建、PO 导入、付款核销<br />
          状态机：OPEN → PARTIALLY_PAID → PAID · 账龄分析：5 档<br />
          Phase 2 将建立 AR Runtime（应收账款）
        </div>

        {/* 底座状态栏 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Workflow Platform', value: 'READY',  ok: true },
            { label: 'AP Runtime',        value: 'LIVE',   ok: true },
            { label: 'DataScope',         value: 'READY',  ok: true },
            { label: 'fin_* 表骨架',      value: loading ? '…' : (health?.status === 'ok' ? 'READY' : 'ERR'), ok: health?.status === 'ok' },
            { label: 'AR Runtime',        value: 'Phase 2', ok: false },
          ].map(item => (
            <div key={item.label} style={{ fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>{item.label}</span>
              <span style={{
                marginLeft: 6, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                background: item.ok ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
              }}>
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

      {/* 模块路线图 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        Finance V2 模块路线图
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14, marginBottom: 28,
      }}>
        <ModuleCard
          icon={TrendingDown} iconColor="#f59e0b"
          title="AP Runtime（应付账款）"
          phase={1} phaseStatus="ACTIVE"
          path="/finance2/ap"
          description="fin_ap_invoices + fin_ap_payment_allocations。供应商发票管理、付款核销、多币种。Phase 1 建立 Workflow Native AP 流程。"
        />
        <ModuleCard
          icon={TrendingUp} iconColor="#10b981"
          title="AR Runtime（应收账款）"
          phase={2} phaseStatus="PLANNED"
          path="/finance2/ar"
          description="fin_ar_invoices + fin_ar_receipts。客户发票、收款核销、账龄分析。Phase 2 建立。"
        />
        <ModuleCard
          icon={Wallet} iconColor="#3b82f6"
          title="Cash Runtime（资金账户）"
          phase={3} phaseStatus="PLANNED"
          path="/finance2/cash-accounts"
          description="fin_cash_accounts + fin_cash_transactions。多账户余额、资金流水、账户间转账。Phase 3 建立。"
        />
        <ModuleCard
          icon={Users} iconColor="#7c3aed"
          title="股东资金 Runtime"
          phase={4} phaseStatus="PLANNED"
          path="/finance2/shareholder-funds"
          description="fin_shareholder_contributions + fin_shareholder_settlements。复用 prc2 设计样板，Phase 4 建立。"
        />
        <ModuleCard
          icon={Receipt} iconColor="#6366f1"
          title="Expense Runtime（费用）"
          phase={3} phaseStatus="PLANNED"
          description="费用申请 → Form Runtime → ApprovalEngine。Phase 3 建立，对接 fin_cash_accounts。"
        />
        <ModuleCard
          icon={PieChart} iconColor="#64748b"
          title="财务报表"
          phase={5} phaseStatus="PLANNED"
          path="/finance2/reports"
          description="资产负债表 / 利润表 / 现金流量表 / 多公司合并报表。Phase 5 建立，基于所有 Runtime 数据。"
        />
      </div>

      {/* Workflow + DataScope 底座说明 */}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        已就绪底座
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, marginBottom: 28,
      }}>
        {[
          { icon: CheckCircle, color: '#059669', title: 'Workflow 2.0 Platform', desc: 'Phase A-I 全部完成，ApprovalEngine + Form Runtime + SLA 已就绪' },
          { icon: CheckCircle, color: '#059669', title: 'DataScope',             desc: '基于 OrgModule @Global，所有接口自动注入 company_code 范围过滤' },
          { icon: CheckCircle, color: '#059669', title: 'fin_* 表骨架',          desc: '9 张 fin_* 领域表 DDL 已创建，Entity 骨架已注册 TypeORM' },
          { icon: CheckCircle, color: '#059669', title: 'RBAC 矩阵',             desc: 'MENU_FIN2_* 8 个权限条目已注册，CFO/Finance/Accountant 分级管控' },
          { icon: CheckCircle, color: '#059669', title: 'AP Runtime（Phase 1）', desc: 'fin_ap_invoices 正式启用，手工创建/PO导入/状态机/账龄分析全部就绪' },
          { icon: Database,    color: '#64748b', title: '旧 Finance 废弃',       desc: 'fin_transactions / fin_payments / biz_cash_flow 不再写入，只读废弃' },
        ].map(item => (
          <div key={item.title} style={{
            background: '#fff', borderRadius: 12, padding: '14px 16px',
            border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <item.icon size={15} color={item.color} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{item.title}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        ))}
      </div>

      {/* 旧 Finance 废弃说明 */}
      <div style={{
        background: '#fff8f1', border: '1.5px solid #fed7aa', borderRadius: 14,
        padding: '16px 20px',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c', marginBottom: 10 }}>
          ⚠️ 旧 Finance 模块废弃声明（{new Date().toISOString().slice(0,10)}）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 12, color: '#9a3412' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>已废弃表（只读，禁止写入）：</div>
            {['fin_transactions', 'fin_payments', 'biz_cash_flow'].map(t => (
              <div key={t} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {t}</div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>已废弃页面（入口关闭）：</div>
            {['/finance', '/finance/payments', '/finance/receivables', '/finance/payables',
              '/finance/aging', '/finance/cashflow', '/finance/cost'].map(p => (
              <div key={p} style={{ fontFamily: 'monospace', marginBottom: 2 }}>• {p}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
