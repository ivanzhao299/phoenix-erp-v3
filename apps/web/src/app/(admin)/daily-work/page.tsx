'use client';

/**
 * /daily-work — 每日工作台
 *
 * 一站式录入入口，按用户类型显示不同的高频卡片组：
 * · 生产/养殖人员（userKind=production）→ 生产日报 / 鸡蛋分级 / 饲料消耗 / 死淘记录 / 现金收支 / 异常上报 / 我的提交
 * · 销售/门店人员（userKind=store） → 销售出库 / 收款记录 / 库存查询 / 我的销售统计
 * · 办公（office）→ 待办 / 审批中心 / 我的发起
 *
 * 设计要点：
 * · 大卡片 + 大图标，移动友好
 * · 卡片右上角 today_count 徽章（今日已录条数）
 * · 点击直接跳到对应录入页（带预设上下文 ?date=today&farm=LPH_MENGSAI 等）
 * · 顶部"今日待办"banner 显示未完成项
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import {
  ClipboardList, Egg, Wheat, AlertTriangle, Wallet, FileSearch, Send,
  ShoppingCart, Receipt, Warehouse, Inbox, CheckCircle2, Clock,
} from 'lucide-react';
import {
  sectionTitle, tableContainer, inlineBadge,
} from '@/components/design-system/cockpit-styles';

interface QuickCard {
  key: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  href: string;
  accent: string;
  todayCount?: number;
}

const tok = () => (typeof window === 'undefined' ? '' : sessionStorage.getItem('phoenix_token') || '');

export default function DailyWorkPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number>>({});

  const userKind: 'production' | 'store' | 'office' = (user as any)?.userKind || 'office';
  const userName = (user as any)?.realNameZh || (user as any)?.name || '用户';
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  // 加载今日统计（容错 — 端点不存在则 0）
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/daily-work/today-stats', {
          headers: { Authorization: `Bearer ${tok()}` },
        });
        if (res.ok) setStats(await res.json());
      } catch { /* noop */ }
    })();
  }, []);

  // 卡片定义：按 userKind 切换
  const cards: QuickCard[] = userKind === 'production' ? [
    {
      key: 'daily_log', title: '生产日报录入', desc: '存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率',
      icon: ClipboardList, href: '/breeding/daily?action=create&date=today', accent: '#2563EB',
      todayCount: stats.daily_log,
    },
    {
      key: 'egg_inbound', title: '鸡蛋分级入库', desc: '7 等级 · 各鸡舍当日产蛋分级',
      icon: Egg, href: '/breeding/egg-ledger?action=create&date=today', accent: '#F59E0B',
      todayCount: stats.egg_inbound,
    },
    {
      key: 'feed_log', title: '饲料消耗登记', desc: '玉米 / 豆粕 / 预混料 · 按鸡舍分配',
      icon: Wheat, href: '/warehouse/outbound?action=create&type=feed&date=today', accent: '#10B981',
      todayCount: stats.feed_log,
    },
    {
      key: 'mortality', title: '死淘快速登记', desc: '紧急死亡 / 淘汰登记 · 含原因',
      icon: AlertTriangle, href: '/breeding/daily?action=mortality', accent: '#EF4444',
      todayCount: stats.mortality,
    },
    {
      key: 'cash_in', title: '现金收款', desc: '直营店 / 客户收款 · 老币 + 人民币',
      icon: Wallet, href: '/finance2/cash-accounts?action=receive', accent: '#0EA5E9',
      todayCount: stats.cash_in,
    },
    {
      key: 'cash_out', title: '现金付款', desc: '采购 / 工资 / 运费 · 老币 + 人民币',
      icon: Receipt, href: '/finance2/cash-accounts?action=pay', accent: '#7C3AED',
      todayCount: stats.cash_out,
    },
    {
      key: 'exception', title: '异常上报', desc: '设备故障 / 鸡群异常 / 质检不合格',
      icon: AlertTriangle, href: '/breeding?action=qa', accent: '#DC2626',
      todayCount: stats.exception,
    },
    {
      key: 'my_submit', title: '我的提交记录', desc: '查看本人发起的所有单据 · 审批进度',
      icon: Send, href: '/workflow/instances?owner=me', accent: '#6B7280',
      todayCount: stats.my_submit,
    },
  ] : userKind === 'store' ? [
    { key: 'sale_create', title: '销售出库', desc: '客户订单 / 散户零售', icon: ShoppingCart, href: '/sales2/orders?action=create', accent: '#2563EB', todayCount: stats.sale_create },
    { key: 'receipt', title: '收款记录', desc: '应收回款登记', icon: Receipt, href: '/finance2/ar?action=receipt', accent: '#10B981', todayCount: stats.receipt },
    { key: 'inv_query', title: '库存查询', desc: '门店实时库存', icon: Warehouse, href: '/sales2/inventory', accent: '#F59E0B' },
    { key: 'my_submit', title: '我的销售统计', desc: '今日 / 本周 / 本月汇总', icon: FileSearch, href: '/sales2/report?owner=me', accent: '#6B7280' },
  ] : [
    { key: 'todo', title: '我的待办', desc: '待处理审批任务', icon: Inbox, href: '/workflow/tasks/todo', accent: '#2563EB', todayCount: stats.todo },
    { key: 'approval', title: '审批中心', desc: '查看所有审批流', icon: CheckCircle2, href: '/approval', accent: '#10B981' },
    { key: 'my_submit', title: '我的发起', desc: '本人发起的单据', icon: Send, href: '/workflow/instances?owner=me', accent: '#6B7280' },
  ];

  const todoCount = (stats.todo || 0) + (stats.overdue || 0);

  return (
    <div>
      <PageHeader
        title={`${userName}的每日工作台`}
        subtitle={`${today} · 一站式录入所有高频业务数据`}
        breadcrumb={['每日工作台']}
      />

      {/* 今日待办 banner */}
      {todoCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, var(--status-warning-bg-faint), transparent)',
          borderLeft: '3px solid var(--status-warning)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Clock size={16} color="var(--status-warning)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              你有 {todoCount} 项待办需要处理
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              点下方"我的待办"卡片快速处理
            </div>
          </div>
        </div>
      )}

      {/* 卡片网格 */}
      <div style={{ ...sectionTitle, marginTop: 0 }}>常用录入入口</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 14,
      }}>
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => router.push(c.href)}
              style={{
                ...tableContainer,
                textAlign: 'left',
                padding: '18px 20px',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                transition: 'all 0.15s',
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: c.accent,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px var(--overlay-black-08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `${c.accent}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={22} color={c.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                  marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {c.title}
                  {c.todayCount !== undefined && c.todayCount > 0 && (
                    <span style={{
                      ...inlineBadge('success'), fontSize: 10, padding: '2px 8px',
                    }}>
                      今日 {c.todayCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {c.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 使用说明（首次访问温馨提示） */}
      <div style={{
        marginTop: 28, padding: '16px 20px', borderRadius: 10,
        background: 'var(--bg-muted)',
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>使用提示</div>
        点击任何卡片可直接打开对应录入页面，默认日期已自动填为今天。
        所有录入数据会自动写入正确的公司 / 项目 / 站点（按你的所属组织自动绑定）。
        如某些卡片暂未显示，说明你的角色暂无该项权限，请联系管理员调整。
      </div>
    </div>
  );
}
