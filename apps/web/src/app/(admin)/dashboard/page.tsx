import Link from 'next/link';
import {
  Egg, Package, Archive, ShoppingCart, TrendingUp,
  CheckCircle, BarChart2, Users, Truck, Wheat
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import DashboardKPIs from './_components/DashboardKPIs';
import styles from './dashboard.module.css';

/** Server Component — 服务端获取初始 KPI 数据（零闪白屏） */
async function fetchInitialKpi() {
  const base = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:3100';
  try {
    const res = await fetch(`${base}/api/dashboard/kpi`, {
      next: { revalidate: 60 },   // ISR: 60s 重新验证
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.code === 200 ? json.data : null;
  } catch {
    return null;
  }
}

const QUICK_LINKS = [
  { path: '/breeding',    label: '养殖管理', desc: '鸡舍 / 鸡群 / 日报',   color: '#10b981', icon: <Egg size={22} /> },
  { path: '/packaging',   label: '分级包装', desc: '集蛋 / 分级 / 包装',   color: '#3b82f6', icon: <Package size={22} /> },
  { path: '/warehouse',   label: '仓储库存', desc: '入库 / 出库 / 盘点',   color: '#8b5cf6', icon: <Archive size={22} /> },
  { path: '/order',       label: '订货系统', desc: '订单 / 审批 / 拣货',   color: '#f59e0b', icon: <ShoppingCart size={22} /> },
  { path: '/transport',   label: '配送运输', desc: '波次 / 跟踪 / 签收',   color: '#06b6d4', icon: <Truck size={22} /> },
  { path: '/finance',     label: '财务结算', desc: '应收 / 应付 / 流水',   color: '#f97316', icon: <TrendingUp size={22} /> },
  { path: '/quality',     label: '品质追溯', desc: '质检 / 追溯 / 报表',   color: '#ec4899', icon: <CheckCircle size={22} /> },
  { path: '/procurement', label: '采购管理', desc: '采购单 / 供应商',      color: '#84cc16', icon: <Wheat size={22} /> },
  { path: '/analytics',   label: '数据分析', desc: 'BI 驾驶舱 / 报表',    color: '#a855f7', icon: <BarChart2 size={22} /> },
  { path: '/settings',    label: '系统设置', desc: '用户 / 权限 / 字典',   color: '#94a3b8', icon: <Users size={22} /> },
];

export const metadata = {
  title: '驾驶舱 — Phoenix ERP',
  description: 'Phoenix ERP 核心运营指标实时总览',
};

export default async function DashboardPage() {
  const initialData = await fetchInitialKpi();

  return (
    <div>
      <PageHeader
        title="系统仪表盘"
        subtitle="Phoenix ERP 核心运营指标概览"
      />

      {/* KPI 区域 + 图表 + 告警（Client Component，接受 SSR 初始数据） */}
      <DashboardKPIs initialData={initialData ?? {}} />

      {/* 快速导航 — 纯静态，Server Component 渲染 */}
      <div style={{ marginTop: 32 }}>
        <p className={styles.sectionLabel}>快速导航</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {QUICK_LINKS.map(q => (
            <Link key={q.path} href={q.path} className={styles.quickLink}>
              <div style={{ color: q.color, flexShrink: 0, background: `${q.color}18`, borderRadius: 10, padding: 10 }}>
                {q.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{q.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{q.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
