'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Egg, Package, Archive, ShoppingCart, TrendingUp,
  CheckCircle, BarChart2, Users, Truck, Wheat
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import DashboardKPIs from './_components/DashboardKPIs';
import styles from './dashboard.module.css';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DashboardPage() {
  const { t } = useLanguage();
  const [initialData, setInitialData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE || '';
    const tok = typeof window !== 'undefined'
      ? (sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '') : '';
    fetch(`${base}/api/dashboard/kpi`, tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.code === 200) setInitialData(json.data);
      })
      .catch(() => {});
  }, []);

  const QUICK_LINKS = [
    { path: '/breeding',    label: t('ui.养殖管理','养殖管理'), desc: t('ui.鸡舍 / 鸡群 / 日报','鸡舍 / 鸡群 / 日报'),   color: '#10b981', icon: <Egg size={22} /> },
    { path: '/packaging',   label: t('ui.分级包装','分级包装'), desc: t('ui.集蛋 / 分级 / 包装','集蛋 / 分级 / 包装'),   color: '#3b82f6', icon: <Package size={22} /> },
    { path: '/warehouse',   label: t('ui.仓储库存','仓储库存'), desc: t('ui.入库 / 出库 / 盘点','入库 / 出库 / 盘点'),   color: '#8b5cf6', icon: <Archive size={22} /> },
    { path: '/sales2/orders', label: t('ui.销售订单','销售订单'), desc: t('ui.订单 / 审批 / 配送','订单 / 审批 / 配送'),   color: '#f59e0b', icon: <ShoppingCart size={22} /> },
    { path: '/sales2/delivery', label: t('ui.配送运输','配送运输'), desc: t('ui.波次 / 跟踪 / 签收','波次 / 跟踪 / 签收'),   color: '#06b6d4', icon: <Truck size={22} /> },
    { path: '/finance2',        label: t('ui.财务结算','财务结算'), desc: t('ui.应收 / 应付 / 流水','应收 / 应付 / 流水'),   color: '#f97316', icon: <TrendingUp size={22} /> },
    { path: '/quality',         label: t('ui.品质追溯','品质追溯'), desc: t('ui.质检 / 追溯 / 报表','质检 / 追溯 / 报表'),   color: '#8b5cf6', icon: <CheckCircle size={22} /> },
    { path: '/procurement2',    label: t('ui.采购管理','采购管理'), desc: t('ui.采购单 / 供应商','采购单 / 供应商'),      color: '#84cc16', icon: <Wheat size={22} /> },
    { path: '/analytics',   label: t('ui.数据分析','数据分析'), desc: t('ui.BI 驾驶舱 / 报表','BI 驾驶舱 / 报表'),    color: '#a855f7', icon: <BarChart2 size={22} /> },
    { path: '/settings',    label: t('ui.系统设置','系统设置'), desc: t('ui.用户 / 权限 / 字典','用户 / 权限 / 字典'),   color: '#94a3b8', icon: <Users size={22} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t('ui.系统仪表盘','系统仪表盘')}
        subtitle={t('ui.Phoenix ERP 核心运营指标概览','Phoenix ERP 核心运营指标概览')}
      />

      {/* KPI 区域 + 图表 + 告警（Client Component，接受 SSR 初始数据） */}
      <DashboardKPIs initialData={initialData} />

      {/* 快速导航 */}
      <div style={{ marginTop: 32 }}>
        <p className={styles.sectionLabel}>{t('ui.快速导航','快速导航')}</p>
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
