'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useBrand } from '@/contexts/BrandContext';
import { canAccess } from '@/lib/mobile-roles';
import { haptic } from '@/lib/haptic';
import { approvalApi, notificationApi } from '@/lib/mobile-api';
import {
  BarChart2, Package, ShieldCheck, Warehouse,
  Truck, CheckSquare, LogOut, Monitor, Wheat, Skull, Bird, Egg,
  Sun, Moon, LineChart, PackageCheck, ClipboardList,
  Maximize2, Minimize2, ClipboardCheck as WorkflowIcon, Bell,
} from 'lucide-react';

type NavCard = {
  icon: React.ReactNode;
  titleZh: string;
  titleEn: string;
  titleLo: string;
  desc: string;
  href?: string;
  soon?: boolean;
  color: string;
  /** mobile-roles.ts 中的 pageKey，用于角色过滤；不填则始终显示 */
  pageKey?: string;
  /** 动态角标数量 key，由首页 useEffect 填充 */
  badgeKey?: 'todoCount' | 'notifCount';
};

const NAV_CARDS: NavCard[] = [
  {
    icon: <BarChart2 size={28} />,
    titleZh: '每日看板', titleEn: 'Daily Board', titleLo: 'ກະດານປະຈໍາວັນ',
    desc: '生产·包装·品质·销售',
    color: '#10b981', href: '/mobile/dashboard', soon: false,
    pageKey: 'dashboard',
  },
  {
    icon: <Wheat size={28} />,
    titleZh: '饲料台账', titleEn: 'Feed Ledger', titleLo: 'ບັນທຶກອາຫານ',
    desc: '出入库登记·库存预警',
    color: '#f59e0b', href: '/mobile/feed', soon: false,
    pageKey: 'feed',
  },
  {
    icon: <Skull size={28} />,
    titleZh: '死淘快录', titleEn: 'Mortality', titleLo: 'ບັນທຶກຕາຍ',
    desc: '各栋死淘数量快速录入',
    color: '#ef4444', href: '/mobile/mortality', soon: false,
    pageKey: 'mortality',
  },
  {
    icon: <Package size={28} />,
    titleZh: '包装统计', titleEn: 'Packaging', titleLo: 'ຫຸ້ມຫໍ່',
    desc: '班次产出、等级分布',
    color: '#a78bfa', href: '/mobile/packaging', soon: false,
    pageKey: 'packaging',
  },
  {
    icon: <ShieldCheck size={28} />,
    titleZh: '品质检测', titleEn: 'Quality', titleLo: 'ຄຸນນະພາບ',
    desc: '首检、过程检、出库检',
    color: '#8b5cf6', href: '/mobile/quality', soon: false,
    pageKey: 'quality',
  },
  {
    icon: <Warehouse size={28} />,
    titleZh: '鸡蛋台账', titleEn: 'Egg Ledger', titleLo: 'ບັນທຶກໄຂ່',
    desc: '出入库登记·分级库存',
    color: '#3b82f6', href: '/mobile/egg', soon: false,
    pageKey: 'egg',
  },
  {
    icon: <Truck size={28} />,
    titleZh: '销售出库', titleEn: 'Sales', titleLo: 'ການຂາຍ',
    desc: '农场直销·出库开单',
    color: '#06b6d4', href: '/mobile/sales', soon: false,
    pageKey: 'sales',
  },
  {
    icon: <CheckSquare size={28} />,
    titleZh: '药品台账', titleEn: 'Medicine', titleLo: 'ຢາ',
    desc: '药品库存·出入库登记',
    color: '#8b5cf6', href: '/mobile/medicine', soon: false,
    pageKey: 'medicine',
  },
  {
    icon: <Monitor size={28} />,
    titleZh: '包装作业台', titleEn: 'Pkg Terminal', titleLo: 'Terminal',
    desc: '前往现场作业终端',
    color: '#f59e0b',
    href: '/terminal/packaging/dashboard',
    soon: false,
    pageKey: 'terminal',
  },
  {
    icon: <Bird size={28} />,
    titleZh: '存栏日报', titleEn: 'Hen Report', titleLo: 'ລາຍງານໄກ່',
    desc: '母鸡存栏·产蛋率·死淘',
    color: '#22d3ee',
    href: '/mobile/henreport',
    soon: false,
    pageKey: 'henreport',
  },
  {
    icon: <Egg size={28} />,
    titleZh: '产蛋录入', titleEn: 'Egg Entry', titleLo: 'ບັນທຶກໄຂ່',
    desc: '各栋产蛋数量·班次录入',
    color: '#f59e0b',
    href: '/mobile/egglog',
    soon: false,
    pageKey: 'egglog',
  },
  {
    icon: <LineChart size={28} />,
    titleZh: '生产趋势', titleEn: 'Analytics', titleLo: 'ທ່າອ່ຽງ',
    desc: '7/14/30天产蛋·死淘·饲料',
    color: '#6366f1',
    href: '/mobile/analytics',
    soon: false,
    pageKey: 'analytics',
  },
  {
    icon: <PackageCheck size={28} />,
    titleZh: '配送签收', titleEn: 'Delivery', titleLo: 'ການຈັດສົ່ງ',
    desc: '查看配送波次 · 录入签收记录',
    color: '#0891b2',
    href: '/mobile/delivery',
    soon: false,
    pageKey: 'delivery',
  },
  {
    icon: <ClipboardList size={28} />,
    titleZh: '发起采购', titleEn: 'Request', titleLo: 'ຂໍຈັດຊື້',
    desc: '填报采购需求 · 查看申请进度',
    color: '#059669', href: '/mobile/prc-request', soon: false,
    pageKey: 'prc_request',
  },
  // ── Workflow 2.0 新增 ──────────────────────────────────────────────────────
  {
    icon: <WorkflowIcon size={28} />,
    titleZh: '审批中心', titleEn: 'Approvals', titleLo: 'ການອະນຸມັດ',
    desc: '统一审批待办',
    color: '#7c3aed', href: '/mobile/workflow', soon: false,
    pageKey: 'workflow',
    badgeKey: 'todoCount',
  },
  {
    icon: <Bell size={28} />,
    titleZh: '通知中心', titleEn: 'Notifications', titleLo: 'ການແຈ້ງເຕືອນ',
    desc: '审批提醒 · 系统通知',
    color: '#f59e0b', href: '/mobile/notifications', soon: false,
    pageKey: 'notifications',
    badgeKey: 'notifCount',
  },
];

