'use client';

/**
 * /daily-work — 每日工作台（G12 重设：按 RBAC 持权动态生成卡片）
 *
 * 设计原则（用户明确）：
 * · 基层效率第一，最短路径直达录入
 * · 不再按 userKind 静态映射，改按用户实际持有的 menu_code + perm 动态生成卡片
 * · 卡片右上 today_count 徽章（今日已录条数）
 * · 顶部"今日待办"banner 显示未完成项
 */

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import {
  ClipboardList, Egg, Wheat, AlertTriangle, Wallet, FileSearch, Send,
  ShoppingCart, Receipt, Warehouse, Inbox, CheckCircle2, Clock,
  Pill, PackagePlus, PackageMinus, Feather, Syringe,
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
  perm: string;                       // 必需的菜单权限
  permOp?: 'V' | 'C' | 'E';          // 默认 'V'，录入类用 'C'
  todayCount?: number;
}

const tok = () => (typeof window === 'undefined' ? '' : sessionStorage.getItem('phoenix_token') || '');

// G12：所有可能的快捷卡片（与 sidebar menu_code 对齐，按 perm 过滤）
const ALL_CARDS: QuickCard[] = [
  // ───── 养殖生产 ─────
  { key: 'daily_log',   title: '生产日报录入',     desc: '存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率',
    icon: ClipboardList, href: '/breeding/daily?action=create&date=today',           accent: '#2563EB', perm: 'MENU_FARM_DAILY',         permOp: 'E' },
  { key: 'flock',       title: '鸡群档案',          desc: '入栏批次 / 当前存栏 / 强制换羽',
    icon: Feather,       href: '/breeding/flock',                                     accent: '#0EA5E9', perm: 'MENU_FARM_DATA',          permOp: 'V' },
  { key: 'mortality',   title: '死淘快速登记',     desc: '紧急死亡 / 淘汰登记 · 含原因',
    icon: AlertTriangle, href: '/breeding/daily?action=mortality',                    accent: '#EF4444', perm: 'MENU_FARM_DAILY',         permOp: 'E' },
  { key: 'feed_log',    title: '饲料消耗登记',     desc: '玉米 / 豆粕 / 预混料 · 按鸡舍分配',
    icon: Wheat,         href: '/breeding/feed?action=create&date=today',             accent: '#10B981', perm: 'MENU_FARM_FEED',          permOp: 'C' },
  { key: 'vet_record',  title: '兽药使用记录',     desc: '日常用药 / 治疗记录',
    icon: Pill,          href: '/breeding/medicine?action=create&date=today',         accent: '#22C55E', perm: 'MENU_FARM_VET',           permOp: 'C' },
  { key: 'vaccine',     title: '免疫疫苗记录',     desc: '免疫计划 / 接种记录',
    icon: Syringe,       href: '/breeding/immune',                                    accent: '#84CC16', perm: 'MENU_FARM_VET',           permOp: 'V' },
  { key: 'med_stock',   title: '药品库存',          desc: '入库 / 出库 / 库存查询',
    icon: Pill,          href: '/breeding/med-stock',                                 accent: '#16A34A', perm: 'MENU_FARM_VET',           permOp: 'V' },
  // G15：集蛋记录已合并到日生产日报，不再单独显示
  { key: 'egg_inbound', title: '日产蛋入库',        desc: '7 等级分级入库',
    icon: PackagePlus,   href: '/breeding/daily-inbound?action=create&date=today',    accent: '#F97316', perm: 'MENU_PROD_INBOUND',       permOp: 'C' },

  // ───── 仓储与库存 ─────
  { key: 'manual_in',   title: '原料入库',          desc: '饲料 / 兽药 / 包材手工入库',
    icon: PackagePlus,   href: '/warehouse/inbound?action=create&date=today',         accent: '#8B5CF6', perm: 'MENU_INV_MANUAL_INBOUND', permOp: 'E' },
  { key: 'wms_out',     title: '出库管理',          desc: '原料出库 / 调拨出库',
    icon: PackageMinus,  href: '/warehouse/outbound?action=create&date=today',        accent: '#A855F7', perm: 'MENU_WMS_INOUT',          permOp: 'E' },
  { key: 'inv_query',   title: '库存查询',          desc: '批次 / 临期 / 流水',
    icon: Warehouse,     href: '/warehouse/query',                                    accent: '#EAB308', perm: 'MENU_WMS_VIEW',           permOp: 'V' },

  // ───── 财务现金 ─────
  { key: 'cash_in',     title: '现金收款',          desc: '直营店 / 客户收款 · 老币+人民币',
    icon: Wallet,        href: '/finance2/cash-accounts?action=receive',              accent: '#06B6D4', perm: 'MENU_FIN2_CASH',          permOp: 'C' },
  { key: 'cash_out',    title: '现金付款',          desc: '采购 / 工资 / 运费',
    icon: Receipt,       href: '/finance2/cash-accounts?action=pay',                  accent: '#7C3AED', perm: 'MENU_FIN2_CASH',          permOp: 'C' },

  // ───── 销售 ─────
  { key: 'sale_create', title: '销售出库',          desc: '客户订单 / 散户零售',
    icon: ShoppingCart,  href: '/sales2/orders?action=create',                        accent: '#10B981', perm: 'MENU_SALES2_ORDER',       permOp: 'C' },
  { key: 'sale_receipt',title: '应收收款',          desc: '客户回款登记',
    icon: Receipt,       href: '/finance2/ar?action=receipt',                         accent: '#059669', perm: 'MENU_FIN2_AR',            permOp: 'C' },

  // ───── 通用 ─────
  { key: 'todo',        title: '我的待办',          desc: '待处理审批任务',
    icon: Inbox,         href: '/workflow/tasks/todo',                                accent: '#3B82F6', perm: 'MENU_WORKFLOW',           permOp: 'V' },
  { key: 'my_submit',   title: '我的提交',          desc: '本人发起的所有单据 · 审批进度',
    icon: Send,          href: '/workflow/instances?owner=me',                        accent: '#6B7280', perm: 'MENU_WORKFLOW',           permOp: 'V' },
];

export default function DailyWorkPage() {
  const { user, hasPermission } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number>>({});

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

  // G12 核心：按持权动态生成卡片，附上 today_count
  const visibleCards = useMemo(
    () => ALL_CARDS
      .filter(c => hasPermission(c.perm, c.permOp || 'V'))
      .map(c => ({ ...c, todayCount: stats[c.key] })),
    [hasPermission, stats]
  );

  const todoCount = (stats.todo || 0) + (stats.overdue || 0);

  return (
    <div>
      <PageHeader
        title={`${userName}的每日工作台`}
        subtitle={`${today} · 一站式录入 · ${visibleCards.length} 项可用功能`}
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

      {visibleCards.length === 0 ? (
        <div style={{
          marginTop: 40, textAlign: 'center', padding: 40,
          background: 'var(--bg-muted)', borderRadius: 12,
          color: 'var(--text-secondary)', fontSize: 14,
        }}>
          <FileSearch size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>暂无可用功能</div>
          <div>你的角色暂无任何录入权限，请联系管理员调整。</div>
        </div>
      ) : (
        <>
          <div style={{ ...sectionTitle, marginTop: 0 }}>常用录入入口 · 按你的角色权限自动显示</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}>
            {visibleCards.map(c => {
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
        </>
      )}
    </div>
  );
}
