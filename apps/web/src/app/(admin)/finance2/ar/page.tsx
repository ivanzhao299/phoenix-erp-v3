'use client';
import { TrendingUp, Clock, ArrowRight, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

const PLANNED_FEATURES = [
  { title: '应收发票台账',   desc: 'fin_ar_invoices — 客户发票管理，支持多币种',        phase: 2 },
  { title: '收款核销',       desc: 'fin_ar_receipts — 收款记录关联发票核销',            phase: 2 },
  { title: 'AR Workflow',   desc: '发票创建 → 审批 → 收款确认，全程 Workflow Native', phase: 2 },
  { title: '账龄分析',       desc: '按客户、公司、货币维度的 AR 账龄报表',              phase: 2 },
  { title: '坏账准备',       desc: '账龄分级自动计提坏账准备，Workflow 审批驱动',       phase: 3 },
  { title: '对账单',         desc: '客户对账单自动生成与发送',                          phase: 3 },
];

export default function Finance2ArPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="AR Runtime（应收账款）"
        subtitle="Finance V2 Phase 2 — 规划中"
        breadcrumb={['Finance V2', 'AR Runtime']}
      />

      {/* Phase 说明 */}
      <div style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
        border: '1.5px solid #86efac', borderRadius: 16,
        padding: '28px 32px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={24} color="#16a34a" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#14532d', marginBottom: 6 }}>
              AR Runtime — 应收账款管理
            </div>
            <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.8 }}>
              本模块计划在 <strong>Finance V2 Phase 2</strong> 建立，AP Runtime（Phase 1）完成后启动。<br />
              将基于原生 <code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px', borderRadius: 4 }}>fin_ar_invoices</code> 和{' '}
              <code style={{ background: 'rgba(255,255,255,0.6)', padding: '1px 5px', borderRadius: 4 }}>fin_ar_receipts</code> Runtime，<br />
              通过 Workflow 2.0 ApprovalEngine 驱动收款审批流程，不调用任何旧 finance 表。
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12, color: '#15803d' }}>
              <Clock size={13} />
              <span>DDL 骨架已就位（Phase 0 基线），等待 Phase 1 AP Runtime 完成后启动</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow 底座就绪状态 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10, marginBottom: 24,
      }}>
        {[
          { label: 'Workflow Platform', status: 'READY',   color: '#059669', bg: '#f0fdf4' },
          { label: 'Form Runtime',      status: 'READY',   color: '#059669', bg: '#f0fdf4' },
          { label: 'ApprovalEngine',    status: 'READY',   color: '#059669', bg: '#f0fdf4' },
          { label: 'fin_ar_invoices',   status: 'PENDING', color: '#d97706', bg: '#fffbeb' },
          { label: 'AR 收款 Workflow',  status: 'PENDING', color: '#d97706', bg: '#fffbeb' },
        ].map(item => (
          <div key={item.label} style={{
            background: item.bg, border: `1.5px solid ${item.color}33`,
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <CheckCircle size={16} color={item.color} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: item.color, fontWeight: 700 }}>
                {item.status === 'READY' ? '✅ 已就绪' : '⏳ Phase 2 建设'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 规划功能 */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: '#374151' }}>Phase 2-3 规划功能</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 28 }}>
        {PLANNED_FEATURES.map(item => (
          <div key={item.title} style={{
            background: '#fff', borderRadius: 12, padding: '16px 18px',
            border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            opacity: 0.85,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 10 }}>
              {item.desc}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: item.phase === 2 ? '#eff6ff' : '#fafafa',
              color:      item.phase === 2 ? '#2563eb' : '#6b7280',
            }}>
              📋 Phase {item.phase} 规划
            </span>
          </div>
        ))}
      </div>

      {/* 导航 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/finance2/ap')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 13,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500,
          }}
        >
          AP Runtime（Phase 1 建设中）<ArrowRight size={13} />
        </button>
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
      </div>
    </div>
  );
}
