'use client';
import { Users, ArrowRight, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

export default function Finance2ShareholderFundsPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="股东资金 Runtime"
        subtitle="来源：prc2_shareholder_funds 适配层"
        breadcrumb={['Finance V2', '股东资金']}
      />

      {/* 适配层说明 */}
      <div style={{
        background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)',
        border: '1.5px solid #e9d5ff', borderRadius: 16,
        padding: '28px 32px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={24} color="#7c3aed" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#4c1d95', marginBottom: 6 }}>
              股东资金 Runtime
            </div>
            <div style={{ fontSize: 13, color: '#6d28d9', lineHeight: 1.8 }}>
              当前数据来源：<strong>prc2_shareholder_funds</strong>（采购 V2 股东资金台账）过渡适配层。<br />
              包含股东出资记录、股东代付、资金结算和利息计算等功能。<br />
              Finance V2 Phase 2 将建立原生 <code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px', borderRadius: 4 }}>fin_shareholder_contributions</code> /<br />
              <code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px', borderRadius: 4 }}>fin_shareholder_settlements</code> Runtime。
            </div>
          </div>
        </div>
      </div>

      {/* 快速导航 */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: '#374151' }}>数据入口</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          {
            title:  '股东资金台账',
            desc:   '查看所有股东出资记录、代付记录及结余情况（prc2_shareholder_funds）',
            path:   '/procurement2/shareholder-funds',
            badge:  '🔄 适配层',
            bg:     '#eff6ff',
            color:  '#2563eb',
          },
          {
            title:  '股东资金结算',
            desc:   '资金结算工作流审批，查看结算单和已审批历史',
            path:   '/procurement2/shareholder-funds',
            badge:  '🔄 适配层',
            bg:     '#eff6ff',
            color:  '#2563eb',
          },
        ].map(item => (
          <div
            key={item.title}
            onClick={() => router.push(item.path)}
            style={{
              background: '#fff', borderRadius: 14, border: '1.5px solid #f1f5f9',
              padding: '20px 22px', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              (e.currentTarget as HTMLDivElement).style.borderColor = '#c4b5fd';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
              (e.currentTarget as HTMLDivElement).style.borderColor = '#f1f5f9';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{item.title}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: item.bg, color: item.color,
              }}>{item.badge}</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 12 }}>{item.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#7c3aed' }}>
              <ExternalLink size={12} /> 前往 Procurement V2
            </div>
          </div>
        ))}
      </div>

      {/* Phase 规划 */}
      <div style={{
        background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12,
        padding: '16px 20px',
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 8 }}>
          📋 Finance V2 Phase 2 — 股东资金原生 Runtime 规划
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px 20px', fontSize: 12, color: '#78350f' }}>
          {[
            'fin_shareholder_contributions — 股东出资台账',
            'fin_shareholder_settlements — 资金结算单',
            'Workflow 审批驱动结算流程',
            '利息计算引擎（复利/单利）',
            '多货币股东资金核算',
            '股东权益报表',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ color: '#d97706', marginTop: 1 }}>•</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => router.push('/finance2')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13,
            background: '#f1f5f9', border: '1.5px solid #e2e8f0',
            cursor: 'pointer', color: '#475569',
          }}
        >
          ← 返回 Finance V2 Dashboard
        </button>
      </div>
    </div>
  );
}
