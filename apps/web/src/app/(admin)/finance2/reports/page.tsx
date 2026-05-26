'use client';
import { PieChart, Clock, ArrowRight, BarChart2, FileText, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

const REPORT_CARDS = [
  {
    icon: BarChart2,
    title:  '资产负债表',
    desc:   '按公司、日期维度的资产负债快照，支持多公司合并',
    phase:  5,
    color:  '#6366f1',
  },
  {
    icon: TrendingUp,
    title:  '利润表',
    desc:   '收入、成本、费用、利润分析，关联 AR/AP/Expense Runtime',
    phase:  5,
    color:  '#10b981',
  },
  {
    icon: PieChart,
    title:  '现金流量表',
    desc:   '经营/投资/筹资三类现金流，基于 fin_cash_transactions',
    phase:  5,
    color:  '#3b82f6',
  },
  {
    icon: FileText,
    title:  'AP 账龄报表',
    desc:   '按供应商 / 公司 / 货币的应付账龄分析（30/60/90/120天）',
    phase:  1,
    color:  '#f59e0b',
  },
  {
    icon: FileText,
    title:  'AR 账龄报表',
    desc:   '按客户 / 公司 / 货币的应收账龄分析，坏账准备计提',
    phase:  2,
    color:  '#ef4444',
  },
  {
    icon: FileText,
    title:  '资金日报',
    desc:   '各账户余额快照 + 当日收支汇总，支持多币种',
    phase:  3,
    color:  '#0ea5e9',
  },
  {
    icon: BarChart2,
    title:  '股东资金报表',
    desc:   '股东出资余额、利息计算、结算进度统计',
    phase:  4,
    color:  '#7c3aed',
  },
  {
    icon: BarChart2,
    title:  '多公司合并报表',
    desc:   '跨公司财务数据汇总，按项目、公司、货币维度聚合',
    phase:  5,
    color:  '#64748b',
  },
];

function PhaseTag({ phase }: { phase: number }) {
  const map: Record<number, { bg: string; color: string }> = {
    1: { bg: '#eff6ff', color: '#2563eb' },
    2: { bg: '#f0fdf4', color: '#16a34a' },
    3: { bg: '#fff7ed', color: '#ea580c' },
    4: { bg: '#fdf4ff', color: '#7c3aed' },
    5: { bg: '#fafafa', color: '#6b7280' },
  };
  const cfg = map[phase] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, color: cfg.color,
    }}>
      📋 Phase {phase} 规划
    </span>
  );
}

export default function Finance2ReportsPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="财务报表"
        subtitle="Finance V2 — 报表中心（Phase 1-5 逐步建立）"
        breadcrumb={['Finance V2', '财务报表']}
      />

      {/* 说明横幅 */}
      <div style={{
        background: 'linear-gradient(135deg, #fafafa 0%, #f1f5f9 100%)',
        border: '1.5px solid #e2e8f0', borderRadius: 14,
        padding: '20px 24px', marginBottom: 24,
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PieChart size={22} color="#6366f1" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>
            Finance V2 报表中心
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
            报表数据将随各 Phase 的 Runtime 建立逐步开放。<br />
            Phase 0 当前无真实业务数据（fin_* 表为空基线）。<br />
            AP 账龄报表（Phase 1）→ AR 账龄（Phase 2）→ 资金日报（Phase 3）→ 财务三表（Phase 5）
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
            <Clock size={13} />
            旧 finance 报表页面已废弃，不再维护
          </div>
        </div>
      </div>

      {/* 报表卡片网格 */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: '#374151' }}>
        报表清单（按 Phase 排序）
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
        {REPORT_CARDS.map(card => (
          <div key={card.title} style={{
            background: '#fff', borderRadius: 14, padding: '18px 20px',
            border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            opacity: card.phase <= 2 ? 0.9 : 0.7,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${card.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <card.icon size={18} color={card.color} />
              </div>
              <PhaseTag phase={card.phase} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              {card.desc}
            </div>
          </div>
        ))}
      </div>

      {/* 导航 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => router.push('/finance2')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 13,
            background: '#f1f5f9', border: '1.5px solid #e2e8f0',
            cursor: 'pointer', color: '#475569',
          }}
        >
          ← Finance V2 Dashboard
        </button>
        <button
          onClick={() => router.push('/finance2/ap')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 13,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          AP Runtime <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
