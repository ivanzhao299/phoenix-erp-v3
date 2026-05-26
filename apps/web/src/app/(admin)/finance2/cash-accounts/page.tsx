'use client';
import { Wallet, Clock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

export default function Finance2CashAccountsPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="资金账户中心"
        subtitle="Finance V2 Phase 2 — 规划中"
        breadcrumb={['Finance V2', '资金账户中心']}
      />

      {/* Phase 规划提示 */}
      <div style={{
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        border: '1.5px solid #bae6fd', borderRadius: 16,
        padding: '32px 36px', marginBottom: 24, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Wallet size={28} color="#0ea5e9" />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0c4a6e', marginBottom: 8 }}>
          资金账户中心
        </div>
        <div style={{ fontSize: 14, color: '#0369a1', lineHeight: 1.8, maxWidth: 480, margin: '0 auto' }}>
          本模块计划在 <strong>Finance V2 Phase 2</strong> 建立。<br />
          将提供多账户余额追踪、资金流水明细、账户间转账管理功能，<br />
          基于 <code style={{ background: 'rgba(255,255,255,0.7)', padding: '1px 6px', borderRadius: 4 }}>fin_cash_accounts</code> 和{' '}
          <code style={{ background: 'rgba(255,255,255,0.7)', padding: '1px 6px', borderRadius: 4 }}>fin_cash_transactions</code> 原生 Runtime。
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, fontSize: 13, color: '#7c3aed' }}>
          <Clock size={14} />
          <span>预计 Phase 2 启动（Phase 1 AP Runtime 完成后）</span>
        </div>
      </div>

      {/* 规划功能列表 */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: '#374151' }}>Phase 2 规划功能</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[
          { title: '多账户管理',    desc: '银行账户、现金账户、虚拟账户统一管理',     phase: 2 },
          { title: '余额追踪',      desc: '实时余额 + 日末余额快照，支持多币种',       phase: 2 },
          { title: '资金流水',      desc: '收付款流水明细，关联 AP/AR Runtime',         phase: 2 },
          { title: '账户间转账',    desc: '内部资金划转，Workflow 审批驱动',            phase: 2 },
          { title: '对账辅助',      desc: '银行流水导入，自动匹配 fin_cash_transactions', phase: 2 },
          { title: '资金预测',      desc: '基于 AP/AR 到期日的 7/30 天资金预测',        phase: 3 },
        ].map(item => (
          <div key={item.title} style={{
            background: '#fff', borderRadius: 12, padding: '16px 18px',
            border: '1.5px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            opacity: 0.8,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 10 }}>
              {item.desc}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: '#fafafa', color: '#6b7280',
            }}>
              📋 Phase {item.phase} 规划
            </span>
          </div>
        ))}
      </div>

      {/* 跳转提示 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>当前阶段可前往：</div>
        <button
          onClick={() => router.push('/finance2/ap')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, fontSize: 13,
            background: '#f1f5f9', border: '1.5px solid #e2e8f0',
            cursor: 'pointer', color: '#475569', fontWeight: 500,
          }}
        >
          AP Runtime（应付账款）<ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
