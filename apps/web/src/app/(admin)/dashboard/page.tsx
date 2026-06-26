'use client';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Egg, Package, Archive, ShoppingCart, TrendingUp,
  CheckCircle, BarChart2, Users, Truck, Wheat
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import DashboardKPIs from './_components/DashboardKPIs';
import styles from './dashboard.module.css';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFirstAccessiblePath } from '@/components/layout/Sidebar';

type QuickLink = {
  path: string;
  groupId?: string;
  label: string;
  desc: string;
  color: string;
  icon: ReactNode;
  perm: string;
  altPerms?: string[];
};

export default function DashboardPage() {
  const { t } = useLanguage();
  const { hasPermission, loading } = useAuth();
  const router = useRouter();
  const [initialData, setInitialData] = useState<Record<string, unknown>>({});

  // 页面级守卫：按菜单权限决定入口，不再按角色名推断。
  //   - MENU_DASHBOARD:V → 集团运营驾驶舱
  //   - 财务驾驶舱权限但无 MENU_DASHBOARD → /finance2
  //   - 其它 → /home
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    try {
      if (hasPermission('MENU_DASHBOARD', 'V')) { setAllowed(true); return; }
      const financePath = getFirstAccessiblePath(hasPermission, 'finance');
      if (financePath) {
        router.replace(financePath);
        return;
      }
      router.replace('/home');
    } catch { router.replace('/home'); }
  }, [hasPermission, loading, router]);

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

  const QUICK_LINKS: QuickLink[] = [
    { path: '/breeding', groupId: 'production', label: t('ui.养殖管理','养殖管理'), desc: t('ui.鸡舍 / 鸡群 / 日报','鸡舍 / 鸡群 / 日报'),   color: 'var(--status-success)', icon: <Egg size={22} />, perm: 'MENU_FARM_DATA' },
    { path: '/packaging', groupId: 'production', label: t('ui.分级包装','分级包装'), desc: t('ui.集蛋 / 分级 / 包装','集蛋 / 分级 / 包装'),   color: 'var(--status-info)', icon: <Package size={22} />, perm: 'MENU_PKG_OP', altPerms: ['MENU_PKG_MGR'] },
    { path: '/warehouse', groupId: 'inventory', label: t('ui.仓储库存','仓储库存'), desc: t('ui.入库 / 出库 / 盘点','入库 / 出库 / 盘点'),   color: 'var(--color-purple-500)', icon: <Archive size={22} />, perm: 'MENU_WMS_VIEW' },
    { path: '/sales2/orders', groupId: 'sales', label: t('ui.销售订单','销售订单'), desc: t('ui.订单 / 审批 / 配送','订单 / 审批 / 配送'),   color: 'var(--status-warning)', icon: <ShoppingCart size={22} />, perm: 'MENU_SALES2_ORDER' },
    { path: '/sales2/delivery', groupId: 'sales', label: t('ui.配送运输','配送运输'), desc: t('ui.波次 / 跟踪 / 签收','波次 / 跟踪 / 签收'),   color: 'var(--status-info)', icon: <Truck size={22} />, perm: 'MENU_SALES2_DELIVERY' },
    { path: '/finance2', groupId: 'finance', label: t('ui.财务结算','财务结算'), desc: t('ui.应收 / 应付 / 流水','应收 / 应付 / 流水'),   color: 'var(--status-warning)', icon: <TrendingUp size={22} />, perm: 'MENU_FIN2_REPORT', altPerms: ['MENU_FIN2_AR', 'MENU_FIN2_AR_LEDGER', 'MENU_FIN2_AP', 'MENU_FIN2_CASH_VIEW', 'MENU_FIN2_CASH', 'MENU_FIN2_CASH_TRANSFER', 'MENU_FIN2_SHAREHOLDER', 'MENU_FIN2_EXPENSE', 'MENU_FIN2_REIMBURSE'] },
    { path: '/quality', groupId: 'production', label: t('ui.品质追溯','品质追溯'), desc: t('ui.质检 / 追溯 / 报表','质检 / 追溯 / 报表'),   color: 'var(--color-purple-500)', icon: <CheckCircle size={22} />, perm: 'MENU_QA_OP', altPerms: ['MENU_QA_MGR'] },
    { path: '/procurement2/dashboard', groupId: 'procurement', label: t('ui.采购管理','采购管理'), desc: t('ui.采购单 / 供应商','采购单 / 供应商'), color: 'var(--status-success)', icon: <Wheat size={22} />, perm: 'MENU_PRC2_DASHBOARD', altPerms: ['MENU_PRC2_SUPPLIER', 'MENU_PRC2_PROJECT', 'MENU_PRC2_REQUEST', 'MENU_PRC2_ORDER', 'MENU_PRC2_PAYMENT', 'MENU_PRC2_RECEIPT', 'MENU_PRC2_SHIPMENT', 'MENU_PRC2_FUND'] },
    { path: '/analytics', groupId: 'analytics', label: t('ui.数据分析','数据分析'), desc: t('ui.BI 驾驶舱 / 报表','BI 驾驶舱 / 报表'),    color: 'var(--violet-500)', icon: <BarChart2 size={22} />, perm: 'MENU_DASHBOARD' },
    { path: '/settings', groupId: 'settings', label: t('ui.系统设置','系统设置'), desc: t('ui.用户 / 权限 / 字典','用户 / 权限 / 字典'),   color: 'var(--slate-400)', icon: <Users size={22} />, perm: 'MENU_SETTINGS_USER' },
  ];
  const visibleQuickLinks = QUICK_LINKS
    .map(q => ({ ...q, path: q.groupId ? (getFirstAccessiblePath(hasPermission, q.groupId) || '') : q.path }))
    .filter(q => q.path && (hasPermission(q.perm, 'V') || (q.altPerms || []).some(p => hasPermission(p, 'V'))));

  // 守卫未通过（无权或正在重定向）→ 不渲染任何内容，避免 CEO 画面闪现
  if (allowed !== true) return null;

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
          {/* g200l(2026-06-20):去 emoji-color 风格,改白底 + 顶部 tone 色条 + 克制图标 */}
          {visibleQuickLinks.map(q => (
            <Link key={q.path} href={q.path} className={styles.quickLink} style={{ borderTop: `3px solid ${q.color}` }}>
              <div style={{ color: q.color, flexShrink: 0 }}>
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