/** 全屏 API 能力检测（iOS Safari 不支持） */
function canFullscreen() {
  if (typeof document === 'undefined') return false;
  return !!(document.documentElement.requestFullscreen
    || (document.documentElement as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen);
}

export default function MobileHomePage() {
  const { user, logout } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const router = useRouter();
  const { isDark, toggle, t } = useMobileTheme();
  const { brand } = useBrand();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported] = useState(() => canFullscreen());

  // 动态角标：审批待办数 + 未读通知数
  const [todoCount,  setTodoCount]  = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      approvalApi.getTaskCount(),
      notificationApi.unreadCount(),
    ]).then(([todoRes, notifRes]) => {
      if (!active) return;
      if (todoRes.status  === 'fulfilled') setTodoCount(todoRes.value);
      if (notifRes.status === 'fulfilled') setNotifCount(notifRes.value);
    });
    return () => { active = false; };
  }, []);

  /** 监听浏览器全屏状态变化（用户按 Esc 退出时同步状态） */
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    haptic('light');
    try {
      if (!document.fullscreenElement) {
        const el = document.documentElement as unknown as {
          requestFullscreen?: () => Promise<void>;
          webkitRequestFullscreen?: () => void;
        };
        if (el.requestFullscreen) await el.requestFullscreen();
        else el.webkitRequestFullscreen?.();
      } else {
        const doc = document as unknown as {
          exitFullscreen?: () => Promise<void>;
          webkitExitFullscreen?: () => void;
        };
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else doc.webkitExitFullscreen?.();
      }
    } catch { /* 用户拒绝或浏览器不支持 */ }
  }, []);

  const getTitle = (card: NavCard) =>
    lang === 'en' ? card.titleEn : lang === 'lo' ? card.titleLo : card.titleZh;

  const handleCardClick = (card: NavCard) => {
    if (card.href) router.push(card.href);
  };

  // 按角色过滤：有 pageKey 的卡片做权限检查，无 pageKey 的始终显示
  const visibleCards = NAV_CARDS.filter(card =>
    !card.pageKey || canAccess(card.pageKey, user?.role)
  );

  const badgeCounts: Record<string, number> = {
    todoCount,
    notifCount,
  };

  // 首页渲染后立即 prefetch 所有可见页面，用户点击时 JS 已就绪 → 瞬间跳转
  useEffect(() => {
    visibleCards.forEach(card => {
      if (card.href && !card.soon) router.prefetch(card.href);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: '100svh',
      background: t.pageBg,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* AppBar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top) + 14px) 20px 14px',
        background: t.appBarBg,
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${t.barBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg,#f59e0b,#d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 18 }}>🐦</span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>金凤凰 ERP</div>
            <div style={{ fontSize: 11, color: t.textFaint, lineHeight: 1.2 }}>
              {user?.name || user?.username || '用户'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 语言切换：ZH → ລາວ → EN → ZH 循环 */}
          <button onClick={toggleLanguage} style={{
            background: 'none', border: `1px solid ${t.btnBorder}`,
            borderRadius: 8, cursor: 'pointer', padding: '4px 8px',
            color: t.textSub, fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
          }}>
            {lang === 'zh' ? 'ZH' : lang === 'lo' ? 'ລາວ' : 'EN'}
          </button>
          <button onClick={toggle} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
            color: t.textSub, display: 'flex', alignItems: 'center',
          }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {/* 全屏按钮：Android Chrome / 桌面支持；iOS Safari 不支持 Fullscreen API，隐藏 */}
          {fsSupported && (
            <button
              onClick={toggleFullscreen}
              title={isFullscreen
                ? (lang === 'en' ? 'Exit Fullscreen' : '退出全屏')
                : (lang === 'en' ? 'Fullscreen' : '全屏')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                color: isFullscreen ? '#f59e0b' : t.textSub,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.2s',
              }}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <button
            onClick={() => logout()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              background: t.btnBg,
              border: `1px solid ${t.btnBorder}`,
              color: t.textSub,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            <LogOut size={14} />
            {lang === 'en' ? 'Logout' : lang === 'lo' ? 'ອອກ' : '退出'}
          </button>
        </div>
      </div>

      {/* 角色 Badge */}
      <div style={{ padding: '16px 20px 8px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.25)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
            {user?.roleNameZh || user?.role || '管理员'}
          </span>
        </div>
      </div>

      {/* 功能卡片 Grid */}
      <div style={{
        flex: 1,
        padding: '8px 16px',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        display: 'grid',
        gridTemplateColumns: 'repeat(2,1fr)',
        gap: 12,
        alignContent: 'start',
      }}>
        {visibleCards.map((card, idx) => (
          <button
            key={idx}
            onClick={() => handleCardClick(card)}
            disabled={card.soon}
            className="mobile-card-in"
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '18px 16px',
              borderRadius: 16,
              background: card.soon
                ? t.sectionBg
                : `linear-gradient(135deg, ${card.color}18, ${card.color}08)`,
              border: `1px solid ${card.soon ? t.cardBorder : card.color + '35'}`,
              cursor: card.soon ? 'default' : 'pointer',
              textAlign: 'left',
              opacity: card.soon ? 0.7 : 1,
              transition: 'transform 0.12s cubic-bezier(0.22,1,0.36,1), box-shadow 0.12s',
              willChange: 'transform',
              // full-width for last odd card
              ...(idx === visibleCards.length - 1 && visibleCards.length % 2 !== 0
                ? { gridColumn: '1/-1' }
                : {}),
            }}
          >
            {/* 即将上线 badge */}
            {card.soon && (
              <div style={{
                position: 'absolute', top: 10, right: 10,
                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                background: t.cardBorder,
                color: t.textFaint,
                fontWeight: 700, letterSpacing: 0.5,
              }}>
                开发中
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 10 }}>
              <div style={{ color: card.soon ? t.textFaint : card.color }}>
                {card.icon}
              </div>
              {card.badgeKey && (badgeCounts[card.badgeKey] ?? 0) > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff',
                  borderRadius: 12, padding: '2px 7px',
                  fontSize: 11, fontWeight: 800, lineHeight: 1.4,
                }}>
                  {badgeCounts[card.badgeKey]}
                </span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: card.soon ? t.textSub : t.text, marginBottom: 4 }}>
              {getTitle(card)}
            </div>
            <div style={{ fontSize: 11, color: t.textFaint, lineHeight: 1.4 }}>
              {card.desc}
            </div>
          </button>
        ))}
      </div>

      {/* 底部版权 */}
      <div style={{ textAlign: 'center', fontSize: 10, color: t.textFaint, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', paddingTop: 4 }}>
        Phoenix ERP V3 · {brand.company_name}
      </div>
    </div>
  );
}
